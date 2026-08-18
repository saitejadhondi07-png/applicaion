import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useReportData } from './ReportDataContext';

const ReportFiltersContext = createContext(null);

export function ReportFiltersProvider({ children }) {
  const { reports = [] } = useReportData();
  const getReportsByStatus = useCallback(
    (status) => reports.filter((r) => r.status === status),
    [reports]
  );

  const getReportsByEngineer = useCallback(
    (engineerId) => reports.filter((r) => r.testEngineerId === engineerId),
    [reports]
  );

  const getStats = useCallback(() => {
    if (!reports || reports.length === 0) {
      return {
        totalReports: 0,
        passCount: 0,
        failCount: 0,
        pendingCount: 0,
        modelDistribution: [],
        userActivity: [],
      };
    }
    
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

  const value = useMemo(
    () => ({
      getReportsByStatus,
      getReportsByEngineer,
      getStats,
    }),
    [getReportsByStatus, getReportsByEngineer, getStats]
  );

  return <ReportFiltersContext.Provider value={value}>{children}</ReportFiltersContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReportFilters() {
  const context = useContext(ReportFiltersContext);
  if (!context) {
    throw new Error('useReportFilters must be used within a ReportFiltersProvider');
  }
  return context;
}

export default ReportFiltersContext;