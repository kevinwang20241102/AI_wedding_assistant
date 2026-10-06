import { Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router'
import LoginPage from '../pages/LoginPage'
import PasswordResetPage from '../pages/PasswordResetPage'
import RegisterPage from '../pages/RegisterPage'
import CreateWeddingPage from '../pages/CreateWeddingPage'
import PlanPage from '../pages/PlanPage'
import BudgetPage from '../pages/BudgetPage'
import SeatingPage from '../pages/SeatingPage'
import XiaoBeiPage from '../pages/XiaoBeiPage'
import AppLayout from '../components/AppLayout'
import { AuthProvider } from '../stores/AuthProvider'
import { useAuth } from '../stores/authContext'

function RestoreNote() {
  return (
    <div className="auth-wrap">
      <p className="later-note" role="status">
        正在恢复登录状态…
      </p>
    </div>
  )
}

function RequireAuth() {
  const { status } = useAuth()
  if (status === 'loading') return <RestoreNote />
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />
}

function RequireWedding() {
  const { status, user } = useAuth()
  if (status === 'loading') return <RestoreNote />
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />
  if (!user.has_wedding) return <Navigate to="/wedding/new" replace />
  return <Outlet />
}

function HomeRedirect() {
  const { status, user } = useAuth()
  if (status === 'loading') return <RestoreNote />
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />
  return <Navigate to={user.has_wedding ? '/plan' : '/wedding/new'} replace />
}

function ArchiveUnderlay() {
  const [params] = useSearchParams()
  const from = params.get('from')
  if (from === 'budget') return <BudgetPage />
  if (from === 'seating') return <SeatingPage />
  if (from === 'xiaobei') return <XiaoBeiPage />
  return <PlanPage />
}

export function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/wedding/new" element={<CreateWeddingPage />} />
          <Route element={<RequireWedding />}>
            <Route element={<AppLayout />}>
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/budget" element={<BudgetPage />} />
              <Route path="/seating" element={<SeatingPage />} />
              <Route path="/xiaobei" element={<XiaoBeiPage />} />
              <Route path="/wedding" element={<ArchiveUnderlay />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </AuthProvider>
  )
}
