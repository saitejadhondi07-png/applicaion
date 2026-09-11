import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Lock, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';
import senseopsLogo from '../assets/senseops-logo.png';
import './LoginPage.css';

const LoginPage = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
            
            {/* Password resets are an administrator action. The self-service reset that used
                to live here posted a user id and a new password to an anonymous endpoint, so
                anyone who could reach the API could take over any account. */}
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
                Forgot your password? Contact your administrator to have it reset.
              </span>
            </div>
          </div>
        </form>

        <div className="login-footer-partner">
          <span className="partner-footer-text">Powered by</span>
          <img src={senseopsLogo} alt="SenseOps" className="partner-footer-logo" />
        </div>
      </div>
      
    </div>
  );
};

export default LoginPage;
