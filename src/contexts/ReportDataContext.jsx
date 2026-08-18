import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import api from '../utils/api';

const ReportDataContext = createContext(null);

export function normalizeReport(r) {
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
  const failedFiles = r.failedFiles || r.FailedFiles || [];

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

  const detailRecords = r.records || r.Records;
  if (detailRecords && Array.isArray(detailRecords) && detailRecords.length > 0) {
    const normalizedRecords = detailRecords.map(normalizeRecord);
    if (!generatedData) {
      generatedData = { records: normalizedRecords };
    } else if (!generatedData.records || generatedData.records.length === 0) {
      generatedData.records = normalizedRecords;
    }
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
    failedFiles,
  };
};

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

export function ReportDataProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    if (!user) {
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/reports');
      const data = response.data;
      const list = Array.isArray(data) ? data : (data?.reports || []);
      setReports(list.map(normalizeReport));
    } catch (e) {
      if (e.response?.status !== 401) {
        console.error('Failed to fetch reports from backend API:', e);
      }
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchReports();
    }
  }, [fetchReports, authLoading]);

  const value = useMemo(
    () => ({
      reports,
      loading,
      setReports,
      refreshReports: fetchReports,
    }),
    [reports, loading, fetchReports]
  );

  return <ReportDataContext.Provider value={value}>{children}</ReportDataContext.Provider>;
}

export function ReportDataConsumer({ children }) {
  const { reports } = useReportData();
  return <>{children(reports)}</>;
}

export function useReportData() {
  const context = useContext(ReportDataContext);
  if (!context) {
    throw new Error('useReportData must be used within a ReportDataProvider');
  }
  return context;
}

export default ReportDataContext;