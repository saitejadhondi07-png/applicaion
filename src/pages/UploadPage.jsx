import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReportMutations } from '../contexts/ReportMutationsContext';
import { useAuth } from '../contexts/AuthContext';
import { parseFiles, extractBatteryPackId } from '../utils/fileParser';
import './UploadPage.css';
import Swal from 'sweetalert2';


export default function UploadPage() {
  const { addReport } = useReportMutations();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [filesList, setFilesList] = useState([]); // List of uploaded files
  const [modelNumber, setModelNumber] = useState('ENE5160-BTR-PP-CDC01-DDM2601');
  const [dragOver, setDragOver] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [backendProgress, setBackendProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Backend progress effect
  useEffect(() => {
    let interval;
    if (uploadProgress === 100 && uploading && backendProgress < 95) {
      interval = setInterval(() => {
        setBackendProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.floor(Math.random() * 5) + 1;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [uploadProgress, uploading, backendProgress]);
  
  // Frontend error states
  const [frontendFailedFiles, setFrontendFailedFiles] = useState([]);
  const [showFrontendError, setShowFrontendError] = useState(false);
  const [failedFiles, setFailedFiles] = useState([]);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  // Parse multiple files
  const parseFilesWrapper = useCallback(
    async (selectedFiles) => {
      setErrorMessage('');
      
      setUploading(true);

      try {
        const results = await parseFiles(selectedFiles);
        setFilesList(prev => [...prev, ...results.filesList]);

        if (results.failed.length > 0) {
          setFrontendFailedFiles(results.failed);
          setShowFrontendError(true);
        }
      } catch (failed) {
        console.error('File parsing threw:', failed);
        const errMsg = failed?.message || 'Failed to parse files.';
        setErrorMessage(errMsg);
        Swal.fire({
          icon: 'error',
          title: 'File Parsing Error',
          text: errMsg,
          confirmButtonText: 'Close',
          confirmButtonColor: '#ef4444',
          background: '#1e293b',
          color: '#fff'
        });
      } finally {
        setUploading(false);
      }
    },
    [parseFiles]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        parseFilesWrapper(e.dataTransfer.files);
      }
    },
    [parseFilesWrapper]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e) => {
      if (e.target.files && e.target.files.length > 0) {
        parseFilesWrapper(e.target.files);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [parseFilesWrapper]
  );

  const handleZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (index) => {
    setFilesList(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setFilesList([]);
    setModelNumber('ENE5160-BTR-PP-CDC01-DDM2601');
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async () => {
    if (filesList.length === 0 || !modelNumber) return;

    setUploading(true);
    setShowProcessing(true);
    setUploadProgress(0);
    setBackendProgress(0);
    setErrorMessage('');

    try {
      const actualFiles = filesList.map(f => f.rawFile);
      const result = await addReport({
        modelNumber,
        files: actualFiles,
        testEngineer: user?.name || 'Priya Sharma',
        testEngineerId: user?.id || 'usr-002',
      }, (progress) => {
        setUploadProgress(progress);
      });
      
      // Snap backend progress to 100% since request returned successfully
      setBackendProgress(100);
      
      // Give the user 800ms to see "100%" before hiding the overlay
      await new Promise(r => setTimeout(r, 800));
      setShowProcessing(false);
      
      if ((result && result.failedFiles && result.failedFiles.length > 0) || failedFiles.length > 0) {
        if (result && result.failedFiles && result.failedFiles.length > 0) {
          const backendFailed = result.failedFiles.map(msg => ({
            name: msg.split(':')[0] || 'Unknown File',
            error: msg.substring(msg.indexOf(':') + 1).trim() || msg
          }));
          
          let errorDetails = '<ul style="text-align: left; background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 5px; list-style-type: none;">';
          backendFailed.forEach(f => {
            errorDetails += `<li style="margin-bottom: 8px; font-size: 13px;"><strong>${f.name}</strong><br/>${f.error}</li>`;
          });
          errorDetails += '</ul>';

          Swal.fire({
            icon: 'error',
            title: 'Report Generation Failed',
            html: `<p>The backend rejected some files.</p>${errorDetails}`,
            confirmButtonText: 'Close',
            confirmButtonColor: '#ef4444',
            background: '#1e293b',
            color: '#fff'
          });
        }
      } else {
        setShowSuccess(true);
      }
      
      handleClearAll();
    } catch (err) {
      console.error(err);
      let errorMsg = err.response?.data?.message || err.message || 'Failed to upload reports to backend database.';
      
      if (
        (err.response && err.response.status === 413) ||
        errorMsg.includes('413') ||
        errorMsg.toLowerCase().includes('payload too large') ||
        errorMsg.toLowerCase().includes('network error') ||
        errorMsg.toLowerCase().includes('failed to fetch')
      ) {
        errorMsg = 'The files you are trying to upload exceed the maximum allowed size (Payload Too Large). Please upload fewer files at a time or check your connection.';
      }

      let errorDetails = '';
      if (err.response?.data?.failedFiles && Array.isArray(err.response.data.failedFiles)) {
        errorDetails = '<ul style="text-align: left; background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 5px; list-style-type: none;">';
        err.response.data.failedFiles.forEach(f => {
          errorDetails += `<li style="margin-bottom: 8px; font-size: 13px;">${f}</li>`;
        });
        errorDetails += '</ul>';
      } else {
        errorDetails = `<p style="color: #ef4444">${errorMsg}</p>`;
      }

      Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        html: `<p>The backend rejected some or all of the files.</p>${errorDetails}`,
        confirmButtonText: 'Close',
        confirmButtonColor: '#ef4444',
        background: '#1e293b',
        color: '#fff'
      });
      setShowProcessing(false);
    } finally {
      setUploading(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
  };

  return (
    <div className="upload-page">
      {/* Header */}
      <div className="upload-header">
        <h1>📤 Upload Test Report</h1>
        <p>Upload raw battery logs or compiled summary report sheets to generate the quality report</p>
      </div>

      {/* Drag & Drop Zone */}
      <div
        className={`upload-dropzone ${dragOver ? 'drag-over' : ''}`}
        onClick={handleZoneClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="dropzone-icon">☁️📤</div>
        <p className="dropzone-text">Drag & drop your files here</p>
        <p className="dropzone-subtext">
          or <span>click to browse</span> (Supports CSV, XLSX)
        </p>
        <div className="dropzone-formats">
          <span className="format-badge">Raw Logs (Single/Multiple)</span>
          <span className="format-badge">Compiled Report Template</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {errorMessage && (
        <div className="upload-error-message">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Files List & Preview Section */}
      {filesList.length > 0 && (
        <div className="file-preview-section">
          {/* File Info Card */}
          <div className="file-info-card animate-fade-in">
            <div className="file-info-header">
              <div className="file-info-left">
                <div className="file-icon">📁</div>
                <div className="file-details">
                  <h3>Uploaded Files ({filesList.length})</h3>
                  <div className="file-meta">
                    <span>⚡ Files ready for upload</span>
                  </div>
                </div>
              </div>
              <button className="clear-all-btn" onClick={handleClearAll}>
                ✕ Clear All
              </button>
            </div>

            {/* List of uploaded files */}
            <div className="uploaded-files-list">
              {filesList.map((f, index) => (
                <div className={`uploaded-file-item ${f.invalidPackId ? 'uploaded-file-item--error' : ''}`} key={index}>
                  <div className="file-item-left">
                    <span>{f.invalidPackId ? '⚠️' : '📄'} {f.name} ({formatFileSize(f.size)})</span>
                    {f.invalidPackId && <span className="file-error-text">Missing Battery Pack ID</span>}
                  </div>
                  <button className="remove-single-file" onClick={() => handleRemoveFile(index)} title="Remove file">✕</button>
                </div>
              ))}
            </div>



            {/* Upload Button */}
            <div className="upload-actions">
              <button
                className="upload-btn upload-btn-primary"
                onClick={handleUpload}
                disabled={!modelNumber || uploading || filesList.length === 0}
              >
                {uploading ? (
                  <>⏳ Uploading & Processing...</>
                ) : (
                  <>🚀 Compile & Create Report</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Overlay */}
      {showSuccess && (
        <div className="success-overlay" onClick={handleCloseSuccess}>
          <div className="success-card animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon">✅🎉</div>
            <h2>Report Uploaded Successfully!</h2>
            <p>
              Your files have been sent to the backend for quality calculation and generation.
              Check the dashboard to view the final report!
            </p>
            <button className="success-close-btn" onClick={handleCloseSuccess}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Parsing Overlay */}
      {isParsing && (
          <div className="processing-overlay">
            <div className="processing-card animate-fade-in">
              <div className="processing-spinner"></div>
              <h2>Reading Files...</h2>
              <p>Reading and validating selected files locally...</p>
              
              <div style={{ marginTop: '20px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontWeight: 'bold', color: '#8b5cf6' }}>
                    Local Parsing Progress
                  </span>
                  <span style={{ fontWeight: 'bold', color: '#8b5cf6' }}>
                    {parseProgress}%
                  </span>
                </div>
                <div style={{ width: '100%', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${parseProgress}%`, background: '#8b5cf6', height: '100%', transition: 'width 0.3s ease' }}></div>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* Uploading Overlay */}
      {showProcessing && (
          <div className="processing-overlay">
            <div className="processing-card animate-fade-in">
              <div className="processing-spinner"></div>
              <h2>Uploading Files...</h2>
              <p>Uploading {filesList.length} raw file(s) to the server.</p>
              
              <div style={{ marginTop: '20px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>
                    Network Upload
                  </span>
                  <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>
                    {uploadProgress}%
                  </span>
                </div>
                <div style={{ width: '100%', background: '#334155', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, background: '#3b82f6', height: '100%', transition: 'width 0.3s ease' }}></div>
                </div>
              </div>

              {uploadProgress === 100 && (
                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontWeight: 'bold', color: '#10b981' }}>
                      Backend Processing & Report Generation
                    </span>
                    <span style={{ fontWeight: 'bold', color: '#10b981' }}>
                      {backendProgress}%
                    </span>
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
            </div>
          </div>
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
              padding: '30px',
              width: '90%',
              maxWidth: '480px',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transform: 'translateY(0)',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <h2 style={{ color: '#f87171', marginTop: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '24px' }}>
              <span style={{ fontSize: '32px' }}>⚠️</span> Validation Warning
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '16px', marginBottom: '24px' }}>
              Some files are corrupted or unsupported. Click OK to continue generating the report with the valid files.
            </p>
            <div style={{ 
              width: '100%', 
              maxHeight: '300px', 
              overflowY: 'auto', 
              backgroundColor: 'rgba(0,0,0,0.3)', 
              borderRadius: '8px', 
              padding: '16px',
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: '24px'
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
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
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
