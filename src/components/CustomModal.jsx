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
          background: 'linear-gradient(145deg, #1e293b, #0f172a)',
          border: `1px solid ${accentColor}44`,
          borderRadius: '16px',
          padding: '32px',
          width: '90%',
          maxWidth: '450px',
          boxShadow: `0 25px 50px -12px ${accentColor}33`,
          color: 'white',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        <h2 style={{ color: 'white', margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          {danger ? '⚠️ ' : '💬 '}{title}
        </h2>

        <p style={{ color: '#cbd5e1', fontSize: '16px', margin: 0, lineHeight: '1.5' }}>
          {message}
        </p>

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
              border: `1px solid ${accentColor}66`,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        )}
        
        {children}

        <div style={{ display: 'flex', gap: '16px', width: '100%', marginTop: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid #475569',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#334155';
              e.target.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#94a3b8';
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={type === 'prompt' && !inputValue.trim()}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: type === 'prompt' && !inputValue.trim() ? '#475569' : accentColor,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
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
