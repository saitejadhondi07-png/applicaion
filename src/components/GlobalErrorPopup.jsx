import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';

const GlobalErrorPopup = () => {
  const [error, setError] = useState(null);

  useEffect(() => {
    // Intercept API errors globally
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        // Ignore 401s if they are being handled by the AuthContext or refresh logic
        if (error.response?.status !== 401) {
          const message = error.response?.data?.message || error.message || 'An unexpected error occurred';
          // Make sure we only show errors that aren't manually handled if we want to
          setError(message);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  if (!error) return null;

  return createPortal(
    <div 
      onClick={() => setError(null)} 
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
          maxWidth: '500px',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)',
          color: 'white',
          textAlign: 'center'
        }}
      >
        <h2 style={{ color: '#f87171', marginTop: 0, fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <span style={{ fontSize: '32px' }}>⚠️</span> System Error
        </h2>
        
        <p style={{ color: '#e2e8f0', fontSize: '16px', margin: '24px 0', lineHeight: '1.5' }}>
          {error}
        </p>

        <button 
          onClick={() => setError(null)}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#dc2626'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#ef4444'}
        >
          Acknowledge & Dismiss
        </button>
      </div>
    </div>,
    document.body
  );
};

export default GlobalErrorPopup;
