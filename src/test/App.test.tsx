import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import { ReportDataProvider } from '../contexts/ReportDataContext'
import { ReportMutationsProvider } from '../contexts/ReportMutationsContext'
import { ReportFiltersProvider } from '../contexts/ReportFiltersContext'
import { ReportDataConsumer } from '../contexts/ReportDataContext'
import ProtectedRoute from '../components/ProtectedRoute'
import DashboardPage from '../pages/DashboardPage'

// Mock config
vi.mock('../config', () => ({
  API_BASE_URL: 'http://localhost:5191/api',
}))

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <ReportDataProvider>
          <ReportMutationsProvider>
            <ReportDataConsumer>
              {reports => (
                <>
                  <ReportFiltersProvider reports={reports}>
                    {component}
                  </ReportFiltersProvider>
                </>
              )}
            </ReportDataConsumer>
          </ReportMutationsProvider>
        </ReportDataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('DashboardPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('Report Generation & Controls')).toBeInTheDocument()
  })
})

describe('ProtectedRoute', () => {
  it('redirects to login when not authenticated', () => {
    renderWithProviders(
      <ProtectedRoute allowedRoles={[]}>
        <div>Protected Content</div>
      </ProtectedRoute>
    )
    // Should redirect to /login
    expect(window.location.pathname).toBe('/login')
  })
})