using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Drawing;
using OfficeOpenXml;
using Endurance.API.Models;
using Endurance.API.Configuration;

namespace Endurance.API.Services
{
    public class ExcelGenerator
    {
        public static byte[] GenerateReport(Report report, List<PackRecord> records, string templatePath, ThresholdConfig thresholds)
        {
            // EPPlus non-commercial license configuration
            ExcelPackage.License.SetNonCommercialOrganization("Endurance");

            if (!File.Exists(templatePath))
            {
                throw new FileNotFoundException($"Excel template not found at {templatePath}");
            }

            using var package = new ExcelPackage(new FileInfo(templatePath));
            
            // Find the sheet to use (prefer one containing ENE5160 or fallback to first)
            var ws = package.Workbook.Worksheets.FirstOrDefault(s => s.Name.Contains("ENE5160")) ?? package.Workbook.Worksheets[0];

            // 1. Find Anchor points dynamically
            int headerRow = -1;
            int signatureRow = -1;
            for (int r = 1; r <= (ws.Dimension?.Rows ?? 100); r++)
            {
                for (int c = 1; c <= (ws.Dimension?.Columns ?? 20); c++)
                {
                    var val = ws.Cells[r, c].Value?.ToString() ?? "";
                    if (headerRow == -1 && val.Contains("Battery Pack ID", StringComparison.OrdinalIgnoreCase))
                    {
                        headerRow = r;
                    }
                    if (val.Contains("Tested By", StringComparison.OrdinalIgnoreCase) || val.Contains("Battery Testing Engineer", StringComparison.OrdinalIgnoreCase) || val.Contains("signature", StringComparison.OrdinalIgnoreCase) || val.Contains("reviewed by", StringComparison.OrdinalIgnoreCase))
                    {
                        signatureRow = r;
                        break;
                    }
                }
            }

            if (headerRow == -1) 
                throw new InvalidOperationException("Could not find data table header 'Battery Pack ID' in the Excel template.");

            // Fallback if signature block isn't found
            if (signatureRow == -1) signatureRow = (ws.Dimension?.Rows ?? 100) + 1;

            // 2. Fill Header Details dynamically
            void FillAdjacent(string label, string value, int offsetCols = 1)
            {
                for (int r = 1; r < headerRow; r++)
                {
                    for (int c = 1; c <= ws.Dimension.Columns; c++)
                    {
                        var val = ws.Cells[r, c].Value?.ToString() ?? "";
                        if (val.Contains(label, StringComparison.OrdinalIgnoreCase))
                        {
                            ws.Cells[r, c + offsetCols].Value = value;
                            return;
                        }
                    }
                }
            }

            FillAdjacent("Test Report ID", report.Id, 2); // In template, ID is 2 cols over
            FillAdjacent("Model No", report.ModelNumber, 1);
            
            string testDateStr = report.UploadDate.ToLocalTime().ToString("dd.MM.yyyy");
            FillAdjacent("Test Start Date", testDateStr, 1);
            FillAdjacent("Test End Date", testDateStr, 1);
            FillAdjacent("Report Date", testDateStr, 1);

            // 3. Map Columns Dynamically
            int colNo = -1, colPackId = -1, colIdleV = -1, colIdleT = -1, colDchV = -1, colDchT = -1;
            int colChV = -1, colChT = -1, colShortChV = -1, colShortDchV = -1, colSoc = -1, colVolt = -1;
            int colBms = -1, colPulse = -1, colOverall = -1;

            for (int c = 1; c <= ws.Dimension.Columns; c++)
            {
                var val = ws.Cells[headerRow, c].Value?.ToString()?.ToLower() ?? "";
                if (val == "") continue;
                
                if (val.Contains("no.")) colNo = c;
                else if (val.Contains("battery pack id")) colPackId = c;
                else if (val.Contains("idle deltav") || val.Contains("idle delta v")) colIdleV = c;
                else if (val.Contains("idle delta_t") || val.Contains("idle delta t")) colIdleT = c;
                else if (val.Contains("soc")) colSoc = c;
                else if (val.Contains("voltage")) colVolt = c;
                else if (val.Contains("bms error") || val.Contains("bms_error")) colBms = c;
                else if (val.Contains("pulse result")) colPulse = c;
                else if (val.Contains("overall result")) colOverall = c;
                else if (val.Contains("dch_deltav") || val.Contains("dch delta v") || val.Contains("dch_delta v"))
                {
                    if (colDchV == -1) colDchV = c; else colShortDchV = c;
                }
                else if (val.Contains("dch_delta_t") || val.Contains("dch delta t") || val.Contains("dch_delta t")) colDchT = c;
                else if (val.Contains("ch_deltav") || val.Contains("ch delta v") || val.Contains("ch_delta v"))
                {
                    if (colChV == -1) colChV = c; else colShortChV = c;
                }
                else if (val.Contains("ch_delta_t") || val.Contains("ch delta t") || val.Contains("ch_delta t")) colChT = c;
            }

            // 4. Prepare data rows dynamically
            int firstDataRow = headerRow + 1;
            int mockRows = signatureRow - firstDataRow;
            
            // Delete excess mock rows so we have exactly 1 template row
            if (mockRows > 1)
            {
                ws.DeleteRow(firstDataRow + 1, mockRows - 1);
            }
            else if (mockRows <= 0)
            {
                ws.InsertRow(firstDataRow, 1);
            }

            // Insert exact number of required rows, copying style from the 1 template row
            if (records.Count > 1)
            {
                ws.InsertRow(firstDataRow + 1, records.Count - 1, firstDataRow);
            }
            else if (records.Count == 0)
            {
                ws.DeleteRow(firstDataRow, 1); 
            }

            // 5. Write Data
            for (int i = 0; i < records.Count; i++)
            {
                int row = firstDataRow + i;
                var rec = records[i];

                if (colNo != -1) ws.Cells[row, colNo].Value = i + 1;
                if (colPackId != -1) ws.Cells[row, colPackId].Value = rec.BatteryPackId;
                if (colIdleV != -1) ws.Cells[row, colIdleV].Value = rec.IdleDeltaV;
                if (colIdleT != -1) ws.Cells[row, colIdleT].Value = rec.IdleDeltaT;
                if (colDchV != -1) ws.Cells[row, colDchV].Value = rec.DchDeltaV;
                if (colDchT != -1) ws.Cells[row, colDchT].Value = rec.DchDeltaT;
                if (colChV != -1) ws.Cells[row, colChV].Value = rec.ChDeltaV;
                if (colChT != -1) ws.Cells[row, colChT].Value = rec.ChDeltaT;
                if (colShortChV != -1) ws.Cells[row, colShortChV].Value = rec.ShortChDeltaV;
                if (colShortDchV != -1) ws.Cells[row, colShortDchV].Value = rec.ShortDchDeltaV;
                if (colSoc != -1) ws.Cells[row, colSoc].Value = rec.Soc;
                if (colVolt != -1) ws.Cells[row, colVolt].Value = rec.Voltage;
                if (colBms != -1) ws.Cells[row, colBms].Value = rec.BmsError;
                
                // Write Formulas dynamically
                if (colPulse != -1)
                {
                    if (rec.BmsError == "YES" || rec.PulseResult == "CAN STUCK") 
                    {
                        ws.Cells[row, colPulse].Value = "CAN STUCK";
                    }
                    else
                    {
                        string dchVAddr = colDchV != -1 ? ws.Cells[row, colDchV].Address : "0";
                        string dchTAddr = colDchT != -1 ? ws.Cells[row, colDchT].Address : "0";
                        string chVAddr = colChV != -1 ? ws.Cells[row, colChV].Address : "0";
                        string chTAddr = colChT != -1 ? ws.Cells[row, colChT].Address : "0";
                        ws.Cells[row, colPulse].Formula = $"IF(OR({dchVAddr}>{thresholds.DchDeltaVHold},{dchTAddr}>{thresholds.DchDeltaTHold},{chVAddr}>{thresholds.ChDeltaVHold},{chTAddr}>{thresholds.ChDeltaTHold}),\"Hold\",\"Pass\")";
                    }
                }

                if (colOverall != -1)
                {
                    string idleVAddr = colIdleV != -1 ? ws.Cells[row, colIdleV].Address : "0";
                    string idleTAddr = colIdleT != -1 ? ws.Cells[row, colIdleT].Address : "0";
                    string pulseAddr = colPulse != -1 ? ws.Cells[row, colPulse].Address : "\"Pass\"";
                    string bmsAddr = colBms != -1 ? ws.Cells[row, colBms].Address : "\"NO\"";
                    string shortChAddr = colShortChV != -1 ? ws.Cells[row, colShortChV].Address : "0";
                    string shortDchAddr = colShortDchV != -1 ? ws.Cells[row, colShortDchV].Address : "0";
                    
                    ws.Cells[row, colOverall].Formula = $"IF(OR({idleVAddr}>{thresholds.IdleDeltaVHold},{idleTAddr}>{thresholds.IdleDeltaTHold},{pulseAddr}=\"Hold\",{pulseAddr}=\"CAN STUCK\",{bmsAddr}<>\"NO\"),\"Fail\",\"Pass\")";
                }
            }

            // Apply Conditional Formatting for Overall Result Background Colors
            if (colOverall != -1 && records.Count > 0)
            {
                var overallRange = ws.Cells[firstDataRow, colOverall, firstDataRow + records.Count - 1, colOverall];

                var failCondition = overallRange.ConditionalFormatting.AddEqual();
                failCondition.Formula = "\"Fail\"";
                failCondition.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                failCondition.Style.Fill.BackgroundColor.Color = Color.Red;
                failCondition.Style.Font.Color.Color = Color.Black;
                failCondition.Style.Font.Bold = true;

                var passCondition = overallRange.ConditionalFormatting.AddEqual();
                passCondition.Formula = "\"Pass\"";
                passCondition.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                passCondition.Style.Fill.BackgroundColor.Color = Color.Green;
                passCondition.Style.Font.Color.Color = Color.White;
                passCondition.Style.Font.Bold = true;
            }

            // 6. Write signatures
            int newSignatureRow = firstDataRow + records.Count;
            for (int r = newSignatureRow; r <= ws.Dimension.Rows; r++)
            {
                for (int c = 1; c <= ws.Dimension.Columns; c++)
                {
                    var val = ws.Cells[r, c].Value?.ToString() ?? "";
                    if (val.Contains("Tested By"))
                    {
                        string testedName = report.TestEngineer;
                        string testedDate = report.UploadDate.ToLocalTime().ToString("dd.MM.yyyy");
                        string reviewedName = report.ReviewedBy ?? "__________";
                        string reviewedDate = report.ReviewDate.HasValue ? report.ReviewDate.Value.ToLocalTime().ToString("dd.MM.yyyy") : "__________";
                        string approvedName = report.ApprovedBy ?? "__________";
                        string approvedDate = report.ApprovalDate.HasValue ? report.ApprovalDate.Value.ToLocalTime().ToString("dd.MM.yyyy") : "__________";

                        string sigText = $"                                Tested By                                     Reviewed By                                     Approved By                               \n\n                          \n        \n                              Name: {testedName}                      Name: {reviewedName}                        Name: {approvedName}                              \n\n                       Battery Testing Engineer                     Quality Engineer                         Quality Manager                        \n                     Date: {testedDate}                           Date: {reviewedDate}                          Date: {approvedDate}                       ";
                        ws.Cells[r, c].Value = sigText;
                    }
                }
            }

            // Delete the unused worksheet "a" if present
            var sheetA = package.Workbook.Worksheets["a"];
            if (sheetA != null)
            {
                package.Workbook.Worksheets.Delete(sheetA);
            }

            // Rename target sheet to model number safely
            string safeModelNum = report.ModelNumber.Replace(":", "-").Replace("/", "-");
            if (safeModelNum.Length > 31) safeModelNum = safeModelNum.Substring(0, 31);
            ws.Name = safeModelNum;

            package.Workbook.Calculate();
            using var ms = new MemoryStream();
            package.SaveAs(ms);
            return ms.ToArray();
        }
    }
}
