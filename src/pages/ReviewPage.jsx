import React, { useState } from 'react';
import { useReportFilters } from '../contexts/ReportFiltersContext';
import { useReportMutations } from '../contexts/ReportMutationsContext';
import { useAuth } from '../contexts/AuthContext';
import { downloadReportExcel } from '../utils/downloadUtils';
import { API_BASE_URL } from '../config';
import './ReviewPage.css';

export default function ReviewPage() {
  const { getReportsByStatus } = useReportFilters();
  const { updateReportStatus } = useReportMutations();
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState(null);
  const [isExportingId, setIsExportingId] = useState(null);
  const [exportProgress, setExportProgress] = useState(0);

  const reports = getReportsByStatus('generated');

  const handleToggle = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleAction = (id, status) => {
    updateReportStatus(id, status, user?.id, user?.name);
  };

  const handleDownload = async (e, report) => {
    e.stopPropagation();
    setIsExportingId(report.id);
    setExportProgress(0);
    const interval = setInterval(() => {
      setExportProgress(p => p < 95 ? p + Math.floor(Math.random() * 5) + 1 : p);
    }, 400);

    try {
      await downloadReportExcel(report, null, 'Combination');
    } catch (err) {
      console.error(err);
    } finally {
      clearInterval(interval);
      setExportProgress(100);
      setTimeout(() => setIsExportingId(null), 500);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusClass = (passFailStatus) => {
    if (passFailStatus === 'pass') return 'status--pass';
    if (passFailStatus === 'fail') return 'status--fail';
    return 'status--pending';
  };

  const getStatusLabel = (passFailStatus) => {
    if (passFailStatus === 'pass') return '✓ Pass';
    if (passFailStatus === 'fail') return '✗ Fail';
    return '⏳ Pending';
  };

  return (
    <div className="review-page">
      {/* Header */}
      <div className="review-header">
        <h1>
          🔍 Review Queue
          {reports.length > 0 && (
            <span className="review-count-badge">{reports.length} pending</span>
          )}
        </h1>
        <p>Review generated reports and mark them as reviewed or rejected</p>
      </div>

      {/* Report Cards */}
      {reports.length > 0 ? (
        <div className="review-cards">
          {reports.map((report, idx) => (
            <div
              className="review-card"
              key={report.id}
              style={{ animationDelay: `${idx * 0.08}s` }}
            >
              {/* Card Header */}
              <div
                className="review-card-header"
                onClick={() => handleToggle(report.id)}
              >
                <div className="review-card-info">
                  <span className="review-card-id">{report.id}</span>
                  <span className="review-card-engineer">
                    👤 {report.testEngineer}
                  </span>
                  <span className="review-card-date">
                    📅 {formatDate(report.uploadDate)}
                  </span>
                  <span
                    className={`review-card-status ${getStatusClass(report.passFailStatus)}`}
                  >
                    {getStatusLabel(report.passFailStatus)}
                  </span>
                </div>
                <span
                  className={`review-card-expand ${
                    expandedId === report.id ? 'expanded' : ''
                  }`}
                >
                  ▼
                </span>
              </div>

              {/* Expanded Body */}
              {expandedId === report.id && (
                <div className="review-card-body">
                  {/* File Metadata */}
                  <div className="report-metadata-grid">
                    <div className="meta-item">
                      <span className="meta-label">File Name</span>
                      <span className="meta-val">{report.fileName}</span>
                    </div>
                    {report.generatedData?.generatedAt && (
                      <div className="meta-item">
                        <span className="meta-label">Generated At</span>
                        <span className="meta-val">{formatDate(report.generatedData.generatedAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Render Data Grid (if records exist) */}
                  {report.generatedData?.records && Array.isArray(report.generatedData.records) ? (
                    <div className="review-table-container">
                      <h4>Calculated Battery Pack Records ({report.generatedData.records.length})</h4>
                      <div className="review-table-wrapper">
                        <table className="review-data-grid">
                          <thead>
                            <tr>
                              <th>Pack ID</th>
                              <th>Idle DeltaV (mV)</th>
                              <th>Idle DeltaT (°C)</th>
                              <th>DCH DeltaV (mV)</th>
                              <th>CH DeltaV (mV)</th>
                              <th>SOC (%)</th>
                              <th>Voltage (V)</th>
                              <th>BMS Error</th>
                              <th>Pulse Result</th>
                              <th>Overall Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.generatedData.records.map((row, rIdx) => (
                              <tr key={rIdx}>
                                <td style={{ fontWeight: 600, color: '#a78bfa' }}>{row.batteryPackId}</td>
                                <td>{row.idleDeltaV}</td>
                                <td>{row.idleDeltaT}</td>
                                <td>{row.dchDeltaV}</td>
                                <td>{row.chDeltaV}</td>
                                <td>{row.soc}%</td>
                                <td>{row.voltage}V</td>
                                <td>
                                  <span className={`bms-badge ${row.bmsError !== 'NO' ? 'err' : ''}`}>
                                    {row.bmsError}
                                  </span>
                                </td>
                                <td>
                                  <span className={`res-badge ${(row.pulseResult || 'Pass').toLowerCase()}`}>
                                    {row.pulseResult || 'Pass'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`res-badge ${(row.overallResult || 'Pass').toLowerCase()}`}>
                                    {row.overallResult || 'Pass'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* Fallback to simple key-value table for mock reports */
                    <div className="review-summary-fallback">
                      <h4>Report Summary Data</h4>
                      <table className="review-data-table">
                        <thead>
                          <tr>
                            {report.generatedData && Object.keys(report.generatedData).filter(k => k !== 'records').map((key) => (
                              <th key={key}>{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {report.generatedData && Object.entries(report.generatedData).filter(([k]) => k !== 'records').map(([_, val], i) => (
                              <td key={i}>{String(val)}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="review-card-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      className="review-action-btn"
                      style={{ background: '#0ea5e9', color: '#fff', border: '1px solid #38bdf8' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`${API_BASE_URL}/reports/${report.id}/download-raw`, '_blank');
                      }}
                      title="Download Raw Uploaded Test Log File(s)"
                    >
                      📥 Raw Data
                    </button>
                    <button
                      className="review-action-btn"
                      style={{ background: '#10b981', color: '#fff', border: '1px solid #34d399', position: 'relative', overflow: 'hidden' }}
                      onClick={(e) => handleDownload(e, report)}
                      disabled={isExportingId !== null}
                      title="Download Generated Excel Report"
                    >
                      {isExportingId === report.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div className="spinner-border" style={{ width: '12px', height: '12px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                          <span>{exportProgress}%</span>
                        </div>
                      ) : (
                        <>⬇ Report</>
                      )}
                    </button>
                    <button
                      className="review-action-btn review-btn-reject"
                      onClick={() => handleAction(report.id, 'rejected')}
                    >
                      Reject ✗
                    </button>
                    <button
                      className="review-action-btn review-btn-approve"
                      onClick={() => handleAction(report.id, 'reviewed')}
                    >
                      Mark as Reviewed ✓
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="review-empty">
          <div className="review-empty-icon">📭</div>
          <h2>No reports pending review</h2>
          <p>
            All generated reports have been reviewed. New reports will appear here
            after test engineers upload and generate them.
          </p>
        </div>
      )}
    </div>
  );
}
