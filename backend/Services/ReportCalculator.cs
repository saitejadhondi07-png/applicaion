using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Endurance.API.Models;
using Endurance.API.Configuration;
using Microsoft.Extensions.Options;
using OfficeOpenXml;

namespace Endurance.API.Services
{
    public class ReportCalculator
    {
        private readonly ThresholdConfig _thresholds;

        public ReportCalculator(IOptions<ThresholdConfig> thresholds)
        {
            _thresholds = thresholds.Value;
        }

        /// <summary>
        /// Header fragments that identify the operator-entered User SoC column.
        /// The BTS exports name it "SoC_User(%)" (noun first); earlier revisions and some
        /// hand-compiled sheets write "User SoC". Both orders are matched - matching only
        /// "user soc" silently missed the real export header and fell through to Real SoC.
        /// </summary>
        private static readonly string[] UserSocPatterns =
        {
            "soc_user", "soc user", "socuser",
            "user soc", "user_soc", "usersoc", "user state of charge",
            "state_of_charge_user", "state of charge (user"
        };

        /// <summary>
        /// Picks the SoC column, preferring the operator-entered "User SoC" over the
        /// instrument's "State of Charge (Real SoC)".
        /// Both headers contain the substring "soc", so a generic match returns whichever
        /// column happens to sit further left - which silently read Real SoC depending on
        /// the export's column order. User SoC is authoritative for pass/fail, so it is
        /// matched explicitly and first; Real SoC is only a fallback when User SoC is absent.
        /// Returns -1 when no SoC column of any kind is present.
        /// </summary>
        private static int FindSocColumn(List<string> headers)
        {
            int idx = headers.FindIndex(h => UserSocPatterns.Any(p => h.Contains(p)));
            if (idx != -1) return idx;

            idx = headers.FindIndex(h => h == "state_of_charge(%)" || h == "state_of_charge");
            if (idx != -1) return idx;

            return headers.FindIndex(h => h.Contains("state_of_charge") || h.Contains("soc"));
        }

        /// <summary>
        /// Reads the battery pack ID out of a raw export's filename, e.g.
        /// "G14_COM14__Profile_Test_TFA3633001BA_DESKTOP-2CDN5CI_...csv" -> "TFA3633001BA".
        ///
        /// The ID is a "T" plus 11 alphanumerics, and it must stand alone between
        /// separators. The lookaround matters: without it the match could start in the
        /// middle of a longer alphanumeric run and return 12 characters that are not a
        /// pack ID at all.
        ///
        /// Returns an empty string when the filename carries no pack ID. It deliberately
        /// does NOT invent one. It used to fall back to "TFA" + the first 9 characters of
        /// the squashed filename, which turned an operator's mis-named export
        /// ("..._Test- Step_1_DESKTOP-...csv", pack ID simply left out) into the
        /// plausible-looking ID "TFAG2COM2PRO" and filed that pack's real measurements
        /// under it. Callers reject the file instead.
        /// </summary>
        // Header patterns for the four delta columns of a compiled sheet.
        //
        // The charge patterns carry a (?<![a-z]) guard because "dch_deltav" *contains*
        // "ch_deltav" as a substring. Matching the charge column with a plain Contains()
        // returned the DISCHARGE column whenever DCH sat to its left - which is the order the
        // plant template uses - so every compiled-sheet upload scored CH_DeltaV and CH_Delta_T
        // against the discharge readings. Raw CSV/XLSX exports were unaffected: they select
        // rows by Step State, not by these headers.
        private const string DchVolts = @"dch[_ ]?delta[_ ]?v";
        private const string DchTemp = @"dch[_ ]?delta[_ ]?_?t";
        private const string ChVolts = @"(?<![a-z])ch[_ ]?delta[_ ]?v";
        private const string ChTemp = @"(?<![a-z])ch[_ ]?delta[_ ]?_?t";

        /// <summary>
        /// Indices of every header matching <paramref name="pattern"/>, in sheet order. The
        /// plant sheet lists each delta twice - the main test, then the Short CDC repeat - so
        /// callers take element 0 for the main column and element 1 for the Short CDC one.
        /// </summary>
        private static List<int> FindColumns(List<string> headers, string pattern)
        {
            var found = new List<int>();
            for (int i = 0; i < headers.Count; i++)
            {
                if (Regex.IsMatch(headers[i], pattern, RegexOptions.IgnoreCase)) found.Add(i);
            }
            return found;
        }

        private static int ColumnAt(List<int> columns, int occurrence) =>
            occurrence < columns.Count ? columns[occurrence] : -1;

        public string ExtractBatteryPackId(string fileName)
        {
            var match = Regex.Match(fileName, @"(?<![A-Z0-9])T[A-Z0-9]{11}(?![A-Z0-9])", RegexOptions.IgnoreCase);
            return match.Success ? match.Value.ToUpper() : string.Empty;
        }

        /// <summary>
        /// Pack ID for a raw export, or an exception naming the file. A raw file is
        /// identified only by its name, so a file with no ID in its name cannot be
        /// attributed to a pack and must not enter the report.
        /// </summary>
        private string RequirePackId(string fileName)
        {
            var packId = ExtractBatteryPackId(fileName);
            if (packId.Length == 0)
            {
                throw new InvalidOperationException(
                    "No Battery Pack ID in the filename. Expected a 12-character ID such as " +
                    "TFA3633001BA between separators. Rename the export to include the pack ID " +
                    "and upload it again.");
            }
            return packId;
        }

        public List<PackRecord> ProcessExcel(Stream stream, string fileName)
        {
            ExcelPackage.License.SetNonCommercialOrganization("Endurance");
            using var package = new ExcelPackage(stream);
            var records = new List<PackRecord>();

            // Find compiled sheet
            ExcelWorksheet? ws = null;
            foreach (var s in package.Workbook.Worksheets)
            {
                if (s.Name.Contains("ENE5160") || s.Name == "a" || s.Name.Contains("Details", StringComparison.OrdinalIgnoreCase))
                {
                    if (s.Name.Contains("ENE5160") || s.Name == "a")
                    {
                        ws = s;
                        break;
                    }
                    ws ??= s;
                }
            }

            if (ws != null)
            {
                int rowCount = ws.Dimension?.Rows ?? 0;
                int colCount = ws.Dimension?.Columns ?? 0;
                int headerRowIdx = -1;
                var headers = new List<string>();

                // Find header row containing "Battery Pack ID"
                for (int r = 1; r <= rowCount; r++)
                {
                    for (int c = 1; c <= colCount; c++)
                    {
                        var valStr = ws.Cells[r, c].Value?.ToString();
                        if (valStr != null && valStr.Contains("Battery Pack ID", StringComparison.OrdinalIgnoreCase))
                        {
                            headerRowIdx = r;
                            break;
                        }
                    }
                    if (headerRowIdx != -1) break;
                }

                if (headerRowIdx != -1)
                {
                    for (int c = 1; c <= colCount; c++)
                    {
                        headers.Add(ws.Cells[headerRowIdx, c].Value?.ToString()?.Trim()?.ToLower() ?? "");
                    }

                    int packIdColIdx = headers.FindIndex(h => h.Contains("battery pack id"));
                    if (packIdColIdx != -1)
                    {
                        for (int r = headerRowIdx + 1; r <= rowCount; r++)
                        {
                            var packId = ws.Cells[r, packIdColIdx + 1].Value?.ToString()?.Trim();
                             if (!string.IsNullOrEmpty(packId) && packId.StartsWith("T", StringComparison.OrdinalIgnoreCase) && packId.Length >= 11 && !packId.Contains(" ") && Regex.IsMatch(packId, @"^[A-Z0-9\-]+$", RegexOptions.IgnoreCase))
                             {
                                double GetColVal(string[] patterns, bool isFloat = false)
                                {
                                    int idx = headers.FindIndex(h => patterns.Any(p => h.Contains(p)));
                                    if (idx == -1) return 0;
                                    var cellVal = ws.Cells[r, idx + 1].Value?.ToString();
                                    if (string.IsNullOrEmpty(cellVal)) return 0;
                                    string cleanVal = Regex.Replace(cellVal, @"[^0-9.-]", "");
                                    return double.TryParse(cleanVal, out double d) ? d : 0;
                                }

                                double GetColValAt(int idx)
                                {
                                    if (idx == -1) return 0;
                                    var cellVal = ws.Cells[r, idx + 1].Value?.ToString();
                                    if (string.IsNullOrEmpty(cellVal)) return 0;
                                    string cleanVal = Regex.Replace(cellVal, @"[^0-9.-]", "");
                                    return double.TryParse(cleanVal, out double d) ? d : 0;
                                }

                                string GetColStr(string[] patterns)
                                {
                                    int idx = headers.FindIndex(h => patterns.Any(p => h.Contains(p)));
                                    if (idx == -1) return "";
                                    return ws.Cells[r, idx + 1].Value?.ToString()?.Trim() ?? "";
                                }

                                var dchVoltCols = FindColumns(headers, DchVolts);
                                var chVoltCols = FindColumns(headers, ChVolts);
                                var dchTempCols = FindColumns(headers, DchTemp);
                                var chTempCols = FindColumns(headers, ChTemp);

                                int idleDeltaV = (int)GetColVal(new[] { "idle deltav", "idle delta v" });
                                double idleDeltaT = GetColVal(new[] { "idle delta_t", "idle delta t" }, true);
                                int dchDeltaV = (int)GetColValAt(ColumnAt(dchVoltCols, 0));
                                double dchDeltaT = GetColValAt(ColumnAt(dchTempCols, 0));
                                int chDeltaV = (int)GetColValAt(ColumnAt(chVoltCols, 0));
                                double chDeltaT = GetColValAt(ColumnAt(chTempCols, 0));

                                // An explicitly labelled "Short CDC" column wins; otherwise the
                                // second occurrence of the delta column is the Short CDC repeat.
                                int shortChDeltaV = (int)GetColVal(new[] { "short cdc ch", "short ch" });
                                if (shortChDeltaV == 0) shortChDeltaV = (int)GetColValAt(ColumnAt(chVoltCols, 1));
                                int shortDchDeltaV = (int)GetColVal(new[] { "short cdc dch", "short dch" });
                                if (shortDchDeltaV == 0) shortDchDeltaV = (int)GetColValAt(ColumnAt(dchVoltCols, 1));
                                // Prefer "User SoC" over "State of Charge (Real SoC)" - a plain
                                // Contains("soc") match returns whichever column sits further left.
                                double soc = GetColValAt(FindSocColumn(headers));
                                double voltage = GetColVal(new[] { "voltage" }, true);
                                string bmsErrorStr = GetColStr(new[] { "bms error", "bms_error", "no_error", "no error", "error" });
                                string bmsError = "NO";
                                if (!string.IsNullOrEmpty(bmsErrorStr))
                                {
                                    if (bmsErrorStr.Trim().Equals("1", StringComparison.OrdinalIgnoreCase) || 
                                        bmsErrorStr.Trim().Equals("YES", StringComparison.OrdinalIgnoreCase) || 
                                        bmsErrorStr.Trim().Equals("TRUE", StringComparison.OrdinalIgnoreCase))
                                    {
                                        bmsError = "YES";
                                    }
                                    else if (bmsErrorStr.Trim().Equals("0", StringComparison.OrdinalIgnoreCase) || 
                                             bmsErrorStr.Trim().Equals("NO", StringComparison.OrdinalIgnoreCase) || 
                                             bmsErrorStr.Trim().Equals("FALSE", StringComparison.OrdinalIgnoreCase))
                                    {
                                        bmsError = "NO";
                                    }
                                    else
                                    {
                                        bmsError = bmsErrorStr.Trim().ToUpper();
                                    }
                                }
                                
                                string pulseResult = (dchDeltaV > _thresholds.DchDeltaVHold || chDeltaV > _thresholds.ChDeltaVHold || dchDeltaT > _thresholds.DchDeltaTHold || chDeltaT > _thresholds.ChDeltaTHold) ? "Hold" : "Pass";
                                string cdcResult = (shortChDeltaV > _thresholds.ShortChDeltaVFail || shortDchDeltaV > _thresholds.ShortDchDeltaVFail) ? "Fail" : "Pass";
                                // SOC valid range for compiled templates: 24.0 - 30.0% (matching raw data normalization)
                                string socResult = (soc < _thresholds.SocMin || soc > _thresholds.SocMax) ? "Fail" : "Pass";
                                
                                string overallResult = "Pass";
                                if (idleDeltaV > _thresholds.IdleDeltaVHold || 
                                    idleDeltaT > _thresholds.IdleDeltaTHold || 
                                    pulseResult != "Pass" || 
                                    bmsError == "YES" || 
                                    bmsError == "CAN STUCK")
                                {
                                    overallResult = "Fail";
                                }

                                if (bmsError == "CAN STUCK")
                                {
                                    pulseResult = "CAN STUCK";
                                    bmsError = "YES";
                                }

                                records.Add(new PackRecord
                                {
                                    BatteryPackId = packId.ToUpper(),
                                    SourceFile = fileName,
                                    IdleDeltaV = idleDeltaV,
                                    IdleDeltaT = idleDeltaT,
                                    DchDeltaV = dchDeltaV,
                                    DchDeltaT = dchDeltaT,
                                    ChDeltaV = chDeltaV,
                                    ChDeltaT = chDeltaT,
                                    ShortChDeltaV = shortChDeltaV,
                                    ShortDchDeltaV = shortDchDeltaV,
                                    Soc = soc,
                                    Voltage = voltage,
                                    BmsError = bmsError,
                                    PulseResult = pulseResult,
                                    CdcResult = cdcResult,
                                    SocResult = socResult,
                                    OverallResult = overallResult
                                });
                            }
                        }
                    }
                }
            }

            return records;
        }

        public PackRecord ProcessRawCsv(string filePath, string fileName)
        {
            string packId = RequirePackId(fileName);
            
            // Try multiple encodings for the stream
            var encodingsToTry = new[]
            {
                (Encoding: (Encoding?)null, Name: "auto-detect"),          // auto-detect from BOM
                (Encoding: Encoding.Unicode, Name: "UTF-16LE"),           // UTF-16 Little Endian
                (Encoding: Encoding.BigEndianUnicode, Name: "UTF-16BE"),  // UTF-16 Big Endian
                (Encoding: Encoding.UTF8, Name: "UTF-8"),                 // plain UTF-8
            };

            var dataRows = new List<string[]>();
            List<string> headers = new List<string>();
            int stepIdIdx = -1, maxVoltIdx = -1, minVoltIdx = -1, maxTempIdx = -1, minTempIdx = -1;
            int socIdx = -1, voltIdx = -1, currentIdx = -1, stateIdx = -1, errorIdx = -1;

            foreach (var enc in encodingsToTry)
            {
                using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var reader = enc.Encoding != null
                    ? new StreamReader(stream, enc.Encoding)
                    : new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);

                string? headerLine = reader.ReadLine();
                if (headerLine == null) continue;

                if (headerLine.Length > 0 && headerLine[0] == '\uFEFF') headerLine = headerLine.Substring(1);
                headerLine = headerLine.Replace("\0", "").Trim();

                string? nextLine = reader.ReadLine();
                if (nextLine == null) continue;

                headers = headerLine.Split(',').Select(h => h.Trim().ToLower()).ToList();
                stepIdIdx = headers.FindIndex(h => h.Contains("step id") || h.Contains("step_id") || h == "step");
                
                if (stepIdIdx != -1)
                {
                    // Encoding was successful
                    Console.WriteLine($"[CSV PARSE] File: {fileName} decoded with {enc.Name}");
                    Console.WriteLine($"[CSV PARSE] Headers found: {string.Join(", ", headers)}");
                    
                    maxVoltIdx = headers.FindIndex(h => h.Contains("max_voltage_0") || h.Contains("max_voltage") || h.Contains("max voltage"));
                    minVoltIdx = headers.FindIndex(h => h.Contains("min_voltage_0") || h.Contains("min_voltage") || h.Contains("min voltage"));
                    maxTempIdx = headers.FindIndex(h => h.Contains("temperature_cell_max") || h.Contains("temp_cell_max") || h.Contains("cell_max_temp") || h.Contains("temperature_cell_max(?c)") || h.Contains("temperature_cell_max(?c)"));
                    minTempIdx = headers.FindIndex(h => h.Contains("temperature_cell_min") || h.Contains("temp_cell_min") || h.Contains("cell_min_temp") || h.Contains("temperature_cell_min(?c)") || h.Contains("temperature_cell_min(?c)"));
                    socIdx = FindSocColumn(headers);
                    voltIdx = headers.FindIndex(h => h == "battery_voltage_0(v)" || h == "battery_voltage_0" || h == "battery_voltage");
                    if (voltIdx == -1) voltIdx = headers.FindIndex(h => h.Contains("battery_voltage_0") || h.Contains("battery_voltage") || h.Contains("voltage"));
                    currentIdx = headers.FindIndex(h => h.Contains("battery_current") || h.Contains("current(a)") || h.Contains("current"));
                    stateIdx = headers.FindIndex(h => h.Contains("step state") || h.Contains("step_state") || h == "state");
                    errorIdx = headers.FindIndex(h => h == "no_error" || h == "no error");
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h.Contains("no_error") || h.Contains("no error"));
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h == "bms_error" || h == "bms error" || h == "error");
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h.Contains("bms_error") || h.Contains("bms error"));
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h.Contains("error"));
                    
                    Console.WriteLine($"[CSV PARSE] Column indices - StepID:{stepIdIdx}, MaxV:{maxVoltIdx}, MinV:{minVoltIdx}, MaxT:{maxTempIdx}, MinT:{minTempIdx}, SOC:{socIdx}, Volt:{voltIdx}, Current:{currentIdx}, State:{stateIdx}, Error:{errorIdx}");

                    var firstDataLine = nextLine.Replace("\0", "").Trim();
                    if (!firstDataLine.StartsWith("??") && !string.IsNullOrWhiteSpace(firstDataLine))
                    {
                        var cols = ParseCsvLine(firstDataLine);
                        if (cols.Length > stepIdIdx && int.TryParse(cols[stepIdIdx], out _)) dataRows.Add(cols);
                    }

                    while (!reader.EndOfStream)
                    {
                        var line = reader.ReadLine()?.Replace("\0", "").Trim();
                        if (string.IsNullOrWhiteSpace(line) || line.StartsWith("??")) continue;
                        
                        var cols = ParseCsvLine(line);
                        // Filter directly here: only keep Step 1, 2, 4, 6, 8, or last row (since we don't know last row, we just keep all valid numbered steps to be safe, but they are strings, so it's small)
                        if (cols.Length > stepIdIdx && int.TryParse(cols[stepIdIdx], out _))
                        {
                            dataRows.Add(cols);
                        }
                    }
                    break;
                }
            }

            if (stepIdIdx == -1)
            {
                throw new InvalidOperationException("CSV file is empty or missing 'Step ID' header");
            }

            Console.WriteLine($"[CSV PARSE] Valid data rows found: {dataRows.Count}");

            if (dataRows.Count == 0)
            {
                throw new InvalidOperationException($"No valid data rows found in CSV after filtering. Total extracted: {dataRows.Count}");
            }

            var csvRecord = ProcessRawDataRows(dataRows, packId, stepIdIdx, maxVoltIdx, minVoltIdx, maxTempIdx, minTempIdx, socIdx, voltIdx, currentIdx, stateIdx, errorIdx);
            csvRecord.SourceFile = fileName;
            return csvRecord;
        }

        public PackRecord ProcessRawExcel(Stream stream, string fileName)
        {
            string packId = RequirePackId(fileName);
            try
            {
                using (var package = new OfficeOpenXml.ExcelPackage(stream))
                {
                    var ws = package.Workbook.Worksheets[0];
                    if (ws == null)
                        throw new InvalidOperationException("Excel file has no worksheets");

                    int rowCount = ws.Dimension?.Rows ?? 0;
                    int colCount = ws.Dimension?.Columns ?? 0;
                    if (rowCount < 2)
                        throw new InvalidOperationException("Excel file has no data rows");

                    // Parse headers from Row 1
                    var headers = new List<string>();
                    for (int c = 1; c <= colCount; c++)
                    {
                        headers.Add(ws.Cells[1, c].Value?.ToString()?.Trim()?.ToLower() ?? "");
                    }

                    // Find key columns
                    int stepIdIdx = headers.FindIndex(h => h.Contains("step id") || h.Contains("step_id") || h == "step");
                    int maxVoltIdx = headers.FindIndex(h => h.Contains("max_voltage_0") || h.Contains("max_voltage") || h.Contains("max voltage"));
                    int minVoltIdx = headers.FindIndex(h => h.Contains("min_voltage_0") || h.Contains("min_voltage") || h.Contains("min voltage"));
                    int maxTempIdx = headers.FindIndex(h => h.Contains("temperature_cell_max") || h.Contains("temp_cell_max") || h.Contains("cell_max_temp") || h.Contains("temperature_cell_max(?c)") || h.Contains("temperature_cell_max(?c)"));
                    int minTempIdx = headers.FindIndex(h => h.Contains("temperature_cell_min") || h.Contains("temp_cell_min") || h.Contains("cell_min_temp") || h.Contains("temperature_cell_min(?c)") || h.Contains("temperature_cell_min(?c)"));
                    int socIdx = FindSocColumn(headers);
                    int voltIdx = headers.FindIndex(h => h == "battery_voltage_0(v)" || h == "battery_voltage_0" || h == "battery_voltage");
                    if (voltIdx == -1) voltIdx = headers.FindIndex(h => h.Contains("battery_voltage_0") || h.Contains("battery_voltage") || h.Contains("voltage"));
                    int currentIdx = headers.FindIndex(h => h.Contains("battery_current") || h.Contains("current(a)") || h.Contains("current"));
                    int stateIdx = headers.FindIndex(h => h.Contains("step state") || h.Contains("step_state") || h == "state");
                    int errorIdx = headers.FindIndex(h => h == "no_error" || h == "no error");
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h.Contains("no_error") || h.Contains("no error"));
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h == "bms_error" || h == "bms error" || h == "error");
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h.Contains("bms_error") || h.Contains("bms error"));
                    if (errorIdx == -1) errorIdx = headers.FindIndex(h => h.Contains("error"));

                    if (stepIdIdx == -1)
                    {
                        throw new InvalidOperationException("Excel file missing required 'Step ID' column");
                    }

                    // Extract rows
                    var dataRows = new List<string[]>();
                    for (int r = 2; r <= rowCount; r++)
                    {
                        var cols = new string[colCount];
                        for (int c = 1; c <= colCount; c++)
                        {
                            cols[c - 1] = ws.Cells[r, c].Value?.ToString() ?? "";
                        }

                        if (stepIdIdx >= 0 && cols.Length > stepIdIdx && int.TryParse(cols[stepIdIdx], out _))
                        {
                            dataRows.Add(cols);
                        }
                    }

                    if (dataRows.Count == 0)
                    {
                        throw new InvalidOperationException("Excel file has no valid data rows with numeric Step IDs");
                    }

                    var excelRecord = ProcessRawDataRows(dataRows, packId, stepIdIdx, maxVoltIdx, minVoltIdx, maxTempIdx, minTempIdx, socIdx, voltIdx, currentIdx, stateIdx, errorIdx);
                    excelRecord.SourceFile = fileName;
                    return excelRecord;
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to process Excel file: {ex.Message}", ex);
            }
        }

        private PackRecord ProcessRawDataRows(
            List<string[]> dataRows, 
            string packId, 
            int stepIdIdx, 
            int maxVoltIdx, 
            int minVoltIdx, 
            int maxTempIdx, 
            int minTempIdx, 
            int socIdx, 
            int voltIdx, 
            int currentIdx, 
            int stateIdx, 
            int errorIdx)
        {
            // Strict variant used for SoC: reports whether a real number was present,
            // so a missing column or a truncated row is rejected instead of silently
            // becoming 0 and then being displayed as the 29.87 default.
            bool TryGetDouble(string[] row, int index, out double value)
            {
                value = 0;
                if (index == -1 || index >= row.Length) return false;
                string raw = Regex.Replace(row[index], @"[^0-9.-]", "");
                return double.TryParse(raw, out value);
            }

            double GetDouble(string[] row, int index)
            {
                if (index == -1 || index >= row.Length) return 0;
                string val = Regex.Replace(row[index], @"[^0-9.-]", "");
                return double.TryParse(val, out double d) ? d : 0;
            }

            int GetInt(string[] row, int index)
            {
                if (index == -1 || index >= row.Length) return 0;
                string val = Regex.Replace(row[index], @"[^0-9-]", "");
                return int.TryParse(val, out int v) ? v : 0;
            }

            string GetString(string[] row, int index)
            {
                if (index == -1 || index >= row.Length) return string.Empty;
                return row[index].Trim().ToUpperInvariant();
            }

            // Idle Test
            // We only want the FIRST Idle step (initial OCV check), not relaxation steps later in the test.
            int firstIdleStepId = -1;
            foreach (var r in dataRows)
            {
                if (stateIdx != -1 && stepIdIdx != -1)
                {
                    string state = GetString(r, stateIdx);
                    if (state.Contains("REST") || state.Contains("IDLE") || state.Contains("STILL") || state.Contains("PAUSE"))
                    {
                        firstIdleStepId = GetInt(r, stepIdIdx);
                        break;
                    }
                }
            }

            var idleRows = dataRows.Where(r => 
                stepIdIdx != -1 && GetInt(r, stepIdIdx) == firstIdleStepId
            ).ToList();

            int idleDeltaV = 0;
            double idleDeltaT = 0;
            
            if (idleRows.Count > 0)
            {
                double maxDiffV = 0;
                double maxDiffT = 0;
                foreach (var r in idleRows)
                {
                    double diffV = Math.Abs(GetDouble(r, maxVoltIdx) - GetDouble(r, minVoltIdx)) * 1000;
                    double diffT = Math.Abs(GetDouble(r, maxTempIdx) - GetDouble(r, minTempIdx));
                    if (diffV > maxDiffV) maxDiffV = diffV;
                    if (diffT > maxDiffT) maxDiffT = diffT;
                }
                idleDeltaV = (int)Math.Round(maxDiffV);
                idleDeltaT = Math.Round(maxDiffT, 1);
            }
            else
            {
                Console.WriteLine($"[CSV PARSE] Warning: Idle Test (REST/IDLE state) data rows not found for {packId}. Using default 0 values.");
            }

            // Pulse DCH -> mapped to CC DISCHARGE
            var pulseDchRows = dataRows.Where(r => 
                stateIdx != -1 && 
                GetString(r, stateIdx).Contains("CC") && GetString(r, stateIdx).Contains("DISCHARGE") &&
                GetDouble(r, currentIdx) < -1
            ).ToList();
            int dchDeltaV = 0;
            double dchDeltaT = 0;
            bool canStuck = false;

            if (pulseDchRows.Count > 0)
            {
                

                double maxDiffV = 0;
                double maxDiffT = 0;
                foreach (var r in pulseDchRows)
                {
                    double diffV = Math.Abs(GetDouble(r, maxVoltIdx) - GetDouble(r, minVoltIdx)) * 1000;
                    double diffT = Math.Abs(GetDouble(r, maxTempIdx) - GetDouble(r, minTempIdx));
                    if (diffV > maxDiffV) maxDiffV = diffV;
                    if (diffT > maxDiffT) maxDiffT = diffT;
                }
                dchDeltaV = (int)Math.Round(maxDiffV);
                dchDeltaT = Math.Round(maxDiffT, 1);
            }

            // Pulse CH -> mapped to CC CHARGE
            var pulseChRows = dataRows.Where(r => 
                stateIdx != -1 && 
                GetString(r, stateIdx).Contains("CC") && GetString(r, stateIdx).Contains("CHARGE") &&
                GetDouble(r, currentIdx) > 1
            ).ToList();
            int chDeltaV = 0;
            double chDeltaT = 0;

            if (pulseChRows.Count > 0)
            {
                

                double maxDiffV = 0;
                double maxDiffT = 0;
                foreach (var r in pulseChRows)
                {
                    double diffV = Math.Abs(GetDouble(r, maxVoltIdx) - GetDouble(r, minVoltIdx)) * 1000;
                    double diffT = Math.Abs(GetDouble(r, maxTempIdx) - GetDouble(r, minTempIdx));
                    if (diffV > maxDiffV) maxDiffV = diffV;
                    if (diffT > maxDiffT) maxDiffT = diffT;
                }
                chDeltaV = (int)Math.Round(maxDiffV);
                chDeltaT = Math.Round(maxDiffT, 1);
            }

            // Short CDC CH -> mapped to BMS FOLLOW (positive current)
            var shortCdcChRows = dataRows.Where(r => 
                stateIdx != -1 && 
                (GetString(r, stateIdx).Contains("BMS") || GetString(r, stateIdx).Contains("FOLLOW")) && 
                GetDouble(r, currentIdx) > 1
            ).ToList();
            int shortChDeltaV = 0;

            if (shortCdcChRows.Count > 0)
            {
                if (shortCdcChRows.Count > 5)
                {
                    string firstMinV = shortCdcChRows[0][minVoltIdx];
                    string firstMaxV = shortCdcChRows[0][maxVoltIdx];
                    bool repeated = shortCdcChRows.All(r => r[minVoltIdx] == firstMinV && r[maxVoltIdx] == firstMaxV);
                    if (repeated) canStuck = true;
                }

                double maxDiffV = 0;
                foreach (var r in shortCdcChRows)
                {
                    double diffV = Math.Abs(GetDouble(r, maxVoltIdx) - GetDouble(r, minVoltIdx)) * 1000;
                    if (diffV > maxDiffV) maxDiffV = diffV;
                }
                shortChDeltaV = (int)Math.Round(maxDiffV);
            }

            // Short CDC DCH -> mapped to BMS FOLLOW (negative current)
            var shortCdcDchRows = dataRows.Where(r => 
                stateIdx != -1 && 
                (GetString(r, stateIdx).Contains("BMS") || GetString(r, stateIdx).Contains("FOLLOW")) && 
                GetDouble(r, currentIdx) < -1
            ).ToList();
            int shortDchDeltaV = 0;

            if (shortCdcDchRows.Count > 0)
            {
                if (shortCdcDchRows.Count > 5)
                {
                    string firstMinV = shortCdcDchRows[0][minVoltIdx];
                    string firstMaxV = shortCdcDchRows[0][maxVoltIdx];
                    bool repeated = shortCdcDchRows.All(r => r[minVoltIdx] == firstMinV && r[maxVoltIdx] == firstMaxV);
                    if (repeated) canStuck = true;
                }

                double maxDiffV = 0;
                foreach (var r in shortCdcDchRows)
                {
                    double diffV = Math.Abs(GetDouble(r, maxVoltIdx) - GetDouble(r, minVoltIdx)) * 1000;
                    if (diffV > maxDiffV) maxDiffV = diffV;
                }
                shortDchDeltaV = (int)Math.Round(maxDiffV);
            }

            // Post Test Status (Last Row SOC & Voltage)
            double soc;
            double voltage = 52.85;
            string bmsError = "NO";

            if (socIdx == -1)
            {
                throw new InvalidOperationException(
                    $"No SoC column found for pack {packId}. Expected a 'User SoC' column " +
                    "(or 'State of Charge' as a fallback). The file cannot be scored without it.");
            }

            {
                var lastRow = dataRows.Last();
                if (!TryGetDouble(lastRow, socIdx, out double socValue))
                {
                    throw new InvalidOperationException(
                        $"SoC value for pack {packId} is missing or not numeric in the final data row. " +
                        "The file cannot be scored without it.");
                }

                soc = Math.Round(socValue, 2);
                voltage = Math.Round(GetDouble(lastRow, voltIdx), 2);

                if (errorIdx != -1)
                {
                    bool hasError = dataRows.Any(r => GetInt(r, errorIdx) == 1 || GetInt(r, errorIdx) > 0);
                    bmsError = hasError ? "YES" : "NO";
                }
            }

            if (canStuck)
            {
                bmsError = "CAN STUCK";
            }

            // Formula checks - SOC valid range: 24.0 - 30.0% (matching compiled template)
            string pulseResult = (dchDeltaV > _thresholds.DchDeltaVHold || chDeltaV > _thresholds.ChDeltaVHold || dchDeltaT > _thresholds.DchDeltaTHold || chDeltaT > _thresholds.ChDeltaTHold) ? "Hold" : "Pass";
            string cdcResult = (shortChDeltaV > _thresholds.ShortChDeltaVFail || shortDchDeltaV > _thresholds.ShortDchDeltaVFail) ? "Fail" : "Pass";
            // SOC valid range for compiled templates: 24.0 - 30.0% (matching raw data normalization)
            string socResult = (soc < _thresholds.SocMin || soc > _thresholds.SocMax) ? "Fail" : "Pass";
            
            string overallResult = "Pass";
            if (idleDeltaV > _thresholds.IdleDeltaVHold || 
                idleDeltaT > _thresholds.IdleDeltaTHold || 
                pulseResult != "Pass" || 
                bmsError == "YES" || 
                bmsError == "CAN STUCK")
            {
                overallResult = "Fail";
            }

            if (bmsError == "CAN STUCK")
            {
                pulseResult = "CAN STUCK";
                bmsError = "YES";
            }

            return new PackRecord
            {
                BatteryPackId = packId,
                IdleDeltaV = idleDeltaV,
                IdleDeltaT = idleDeltaT,
                DchDeltaV = dchDeltaV,
                DchDeltaT = dchDeltaT,
                ChDeltaV = chDeltaV,
                ChDeltaT = chDeltaT,
                ShortChDeltaV = shortChDeltaV,
                ShortDchDeltaV = shortDchDeltaV,
                Soc = soc,
                Voltage = voltage > 0 ? voltage : 52.85,
                BmsError = bmsError,
                PulseResult = pulseResult,
                CdcResult = cdcResult,
                SocResult = socResult,
                OverallResult = overallResult
            };
        }

        private static string[] ParseCsvLine(string line)
        {
            var cols = new List<string>();
            bool inQuotes = false;
            var currentColumn = new System.Text.StringBuilder();

            for (int i = 0; i < line.Length; i++)
            {
                char c = line[i];
                if (c == '\"')
                {
                    inQuotes = !inQuotes;
                }
                else if (c == ',' && !inQuotes)
                {
                    cols.Add(currentColumn.ToString());
                    currentColumn.Clear();
                }
                else
                {
                    currentColumn.Append(c);
                }
            }
            cols.Add(currentColumn.ToString());
            return cols.ToArray();
        }
    }
}
