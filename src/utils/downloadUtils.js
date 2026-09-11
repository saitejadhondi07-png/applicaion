import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import api from './api';

// Plant naming convention: document number, then the report date.
// e.g. ENE5160-BTR-PP-CDC01-24F2601_24_Jun_2026.xlsx
// Falls back to the internal id for reports created before document numbers existed.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function reportFileStem(report) {
  const d = report?.uploadDate ? new Date(report.uploadDate) : new Date();
  const datePart = `${String(d.getDate()).padStart(2, '0')}_${MONTHS[d.getMonth()]}_${d.getFullYear()}`;
  return `${report?.testReportId || report?.id || 'Report'}_${datePart}`;
}

export async function downloadReportExcel(report, records, filter = 'Combination', onProgress) {
  if (!report) {
    console.error('No active report available to generate Excel.');
    alert('No active report is selected or available. Please upload files and generate a report first.');
    return;
  }

  // 1. If this report is saved on the backend, try downloading directly from the API first
  if (report.id && !report.id.startsWith('mock-') && ['generated', 'reviewed', 'approved'].includes(report.status?.toLowerCase())) {
    try {
      const filterParam = (filter && filter !== 'Combination') ? `?filter=${filter}` : '';
      const response = await api.get(`/reports/${report.id}/download${filterParam}`, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (onProgress) onProgress(percentCompleted);
        }
      });
      
      const blob = response.data;
      const outputName = `${reportFileStem(report)}.xlsx`;
      saveAs(blob, outputName);
      if (onProgress) onProgress(100);
      return;
    } catch (apiErr) {
      console.warn('Backend API download failed, falling back to frontend ExcelJS generation:', apiErr);
    }
  }

  try {
    // 2. Fetch template from public folder
    const response = await fetch('/template.xlsx');
    if (!response.ok) throw new Error('Template file not found in public folder');
    const arrayBuffer = await response.arrayBuffer();
    
    // 3. Read with ExcelJS (preserves 100% of styles, colors, borders, formulas, fonts, and layout)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    
    // 4. Always use the main template sheet ENE5160-BTR‑PP‑CDC01‑DDM2601
    const targetSheetName = 'ENE5160-BTR‑PP‑CDC01‑DDM2601';
    let sheet = workbook.getWorksheet(targetSheetName);
    if (!sheet) {
      sheet = workbook.worksheets.find(s => s.name === targetSheetName || s.name.includes('ENE5160')) || workbook.worksheets[0];
    }
    if (!sheet) throw new Error(`Target sheet ${targetSheetName} not found in template`);
    
    // 5. Fill header info
    // Report ID in D5
    sheet.getCell('D5').value = report.testReportId || report.id || '';
    // Model No in C6
    sheet.getCell('C6').value = report.modelNumber || 'ENE-5160-15A';
    
    // Test Start Date, End Date, Report Date
    const testDateStr = report.uploadDate ? new Date(report.uploadDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
    sheet.getCell('J5').value = testDateStr;
    sheet.getCell('L5').value = testDateStr;
    sheet.getCell('P5').value = testDateStr;
    
    // 5.5 Check if we need to expand template capacity (Template has 84 rows: 8 to 91)
    const dataRecords = records || report.records || [];
    if (dataRecords.length > 84) {
      const templateRow = sheet.getRow(8);
      for (let i = 84; i < dataRecords.length; i++) {
        const newRow = sheet.getRow(8 + i);
        templateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          newRow.getCell(colNumber).style = cell.style;
        });
      }
    }

    // 6. Fill rows
    dataRecords.forEach((rec, index) => {
      const rowIndex = 8 + index; // Data starts at Row 8
      
      // Index (No.)
      sheet.getCell(`B${rowIndex}`).value = index + 1;
      // Battery Pack ID
      sheet.getCell(`C${rowIndex}`).value = rec.batteryPackId;
      // Idle DeltaV
      sheet.getCell(`D${rowIndex}`).value = rec.idleDeltaV;
      // Idle Delta_T
      sheet.getCell(`E${rowIndex}`).value = rec.idleDeltaT;
      // CH_DeltaV (Wait, actually F is DchDeltaV in new template)
      sheet.getCell(`F${rowIndex}`).value = rec.dchDeltaV;
      // CH_Delta_T
      sheet.getCell(`G${rowIndex}`).value = rec.dchDeltaT;
      // DCH_DeltaV
      sheet.getCell(`H${rowIndex}`).value = rec.chDeltaV;
      // DCH_Delta_T
      sheet.getCell(`I${rowIndex}`).value = rec.chDeltaT;
      // Short CDC CH_DeltaV
      sheet.getCell(`J${rowIndex}`).value = rec.shortChDeltaV;
      // Short CDC DCH_DeltaV
      sheet.getCell(`K${rowIndex}`).value = rec.shortDchDeltaV;
      // SOC
      sheet.getCell(`L${rowIndex}`).value = rec.soc;
      // Voltage
      sheet.getCell(`M${rowIndex}`).value = rec.voltage;
      // BMS Error
      sheet.getCell(`N${rowIndex}`).value = rec.bmsError;
      
      // Verdicts are written as the values the backend already scored, NOT re-derived here.
      // This path used to embed its own formulas with different limits (F>10/H>8/E>1.5 vs the
      // configured 11/9/2.0) and wrote "Hold" where the backend writes "Fail", so a fallback
      // download silently disagreed with the report of record.
      sheet.getCell(`O${rowIndex}`).value = rec.pulseResult ?? 'Pass';
      sheet.getCell(`P${rowIndex}`).value = rec.overallResult ?? 'Pass';
    });
    
    // 7. Clear any remaining template rows that were not overwritten to preserve formatting but remove old mock data
    const maxTemplateRows = 91;
    for (let r = 8 + dataRecords.length; r <= maxTemplateRows; r++) {
      sheet.getCell(`B${r}`).value = null;
      sheet.getCell(`C${r}`).value = null;
      sheet.getCell(`D${r}`).value = null;
      sheet.getCell(`E${r}`).value = null;
      sheet.getCell(`F${r}`).value = null;
      sheet.getCell(`G${r}`).value = null;
      sheet.getCell(`H${r}`).value = null;
      sheet.getCell(`I${r}`).value = null;
      sheet.getCell(`J${r}`).value = null;
      sheet.getCell(`K${r}`).value = null;
      sheet.getCell(`L${r}`).value = null;
      sheet.getCell(`M${r}`).value = null;
      sheet.getCell(`N${r}`).value = null;
      sheet.getCell(`O${r}`).value = null;
      sheet.getCell(`P${r}`).value = null;
      sheet.getCell(`Q${r}`).value = null;
      sheet.getCell(`R${r}`).value = null;
    }
    
    // 8. Write signatures
    // If we have more than 84 records, the signature row must be pushed down dynamically!
    // Otherwise it stays at B93 (so that spliceRows later pulls it up perfectly)
    const sigRowIndex = dataRecords.length > 84 ? 8 + dataRecords.length + 2 : 93;
    const sigCellRef = `B${sigRowIndex}`;
    
    const formattedUploadDate = report.uploadDate ? new Date(report.uploadDate).toLocaleDateString() : new Date().toLocaleDateString();
    const formattedReviewDate = report.reviewDate ? new Date(report.reviewDate).toLocaleDateString() : '__________';
    const formattedApprovalDate = report.approvalDate ? new Date(report.approvalDate).toLocaleDateString() : '__________';
    
    let sigText = `                                Tested By                                     Reviewed By                                     Approved By                               \n\n                          \n        \n                              Name: ${report.testEngineer || '__________'}                      Name: ${report.reviewedBy || '__________'}                        Name: ${report.approvedBy || '__________'}                              \n\n                       Battery Testing Engineer                     Quality Engineer                         Quality Manager                        \n                     Date: ${formattedUploadDate}                           Date: ${formattedReviewDate}                          Date: ${formattedApprovalDate}                       `;
    
    sheet.getCell(sigCellRef).value = sigText;
    
    // 9. Delete the unused sheet "a" if present
    const sheetA = workbook.getWorksheet('a') || workbook.worksheets.find(s => s.name === 'a');
    if (sheetA && sheetA.id !== sheet.id) {
      workbook.removeWorksheet(sheetA.id);
    }
    
    // 10. Delete unused template data rows to pull the signature block up right below the data rows
    const startUnusedRow = 8 + dataRecords.length;
    const endUnusedRow = 91;
    if (endUnusedRow >= startUnusedRow) {
      sheet.spliceRows(startUnusedRow, endUnusedRow - startUnusedRow + 1);
    }
    
    // 13. Rename target sheet to model number
    const safeModelNum = (report.modelNumber || 'Report').replace(/[:/]/g, '-').substring(0, 31);
    sheet.name = safeModelNum;
    
    // 14. Write buffer and trigger save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const outputName = `${reportFileStem(report)}.xlsx`;
    saveAs(blob, outputName);
    
  } catch (err) {
    console.error('Error generating Excel file:', err);
    alert('Failed to generate Excel report using template. Falling back to clean CSV download.');
    downloadFallbackCsv(report, records);
  }
}

function downloadFallbackCsv(report, records) {
  if (!report) {
    console.error('No active report available to generate CSV.');
    return;
  }
  const headers = [
    'No.', 'Battery Pack ID', 
    'Idle DeltaV (mV)', 'Idle Delta_T (C)', 
    'DCH_DeltaV (mV)', 'DCH_Delta_T (C)', 
    'CH_DeltaV (mV)', 'CH_Delta_T (C)', 
    'Short CDC CH_DeltaV (mV)', 'Short CDC DCH_DeltaV (mV)', 
    'SOC (%)', 'Voltage (V)', 'BMS Error', 
    'Pulse Result', 'Overall Result'
  ];
  
  const rows = records.map((r, i) => [
    i + 1, r.batteryPackId,
    r.idleDeltaV, r.idleDeltaT,
    r.dchDeltaV, r.dchDeltaT,
    r.chDeltaV, r.chDeltaT,
    r.shortChDeltaV, r.shortDchDeltaV,
    r.soc, r.voltage, r.bmsError,
    r.pulseResult, r.overallResult
  ]);
  
  let csvContent = `Plant : ,Mindewadi,Test Department : ,Battery Testing-New Energy,Model No : ,${report.modelNumber}\n`;
  csvContent += `Report ID: ,${report.id},Tested By: ,${report.testEngineer || ''},Date: ,${report.uploadDate || ''}\n`;
  csvContent += `Reviewed By: ,${report.reviewedBy || 'Pending'},Approved By: ,${report.approvedBy || 'Pending'}\n\n`;
  csvContent += headers.join(',') + '\n';
  
  rows.forEach(row => {
    csvContent += row.join(',') + '\n';
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${reportFileStem(report)}.csv`);
}

export async function downloadRawReportFiles(report) {
  if (!report || !report.id) return;
  try {
    const response = await api.get(`/reports/${report.id}/download-raw`, {
      responseType: 'blob'
    });
    
    let filename = `${report.modelNumber || 'Report'}_RawData.zip`;
    const disposition = response.headers['content-disposition'];
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    } else if (response.data.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      filename = `${report.modelNumber || 'Report'}_RawData.xlsx`;
    }
    
    saveAs(response.data, filename);
  } catch (err) {
    console.error('Failed to download raw data:', err);
    throw err;
  }
}