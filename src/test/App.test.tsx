import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'

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
