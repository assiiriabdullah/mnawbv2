import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Login from './pages/Login';

// Dashboard pages
import Overview from './pages/dashboard/Overview';
import Employees from './pages/dashboard/Employees';
import Leaves from './pages/dashboard/Leaves';
import Courses from './pages/dashboard/Courses';
import Mandates from './pages/dashboard/Mandates';
import Attendance from './pages/dashboard/Attendance';
import DashSupportAttendance from './pages/dashboard/SupportAttendance';
import Activity from './pages/dashboard/Activity';

// Employee pages
import MyAttendance from './pages/employee/MyAttendance';
import EmpSupportAttendance from './pages/employee/SupportAttendance';
import Profile from './pages/employee/Profile';
import Signature from './pages/employee/Signature';
import Password from './pages/employee/Password';
import SupervisorLeaves from './pages/employee/SupervisorLeaves';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ecfdf5, #f0fdfa)' }}>
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="animate-spin h-7 w-7 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const isManager = user.role === 'general_manager' || user.role === 'dept_manager';

  return (
    <Routes>
      {/* Manager Dashboard */}
      {isManager && (
        <Route path="/dashboard" element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="employees" element={<Employees />} />
          <Route path="leaves" element={<Leaves />} />
          <Route path="courses" element={<Courses />} />
          <Route path="mandates" element={<Mandates />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="support-attendance" element={<DashSupportAttendance />} />
          <Route path="activity" element={<Activity />} />
        </Route>
      )}

      {/* Employee Portal */}
      {!isManager && (
        <Route path="/employee" element={<Layout />}>
          <Route index element={user.shift ? <MyAttendance /> : <Profile />} />
          <Route path="support" element={<EmpSupportAttendance />} />
          <Route path="leaves" element={<SupervisorLeaves />} />
          <Route path="profile" element={<Profile />} />
          <Route path="signature" element={<Signature />} />
          <Route path="password" element={<Password />} />
        </Route>
      )}

      {/* Redirect */}
      <Route path="*" element={<Navigate to={isManager ? '/dashboard' : '/employee'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
