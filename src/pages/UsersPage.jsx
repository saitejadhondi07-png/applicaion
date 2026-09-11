import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import CustomModal from '../components/CustomModal';
import './UsersPage.css';

export default function UsersPage() {
  const { user: currentUser, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('test_engineer');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: null, danger: false, confirmText: 'Yes, Delete' });

  // Password reset. This is the only reset path in the system: the self-service one that used
  // to live on the login page reset any account anonymously, so it was removed.
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        setError('Session expired. Please log in again.');
      } else {
        setError(err.response?.data?.message || err.message || 'Could not connect to backend server');
      }
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim() || !userId.trim() || !password.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters long.');
      return;
    }

    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_=\-+]/;
    if (!specialCharRegex.test(password)) {
      setError('Password must include at least one special character (e.g. !@#$%^&*).');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/users', { userId, name, password, role });
      const newUser = response.data;
      
      setUsers((prev) => [...prev, newUser].sort((a, b) => a.name.localeCompare(b.name)));
      setSuccess(`User "${newUser.name}" successfully created!`);
      
      // Clear form
      setName('');
      setUserId('');
      setPassword('');
      setRole('test_engineer');
      setShowForm(false);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        setError('Session expired. Please log in again.');
      } else {
        setError(err.response?.data?.message || err.message || 'Error occurred during registration');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id, userName) => {
    if (id === '102024') {
      setError('Cannot delete the primary system administrator.');
      return;
    }

    setModalConfig({
      isOpen: true,
      title: 'Delete User',
      message: `Are you sure you want to delete user "${userName}"?`,
      danger: true,
      onConfirm: async () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        setError('');
        setSuccess('');

        try {
          await api.delete(`/users/${id}`);
          setUsers((prev) => prev.filter((u) => u.id !== id));
          setSuccess(`User "${userName}" deleted successfully.`);
        } catch (err) {
          if (err.response?.status === 401) {
            logout();
            setError('Session expired. Please log in again.');
          } else {
            setError(err.response?.data?.message || err.message || 'Failed to delete user');
          }
        }
      }
    });
  };

  const submitPasswordReset = async () => {
    if (!resetTarget) return;

    if (resetPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }

    setError('');
    setSuccess('');
    const target = resetTarget;
    setResetTarget(null);

    try {
      await api.put(`/users/${target.id}/password`, { newPassword: resetPassword });
      setSuccess(`Password reset for "${target.name}". They must sign in again.`);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        setError('Session expired. Please log in again.');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to reset password');
      }
    } finally {
      setResetPassword('');
    }
  };

  const formatRoleLabel = (roleStr) => {
    switch (roleStr?.toLowerCase()) {
      case 'admin':
        return 'System Admin';
      case 'test_engineer':
        return 'Test Engineer';
      case 'quality_engineer':
        return 'Quality Engineer';
      case 'quality_manager':
        return 'Quality Manager';
      default:
        return roleStr;
    }
  };

  return (
    <div className="users-page">
      {/* Header */}
      <div className="users-header">
        <div>
          <h1>👥 Users Management</h1>
          <p>Create, manage, and assign roles for QMS workflow members</p>
        </div>
        <button className="add-user-trigger" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Close Form' : '➕ Add New User'}
        </button>
      </div>

      {/* Message alerts */}
      {error && (
        <div className="users-alert alert-error">
          <span>⚠️</span> {error}
        </div>
      )}
      {success && (
        <div className="users-alert alert-success">
          <span>✓</span> {success}
        </div>
      )}

      {/* Add User Form Section */}
      {showForm && (
        <div className="users-form-card glass-card animate-fade-in">
          <h2>Create New Account</h2>
          <form onSubmit={handleCreateUser} className="users-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="user-name">Full Name</label>
                <input
                  id="user-name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-userid">User ID</label>
                <input
                  id="user-userid"
                  type="text"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="e.g. 102025"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-pwd">Password</label>
                <input
                  id="user-pwd"
                  type="password"
                  placeholder="Min 12 chars + special char"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-role">Assigned QMS Role</label>
                <select
                  id="user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="test_engineer">Test Engineer (Can Generate Reports)</option>
                  <option value="quality_engineer">Quality Engineer (Access to Review)</option>
                  <option value="quality_manager">Quality Manager (Access to Approval)</option>
                  <option value="admin">Administrator (Full Access)</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users grid list */}
      {loading ? (
        <div className="users-loading">
          <div className="users-spinner" />
          <p>Loading registry members...</p>
        </div>
      ) : (
        <div className="users-grid">
          {users.map((u) => {
            const isMe = u.id === currentUser?.id;
            return (
              <div className="user-profile-card glass-card" key={u.id}>
                <div className="user-card-top">
                  <div className="user-avatar-large">{u.avatar || 'U'}</div>
                  <span className={`user-role-badge role-${u.role}`}>
                    {formatRoleLabel(u.role)}
                  </span>
                </div>

                <div className="user-card-body">
                  <h3>{u.name}</h3>
                  <p className="user-userid-text">👤 {u.id}</p>
                  <span className="user-id-sub">ID: {u.id}</span>
                </div>

                <div className="user-card-footer">
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>

                    {isMe ? (
                      <span className="user-me-badge" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Current Session</span>
                    ) : (
                      <>
                        <button
                          className="delete-user-btn"
                          style={{ flex: 1 }}
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          disabled={u.id === '102024'}
                        >
                          Delete Member
                        </button>
                        <button
                          className="delete-user-btn"
                          style={{ flex: 1, background: 'none', border: '1px solid #3b82f6', color: '#3b82f6' }}
                          onClick={() => { setResetPassword(''); setResetTarget(u); }}
                        >
                          Reset Password
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      <CustomModal
        isOpen={resetTarget !== null}
        title="Reset Password"
        message={`Set a new password for "${resetTarget?.name ?? ''}". Any session they have open will be signed out.`}
        type="confirm"
        confirmText="Reset Password"
        cancelText="Cancel"
        onConfirm={submitPasswordReset}
        onCancel={() => { setResetTarget(null); setResetPassword(''); }}
      >
        <div style={{ marginTop: '16px' }}>
          <input
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="New password (min 12 characters)"
            autoComplete="new-password"
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
}
