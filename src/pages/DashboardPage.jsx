import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { useReportData, normalizeReport } from '../contexts/ReportDataContext';
import { useReportMutations } from '../contexts/ReportMutationsContext';
import { useReportFilters } from '../contexts/ReportFiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { downloadReportExcel, downloadRawReportFiles } from '../utils/downloadUtils';
import { MODEL_NUMBER } from '../config';
import api from '../utils/api';
import senseopsLogo from '../assets/senseops-logo.png';
import './DashboardPage.css';
import './UploadPage.css';
import { parseFiles } from '../utils/fileParser';
import Swal from 'sweetalert2';
import { escapeHtml } from '../utils/html';


/* Helper to convert raw ISO upload timestamp to relative time string */
const getRelativeTimeString = (dateStr) => {
  try {
    if (!dateStr) return '';
    
    // Ensure the date is treated as UTC if the backend sends it without a timezone indicator
    let timeString = dateStr;
    if (!timeString.endsWith('Z') && !timeString.includes('+')) {
      timeString += 'Z';
    }
    
    const date = new Date(timeString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

function DashboardPage() {
  const outletCtx = useOutletContext() || {};
  const searchQuery = outletCtx.searchQuery || '';
  
  const { reports } = useReportData();
  const { addReport, updateReportStatus } = useReportMutations();
  const { getStats: getStatsFromFilters } = useReportFilters();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  
  // Frontend error states
  const [frontendFailedFiles, setFrontendFailedFiles] = useState([]);
  const [showFrontendError, setShowFrontendError] = useState(false);

  /* ── State ── */
  const [activeReportId, setActiveReportId] = useState(null);
  const [uploadedChips, setUploadedChips] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [backendProgress, setBackendProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isDownloadingRaw, setIsDownloadingRaw] = useState(false);
  // Error popup states
  const [failedFiles, setFailedFiles] = useState([]);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [resultFilter, setResultFilter] = useState('Combination');

  // Global Stats State
  const [globalStats, setGlobalStats] = useState({ totalReports: 0, totalFilesUploaded: 0 });

  const fetchGlobalStats = async () => {
    try {
      const res = await api.get('/reports/stats');
      setGlobalStats(res.data);
    } catch (err) {
      console.error('Failed to fetch global stats:', err);
    }
  };

  useEffect(() => {
    fetchGlobalStats();
  }, []);
  
  // Backend progress effect
  useEffect(() => {
    let interval;
    if (uploadProgress === 100 && isUploading && backendProgress < 95) {
      interval = setInterval(() => {
        setBackendProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.floor(Math.random() * 5) + 1;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [uploadProgress, isUploading, backendProgress]);

  /* ── Active Report Resolution ── */
  const activeReport = useMemo(() => {
    if (activeReportId && reports?.length) {
      const found = reports.find((r) => r.id === activeReportId);
      if (found) return found;
    }
    return null; // Force a clean slate if no report is explicitly selected
  }, [activeReportId, reports]);

  // Removed the useEffect that auto-selects reports so dashboard starts completely clean.

  /* Reset pagination when active report or filter changes */
  useEffect(() => {
    setCurrentPage(1);
  }, [activeReport?.id, resultFilter]);

  /* ── Current Records & Pagination Calculations ── */

  // Fetch detailed report to get records
  const [detailedReport, setDetailedReport] = useState(null);
  useEffect(() => {
    if (activeReport?.id) {
      api.get(`/reports/${activeReport.id}`)
        .then(res => {
          if (res.data) setDetailedReport(normalizeReport(res.data));
        })
        .catch(console.error);
    }
  }, [activeReport?.id, user]);

  const baseRecords = useMemo(() => {
    if (detailedReport?.id === activeReport?.id && detailedReport?.generatedData?.records?.length > 0) {
      return detailedReport.generatedData.records;
    }
    if (activeReport?.generatedData?.records?.length > 0) {
      return activeReport.generatedData.records;
    }
    if (activeReport?.rawData?.records?.length > 0) {
      return activeReport.rawData.records;
    }
    return [];
  }, [activeReport, detailedReport]);

  const localStats = useMemo(() => {
    if (!activeReport) {
      return { 
        total: globalStats?.totalReports || 0, 
        pass: globalStats?.passCount || 0, 
        fail: globalStats?.failCount || 0, 
        pending: globalStats?.pendingCount || 0 
      };
    }
    if (!baseRecords.length) {
      return { total: 0, pass: 0, fail: 0, pending: 0 };
    }
    const total = baseRecords.length;
    let pass = 0, fail = 0;
    baseRecords.forEach(r => {
      if ((r.overallResult || 'Pass').toLowerCase() === 'pass' && (r.pulseResult || 'Pass').toLowerCase() === 'pass' && r.bmsError === 'NO') {
        pass++;
      } else {
        fail++;
      }
    });
    const pending = activeReport.failedFiles?.length || 0;
    return { total, pass, fail, pending };
  }, [baseRecords, activeReport, globalStats]);

  const currentRecords = useMemo(() => {
    if (resultFilter === 'OK') {
      return baseRecords.filter(r => (r.overallResult || 'Pass').toLowerCase() === 'pass' && (r.pulseResult || 'Pass').toLowerCase() === 'pass' && r.bmsError === 'NO');
    }
    if (resultFilter === 'NG') {
      return baseRecords.filter(r => (r.overallResult || 'Pass').toLowerCase() !== 'pass' || (r.pulseResult || 'Pass').toLowerCase() !== 'pass' || r.bmsError !== 'NO');
    }
    return baseRecords;
  }, [baseRecords, resultFilter]);

  const totalRecords = currentRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return currentRecords.slice(start, start + pageSize);
  }, [currentRecords, currentPage, pageSize]);

  /* ── Filtered Audit List ── */
  const auditList = useMemo(() => {
    const list = reports && reports.length > 0
      ? reports.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          modelNumber: r.modelNumber,
          engineer: r.testEngineer || 'Priya Sharma',
          time: getRelativeTimeString(r.uploadDate),
          status: r.status || 'generated',
          rawDate: r.uploadDate,
        }))
      : [];

    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((item) =>
      item.id.toLowerCase().includes(q) || item.engineer.toLowerCase().includes(q)
    );
  }, [reports, searchQuery]);

  /* ── Handlers ── */
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleStatusChange = async (newStatus) => {
    try {
      if (activeReport?.id && updateReportStatus) {
        await updateReportStatus(activeReport.id, newStatus, user?.id, user?.name);
      }
      showToast(`✅ Report ${activeReport?.id || 'rpt-005'} marked as ${newStatus.toUpperCase()}!`);
    } catch (err) {
      console.error(err);
      showToast(`⚠️ Updated report status to ${newStatus}`);
    }
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      await downloadReportExcel(activeReport, currentRecords, resultFilter, (progress) => {
        setExportProgress(progress);
      });
      showToast(`⬇ Exported ${resultFilter === 'Combination' ? 'All' : resultFilter} Excel report for ${activeReport?.id || 'rpt-005'}...`);
    } catch (err) {
      console.error(err);
      showToast(`⚠️ Failed to export report`);
    } finally {
      setTimeout(() => setIsExporting(false), 500);
    }
  };


  const handleRemoveChip = (name) => {
    setUploadedChips((prev) => prev.filter((c) => c.name !== name));
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
  };
  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsParsing(true);
      setParseProgress(0);
      try {
        const result = await parseFiles(e.target.files, (progress) => {
          setParseProgress(progress);
        });
        
        if (result.filesList && result.filesList.length > 0) {
          const newChips = result.filesList.map(f => ({ name: f.name, status: 'pending' }));
          setUploadedChips(prev => [...prev, ...newChips]);
          setPendingFiles(prev => [...prev, ...result.filesList]);
          showToast(`Added ${result.filesList.length} file(s) to upload queue`);
        }
        
        if (result.failed && result.failed.length > 0) {
          setFrontendFailedFiles(result.failed);
          setShowFrontendError(true);
        }
      } catch (failedFiles) {
        console.error('File parsing threw:', failedFiles);
        showToast('Failed to parse files. See console.');
      } finally {
        setIsParsing(false);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateClick = async () => {
    if (pendingFiles.length > 0) {
      setIsUploading(true);
      setUploadProgress(0);
      setBackendProgress(0);
      try {
        showToast("⏳ Uploading and processing test logs...");
        const result = await addReport({
          modelNumber: MODEL_NUMBER,
          files: pendingFiles,
          testEngineer: user?.name || 'Priya Sharma',
          testEngineerId: user?.id || 'usr-002',
        }, (progress) => {
          setUploadProgress(progress);
        });
        
        // Snap backend progress to 100% since request returned successfully
        setBackendProgress(100);
        await new Promise(r => setTimeout(r, 800));
        setPendingFiles([]);
        setUploadedChips([]);
        if (result && result.id) {
          setActiveReportId(result.id);
        }
        showToast("✅ Report generated successfully!");
        fetchGlobalStats();

        if ((result && result.failedFiles && result.failedFiles.length > 0) || failedFiles.length > 0) {
          if (result && result.failedFiles && result.failedFiles.length > 0) {
            showToast(`⚠️ Backend rejected ${result.failedFiles.length} file(s)`);
            const backendFailed = result.failedFiles.map(msg => ({
              name: msg.split(':')[0],
              error: msg.substring(msg.indexOf(':') + 1).trim()
            }));
            setFailedFiles(prev => {
              const combined = [...prev, ...backendFailed];
              return combined.filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i);
            });
          }
          setShowErrorPopup(true);
        } else {
          setFailedFiles([]);
        }
      } catch (err) {
        console.error('Add report failed:', err);
        
        let errorDetails = '';
        if (err.response?.data?.failedFiles && Array.isArray(err.response.data.failedFiles)) {
          errorDetails = '<ul style="text-align: left; background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 5px; list-style-type: none;">';
          err.response.data.failedFiles.forEach(f => {
            errorDetails += `<li style="margin-bottom: 8px; font-size: 13px;">${escapeHtml(f)}</li>`;
          });
          errorDetails += '</ul>';
        } else {
          errorDetails = `<p style="color: #ef4444">${escapeHtml(err.response?.data?.message || err.message || 'Server error')}</p>`;
        }

        Swal.fire({
          icon: 'error',
          title: 'Report Generation Failed',
          html: `<p>The backend rejected some or all of the files.</p>${errorDetails}`,
          confirmButtonText: 'Close',
          confirmButtonColor: '#ef4444',
          background: '#1e293b',
          color: '#fff'
        });
        
        showToast(`⚠️ Upload failed. See popup for details.`);
      } finally {
        setTimeout(() => setIsUploading(false), 800);
      }
    } else if (activeReport) {
      setIsUploading(true);
      try {
        await handleStatusChange('generated');
      } finally {
        setTimeout(() => setIsUploading(false), 500);
      }
    }
  };

  /* ── Stepper Resolution ── */
  const getStepperStatus = () => {
    const s = (activeReport?.status || 'approved').toLowerCase();
    if (s === 'approved') return 3;
    if (s === 'reviewed') return 2;
    return 1;
  };
  const currentStep = getStepperStatus();

  /* Calculate start and end entry indices for display */
  const startEntry = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, totalRecords);

  return (
    <div className="dashboard-container animate-fade-in">
      {/* Toast */}
      {toastMessage && <div className="dashboard-toast">{toastMessage}</div>}

      {/* Top Flex Bar: Stepper on Left, Export Trail on Right */}
      <div className="dashboard-top-bar">
        <div className="workflow-stepper-bar">
          <div className={`step-node ${currentStep >= 1 ? 'step-active' : ''}`}>
            <div className="step-circle">1</div>
            <span className="step-label">Tested</span>
          </div>
          
          <div className={`step-line ${currentStep >= 2 ? 'line-active' : ''}`}></div>
          
          <div className={`step-node ${currentStep >= 2 ? 'step-active' : ''}`}>
            <div className="step-circle">2</div>
            <span className="step-label">Reviewed</span>
          </div>
          
          <div className={`step-line ${currentStep >= 3 ? 'line-active' : ''}`}></div>
          
          <div className={`step-node ${currentStep >= 3 ? 'step-active' : ''}`}>
            <div className="step-circle">3</div>
            <span className="step-label">Approved</span>
          </div>
        </div>
      </div>



      {/* Horizontal Stats Row */}
      <div className="horizontal-stats-row">
        <div className="stat-card">
          <span className="stat-lbl">TOTAL</span>
          <span className="stat-num">{localStats.total}</span>
        </div>

        <div className="stat-card">
          <span className="stat-lbl">PASS</span>
          <span className="stat-num stat-green">
            {localStats.pass}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-lbl">FAIL</span>
          <span className="stat-num stat-red">
            {localStats.fail}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-lbl">PENDING</span>
          <span className="stat-num stat-yellow">
            {localStats.pending}
          </span>
        </div>
      </div>

      <div className="dashboard-main-content">
        {/* ── Report Generation Card ── */}
        <div className="report-generation-card">
          <div className="report-gen-top">
            <div className="report-gen-info">
              <h2>Report Generation & Controls</h2>
              <p>Upload raw Excel battery test logs to generate standardized engineering reports.</p>
            </div>
            
            {/* Switch Report / Audit in its own premium top pill badge */}
            <div className="action-audit-dropdown">
              <span className="action-audit-icon">🔄</span>
              <span className="action-audit-lbl">Switch Report / Audit:</span>
              <select
                className="action-audit-select"
                value={activeReport?.id || ''}
                onChange={(e) => {
                  setActiveReportId(e.target.value);
                  showToast(`Switched active report to ${e.target.value}`);
                }}
                disabled={auditList.length === 0}
              >
                {auditList.length === 0 ? (
                  <option value="">No reports available</option>
                ) : (
                  auditList.map((item) => {
                    return (
                      <option key={item.id} value={item.id}>
                        [{item.status.toUpperCase()}] {item.id} — {item.engineer} {item.time ? `• ${item.time}` : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          </div>

          <div className="report-gen-actions-bar">
            <button
              className="btn-upload-excel"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="btn-icon">📄</span> Upload Excel Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            <button
              className="btn-generate-report"
              onClick={handleGenerateClick}
              disabled={(!activeReport && pendingFiles.length === 0) || isUploading}
            >
              {isUploading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="spinner-border" style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <span>{pendingFiles.length > 0 ? `Uploading... ${uploadProgress}%` : 'Processing...'}</span>
                  </span>
                ) : 'Generate Report'}
            </button>

            {/* USER REQUESTED EXPORT BUTTON */}
            <button
              className="btn-export-report"
              onClick={handleExportReport}
              disabled={!activeReport || isExporting}
              title="Export Current Report to Excel"
            >
              {isExporting ? (
                <>
                  <div className="spinner-border" style={{ width: '1rem', height: '1rem', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <span>Generating... {exportProgress}%</span>
                </>
              ) : (
                <><span className="btn-icon">⬇</span> Export Report</>
              )}
            </button>

            <button
              className="btn-export-report btn-export-raw"
              onClick={async () => {
                if (activeReport?.id) {
                  showToast(`📥 Downloading raw uploaded data files for ${activeReport.id}...`);
                  setIsDownloadingRaw(true);
                  try {
                    await downloadRawReportFiles(activeReport);
                    showToast(`✅ Raw data downloaded for ${activeReport.id}`);
                  } catch {
                    showToast(`⚠️ Failed to download raw data`);
                  } finally {
                    setIsDownloadingRaw(false);
                  }
                }
              }}
              disabled={!activeReport || isDownloadingRaw}
              title="Download Raw Uploaded Data File(s) (.xlsx or .zip)"
              style={{ background: '#0ea5e9', borderColor: '#38bdf8' }}
            >
              {isDownloadingRaw ? (
                <>
                  <div className="spinner-border" style={{ width: '1rem', height: '1rem', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <span>Downloading...</span>
                </>
              ) : (
                <><span className="btn-icon">📥</span> Download Raw Data</>
              )}
            </button>
          </div>

          {/* Uploaded File Chips inside a bounded scrollable queue container */}
          {uploadedChips.length > 0 && (
            <div className="file-chips-container animate-fade-in">
              <div className="file-chips-header">
                <span>📁 Uploaded Files Queue ({uploadedChips.length})</span>
                <button
                  type="button"
                  className="chips-clear-btn"
                  onClick={() => {
                    setUploadedChips([]);
                    setPendingFiles([]);
                  }}
                >
                  Clear Queue ×
                </button>
              </div>
              <div className="file-chips-scroll">
                {uploadedChips.map((chip, idx) => (
                  <div
                    key={idx}
                    className={`file-chip ${chip.status === 'success' ? 'chip-success' : 'chip-default'}`}
                  >
                    <span className="chip-icon">{chip.status === 'success' ? '✓' : '📄'}</span>
                    <span className="chip-name">{chip.name}</span>
                    <button type="button" className="chip-close" onClick={() => handleRemoveChip(chip.name)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {activeReport ? (
          <div className="formal-report-card">
            {/* Top Blue Banner */}
            <div className="formal-banner-top">
              <div className="formal-banner-header-left">
                <div className="formal-banner-logos" style={{ background: '#ffffff', padding: '4px', borderRadius: '4px' }}>
                  <img src="/bk.png" alt="Company Logo" className="formal-logo-img endurance-img" />
                </div>
                <div className="company-title">ENDURANCE TECHNOLOGIES LIMITED</div>
              </div>
              <div className="format-meta">
                <div>Format no.: BTR/TL/03</div>
                <div>Rev. no.: 03</div>
              </div>
            </div>

            {/* Subtitle Banner */}
            <div className="formal-banner-sub">
              Battery Pack Pulse Profile & Charge-Discharge Test Report
            </div>

            {/* Metadata Grid */}
            <div className="formal-meta-grid">
              <div className="meta-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="meta-cell"><span>Plant:</span> Mindewadi</div>
                <div className="meta-cell"><span>Test Dept:</span> Battery Testing - New Energy</div>
                <div className="meta-cell" style={{ borderRight: 'none' }}><span>Rating:</span> 51.2V 60Ah 3.0 kWh (LFP)</div>
              </div>
              <div className="meta-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="meta-cell" style={{ borderBottom: 'none' }}><span>Test ID:</span> <strong>{activeReport.id}</strong></div>
                <div className="meta-cell" style={{ borderBottom: 'none' }}><span>File Name:</span> <strong>{activeReport.id}</strong></div>
                <div className="meta-cell" style={{ borderRight: 'none', borderBottom: 'none' }}><span>Report Date:</span> {activeReport.uploadDate ? new Date(activeReport.uploadDate).toLocaleDateString('en-GB').replace(/\//g, '.') : '25.05.2026'}</div>
              </div>
            </div>

            {/* OK / NG / Combination Filter Bar */}
            <div className="report-filter-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter Results:</span>
                <div className="filter-btn-group" style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.25)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <button
                    className={`filter-btn ${resultFilter === 'Combination' ? 'active' : ''}`}
                    onClick={() => { setResultFilter('Combination'); setCurrentPage(1); }}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: resultFilter === 'Combination' ? '#3b82f6' : 'transparent', color: resultFilter === 'Combination' ? '#fff' : '#cbd5e1', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    📊 Combination (Both)
                  </button>
                  <button
                    className={`filter-btn ${resultFilter === 'OK' ? 'active' : ''}`}
                    onClick={() => { setResultFilter('OK'); setCurrentPage(1); }}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: resultFilter === 'OK' ? '#10b981' : 'transparent', color: resultFilter === 'OK' ? '#fff' : '#cbd5e1', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    ✓ OK (Passed Only)
                  </button>
                  <button
                    className={`filter-btn ${resultFilter === 'NG' ? 'active' : ''}`}
                    onClick={() => { setResultFilter('NG'); setCurrentPage(1); }}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: resultFilter === 'NG' ? '#ef4444' : 'transparent', color: resultFilter === 'NG' ? '#fff' : '#cbd5e1', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    ✗ NG (Failed Only)
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#94a3b8' }}>
                <span>Showing <strong style={{ color: '#fff' }}>{currentRecords.length}</strong> of <strong style={{ color: '#fff' }}>{baseRecords.length}</strong> records</span>
              </div>
            </div>

            {/* Test Data Grid Table */}
            <div className="table-scroll-wrapper">
              <table className="formal-data-table">
                <thead>
                  <tr className="group-headers-row">
                    <th rowSpan="2" className="th-num">No.</th>
                    <th rowSpan="2" className="th-id">Battery Pack ID</th>
                    <th colSpan="2" className="th-group">Idle Test</th>
                    <th colSpan="4" className="th-group">Pulse Profile Test (CH_54A & DCH_70A)</th>
                    <th colSpan="2" className="th-group">Short CDC(10%) Test</th>
                    <th colSpan="3" className="th-group">Post Test Status</th>
                    <th colSpan="2" className="th-group">Test Results</th>
                  </tr>
                  <tr className="sub-headers-row">
                    <th>Idle DeltaV<br/>(mV)</th>
                    <th>Idle Delta_T<br/>(°C)</th>
                    <th>DCH_DeltaV<br/>(mV)</th>
                    <th>DCH_Delta_T<br/>(°C)</th>
                    <th>CH_DeltaV<br/>(mV)</th>
                    <th>CH_Delta_T<br/>(°C)</th>
                    <th>CH_DeltaV<br/>(mV)</th>
                    <th>DCH_DeltaV<br/>(mV)</th>
                    <th>SOC<br/>(%)</th>
                    <th>Voltage<br/>(V)</th>
                    <th>BMS<br/>Error</th>
                    <th>Pulse<br/>Result</th>
                    <th>Overall<br/>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((rec, idx) => {
                    const actualIdx = (currentPage - 1) * pageSize + idx + 1;
                    const isFail = rec.overallResult?.toLowerCase() !== 'pass';
                    return (
                      <tr key={idx} className="data-row">
                        <td className="td-num">{actualIdx}</td>
                        <td className="td-id">
                          <a href={`#pack-${rec.batteryPackId}`} onClick={(e) => e.preventDefault()}>
                            {rec.batteryPackId}
                          </a>
                        </td>
                        <td>{rec.idleDeltaV ?? 0}</td>
                        <td>{rec.idleDeltaT ?? 0.3}</td>
                        <td className="font-bold">{rec.dchDeltaV ?? 7}</td>
                        <td>{rec.dchDeltaT ?? 0.3}</td>
                        <td className="font-bold">{rec.chDeltaV ?? 7}</td>
                        <td>{rec.chDeltaT ?? 0.3}</td>
                        <td>{rec.shortChDeltaV ?? rec.chDeltaV ?? 8}</td>
                        <td>{rec.shortDchDeltaV ?? rec.dchDeltaV ?? 8}</td>
                        <td className="td-highlight-yellow font-bold">
                          {rec.soc ?? 27.81}
                        </td>
                        <td>{rec.voltage ?? 52.82}</td>
                        <td className={rec.bmsError === 'NO' || !rec.bmsError ? 'text-green font-bold' : 'text-red font-bold'}>
                          {rec.bmsError ?? 'NO'}
                        </td>
                        <td>{rec.pulseResult ?? 'Pass'}</td>
                        <td>
                          <span className={`status-pill ${isFail ? 'pill-fail' : 'pill-pass'}`}>
                            {rec.overallResult ?? 'Pass'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Empty padding rows for consistent table height across pages */}
                  {paginatedRecords.length < pageSize &&
                    [...Array(pageSize - paginatedRecords.length)].map((_, i) => (
                      <tr key={`empty-${i}`} className="empty-row">
                        <td className="td-num"></td>
                        <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination Control Bar ── */}
            <div className="report-pagination-bar">
              <div className="pagination-left">
                <span className="pagination-info">
                  Showing <strong>{startEntry}</strong> to <strong>{endEntry}</strong> of <strong>{totalRecords}</strong> entries
                </span>
                <div className="page-size-box">
                  <span className="page-size-lbl">Rows per page:</span>
                  <select
                    className="page-size-select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="pagination-right">
                <button
                  className="page-nav-btn"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  title="First Page"
                >
                  ⏮ First
                </button>
                <button
                  className="page-nav-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  title="Previous Page"
                >
                  ◀ Prev
                </button>

                <div className="page-numbers-group">
                  {[...Array(totalPages)].map((_, idx) => {
                    const pageNum = idx + 1;
                    // Show around current page
                    if (
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={pageNum}
                          className={`page-num-btn ${currentPage === pageNum ? 'active' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    } else if (
                      (pageNum === currentPage - 2 && pageNum > 1) ||
                      (pageNum === currentPage + 2 && pageNum < totalPages)
                    ) {
                      return <span key={pageNum} className="page-ellipsis">...</span>;
                    }
                    return null;
                  })}
                </div>

                <button
                  className="page-nav-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  title="Next Page"
                >
                  Next ▶
                </button>
                <button
                  className="page-nav-btn"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  title="Last Page"
                >
                  Last ⏭
                </button>
              </div>
            </div>

            {/* Signatures & Action Workflow Section at Bottom */}
            <div className="formal-signatures-section">
              <div className="sig-column">
                <button 
                  className="btn-sign-action" 
                  onClick={() => handleStatusChange('generated')}
                  disabled={user?.role !== 'test_engineer' && user?.role !== 'admin'}
                  title={(user?.role !== 'test_engineer' && user?.role !== 'admin') ? "Only Test Engineers can sign" : "Sign report as Tester"}
                >
                  📝 Sign as Tester
                </button>
                <div className="sig-divider"></div>
                <div className="sig-role">TESTED BY</div>
                <div className="sig-name">{activeReport.testEngineer || 'Priya Sharma'}</div>
              </div>

              <div className="sig-column">
                <button 
                  className="btn-sign-action" 
                  onClick={() => handleStatusChange('reviewed')}
                  disabled={user?.role !== 'quality_engineer' && user?.role !== 'admin'}
                  title={(user?.role !== 'quality_engineer' && user?.role !== 'admin') ? "Only Quality Engineers can sign" : "Sign report as Reviewer"}
                >
                  📝 Sign as Reviewer
                </button>
                <div className="sig-divider"></div>
                <div className="sig-role">REVIEWED BY</div>
                <div className="sig-name">{activeReport.reviewedBy || 'N/A'}</div>
              </div>

              <div className="sig-column">
                <button 
                  className="btn-sign-action" 
                  onClick={() => handleStatusChange('approved')}
                  disabled={user?.role !== 'quality_manager' && user?.role !== 'admin'}
                  title={(user?.role !== 'quality_manager' && user?.role !== 'admin') ? "Only Quality Managers can sign" : "Sign report as Approver"}
                >
                  📝 Sign as Approver
                </button>
                <div className="sig-divider"></div>
                <div className="sig-role">APPROVED BY</div>
                <div className="sig-name">{activeReport.approvedBy || 'N/A'}</div>
              </div>
            </div>

            {/* Formal Report Footer */}
            <div className="formal-report-footer">
              <div className="formal-footer-left">
                <span className="footer-text-brand">ENDURANCE TECHNOLOGIES LIMITED</span> • BATTERY TESTING DIVISION
              </div>
              <div className="formal-footer-right">
                <span>Powered by</span>
                <img src={senseopsLogo} alt="SenseOps Analytics" className="formal-footer-logo" />
              </div>
            </div>
          </div>
        ) : (
          <div className="no-reports-placeholder">
            <span className="placeholder-icon">📊</span>
            <h3>No Test Reports Available</h3>
            <p>Mock database seeding has been disabled. Please upload raw Excel battery test logs above to generate a new standardized engineering report.</p>
          </div>
        )}
      </div>
      
      {/* PARSING OVERLAY */}
      {isParsing && createPortal(
        <div className="processing-overlay">
          <div className="processing-overlay-content">
            <div className="processing-spinner"></div>
            <h3 className="processing-title">Reading Files...</h3>
            <p className="processing-text">
              Reading and validating selected files locally...
            </p>
            
            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontWeight: 'bold', color: '#8b5cf6' }}>Local Parsing Progress</span>
                <span style={{ fontWeight: 'bold', color: '#8b5cf6' }}>{parseProgress}%</span>
              </div>
              <div style={{ width: '100%', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${parseProgress}%`, background: '#8b5cf6', height: '100%', transition: 'width 0.3s ease' }}></div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PROCESSING OVERLAY */}
      {isUploading && createPortal(
        <div className="processing-overlay">
          <div className="processing-overlay-content">
            <div className="processing-spinner"></div>
            <h3 className="processing-title">Uploading Files...</h3>
            <p className="processing-text">
              {pendingFiles.length > 0 
                ? `Uploading ${pendingFiles.length} raw file(s) to the server.` 
                : 'Please wait while the system updates the report status.'}
            </p>
            
            {pendingFiles.length > 0 && (
              <>
                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>Network Upload</span>
                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: '100%', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress}%`, background: '#3b82f6', height: '100%', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>

                {uploadProgress === 100 && (
                  <div style={{ marginTop: '20px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontWeight: 'bold', color: '#10b981' }}>Backend Processing & Report Generation</span>
                      <span style={{ fontWeight: 'bold', color: '#10b981' }}>{backendProgress}%</span>
                    </div>
                    <div style={{ width: '100%', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ width: `${backendProgress}%`, background: '#10b981', height: '100%', transition: 'width 0.3s ease' }}></div>
                    </div>
                    {backendProgress === 100 && (
                      <p style={{ marginTop: '15px', color: '#10b981', fontWeight: 'bold', textAlign: 'center' }}>
                        ✓ Finalizing Results...
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* NEW FOOLPROOF ERROR POPUP VIA PORTAL */}
      {showErrorPopup && createPortal(
        <div 
          onClick={() => setShowErrorPopup(false)} 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483647,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{
              background: 'linear-gradient(145deg, #1e293b, #0f172a)',
              border: '1px solid #ef4444',
              borderRadius: '16px',
              padding: '32px',
              width: '90%',
              maxWidth: '600px',
              boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)',
              color: 'white'
            }}
          >
            <h2 style={{ color: '#f87171', marginTop: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '24px' }}>
              <span style={{ fontSize: '32px' }}>⚠️</span> Validation Warning
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '16px', marginBottom: '24px' }}>
              Some files are corrupted or unsupported. Click OK to continue generating the report with the valid files.
            </p>
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto', 
              backgroundColor: 'rgba(0,0,0,0.3)', 
              borderRadius: '8px', 
              padding: '16px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                {failedFiles.map((f, i) => (
                  <li key={i} style={{ 
                    padding: '12px', 
                    borderBottom: i < failedFiles.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <strong style={{ color: '#e2e8f0', fontSize: '15px' }}>{f.name}</strong>
                    <span style={{ color: '#ef4444', fontSize: '14px' }}>{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={() => setShowErrorPopup(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.target.style.color = '#fff'; }}
                onMouseOut={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#94a3b8'; }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showFrontendError && createPortal(
        <div 
          onClick={() => setShowFrontendError(false)} 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999999,
            padding: '20px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{
              background: '#1e293b', padding: '30px', borderRadius: '12px',
              maxWidth: '500px', width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #334155',
              maxHeight: '90vh', display: 'flex', flexDirection: 'column'
            }}
          >
            <h2 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444' }}>
              ⚠️ Validation Warning
            </h2>
            <p style={{ color: '#cbd5e1', marginBottom: '20px', fontSize: '15px' }}>
              Some files are corrupted or unsupported.
            </p>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '16px',
              overflowY: 'auto',
              flex: 1,
              minHeight: '100px'
            }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {frontendFailedFiles.map((f, i) => (
                  <li key={i} style={{ marginBottom: i === frontendFailedFiles.length - 1 ? 0 : '12px', paddingBottom: i === frontendFailedFiles.length - 1 ? 0 : '12px', borderBottom: i === frontendFailedFiles.length - 1 ? 'none' : '1px solid rgba(239,68,68,0.1)' }}>
                    <strong style={{ color: '#ef4444', display: 'block', marginBottom: '4px' }}>{f.name}</strong>
                    <span style={{ color: '#cbd5e1', fontSize: '13px' }}>{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={() => setShowFrontendError(false)}
                style={{
                  flex: 1, padding: '14px',
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setShowFrontendError(false);
                }}
                style={{
                  flex: 1, padding: '14px',
                  background: '#ef4444',
                  border: 'none',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default DashboardPage;
