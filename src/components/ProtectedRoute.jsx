import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const accessDeniedStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    color: '#fff',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: '2rem',
    textAlign: 'center',
  },
  icon: {
    fontSize: '5rem',
    marginBottom: '1.5rem',
    filter: 'drop-shadow(0 0 20px rgba(255, 87, 87, 0.5))',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '0.75rem',
    background: 'linear-gradient(90deg, #ff6b6b, #ffa36b)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  message: {
    fontSize: '1.1rem',
    color: 'rgba(255, 255, 255, 0.7)',
    maxWidth: '420px',
    lineHeight: 1.6,
    marginBottom: '2rem',
  },
  button: {
    padding: '0.85rem 2.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
  },
};

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { user, isAuthenticated } = useAuth();

  // Not logged in → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Admin always has access
  const hasAccess =
    user.role === 'admin' ||
    allowedRoles.length === 0 ||
    allowedRoles.includes(user.role);

  if (!hasAccess) {
    return (
      <div style={accessDeniedStyles.container}>
        <div style={accessDeniedStyles.icon}>🚫</div>
        <h1 style={accessDeniedStyles.title}>Access Denied</h1>
        <p style={accessDeniedStyles.message}>
          You don't have the required permissions to view this page. Please
          contact your administrator if you believe this is an error.
        </p>
        <button
          style={accessDeniedStyles.button}
          onClick={() => (window.location.href = '/dashboard')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 28px rgba(102, 126, 234, 0.55)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.4)';
          }}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return <Outlet />;
}
