import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import senseopsLogo from '../assets/senseops-logo.png';
import CustomModal from '../components/CustomModal';
import Swal from 'sweetalert2';
import './LoginPage.css';

const User = ({ size, className }) => <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const Lock = ({ size, className }) => <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>;
const Eye = ({ size, className }) => <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
const EyeOff = ({ size, className }) => <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;
const AlertTriangle = ({ size, className }) => <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>;

const LoginPage = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!userId.trim() || !password.trim()) {
      setError('Please enter both User ID and password.');
      return;
    }

    setLoading(true);

    try {
      const success = await login(userId, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Invalid User ID or password. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Invalid User ID or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setResetError('');
    if (!resetUserId.trim() || !resetPassword.trim()) {
      setResetError('Please enter both User ID and a new password.');
      return;
    }
    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5191`}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, newPassword: resetPassword })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to reset password');
      }
      setIsForgotModalOpen(false);
      setResetUserId('');
      setResetPassword('');
      Swal.fire({
        icon: 'success',
        html: `
          <h3 style="margin: 0 0 10px 0; font-size: 1.3rem; font-weight: 600; color: #0f172a;">Success!</h3>
          <p style="margin: 0; font-size: 0.9rem; color: #475569; line-height: 1.4;">Password reset successfully! You can now log in with the new password.</p>
        `,
        confirmButtonColor: '#2563eb',
        background: '#ffffff',
        width: '320px',
        padding: '1.5rem',
        customClass: {
          confirmButton: 'swal2-confirm-small'
        }
      });
    } catch (err) {
      setResetError(err.message);
    }
  };

  return (
    <div className="login-page-container">
      {/* Decorative corporate background elements */}
      <div className="login-bg-shapes">
        <div className="bg-shape shape-1" />
        <div className="bg-shape shape-2" />
      </div>

      {/* Main Login Box */}
      <div className="login-card-container">
        <div className="login-card-header">
          <div className="login-brand-logos-container" style={{ justifyContent: 'center' }}>
            <img src="/bk.png" alt="Company Logo" className="login-logo-img" style={{ maxHeight: '80px', width: 'auto' }} />
          </div>
        </div>

        <div className="login-card-subheading">
          <h2>Quality Management System</h2>
        </div>

        {error && (
          <div className="login-error-alert animate-shake">
            <AlertTriangle className="alert-icon" size={18} />
            <span className="alert-text">{error}</span>
          </div>
        )}


        <form className="login-form-main" onSubmit={handleSubmit} autoComplete="off">
          <div className="login-form-group">
            <label htmlFor="login-userid">User ID</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <User size={18} />
              </span>
              <input
                id="login-userid"
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="e.g. 123456"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-form-group">
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <Lock size={18} />
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="login-btn-spinner" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>

            {/* Password resets are an administrator action. The self-service reset that used
                to live here posted a user id and a new password to an anonymous endpoint, so
                anyone who could reach the API could take over any account. */}
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setIsForgotModalOpen(true);
                }}
                style={{ color: '#2563eb', fontSize: '0.9rem', textDecoration: 'none', cursor: 'pointer', display: 'block', lineHeight: '1.5' }}
              >
                Forgot your password? Contact your administrator<br />to have it reset.
              </a>
            </div>
          </div>
        </form>

        <div className="login-footer-partner">
          <span className="partner-footer-text">Powered by</span>
          <img src={senseopsLogo} alt="SenseOps" className="partner-footer-logo" />
        </div>
      </div>

      <CustomModal
        isOpen={isForgotModalOpen}
        title="Reset Password"
        type="confirm"
        onConfirm={handleResetPassword}
        onCancel={() => {
          setIsForgotModalOpen(false);
          setResetUserId('');
          setResetPassword('');
          setResetError('');
        }}
        confirmText="Reset Password"
        lightMode={true}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          {resetError && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{resetError}</div>}
          <div className="login-form-group" style={{ textAlign: 'left', marginBottom: '4px' }}>
            <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '4px', fontWeight: '500' }}>User ID</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <User size={18} />
              </span>
              <input
                type="text"
                value={resetUserId}
                onChange={(e) => setResetUserId(e.target.value)}
                placeholder="Enter User ID"
                style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>
          <div className="login-form-group" style={{ textAlign: 'left', marginBottom: '4px' }}>
            <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '4px', fontWeight: '500' }}>New Password</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <Lock size={18} />
              </span>
              <input
                type={showResetPassword ? "text" : "password"}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter new password"
                style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowResetPassword((prev) => !prev)}
              >
                {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>
      </CustomModal>
    </div>
  );
};

export default LoginPage;
