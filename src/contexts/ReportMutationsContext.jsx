import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useReportData, normalizeReport } from './ReportDataContext';
import api from '../utils/api';

const ReportMutationsContext = createContext(null);

export function ReportMutationsProvider({ children }) {
  const { logout } = useAuth();
  const { setReports, refreshReports } = useReportData();

  const addReport = useCallback(async (reportData, onProgress) => {
    try {
      const formData = new FormData();
      formData.append('modelNumber', reportData.modelNumber);
      formData.append('engineerId', reportData.testEngineerId);
      formData.append('engineerName', reportData.testEngineer);
      
      reportData.files.forEach(f => {
        formData.append('files', f.rawFile || f);
      });

      const response = await api.post('/reports/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (onProgress) onProgress(percentCompleted);
        }
      });

      if (onProgress) onProgress(100);

      const uploadData = response.data;
      const reportId = uploadData.id || uploadData.Id;

      let fullReport = uploadData;
      if (reportId) {
        try {
          const detailResponse = await api.get(`/reports/${reportId}`);
          fullReport = { ...detailResponse.data, failedFiles: uploadData.failedFiles || uploadData.FailedFiles };
        } catch (detailErr) {
          console.warn('Could not fetch report detail, using upload response:', detailErr);
        }
      }

      const normalized = normalizeReport(fullReport);
      if (refreshReports) {
        await refreshReports();
        setReports(prev => {
          const exists = prev.some(r => r.id === normalized.id);
          if (exists) {
            return prev.map(r => r.id === normalized.id ? normalized : r);
          }
          return [normalized, ...prev];
        });
      }
      return normalized;
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      console.error('Upload failed:', err);
      throw err;
    }
  }, [logout, refreshReports, setReports]);

  const updateReportStatus = useCallback(async (id, status, userId, userName) => {
    try {
      const response = await api.put(`/reports/${id}/status`, { status, userId, userName });
      const normalized = normalizeReport(response.data);
      if (refreshReports) {
        await refreshReports();
        setReports(prev => prev.map(r => r.id === normalized.id ? normalized : r));
      }
      return normalized;
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      console.error('Status update failed:', err);
      throw err;
    }
  }, [logout, refreshReports, setReports]);

  const deleteReport = useCallback(async (id) => {
    try {
      await api.delete(`/reports/${id}`);
      return true;
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      console.error('Delete report failed:', err);
      throw err;
    }
  }, [logout]);

  const clearAllReports = useCallback(async () => {
    try {
      await api.delete('/reports');
      return true;
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      console.error('Clear all failed:', err);
      throw err;
    }
  }, [logout]);

  const value = useMemo(
    () => ({
      addReport,
      updateReportStatus,
      deleteReport,
      clearAllReports,
    }),
    [addReport, updateReportStatus, deleteReport, clearAllReports]
  );

  return <ReportMutationsContext.Provider value={value}>{children}</ReportMutationsContext.Provider>;
}

export function useReportMutations() {
  const context = useContext(ReportMutationsContext);
  if (!context) {
    throw new Error('useReportMutations must be used within a ReportMutationsProvider');
  }
  return context;
}

export default ReportMutationsContext;