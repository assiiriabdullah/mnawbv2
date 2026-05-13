import { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CalendarDays, GraduationCap, Briefcase,
  ClipboardCheck, Shield, Activity, LogOut, Menu, X, ChevronRight,
  User, KeyRound, FileSignature, Home, PanelLeftClose, PanelLeft
} from 'lucide-react';

const roleLabels: Record<string, string> = {
  general_manager: 'المدير العام',
  dept_manager: 'مدير إدارة',
  supervisor: 'ضابط',
  operator: 'منفذ',
};

const deptLabels: Record<string, string> = {
  shifts: 'إدارة المناوبات',
  hr: 'الموارد البشرية',
  operations: 'العمليات',
  workforce: 'القوى العاملة',
};

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  show?: boolean;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isManager = user?.role === 'general_manager' || user?.role === 'dept_manager';
  const isSupervisor = user?.role === 'supervisor';
  const isSupport = !!user?.support_group;

  const managerNav: NavItem[] = [
    { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'الرئيسية' },
    { to: '/dashboard/employees', icon: <Users size={20} />, label: 'الموظفين' },
    { to: '/dashboard/leaves', icon: <CalendarDays size={20} />, label: 'الإجازات' },
    { to: '/dashboard/courses', icon: <GraduationCap size={20} />, label: 'الدورات' },
    { to: '/dashboard/mandates', icon: <Briefcase size={20} />, label: 'الانتدابات' },
    { to: '/dashboard/attendance', icon: <ClipboardCheck size={20} />, label: 'سجلات الحضور' },
    { to: '/dashboard/support-attendance', icon: <Shield size={20} />, label: 'كشوفات المساندة' },
    { to: '/dashboard/activity', icon: <Activity size={20} />, label: 'سجل النشاطات' },
  ];

  const employeeNav: NavItem[] = [
    { to: '/employee', icon: <Home size={20} />, label: 'الحضور', show: !!user?.shift },
    { to: '/employee/support', icon: <Shield size={20} />, label: 'كشف المساندة', show: isSupervisor || isSupport },
    { to: '/employee/leaves', icon: <CalendarDays size={20} />, label: 'إجازات المناوبة', show: isSupervisor },
    { to: '/employee/profile', icon: <User size={20} />, label: 'صفحتي' },
    { to: '/employee/signature', icon: <FileSignature size={20} />, label: 'التوقيع الإلكتروني' },
    { to: '/employee/password', icon: <KeyRound size={20} />, label: 'كلمة المرور' },
  ];

  const navItems = isManager ? managerNav : employeeNav.filter(n => n.show !== false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
      isActive
        ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    } ${collapsed ? 'justify-center px-3' : ''}`;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-100 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md flex-shrink-0">
          <Users size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-bold text-gray-800 text-sm truncate">نظام إدارة الموظفين</h1>
            <p className="text-[11px] text-gray-400 truncate">{isManager ? 'لوحة الإدارة' : 'بوابة الموظف'}</p>
          </div>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard' || item.to === '/employee'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => linkClass(isActive)}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Info + Logout */}
      <div className="border-t border-gray-100 p-3 space-y-2">
        {!collapsed && user && (
          <div className="px-3 py-2 rounded-xl bg-gray-50">
            <p className="font-semibold text-gray-800 text-sm truncate">{user.name}</p>
            <p className="text-[11px] text-gray-400 truncate">
              {roleLabels[user.role]} {user.department ? `• ${deptLabels[user.department] || ''}` : ''}
              {user.shift ? ` • مناوبة ${user.shift}` : ''}
            </p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition text-sm font-medium ${collapsed ? 'justify-center' : ''}`}
          title="تسجيل الخروج"
        >
          <LogOut size={20} />
          {!collapsed && <span>تسجيل الخروج</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" dir="rtl">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - mobile */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-50 lg:hidden"
          >
            <div className="absolute top-4 left-4">
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Sidebar - desktop */}
      <aside
        className="hidden lg:flex flex-col bg-white border-l border-gray-100 transition-all duration-300 flex-shrink-0"
        style={{ width: collapsed ? 72 : 260 }}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute bottom-4 -left-3 w-6 h-6 items-center justify-center bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 transition z-10"
          style={{ right: collapsed ? 60 : 248 }}
        >
          {collapsed ? <PanelLeft size={12} /> : <PanelLeftClose size={12} />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 lg:px-6 h-16 bg-white border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium">
                <CalendarDays size={14} />
                <span>رصيد الإجازات: <strong>{user.annual_leave_balance}</strong> يوم</span>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
