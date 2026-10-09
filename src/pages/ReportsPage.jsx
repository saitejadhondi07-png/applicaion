import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useReportData } from '../contexts/ReportDataContext';
import { useReportMutations } from '../contexts/ReportMutationsContext';
import { downloadReportExcel, downloadRawReportFiles } from '../utils/downloadUtils';
import CustomModal from '../components/CustomModal';
import './ReportsPage.css';

const STATUSES = ['All', 'Generated', 'Reviewed', 'Approved', 'Rejected'];
const PAGE_SIZE = 10;

export default function ReportsPage() {
  const { user } = useAuth();
  const { reports } = useReportData();
  const { updateReportStatus, clearAllReports, deleteReport } = useReportMutations();

  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportingId, setIsExportingId] = useState(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [isDownloadingRawId, setIsDownloadingRawId] = useState(null);
  
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: null, danger: false });

  /* ---- Filtered & searched reports ---- */
  const filtered = useMemo(() => {
    let list = reports ?? [];

    if (statusFilter !== 'All') {
      list = list.filter(
        (r) => r.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    return list;
  }, [reports, statusFilter]);

  /* ---- Pagination ---- */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToPage = (p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  /* ---- Status badge class ---- */
  const statusClass = (status) => {
    const s = status?.toLowerCase();
    return `badge badge-${s || 'na'}`;
  };

  /* ---- Pass/Fail badge ---- */
  const passFail = (value) => {
    if (value === true || value === 'pass') return <span className="badge badge-pass">Pass</span>;
    if (value === false || value === 'fail') return <span className="badge badge-fail">Fail</span>;
    return <span className="badge badge-na">N/A</span>;
  };

  /* ---- Downloadable statuses ---- */
  const downloadableStatuses = ['generated', 'reviewed', 'approved'];

  const handleDownload = async (report) => {
    setIsExportingId(report.id);
    setExportProgress(0);

    try {
      await downloadReportExcel(report, null, 'Combination', (progress) => {
        setExportProgress(progress);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setIsExportingId(null), 500);
    }
  };

  /* ---- Role-based action buttons ---- */
  const renderActions = (report) => {
    const role = user?.role;
    const status = report.status?.toLowerCase();
    const isOwner = report.testEngineerId === user?.id || report.testEngineer === user?.name;
    const buttons = [];

    // Generate — test_engineer, quality_engineer, quality_manager, or admin
    if (
      status === 'uploaded' &&
      (role === 'admin' || role === 'quality_engineer' || role === 'quality_manager' || role === 'test_engineer')
    ) {
      buttons.push(
        <button
          key="generate"
          className="action-btn action-btn-generate"
          onClick={() => updateReportStatus(report.id, 'generated', user?.id, user?.name)}
        >
          Generate
        </button>
      );
    }

    // Review — quality_engineer on generated reports, or admin
    if (
      status === 'generated' &&
      (role === 'admin' || role === 'quality_engineer')
    ) {
      buttons.push(
        <button
          key="review"
          className="action-btn action-btn-review"
          onClick={() => updateReportStatus(report.id, 'reviewed', user?.id, user?.name)}
        >
          Review
        </button>
      );
    }

    // Approve — quality_manager on reviewed reports, or admin
    if (
      status === 'reviewed' &&
      (role === 'admin' || role === 'quality_manager')
    ) {
      buttons.push(
        <button
          key="approve"
          className="action-btn action-btn-approve"
          onClick={() => updateReportStatus(report.id, 'approved', user?.id, user?.name)}
        >
          Approve
        </button>
      );
    }

    // Reject — quality_engineer on generated, quality_manager on reviewed, or admin on both
    if (
      (status === 'generated' && (role === 'admin' || role === 'quality_engineer')) ||
      (status === 'reviewed' && (role === 'admin' || role === 'quality_manager'))
    ) {
      buttons.push(
        <button
          key="reject"
          className="action-btn action-btn-reject"
          onClick={() => updateReportStatus(report.id, 'rejected', user?.id, user?.name)}
        >
          Reject
        </button>
      );
    }

    // Download Generated Report — for generated / reviewed / approved
    if (downloadableStatuses.includes(status)) {
      const isThisExporting = isExportingId === report.id;
      buttons.push(
        <button
          key="download-report"
          className="action-btn action-btn-download"
          style={{ background: '#10b981', color: '#fff', position: 'relative', overflow: 'hidden' }}
          onClick={() => handleDownload(report)}
          disabled={isExportingId !== null}
          title="Download Generated Excel Report"
        >
          {isThisExporting ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div className="spinner-border" style={{ width: '12px', height: '12px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span>{exportProgress}%</span>
            </div>
          ) : (
            <>⬇ Report</>
          )}
        </button>
      );
    }

    // Download Raw Data — available for all uploaded / generated reports
    const isThisDownloadingRaw = isDownloadingRawId === report.id;
    buttons.push(
      <button
        key="download-raw"
        className="action-btn action-btn-download-raw"
        style={{ background: '#0ea5e9', color: '#fff', marginLeft: '6px' }}
        onClick={async () => {
          setIsDownloadingRawId(report.id);
          try {
            await downloadRawReportFiles(report);
          } catch (err) {
            console.error('Failed to download raw data', err);
          } finally {
            setIsDownloadingRawId(null);
          }
        }}
        disabled={isDownloadingRawId !== null}
        title="Download Raw Uploaded Test Log File(s)"
      >
        {isThisDownloadingRaw ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div className="spinner-border" style={{ width: '12px', height: '12px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <span>Downloading...</span>
          </div>
        ) : (
          <>📥 Raw Data</>
        )}
      </button>
    );

    if (role === 'admin' || role === 'quality_manager') {
      buttons.push(
        <button
          key="delete"
          className="action-btn"
          style={{ background: '#ef4444', color: '#fff', marginLeft: '6px' }}
          onClick={() => {
            setModalConfig({
              isOpen: true,
              title: 'Delete Report',
              message: 'Are you sure you want to delete this report?',
              danger: true,
              onConfirm: () => {
                deleteReport(report.id);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
              }
            });
          }}
        >
          🗑 Delete
        </button>
      );
    }

    return buttons.length > 0 ? buttons : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>—</span>;
  };

  /* ---- Page number buttons ---- */
  const pageButtons = () => {
    const btns = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
      btns.push(
        <button
          key={i}
          className={`pagination-btn${i === safePage ? ' active' : ''}`}
          onClick={() => goToPage(i)}
        >
          {i}
        </button>
      );
    }
    return btns;
  };

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="reports-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="reports-page-title">Reports Management</h1>
        {reports?.length > 0 && user?.role === 'admin' && (
          <button
            className="action-btn"
            style={{ background: '#ef4444', color: '#fff', padding: '8px 16px', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              setModalConfig({
                isOpen: true,
                title: 'Clear All Data',
                message: 'Are you sure you want to clear all generated reports and data?',
                danger: true,
                onConfirm: () => {
                  clearAllReports();
                  setModalConfig(prev => ({ ...prev, isOpen: false }));
                }
              });
            }}
          >
            🗑 Clear All Data
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="reports-filter-bar">
        <select
          className="reports-filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All Statuses' : s}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="reports-table-container">
        <div className="reports-table-scroll">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>User</th>
                <th>Status</th>
                <th>Pass / Fail</th>
                <th>Upload Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length > 0 ? (
                paged.map((report) => (
                  <tr key={report.id}>
                    <td>{report.id}</td>
                    <td>
                      <div>{report.testEngineer ?? '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>
                        {report.testEngineerRole ? report.testEngineerRole.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ''}
                      </div>
                    </td>
                    <td>
                      <span className={statusClass(report.status)}>
                        {report.status ?? 'Unknown'}
                      </span>
                    </td>
                    <td>{passFail(report.passFailStatus || report.passFail)}</td>
                    <td>{report.uploadDate ?? '—'}</td>
                    <td>
                      <div className="actions-cell">{renderActions(report)}</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">
                    <div className="reports-empty">
                      <div className="reports-empty-icon">📭</div>
                      No reports found
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="reports-pagination">
            <button
              className="pagination-btn"
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
            >
              ‹
            </button>

            {pageButtons()}

            <button
              className="pagination-btn"
              disabled={safePage >= totalPages}
              onClick={() => goToPage(safePage + 1)}
            >
              ›
            </button>

            <span className="reports-pagination-info">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
          </div>
        )}
      </div>
      
      <CustomModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type="confirm"
        confirmText="Yes, Delete"
        cancelText="Cancel"
        danger={modalConfig.danger}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
