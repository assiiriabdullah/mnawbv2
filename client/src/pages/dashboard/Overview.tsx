import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../hooks/useApi';
import { StatCard, Card, Skeleton, SectionHeader } from '../../components/UI';
import { StatusBadge, ShiftBadge } from '../../components/Badge';
import { Users, UserCheck, Shield, CalendarDays, GraduationCap, Briefcase, Clock, TrendingUp } from 'lucide-react';

interface Stats {
  totalEmployees: number;
  deptManagers: number;
  supervisors: number;
  operators: number;
  pendingLeaves: number;
  approvedLeaves: number;
  totalCourses: number;
  totalMandates: number;
  byShift: { shift: string; count: number }[];
  recentLeaves: any[];
}

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Stats>('/api/stats').then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader title="لوحة التحكم" subtitle="نظرة عامة على النظام" />

      {/* Stats Grid */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users size={22} />} label="إجمالي الموظفين" value={stats.totalEmployees} gradient="from-emerald-500 to-teal-600" />
        <StatCard icon={<Shield size={22} />} label="المشرفين" value={stats.supervisors} gradient="from-blue-500 to-indigo-600" />
        <StatCard icon={<UserCheck size={22} />} label="المنفذين" value={stats.operators} gradient="from-amber-500 to-orange-600" />
        <StatCard icon={<CalendarDays size={22} />} label="إجازات معلقة" value={stats.pendingLeaves} gradient="from-rose-500 to-red-600" />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<CalendarDays size={22} />} label="إجازات مقبولة" value={stats.approvedLeaves} gradient="from-green-500 to-emerald-600" />
        <StatCard icon={<GraduationCap size={22} />} label="الدورات" value={stats.totalCourses} gradient="from-violet-500 to-purple-600" />
        <StatCard icon={<Briefcase size={22} />} label="الانتدابات" value={stats.totalMandates} gradient="from-cyan-500 to-teal-600" />
        <StatCard icon={<TrendingUp size={22} />} label="مدراء الإدارات" value={stats.deptManagers} gradient="from-pink-500 to-rose-600" />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shifts distribution */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-emerald-600" />
            توزيع المناوبات
          </h3>
          <div className="space-y-3">
            {stats.byShift.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">لا يوجد بيانات</p>
            ) : (
              stats.byShift.map(s => {
                const pct = stats.totalEmployees > 0 ? Math.round((s.count / stats.totalEmployees) * 100) : 0;
                return (
                  <div key={s.shift} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-bold text-gray-700">مناوبة {s.shift}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full gradient-primary"
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-600 w-12 text-left">{s.count}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Recent leaves */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CalendarDays size={20} className="text-amber-500" />
            آخر طلبات الإجازة
          </h3>
          <div className="space-y-3">
            {stats.recentLeaves.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">لا يوجد طلبات</p>
            ) : (
              stats.recentLeaves.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{l.employee_name}</p>
                    <p className="text-xs text-gray-400">{l.start_date} → {l.end_date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShiftBadge shift={l.employee_shift} />
                    <StatusBadge status={l.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
