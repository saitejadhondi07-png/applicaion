import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import LoginPage from '../pages/LoginPage'

vi.mock('../config', () => ({
  API_BASE_URL: 'http://localhost:5191/api',
}))

// AuthProvider calls api.get('/auth/me') on mount. Without this mock the request
// is never resolved under jsdom and the whole suite times out waiting on a worker.
const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    defaults: { headers: { common: {} } },
    interceptors: { response: { use: vi.fn() } },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
}))

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
  sessionStorage.clear()
})

describe('ProtectedRoute', () => {
  it('sends an unauthenticated visitor to the login page', async () => {
    // No session: /auth/me rejects the way the real API does with no token.
    mockGet.mockRejectedValue({ response: { status: 401 } })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Screen</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <div>Secret Dashboard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Login Screen')).toBeInTheDocument())
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument()
  })

  it('keeps an authenticated admin out of a route they lack the role for', async () => {
    mockGet.mockResolvedValue({ data: { id: '1', name: 'QA', role: 'test_engineer' } })

    render(
      <MemoryRouter initialEntries={['/users']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Screen</div>} />
            <Route path="/dashboard" element={<div>Dashboard Fallback</div>} />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <div>User Admin</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('User Admin')).not.toBeInTheDocument())
  })
})

// The login page is the one screen every user must get past. A stray reference to a removed
// piece of state throws during render and the whole page goes blank - `npm run build` does not
// catch that, and it reached the development server once already.
describe('LoginPage', () => {
  it('renders without throwing', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument()
  })

  it('no longer offers self-service password reset', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.queryByRole('button', { name: /forgot password/i })).toBeNull()
  })
})