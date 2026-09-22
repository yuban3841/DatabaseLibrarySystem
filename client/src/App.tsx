import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RequireRole from './auth/RequireRole';
import { AuthProvider } from './auth/useAuth';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Activities from './pages/Activities';
import ActivityForm from './pages/ActivityForm';
import Registrations from './pages/Registrations';
import Checkin from './pages/Checkin';
import Statistics from './pages/Statistics';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireRole>
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/activities"
              element={
                <RequireRole roles={['ADMIN', 'ORGANIZER']}>
                  <Activities />
                </RequireRole>
              }
            />
            <Route
              path="/activities/new"
              element={
                <RequireRole roles={['ADMIN', 'ORGANIZER']}>
                  <ActivityForm />
                </RequireRole>
              }
            />
            <Route
              path="/activities/:activityId/edit"
              element={
                <RequireRole roles={['ADMIN', 'ORGANIZER']}>
                  <ActivityForm />
                </RequireRole>
              }
            />
            <Route
              path="/registrations"
              element={
                <RequireRole roles={['ADMIN', 'ORGANIZER']}>
                  <Registrations />
                </RequireRole>
              }
            />
            <Route
              path="/checkin"
              element={
                <RequireRole roles={['ADMIN', 'ORGANIZER']}>
                  <Checkin />
                </RequireRole>
              }
            />
            <Route
              path="/statistics"
              element={
                <RequireRole roles={['ADMIN', 'ORGANIZER']}>
                  <Statistics />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
