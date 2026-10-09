import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const CustomModal = ({
  isOpen,
  title,
  message,
  type = 'confirm', // 'confirm' or 'prompt'
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  placeholder = 'Enter value...',
  danger = false,
  maxWidth = '450px',
  lightMode = false,
  children
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (type === 'prompt' && !inputValue.trim()) return;
    onConfirm(type === 'prompt' ? inputValue.trim() : undefined);
  };

  const accentColor = danger ? '#ef4444' : '#3b82f6';
  const accentHover = danger ? '#dc2626' : '#2563eb';

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
          background: lightMode ? '#ffffff' : 'var(--bg-secondary, #ffffff)',
          border: lightMode ? '1px solid #e2e8f0' : `1px solid var(--border-color, #e2e8f0)`,
          borderRadius: '16px',
          padding: '24px',
          width: '90%',
          maxWidth: maxWidth,
          boxShadow: `0 20px 40px -12px ${accentColor}33`,
          color: lightMode ? '#0f172a' : 'var(--text-primary, #0f172a)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        <h2 style={{ color: lightMode ? '#0f172a' : 'var(--text-primary, #0f172a)', margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          {danger ? '⚠️ ' : '💬 '}{title}
        </h2>

        {message && (
          <p style={{ color: lightMode ? '#64748b' : 'var(--text-muted, #64748b)', fontSize: '14px', margin: 0, lineHeight: '1.5' }}>
            {message}
          </p>
        )}

        {type === 'prompt' && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onCancel();
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              border: `1px solid var(--border-color)`,
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '15px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        )}
        
        {children}

        <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: lightMode ? '#f1f5f9' : 'var(--bg-primary, #f1f5f9)',
              color: lightMode ? '#0f172a' : 'var(--text-primary, #0f172a)',
              border: lightMode ? '1px solid #cbd5e1' : '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = lightMode ? '#e2e8f0' : 'var(--border-color, #e2e8f0)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = lightMode ? '#f1f5f9' : 'var(--bg-primary, #f1f5f9)';
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={type === 'prompt' && !inputValue.trim()}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: type === 'prompt' && !inputValue.trim() ? 'var(--border-color)' : accentColor,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: type === 'prompt' && !inputValue.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => {
              if (!(type === 'prompt' && !inputValue.trim())) {
                e.target.style.backgroundColor = accentHover;
              }
            }}
            onMouseOut={(e) => {
              if (!(type === 'prompt' && !inputValue.trim())) {
                e.target.style.backgroundColor = accentColor;
              }
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CustomModal;
