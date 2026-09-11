// The pack ID is a "T" plus 11 alphanumerics standing alone between separators, e.g.
// "G14_COM14__Profile_Test_TFA3633001BA_DESKTOP-2CDN5CI_...csv" -> "TFA3633001BA".
// Must stay in step with ExtractBatteryPackId in backend/Services/ReportCalculator.cs.
// Written with a consumed prefix group rather than a lookbehind so it parses in every
// browser. An unanchored /T[A-Z0-9]{11}/ could start mid-token and return 12 characters
// that are not a pack ID.
const PACK_ID_RE = /(^|[^A-Z0-9])(T[A-Z0-9]{11})(?![A-Z0-9])/i;

export const extractBatteryPackId = (filename) => {
  const match = filename.match(PACK_ID_RE);
  return match ? match[2].toUpperCase() : '';
};

const checkFileSignature = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    // Fallback timeout to ensure we never hang forever
    const timeoutId = setTimeout(() => {
      resolve('unknown');
    }, 2000);

    reader.onloadend = (e) => {
      clearTimeout(timeoutId);
      if (e.target.error || !e.target.result) {
        resolve('unknown');
        return;
      }
      if (e.target.readyState === FileReader.DONE) {
        try {
          const arr = new Uint8Array(e.target.result);
          if (arr.length < 4) {
            resolve('unknown');
            return;
          }
          let header = '';
          for (let i = 0; i < Math.min(arr.length, 8); i++) {
            header += arr[i].toString(16).padStart(2, '0').toUpperCase();
          }
          
          // .xls (OLE CF) signature is D0CF11E0A1B11AE1
          if (header.startsWith('D0CF11E0A1B11AE1')) {
            resolve('xls');
            return;
          }
          
          // .xlsx (ZIP) signature starts with 504B0304 (PK..)
          if (header.startsWith('504B0304')) {
            resolve('xlsx');
            return;
          }
          
          resolve('unknown');
        } catch {
          resolve('unknown');
        }
      }
    };
    reader.onerror = () => {
      clearTimeout(timeoutId);
      resolve('unknown');
    };
    
    try {
      reader.readAsArrayBuffer(file.slice(0, 8));
    } catch (err) {
      clearTimeout(timeoutId);
      resolve('unknown');
    }
  });
};

export const processSingleFile = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase();
  
  if (ext === 'xlsx') {
    const signature = await checkFileSignature(file);
    if (signature === 'xls') {
      return { type: 'unsupported', error: 'File appears to be an older .xls file despite having a .xlsx extension. Please save it as a proper Excel Workbook (.xlsx).' };
    } else if (signature === 'unknown') {
      return { type: 'unsupported', error: 'Corrupted or unreadable .xlsx file (invalid file signature). Please ensure this is a valid Excel file.' };
    }

    // Deep validation removed to make parsing instant. The backend will validate the file anyway.
    
    const hasPackId = PACK_ID_RE.test(file.name);
    // Treat all valid .xlsx as raw data - let backend decide
    const packId = extractBatteryPackId(file.name);
    return { type: 'raw_excel', packId, hasPackId };
  } else if (ext === 'csv') {
    if (file.size === 0) {
      return { type: 'unsupported', error: 'File is completely empty. Please provide a valid CSV file.' };
    }
    
    // Validate CSV content to ensure it's not randomly corrupted
    try {
      const text = await file.slice(0, 1024).text(); // read first 1KB
      if (!text || text.trim().length === 0) {
         return { type: 'unsupported', error: 'CSV file contains no readable text data.' };
      }
      
      // Basic check: A typical CSV log should have some commas or tabs. If it's just random binary garbage, it will fail this.
      // We don't want to be TOO strict, but it must be printable text.
      // We check if the first 100 characters are mostly printable.
      const first100 = text.substring(0, 100);
      const isMostlyPrintable = /^[\x20-\x7E\r\n\t]*$/.test(first100);
      const hasFewInvalidChars = (first100.match(/[^\x20-\x7E\r\n\t]/g) || []).length < 5;
      
      if (!isMostlyPrintable && !hasFewInvalidChars) {
         return { type: 'unsupported', error: 'CSV file appears to be corrupted or contains invalid binary characters.' };
      }
    } catch (err) {
      return { type: 'unsupported', error: 'Could not read CSV file.' };
    }

    const hasPackId = PACK_ID_RE.test(file.name);
    const packId = extractBatteryPackId(file.name);
    return { type: 'raw_csv', packId, hasPackId };
  } else {
    return { type: 'unsupported', error: 'Unsupported file type (.xlsx and .csv only)' };
  }
};

export const parseFiles = async (files, onProgress) => {
  const results = {
    filesList: [],
    records: [],
    failed: []
  };

  const fileArray = Array.from(files);
  const totalFiles = fileArray.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = fileArray[i];
    if (onProgress) {
      const percentage = Math.round(((i) / totalFiles) * 100);
      onProgress(percentage);
    }
    if (file.name.startsWith('~$')) {
      results.failed.push({ name: file.name, error: 'Temporary Excel files (~$) cannot be processed. Please upload the actual saved workbook.' });
      continue;
    }
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      results.failed.push({ name: file.name, error: 'Unsupported file type (.csv and .xlsx only)' });
      continue;
    }

    // A raw export is identified only by its filename. With no pack ID in the name the
    // record cannot be attributed to a pack, and the backend used to invent one from the
    // filename ("G2_COM2__..." became "TFAG2COM2PRO"), filing real measurements under a
    // pack that does not exist. Rejected here and again server-side.
    if (!PACK_ID_RE.test(file.name)) {
      results.failed.push({
        name: file.name,
        error: 'No Battery Pack ID in the filename. Expected a 12-character ID such as TFA3633001BA. Rename the export to include the pack ID.',
      });
      continue;
    }

    try {
      const res = await processSingleFile(file);
      
      const fileObj = {
        name: file.name,
        size: file.size,
        rawFile: file,
        invalidPackId: false,
        error: ''
      };

      if (res.type === 'unsupported') {
        results.failed.push({ name: file.name, error: res.error });
      } else if (res.type === 'raw_csv' || res.type === 'raw_excel') {
        // Accept all valid extensions - backend validates content
        results.filesList.push(fileObj);
      } else {
        results.failed.push({ name: file.name, error: 'Empty or unprocessable file' });
      }
    } catch (err) {
      results.failed.push({ name: file.name, error: 'Corrupted file or processing error' });
    }
  }

  return results;
};