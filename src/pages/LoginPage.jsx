import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Lock, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';
import senseopsLogo from '../assets/senseops-logo.png';
import CustomModal from '../components/CustomModal';
import './LoginPage.css';

const LoginPage = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotUserId, setForgotUserId] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');

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



  const submitForgotPassword = async () => {
    setIsForgotModalOpen(false);
    if (!forgotUserId.trim() || !forgotNewPassword.trim()) {
      setError('User ID and New Password are required.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await fetch('http://localhost:5191/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: forgotUserId, newPassword: forgotNewPassword })
      });

      const data = await response.json();
      if (response.ok) {
        setSuccessMsg(data.message);
      } else {
        setError(data.message || 'Failed to reset password.');
      }
    } catch (err) {
      setError(err.message || 'Could not connect to the server to reset password.');
    } finally {
      setLoading(false);
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
        {successMsg && (
          <div className="login-error-alert" style={{ backgroundColor: '#10b98122', color: '#10b981', border: '1px solid #10b98144' }}>
            <CheckCircle className="alert-icon" size={18} />
            <span className="alert-text">{successMsg}</span>
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
            
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}
              >
                Forgot Password?
              </button>
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
        title="Forgot Password"
        message="Please enter your User ID and your new password:"
        type="confirm"
        confirmText="Reset Password"
        onConfirm={submitForgotPassword}
        onCancel={() => setIsForgotModalOpen(false)}
      >
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="text"
            value={forgotUserId}
            onChange={(e) => setForgotUserId(e.target.value)}
            placeholder="User ID"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.4)', backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'white', fontSize: '16px', outline: 'none'
            }}
          />
          <input
            type="password"
            value={forgotNewPassword}
            onChange={(e) => setForgotNewPassword(e.target.value)}
            placeholder="New Password"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.4)', backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'white', fontSize: '16px', outline: 'none'
            }}
          />
        </div>
      </CustomModal>
    </div>
  );
};

export default LoginPage;
