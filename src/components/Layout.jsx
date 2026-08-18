import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', roles: [] },
  { to: '/reports', label: 'Reports', roles: [] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    // Default to light mode to match Dashboard.png exactly
    return localStorage.getItem('endurance-theme') || 'light';
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.settings-menu-container')) {
        setSettingsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('endurance-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isVisible = (roles) =>
    roles.length === 0 || user?.role === 'admin' || roles.includes(user?.role);

  return (
    <div className="app-layout">
      {/* Top Navigation Bar Matching Dashboard.png */}
      <header className="top-navbar">
        <div className="navbar-left">
          {/* Logo */}
          <div className="navbar-brand" onClick={() => navigate('/dashboard')}>
            <div className="brand-logos-container">
              <img src="/bk.png" alt="Company Logo" className="brand-logo-img" style={{ maxHeight: '38px', width: 'auto' }} />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="navbar-links">
            {NAV_ITEMS.filter((item) => isVisible(item.roles)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="navbar-right">
          {/* Search Box */}
          <div className="navbar-search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          {/* Icons */}
          <button className="navbar-icon-btn" aria-label="Notifications" title="Notifications">
            🔔
            <span className="notif-dot"></span>
          </button>
          
          <div className="settings-menu-container">
            <button 
              className={`navbar-icon-btn ${settingsDropdownOpen ? 'active' : ''}`}
              onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
              aria-label="Settings"
              title="Settings"
            >
              ⚙️
            </button>
            {settingsDropdownOpen && (
              <div className="settings-dropdown-menu">
                {user?.role === 'admin' && (
                  <button 
                    className="settings-dropdown-item"
                    onClick={() => {
                      setSettingsDropdownOpen(false);
                      navigate('/users');
                    }}
                  >
                    🔧 User Management
                  </button>
                )}
                {user?.role !== 'admin' && (
                  <div className="settings-dropdown-item disabled">
                    🔒 Settings Restricted
                  </div>
                )}
                
                <button 
                  className="settings-dropdown-item"
                  onClick={() => {
                    setSettingsDropdownOpen(false);
                    toggleTheme();
                  }}
                >
                  {theme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                </button>

                <div className="settings-dropdown-divider"></div>
                <div className="settings-dropdown-item-header">Logged in as:</div>
                <div className="settings-dropdown-user-info">
                  <strong>{user?.name || 'User'}</strong>
                  <span className="user-role-badge">{user?.role}</span>
                </div>
              </div>
            )}
          </div>

          {/* User Profile / Logout */}
          <div className="navbar-user-profile" title={`Logged in as ${user?.name || 'User'} (${user?.role})`}>
            <div className="user-avatar-circle">
              {user?.avatar || '👨‍💼'}
            </div>
            <button className="logout-mini-btn" onClick={handleLogout} aria-label="Logout" title="Logout">
              ⏻
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Area */}
      <main className="layout-content-area">
        <Outlet context={{ searchQuery, setSearchQuery }} />
      </main>
    </div>
  );
}
