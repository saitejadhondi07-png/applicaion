import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ReportDataProvider } from './contexts/ReportDataContext';
import { ReportMutationsProvider } from './contexts/ReportMutationsContext';
import { ReportFiltersProvider } from './contexts/ReportFiltersContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';
import ApprovalPage from './pages/ApprovalPage';
import UsersPage from './pages/UsersPage';
import GlobalErrorPopup from './components/GlobalErrorPopup';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <ReportDataProvider>
        <ReportMutationsProvider>
          <ReportFiltersProvider>
            <BrowserRouter>
              <GlobalErrorPopup />
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected layout routes */}
                <Route path="/" element={<Layout />}>
                  {/* Default redirect to dashboard */}
                  <Route index element={<Navigate to="/dashboard" replace />} />

                  {/* Shared protected routes */}
                  <Route element={<ProtectedRoute allowedRoles={[]} />}>
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                  </Route>

                  {/* Test Engineer specific routes */}
                  <Route element={<ProtectedRoute allowedRoles={['test_engineer', 'admin']} />}>
                    <Route path="upload" element={<UploadPage />} />
                  </Route>

                  {/* Quality Engineer specific routes */}
                  <Route element={<ProtectedRoute allowedRoles={['quality_engineer', 'admin', 'quality_manager']} />}>
                    <Route path="review" element={<ReviewPage />} />
                  </Route>

                  {/* Quality Manager specific routes */}
                  <Route element={<ProtectedRoute allowedRoles={['quality_manager', 'admin']} />}>
                    <Route path="approval" element={<ApprovalPage />} />
                  </Route>

                  {/* Admin specific routes */}
                  <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                    <Route path="users" element={<UsersPage />} />
                    <Route path="analytics" element={<AnalyticsPage />} />
                  </Route>

                  {/* Catch all redirect to dashboard */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ReportFiltersProvider>
        </ReportMutationsProvider>
      </ReportDataProvider>
    </AuthProvider>
  );
}

export default App;
