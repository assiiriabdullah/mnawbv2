import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import Modal, { Card, SectionHeader, EmptyState, Button, Input } from '../../components/UI';
import { RoleBadge, DeptBadge, ShiftBadge, SubDeptBadge, StatusBadge } from '../../components/Badge';
import { User, CalendarDays, GraduationCap, Briefcase, Plus, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConflictInfo {
  employee_name: string;
  leave_start: string;
  leave_end: string;
  status: string;
  overlap_days: string[];
}

interface MonthCount {
  count: number;
  max: number;
  full: boolean;
}

interface ConflictCheckResult {
  conflicts: ConflictInfo[];
  monthCounts: Record<string, MonthCount>;
  canSubmit: boolean;
  fullMonths: string[];
  message: string | null;
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [mandates, setMandates] = useState<any[]>([]);
  const [tab, setTab] = useState<'leaves' | 'courses' | 'mandates'>('leaves');

  // Leave request state
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '' });
  const [conflictData, setConflictData] = useState<ConflictCheckResult | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/leaves').then(setLeaves).catch(() => {});
    api('/api/courses').then(setCourses).catch(() => {});
    api('/api/mandates').then(setMandates).catch(() => {});
  }, []);

  const tabs = [
    { key: 'leaves' as const, label: 'إجازاتي', icon: <CalendarDays size={16} />, count: leaves.length },
    { key: 'courses' as const, label: 'دوراتي', icon: <GraduationCap size={16} />, count: courses.length },
    { key: 'mandates' as const, label: 'انتداباتي', icon: <Briefcase size={16} />, count: mandates.length },
  ];

  // Check conflicts when dates change
  const checkConflicts = async (startDate: string, endDate: string) => {
    if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) {
      setConflictData(null);
      return;
    }
    setCheckingConflicts(true);
    try {
      const data = await api<ConflictCheckResult>(`/api/leaves/check-conflicts?start_date=${startDate}&end_date=${endDate}`);
      setConflictData(data);
    } catch {
      setConflictData(null);
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handleDateChange = (field: 'start_date' | 'end_date', value: string) => {
    const newForm = { ...leaveForm, [field]: value };
    setLeaveForm(newForm);
    checkConflicts(newForm.start_date, newForm.end_date);
  };

  const handleSubmitLeave = async () => {
    if (!leaveForm.start_date || !leaveForm.end_date) {
      toast('يرجى تحديد تاريخ البداية والنهاية', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/leaves', 'POST', leaveForm);
      toast('تم تقديم طلب الإجازة بنجاح');
      setLeaveModalOpen(false);
      setLeaveForm({ start_date: '', end_date: '' });
      setConflictData(null);
      // Refresh data
      const newLeaves = await api('/api/leaves');
      setLeaves(newLeaves);
      refresh();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const calcDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const monthNameAr = (monthStr: string) => {
    const months: Record<string, string> = {
      '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
      '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
      '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
    };
    const [year, mon] = monthStr.split('-');
    return `${months[mon] || mon} ${year}`;
  };

  if (!user) return null;

  const canRequestLeave = user.role !== 'general_manager';

  return (
    <div className="space-y-6">
      <SectionHeader title="صفحتي" />

      {/* Profile card */}
      <Card className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-lg">
          <User size={28} />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-800">{user.name}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            <RoleBadge role={user.role} />
            <DeptBadge dept={user.department} />
            <SubDeptBadge subDept={user.sub_department} />
            <ShiftBadge shift={user.shift} />
          </div>
          <p className="text-xs text-gray-400 mt-1">رصيد الإجازات: <strong className="text-emerald-600">{user.annual_leave_balance}</strong> يوم</p>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition ${tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon} {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'leaves' && (
        <>
          {canRequestLeave && (
            <div className="flex justify-end">
              <Button onClick={() => { setLeaveModalOpen(true); setLeaveForm({ start_date: '', end_date: '' }); setConflictData(null); }}>
                <Plus size={16} /> طلب إجازة
              </Button>
            </div>
          )}
          {leaves.length === 0 ? <Card><EmptyState message="لا توجد إجازات" /></Card> : (
            <Card padding={false}>
              <div className="divide-y divide-gray-50">
                {leaves.map(l => (
                  <div key={l.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="text-sm text-gray-800">{l.start_date} → {l.end_date}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{calcDays(l.start_date, l.end_date)} يوم</p>
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'courses' && (
        courses.length === 0 ? <Card><EmptyState message="لا توجد دورات" /></Card> : (
          <Card padding={false}>
            <div className="divide-y divide-gray-50">
              {courses.map(c => (
                <div key={c.id} className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-800">{c.title}</p>
                  <p className="text-xs text-gray-400">{c.location} • {c.date}</p>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {tab === 'mandates' && (
        mandates.length === 0 ? <Card><EmptyState message="لا توجد انتدابات" /></Card> : (
          <Card padding={false}>
            <div className="divide-y divide-gray-50">
              {mandates.map(m => (
                <div key={m.id} className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-800">{m.title}</p>
                  <p className="text-xs text-gray-400">{m.location} • {m.date}</p>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {/* Leave Request Modal */}
      <Modal open={leaveModalOpen} onClose={() => setLeaveModalOpen(false)} title="طلب إجازة جديدة">
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs">
            <CalendarDays size={14} />
            <span>رصيدك المتبقي: <strong>{user.annual_leave_balance}</strong> يوم</span>
          </div>

          <Input label="تاريخ البداية" type="date" value={leaveForm.start_date} onChange={e => handleDateChange('start_date', e.target.value)} required />
          <Input label="تاريخ النهاية" type="date" value={leaveForm.end_date} onChange={e => handleDateChange('end_date', e.target.value)} required />

          {leaveForm.start_date && leaveForm.end_date && new Date(leaveForm.end_date) >= new Date(leaveForm.start_date) && (
            <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-xl">
              المدة: <strong>{calcDays(leaveForm.start_date, leaveForm.end_date)}</strong> يوم
            </div>
          )}

          {/* Loading indicator */}
          {checkingConflicts && (
            <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
              جاري فحص التعارضات...
            </div>
          )}

          {/* Conflict Results */}
          <AnimatePresence>
            {conflictData && !checkingConflicts && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {/* Monthly capacity */}
                {Object.keys(conflictData.monthCounts).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500">السعة الشهرية:</p>
                    <div className="grid gap-2">
                      {Object.entries(conflictData.monthCounts).map(([month, info]) => (
                        <div key={month} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${info.full ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                          <span className="font-medium">{monthNameAr(month)}</span>
                          <div className="flex items-center gap-2">
                            <span className={info.full ? 'text-red-600' : 'text-green-600'}>
                              {info.count}/{info.max} إجازة
                            </span>
                            {info.full ? <XCircle size={14} className="text-red-500" /> : <CheckCircle2 size={14} className="text-green-500" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full months warning */}
                {!conflictData.canSubmit && (
                  <div className="flex items-start gap-2 px-3 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">لا يمكن تقديم الطلب</p>
                      <p className="mt-1">{conflictData.message}</p>
                    </div>
                  </div>
                )}

                {/* Conflicts with colleagues */}
                {conflictData.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 flex items-center gap-1">
                      <AlertTriangle size={12} className="text-amber-500" />
                      تعارضات مع الزملاء ({conflictData.conflicts.length}):
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {conflictData.conflicts.map((c, i) => (
                        <div key={i} className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                          <p className="font-medium text-amber-800">{c.employee_name}</p>
                          <p className="text-amber-600 mt-0.5">
                            إجازته: {c.leave_start} → {c.leave_end}
                            <span className="mr-2">({c.status === 'approved' ? 'مقبولة' : 'معلقة'})</span>
                          </p>
                          <p className="text-amber-500 mt-1">
                            أيام التعارض: {c.overlap_days.length} يوم
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All clear */}
                {conflictData.canSubmit && conflictData.conflicts.length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs">
                    <CheckCircle2 size={14} />
                    <span>لا توجد تعارضات - يمكنك تقديم الطلب</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSubmitLeave} disabled={submitting || (conflictData !== null && !conflictData.canSubmit)} className="flex-1">
              {submitting ? 'جاري الإرسال...' : 'تقديم الطلب'}
            </Button>
            <Button variant="secondary" onClick={() => setLeaveModalOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
