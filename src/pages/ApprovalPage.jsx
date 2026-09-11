import React from 'react';
import { useReportFilters } from '../contexts/ReportFiltersContext';
import { useReportMutations } from '../contexts/ReportMutationsContext';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';
import './ApprovalPage.css';

const TIMELINE_STEPS = ['Uploaded', 'Generated', 'Reviewed', 'Approved'];
const STATUS_TO_STEP_INDEX = {
  uploaded: 0,
  generated: 1,
  reviewed: 2,
  approved: 3,
};

export default function ApprovalPage() {
  const { getReportsByStatus } = useReportFilters();
  const { updateReportStatus } = useReportMutations();
  const { user } = useAuth();

  const reports = getReportsByStatus('reviewed');

  const handleAction = (id, status) => {
    updateReportStatus(id, status, user?.id, user?.name);
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

  const getStepState = (stepIdx, currentStep) => {
    if (stepIdx < currentStep) return 'completed';
    if (stepIdx === currentStep) return 'active';
    return 'pending';
  };

  const getConnectorState = (stepIdx, currentStep) => {
    if (stepIdx < currentStep) return 'completed';
    return 'pending';
  };

  return (
    <div className="approval-page">
      {/* Header */}
      <div className="approval-header">
        <h1>
          ✅ Approval Queue
          {reports.length > 0 && (
            <span className="approval-count-badge">{reports.length} pending</span>
          )}
        </h1>
        <p>Review quality-reviewed sheets, approve them, and close files</p>
      </div>

      {/* Report Cards */}
      {reports.length > 0 ? (
        <div className="approval-cards">
          {reports.map((report, idx) => {
            const currentStep = STATUS_TO_STEP_INDEX[report.status] ?? 0;

            return (
              <div
                className="approval-card"
                key={report.id}
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                {/* Card Header */}
                <div className="approval-card-header">
                  <div className="approval-card-info">
                    <span className="approval-card-id">{report.testReportId || report.id}</span>
                    <span className="approval-card-detail">
                      👤 Test Eng: {report.testEngineer}
                    </span>
                    <span className="approval-card-detail">
                      📅 Date: {formatDate(report.uploadDate)}
                    </span>
                    <span className="approval-card-detail" style={{ color: '#10b981', fontWeight: 600 }}>
                      🔍 Reviewed by: {report.reviewedBy || 'QE Reviewer'}
                    </span>
                  </div>
                </div>

                {/* Timeline Progress */}
                <div className="approval-timeline">
                  {TIMELINE_STEPS.map((step, stepIdx) => {
                    const state = getStepState(stepIdx, currentStep);
                    return (
                      <React.Fragment key={step}>
                        <div className="timeline-step">
                          <div className={`timeline-dot ${state}`}>
                            {state === 'completed' ? '✓' : stepIdx + 1}
                          </div>
                          <span className={`timeline-label ${state}`}>{step}</span>
                        </div>
                        {stepIdx < TIMELINE_STEPS.length - 1 && (
                          <div
                            className={`timeline-connector ${getConnectorState(stepIdx, currentStep)}`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Card Body Details */}
                <div className="approval-card-body">
                  <div className="approval-meta-grid">
                    <div className="meta-item">
                      <span className="meta-label">File Name</span>
                      <span className="meta-val">{report.fileName || 'N/A'}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Pass/Fail Status</span>
                      <span className={`meta-val badge-${report.passFailStatus}`}>
                        {report.passFailStatus === 'pass' ? '✓ Pass' : report.passFailStatus === 'fail' ? '✗ Fail' : '⏳ Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Render Data Grid (if records exist) */}
                  {report.generatedData?.records && Array.isArray(report.generatedData.records) ? (
                    <div className="approval-table-container">
                      <h4>Calculated Battery Pack Records ({report.generatedData.records.length})</h4>
                      <div className="approval-table-wrapper">
                        <table className="approval-data-grid">
                          <thead>
                            <tr>
                              <th>Pack ID</th>
                              <th>Idle DeltaV (mV)</th>
                              <th>Idle DeltaT (°C)</th>
                              <th>DCH DeltaV (mV)</th>
                              <th>CH DeltaV (mV)</th>
                              <th>Short CDC CH (mV)</th>
                              <th>Short CDC DCH (mV)</th>
                              <th>SOC (%)</th>
                              <th>SOC Result</th>
                              <th>Voltage (V)</th>
                              <th>BMS Error</th>
                              <th>Pulse Result</th>
                              <th>CDC Result</th>
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
                                <td>{row.shortChDeltaV}</td>
                                <td>{row.shortDchDeltaV}</td>
                                <td>{row.soc}%</td>
                                <td>
                                  <span className={`res-badge ${(row.socResult || 'Pass').toLowerCase()}`}>
                                    {row.socResult || 'Pass'}
                                  </span>
                                </td>
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
                                  <span className={`res-badge ${(row.cdcResult || 'Pass').toLowerCase()}`}>
                                    {row.cdcResult || 'Pass'}
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
                    /* Fallback summary fields */
                    <div className="approval-summary-fallback">
                      <h4>Report Summary</h4>
                      <div className="fallback-stats-grid">
                        <div className="f-stat">
                          <span className="fs-lbl">Efficiency</span>
                          <span className="fs-val">{report.generatedData?.efficiency || 'N/A'}%</span>
                        </div>
                        <div className="f-stat">
                          <span className="fs-lbl">Quality Score</span>
                          <span className="fs-val">{report.generatedData?.qualityScore || 'N/A'}</span>
                        </div>
                        <div className="f-stat">
                          <span className="fs-lbl">Power Output</span>
                          <span className="fs-val">{report.generatedData?.powerOutput || 'N/A'} W</span>
                        </div>
                        <div className="f-stat">
                          <span className="fs-lbl">Thermal Index</span>
                          <span className="fs-val">{report.generatedData?.thermalIndex || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="approval-card-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    className="approval-action-btn"
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
                    className="approval-action-btn"
                    style={{ background: '#10b981', color: '#fff', border: '1px solid #34d399' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`${API_BASE_URL}/reports/${report.id}/download`, '_blank');
                    }}
                    title="Download Generated Excel Report"
                  >
                    ⬇ Report
                  </button>
                  <button
                    className="approval-action-btn approval-btn-reject"
                    onClick={() => handleAction(report.id, 'rejected')}
                  >
                    Reject ✗
                  </button>
                  <button
                    className="approval-action-btn approval-btn-approve"
                    onClick={() => handleAction(report.id, 'approved')}
                  >
                    Approve & Close ✓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="approval-empty">
          <div className="approval-empty-icon">📋✨</div>
          <h2>No reports pending approval</h2>
          <p>
            All reviewed reports have been processed. New reports will appear here
            after quality engineers review them.
          </p>
        </div>
      )}
    </div>
  );
}
