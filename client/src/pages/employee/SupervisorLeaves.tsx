import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import Modal, { Card, SectionHeader, EmptyState, Button, Input, Skeleton } from '../../components/UI';
import { StatusBadge } from '../../components/Badge';
import { CalendarDays, Check, X, Settings, Users, ChevronLeft, ChevronRight, AlertTriangle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Leave {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_shift: string;
  employee_department: string;
  employee_sub_department: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
}

interface LeaveSetting {
  id?: number;
  shift: string;
  month: string;
  max_leaves: number;
}

export default function SupervisorLeaves() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState<LeaveSetting[]>([]);
  const [settingMonth, setSettingMonth] = useState('');
  const [settingMax, setSettingMax] = useState(8);
  const [statusFilter, setStatusFilter] = useState('');

  // Month navigation
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const load = () => {
    setLoading(true);
    api<Leave[]>('/api/leaves')
      .then(d => { setLeaves(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const loadSettings = () => {
    api<LeaveSetting[]>('/api/leaves/settings')
      .then(setSettings)
      .catch(() => {});
  };

  useEffect(() => { load(); loadSettings(); }, []);

  // Calculate month info
  const monthNameAr = (monthStr: string) => {
    const months: Record<string, string> = {
      '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
      '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
      '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
    };
    const [year, mon] = monthStr.split('-');
    return `${months[mon] || mon} ${year}`;
  };

  const navigateMonth = (direction: number) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + direction, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Filter leaves by selected month (leaves that overlap with the month)
  const monthFilteredLeaves = useMemo(() => {
    const [year, mon] = selectedMonth.split('-');
    const monthStart = new Date(`${year}-${mon}-01`);
    const monthEnd = new Date(parseInt(year), parseInt(mon), 0); // last day of month

    return leaves.filter(l => {
      const leaveStart = new Date(l.start_date);
      const leaveEnd = new Date(l.end_date);
      // Check if leave overlaps with the month
      return leaveStart <= monthEnd && leaveEnd >= monthStart;
    });
  }, [leaves, selectedMonth]);

  // Apply status filter
  const filteredLeaves = useMemo(() => {
    if (!statusFilter) return monthFilteredLeaves;
    return monthFilteredLeaves.filter(l => l.status === statusFilter);
  }, [monthFilteredLeaves, statusFilter]);

  // Stats for the selected month
  const monthStats = useMemo(() => {
    const approved = monthFilteredLeaves.filter(l => l.status === 'approved').length;
    const pending = monthFilteredLeaves.filter(l => l.status === 'pending').length;
    const rejected = monthFilteredLeaves.filter(l => l.status === 'rejected').length;
    const currentSetting = settings.find(s => s.month === selectedMonth);
    const maxLeaves = currentSetting?.max_leaves ?? 8;
    return { approved, pending, rejected, total: monthFilteredLeaves.length, maxLeaves };
  }, [monthFilteredLeaves, settings, selectedMonth]);

  const calcDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const approve = async (id: number) => {
    try {
      await api(`/api/leaves/${id}/approve`, 'PUT');
      toast('تمت الموافقة على الإجازة');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const reject = async (id: number) => {
    try {
      await api(`/api/leaves/${id}/reject`, 'PUT');
      toast('تم رفض الإجازة');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const openSettings = () => {
    setSettingMonth(selectedMonth);
    const current = settings.find(s => s.month === selectedMonth);
    setSettingMax(current?.max_leaves ?? 8);
    setSettingsModalOpen(true);
  };

  const saveSettings = async () => {
    try {
      await api('/api/leaves/settings', 'PUT', { month: settingMonth, max_leaves: settingMax });
      toast('تم تحديث الإعدادات');
      setSettingsModalOpen(false);
      loadSettings();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="إجازات المناوبة"
        subtitle={user.shift ? `مناوبة ${user.shift}` : ''}
        actions={
          <Button variant="secondary" onClick={openSettings}>
            <Settings size={16} /> إعدادات الحد الشهري
          </Button>
        }
      />

      {/* Month Navigation */}
      <Card className="flex items-center justify-between">
        <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <ChevronRight size={20} />
        </button>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-800">{monthNameAr(selectedMonth)}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {monthStats.total} طلب • {monthStats.approved} مقبول • {monthStats.pending} معلق
          </p>
        </div>
        <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <ChevronLeft size={20} />
        </button>
      </Card>

      {/* Capacity indicator */}
      <Card>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">السعة الشهرية</span>
            <span className={`font-bold ${monthStats.approved >= monthStats.maxLeaves ? 'text-red-600' : 'text-emerald-600'}`}>
              {monthStats.approved} / {monthStats.maxLeaves}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <motion.div
              className={`h-full rounded-full transition-colors ${
                monthStats.approved >= monthStats.maxLeaves ? 'bg-gradient-to-l from-red-500 to-red-400' :
                monthStats.approved >= monthStats.maxLeaves * 0.75 ? 'bg-gradient-to-l from-amber-500 to-amber-400' :
                'bg-gradient-to-l from-emerald-500 to-teal-400'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((monthStats.approved / monthStats.maxLeaves) * 100, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          {monthStats.approved >= monthStats.maxLeaves && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 mt-1">
              <AlertTriangle size={12} />
              <span>تم الوصول للحد الأقصى - لن يتم قبول إجازات جديدة</span>
            </div>
          )}
        </div>
      </Card>

      {/* Status Filter */}
      <div className="flex gap-2">
        {[
          { value: '', label: 'الكل' },
          { value: 'pending', label: 'معلقة' },
          { value: 'approved', label: 'مقبولة' },
          { value: 'rejected', label: 'مرفوضة' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition ${
              statusFilter === f.value
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            {f.value === 'pending' && monthStats.pending > 0 && (
              <span className="mr-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[10px]">
                {monthStats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Leaves List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : filteredLeaves.length === 0 ? (
        <Card><EmptyState message="لا توجد إجازات لهذا الشهر" icon={<CalendarDays size={48} />} /></Card>
      ) : (
        <div className="space-y-3">
          {filteredLeaves.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{l.employee_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {l.start_date} → {l.end_date} • {calcDays(l.start_date, l.end_date)} يوم
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={l.status} />
                  {l.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => approve(l.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium transition"
                      >
                        <Check size={14} /> موافقة
                      </button>
                      <button
                        onClick={() => reject(l.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-medium transition"
                      >
                        <X size={14} /> رفض
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      <Modal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} title="إعدادات الحد الشهري">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            حدد الحد الأقصى لعدد الموظفين في إجازة لكل شهر في مناوبتك.
          </p>
          <Input
            label="الشهر"
            type="month"
            value={settingMonth}
            onChange={e => setSettingMonth(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الحد الأقصى للإجازات</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSettingMax(Math.max(0, settingMax - 1))}
                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition text-lg font-bold"
              >
                -
              </button>
              <div className="flex-1 text-center">
                <span className="text-3xl font-bold text-gray-800">{settingMax}</span>
                <p className="text-xs text-gray-400 mt-1">موظف كحد أقصى</p>
              </div>
              <button
                onClick={() => setSettingMax(Math.min(50, settingMax + 1))}
                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition text-lg font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Current settings list */}
          {settings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 mb-2">الإعدادات الحالية:</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {settings.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 text-xs">
                    <span className="text-gray-600">{monthNameAr(s.month)}</span>
                    <span className="font-bold text-gray-800">{s.max_leaves} موظف</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={saveSettings} className="flex-1">
              <Save size={16} /> حفظ
            </Button>
            <Button variant="secondary" onClick={() => setSettingsModalOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
