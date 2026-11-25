import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Overview from './pages/Overview'
import PlatformAnalytics from './pages/PlatformAnalytics'
import ContentLibrary from './pages/ContentLibrary'
import Growth from './pages/Growth'
import Strategist from './pages/Strategist'
import Ideas from './pages/Ideas'
import CalendarPage from './pages/Calendar'
import Brands from './pages/Brands'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function Gate() {
  const { session, loading, demoGuest } = useAuth()
  if (loading) return <Spinner label="Checking your session…" />
  if (!session && !demoGuest) return <Login />
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="instagram" element={<PlatformAnalytics platform="instagram" key="ig" />} />
          <Route path="youtube" element={<PlatformAnalytics platform="youtube" key="yt" />} />
          <Route path="content" element={<ContentLibrary />} />
          <Route path="growth" element={<Growth />} />
          <Route path="strategist" element={<Strategist />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="brands" element={<Brands />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </HashRouter>
  )
}
