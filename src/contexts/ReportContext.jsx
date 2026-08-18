import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from './AuthContext';

const ReportContext = createContext(null);

const MODEL_NUMBERS = [
  'ENE5160-BTR-PP-CDC01-DDM2601',
  'ENE5160-BTR-PP-CDC02-DDM2602',
  'ENE5160-BTR-PP-CDC03-DDM2603',
  'ENE3280-BTR-PP-CDC01-DDM1301',
];

// Helper to normalize a single battery pack record to have consistent lowercase keys
const normalizeRecord = (rec) => {
  if (!rec) return null;
  return {
    batteryPackId: rec.batteryPackId || rec.BatteryPackId || '',
    idleDeltaV: rec.idleDeltaV !== undefined ? rec.idleDeltaV : (rec.IdleDeltaV || 0),
    idleDeltaT: rec.idleDeltaT !== undefined ? rec.idleDeltaT : (rec.IdleDeltaT || 0),
    dchDeltaV: rec.dchDeltaV !== undefined ? rec.dchDeltaV : (rec.DchDeltaV || 0),
    dchDeltaT: rec.dchDeltaT !== undefined ? rec.dchDeltaT : (rec.DchDeltaT || 0),
    chDeltaV: rec.chDeltaV !== undefined ? rec.chDeltaV : (rec.ChDeltaV || 0),
    chDeltaT: rec.chDeltaT !== undefined ? rec.chDeltaT : (rec.ChDeltaT || 0),
    shortChDeltaV: rec.shortChDeltaV !== undefined ? rec.shortChDeltaV : (rec.ShortChDeltaV || 0),
    shortDchDeltaV: rec.shortDchDeltaV !== undefined ? rec.ShortDchDeltaV || rec.shortDchDeltaV || 0 : (rec.ShortDchDeltaV || 0),
    soc: rec.soc !== undefined ? rec.soc : (rec.Soc || 0),
    voltage: rec.voltage !== undefined ? rec.voltage : (rec.Voltage || 0),
    bmsError: rec.bmsError || rec.BmsError || 'NO',
    pulseResult: rec.pulseResult || rec.PulseResult || 'Pass',
    cdcResult: rec.cdcResult || rec.CdcResult || 'Pass',
    socResult: rec.socResult || rec.SocResult || 'Pass',
    overallResult: rec.overallResult || rec.OverallResult || 'Pass',
  };
};

// Helper to normalize the report data from backend PascalCase/camelCase and parse JSON strings
export const normalizeReport = (r) => {
  if (!r) return null;
  
  const id = r.id || r.Id || '';
  const modelNumber = r.modelNumber || r.ModelNumber || '';
  const testEngineer = r.testEngineer || r.TestEngineer || '';
  const testEngineerId = r.testEngineerId || r.TestEngineerId || '';
  const status = r.status || r.Status || 'uploaded';
  const uploadDate = r.uploadDate || r.UploadDate || new Date().toISOString();
  const reviewedBy = r.reviewedBy || r.ReviewedBy || null;
  const reviewDate = r.reviewDate || r.ReviewDate || null;
  const approvedBy = r.approvedBy || r.ApprovedBy || null;
  const approvalDate = r.approvalDate || r.ApprovalDate || null;
  const fileName = r.fileName || r.FileName || '';
  const passFailStatus = r.passFailStatus || r.PassFailStatus || 'pending';

  // Parse RawDataJson
  let rawData = {};
  try {
    const rawJson = r.rawDataJson || r.RawDataJson;
    if (rawJson) {
      rawData = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    }
    if (rawData && Array.isArray(rawData.records)) {
      rawData.records = rawData.records.map(normalizeRecord);
    }
  } catch (e) {
    console.error('Error parsing rawDataJson', e);
  }

  // Parse GeneratedDataJson
  let generatedData = null;
  try {
    const genJson = r.generatedDataJson || r.GeneratedDataJson;
    if (genJson && genJson !== '{}') {
      generatedData = typeof genJson === 'string' ? JSON.parse(genJson) : genJson;
    }
    if (generatedData && Array.isArray(generatedData.records)) {
      generatedData.records = generatedData.records.map(normalizeRecord);
    }
  } catch (e) {
    console.error('Error parsing generatedDataJson', e);
  }

  return {
    id,
    modelNumber,
    testEngineer,
    testEngineerId,
    status,
    uploadDate,
    reviewedBy,
    reviewDate,
    approvedBy,
    approvalDate,
    fileName,
    rawData,
    generatedData,
    passFailStatus,
  };
};

export function ReportProvider({ children }) {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch reports on start
  const fetchReports = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reports`, {
        headers: {
          'Authorization': user ? `Bearer ${user.token}` : ''
        }
      });
      
      if (response.status === 401) {
        logout();
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setReports(data.map(normalizeReport));
      }
    } catch (e) {
      console.error('Failed to fetch reports from backend API:', e);
    } finally {
      setLoading(false);
    }
  }, [user, logout]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Upload files and add report to backend
  const addReport = useCallback(async (reportData) => {
    const { modelNumber, files, testEngineer, testEngineerId } = reportData;
    
    const formData = new FormData();
    formData.append('modelNumber', modelNumber);
    formData.append('engineerId', testEngineerId);
    formData.append('engineerName', testEngineer);
    
    files.forEach(f => {
      formData.append('files', f);
    });

    try {
      const response = await fetch(`${API_BASE_URL}/reports/upload`, {
        method: 'POST',
        headers: {
          'Authorization': user ? `Bearer ${user.token}` : ''
        },
        body: formData,
      });

      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to upload reports to backend');
      }

      const newReport = await response.json();
      const normalized = normalizeReport(newReport);
      
      setReports(prev => [normalized, ...prev]);
      return normalized;
    } catch (err) {
      console.error('Upload failed:', err);
      throw err;
    }
  }, [user, logout]);

  // Update report status in backend
  const updateReportStatus = useCallback(async (id, status, userId, userName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user ? `Bearer ${user.token}` : ''
        },
        body: JSON.stringify({ status, userId, userName }),
      });

      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update report status');
      }

      const updatedReport = await response.json();
      const normalized = normalizeReport(updatedReport);
      
      setReports(prev => prev.map(r => r.id === id ? normalized : r));
      return normalized;
    } catch (err) {
      console.error('Status update failed:', err);
      throw err;
    }
  }, [user, logout]);

  const getReportsByStatus = useCallback(
    (status) => reports.filter((r) => r.status === status),
    [reports]
  );

  const getReportsByEngineer = useCallback(
    (engineerId) => reports.filter((r) => r.testEngineerId === engineerId),
    [reports]
  );

  // Compute stats reactively from reports array
  const getStats = useCallback(() => {
    const totalReports = reports.length;
    const passCount = reports.filter((r) => r.passFailStatus === 'pass').length;
    const failCount = reports.filter((r) => r.passFailStatus === 'fail').length;
    const pendingCount = reports.filter((r) => r.passFailStatus === 'pending').length;

    // Model distribution
    const modelMap = {};
    reports.forEach((r) => {
      modelMap[r.modelNumber] = (modelMap[r.modelNumber] || 0) + 1;
    });
    const modelDistribution = Object.entries(modelMap).map(([name, value]) => ({
      name,
      value,
    }));

    // User activity
    const activityMap = {};
    reports.forEach((r) => {
      // Tested
      if (r.testEngineer) {
        if (!activityMap[r.testEngineer]) {
          activityMap[r.testEngineer] = { name: r.testEngineer, tested: 0, reviewed: 0, approved: 0 };
        }
        activityMap[r.testEngineer].tested += 1;
      }

      // Reviewed
      if (r.reviewedBy) {
        if (!activityMap[r.reviewedBy]) {
          activityMap[r.reviewedBy] = { name: r.reviewedBy, tested: 0, reviewed: 0, approved: 0 };
        }
        activityMap[r.reviewedBy].reviewed += 1;
      }

      // Approved
      if (r.approvedBy) {
        if (!activityMap[r.approvedBy]) {
          activityMap[r.approvedBy] = { name: r.approvedBy, tested: 0, reviewed: 0, approved: 0 };
        }
        activityMap[r.approvedBy].approved += 1;
      }
    });
    const userActivity = Object.values(activityMap);

    return {
      totalReports,
      passCount,
      failCount,
      pendingCount,
      modelDistribution,
      userActivity,
    };
  }, [reports]);

  const clearAllReports = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reports`, {
        method: 'DELETE',
        headers: {
          'Authorization': user ? `Bearer ${user.token}` : ''
        }
      });
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      
      if (!response.ok) {
        throw new Error('Failed to clear reports');
      }
      setReports([]);
    } catch (err) {
      console.error('Clear all failed:', err);
      throw err;
    }
  }, [user, logout]);

  const deleteReport = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': user ? `Bearer ${user.token}` : ''
        }
      });
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      
      if (!response.ok) {
        throw new Error('Failed to delete report');
      }
      setReports(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Delete report failed:', err);
      throw err;
    }
  }, [user, logout]);

  const value = useMemo(
    () => ({
      reports,
      loading,
      addReport,
      updateReportStatus,
      clearAllReports,
      deleteReport,
      getReportsByStatus,
      getReportsByEngineer,
      getStats,
      refreshReports: fetchReports,
    }),
    [reports, loading, addReport, updateReportStatus, clearAllReports, deleteReport, getReportsByStatus, getReportsByEngineer, getStats, fetchReports]
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReports() {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error('useReports must be used within a ReportProvider');
  }
  return context;
}

export default ReportContext;
