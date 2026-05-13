import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import { Card, SectionHeader, Button } from '../../components/UI';
import { StatusBadge } from '../../components/Badge';
import SignaturePad from '../../components/SignaturePad';
import type { SignaturePadRef } from '../../components/SignaturePad';
import { Shield, Sun, Sunset, Moon, LogIn, LogOut, CheckCircle, Plus, Lock, Unlock } from 'lucide-react';
import { motion } from 'framer-motion';

const GROUP_LABELS: Record<string, string> = { morning: 'الصباح', afternoon: 'العصر', night: 'الليل' };
const GROUP_ICONS: Record<string, any> = { morning: <Sun size={20} />, afternoon: <Sunset size={20} />, night: <Moon size={20} /> };
const GROUP_COLORS: Record<string, string> = { morning: 'from-amber-400 to-orange-500', afternoon: 'from-blue-400 to-indigo-500', night: 'from-indigo-500 to-purple-600' };

export default function EmpSupportAttendance() {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor';
  const isSupport = !!user?.support_group;
  const { toast } = useToast();
  const sigRef = useRef<SignaturePadRef>(null);

  // Supervisor state
  const [report, setReport] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [groupRecords, setGroupRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Operator state
  const [myStatus, setMyStatus] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load
  useEffect(() => {
    if (isSupervisor) loadReport();
    if (isSupport) loadMyStatus();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await api('/api/support-attendance/today');
      setReport(data.report);
      setSessions(data.sessions || []);
    } catch {} finally { setLoading(false); }
  };

  const loadMyStatus = async () => {
    try {
      const data = await api('/api/support-attendance/my-status');
      setMyStatus(data);
    } catch {} finally { setLoading(false); }
  };

  // Supervisor actions
  const createReport = async () => {
    try { await api('/api/support-attendance/reports', 'POST'); toast('تم إنشاء كشف اليوم'); loadReport(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  const toggleCheckin = async (sessionId: number, currentStatus: string) => {
    const action = currentStatus === 'pending' ? 'open' : 'completed';
    try {
      await api(`/api/support-attendance/sessions/${sessionId}/checkin`, 'PUT', { status: action });
      toast(action === 'open' ? 'تم فتح التحضير' : 'تم إغلاق التحضير');
      loadReport();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const toggleCheckout = async (sessionId: number, currentStatus: string) => {
    const action = currentStatus === 'pending' ? 'open' : 'completed';
    try {
      await api(`/api/support-attendance/sessions/${sessionId}/checkout`, 'PUT', { status: action });
      toast(action === 'open' ? 'تم فتح الانصراف' : 'تم إغلاق الانصراف');
      loadReport();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const loadGroupRecords = async (sessionId: number, group: string) => {
    try {
      const data = await api(`/api/support-attendance/sessions/${sessionId}/records`);
      setGroupRecords(data);
      setActiveGroup(group);
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const updateRecordStatus = async (recordId: number, newStatus: string) => {
    try {
      await api(`/api/support-attendance/records/${recordId}`, 'PUT', { status: newStatus });
      // Reload records for active group
      const activeSession = sessions.find(s => s.group_type === activeGroup);
      if (activeSession) loadGroupRecords(activeSession.id, activeGroup!);
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const submitReport = async () => {
    if (!report) return;
    try { await api(`/api/support-attendance/reports/${report.id}/submit`, 'PUT'); toast('تم رفع الكشف للإدارة ✓'); loadReport(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  // Operator actions
  const supportCheckIn = async () => {
    const sig = sigRef.current?.getData();
    if (!sig) { toast('التوقيع مطلوب', 'error'); return; }
    setSubmitting(true);
    try { await api('/api/support-attendance/check-in', 'POST', { signature: sig }); toast('تم تسجيل حضورك ✓'); loadMyStatus(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  const supportCheckOut = async () => {
    const sig = sigRef.current?.getData();
    if (!sig) { toast('التوقيع مطلوب', 'error'); return; }
    setSubmitting(true);
    try { await api('/api/support-attendance/check-out', 'POST', { signature: sig }); toast('تم تسجيل انصرافك ✓'); loadMyStatus(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  // Render
  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-24" />)}</div>;

  // ===== SUPERVISOR VIEW =====
  if (isSupervisor) {
    return (
      <div className="space-y-6">
        <SectionHeader title="كشف المساندة اليومي" subtitle={new Date().toLocaleDateString('ar-SA')} />

        {!report ? (
          <Card className="text-center py-12">
            <Shield size={56} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">لم يتم إنشاء كشف المساندة لليوم</p>
            <Button onClick={createReport}><Plus size={16} /> إنشاء كشف اليوم</Button>
          </Card>
        ) : (
          <>
            {/* Status bar */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <span className="text-sm font-medium text-gray-600">حالة الكشف</span>
              <StatusBadge status={report.status} />
            </div>

            {/* Groups */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sessions.map(session => (
                <motion.div key={session.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={`border-2 transition ${activeGroup === session.group_type ? 'border-emerald-400 shadow-md' : 'border-gray-100 hover:border-gray-200'}`}>
                    <div className="flex items-center gap-3 mb-4 cursor-pointer" onClick={() => loadGroupRecords(session.id, session.group_type)}>
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${GROUP_COLORS[session.group_type]} flex items-center justify-center text-white`}>
                        {GROUP_ICONS[session.group_type]}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">مجموعة {GROUP_LABELS[session.group_type]}</p>
                        <p className="text-xs text-gray-400">{session.shift_start_time} → {session.shift_end_time}</p>
                      </div>
                    </div>

                    {/* Checkin / Checkout buttons */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        onClick={() => toggleCheckin(session.id, session.checkin_status)}
                        disabled={report.status !== 'active'}
                        className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition
                          ${session.checkin_status === 'completed' ? 'bg-green-100 text-green-700' :
                            session.checkin_status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
                      >
                        {session.checkin_status === 'completed' ? <CheckCircle size={14} /> :
                         session.checkin_status === 'open' ? <Unlock size={14} /> : <Lock size={14} />}
                        حضور
                      </button>
                      <button
                        onClick={() => toggleCheckout(session.id, session.checkout_status)}
                        disabled={report.status !== 'active'}
                        className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-medium transition
                          ${session.checkout_status === 'completed' ? 'bg-green-100 text-green-700' :
                            session.checkout_status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
                      >
                        {session.checkout_status === 'completed' ? <CheckCircle size={14} /> :
                         session.checkout_status === 'open' ? <Unlock size={14} /> : <Lock size={14} />}
                        انصراف
                      </button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Records for active group */}
            {activeGroup && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    {GROUP_ICONS[activeGroup]} مجموعة {GROUP_LABELS[activeGroup]}
                  </h3>
                  {groupRecords.length === 0 ? (
                    <p className="text-center text-gray-400 py-6 text-sm">لا يوجد منفذين في هذه المجموعة</p>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50"><tr>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">#</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">الموظف</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">الحالة</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">الحضور</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">الانصراف</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">ملاحظة</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {groupRecords.map((r: any, i: number) => (
                            <tr key={r.id}>
                              <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-4 py-2 font-medium text-gray-800">{r.employee_name}</td>
                              <td className="px-4 py-2">
                                {report.status === 'active' ? (
                                  <select value={r.status} onChange={e => updateRecordStatus(r.id, e.target.value)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg">
                                    <option value="absent">غائب</option><option value="present">حاضر</option>
                                    <option value="late">متأخر</option><option value="excused">معذور</option>
                                  </select>
                                ) : <StatusBadge status={r.status} />}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{r.check_in_time ? '✓' : '-'}</td>
                              <td className="px-4 py-2 text-xs text-gray-500">{r.check_out_time ? '✓' : '-'}</td>
                              <td className="px-4 py-2 text-xs text-gray-400">{r.note || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}

            {/* Submit */}
            {report.status === 'active' && (
              <Button onClick={submitReport} className="w-full" size="lg">
                <CheckCircle size={18} /> رفع الكشف اليومي لإدارة المناوبات
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  // ===== OPERATOR (SUPPORT) VIEW =====
  if (isSupport) {
    const hasCheckedIn = myStatus?.record?.check_in_time;
    const hasCheckedOut = myStatus?.record?.check_out_time;

    return (
      <div className="space-y-6">
        <SectionHeader title="كشف المساندة" subtitle={`مجموعة ${GROUP_LABELS[user?.support_group || '']} • ${new Date().toLocaleDateString('ar-SA')}`} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${GROUP_COLORS[user?.support_group || 'morning']} flex items-center justify-center text-white shadow-lg`}>
                {GROUP_ICONS[user?.support_group || 'morning']}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">حالة الحضور</h3>
                <p className="text-sm text-gray-500">
                  {!myStatus?.has_session ? 'لم يتم فتح التحضير بعد' :
                   hasCheckedOut ? 'تم تسجيل الحضور والانصراف ✓' :
                   hasCheckedIn ? 'تم الحضور - بانتظار الانصراف' : 'بانتظار تسجيل الحضور'}
                </p>
              </div>
            </div>

            {myStatus?.has_session && (
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className={`flex-1 px-4 py-3 rounded-xl text-center text-sm font-medium ${hasCheckedIn ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                    <LogIn size={18} className="mx-auto mb-1" />
                    {hasCheckedIn ? `حضور ✓` : 'لم يسجل'}
                  </div>
                  <div className={`flex-1 px-4 py-3 rounded-xl text-center text-sm font-medium ${hasCheckedOut ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                    <LogOut size={18} className="mx-auto mb-1" />
                    {hasCheckedOut ? `انصراف ✓` : 'لم يسجل'}
                  </div>
                </div>

                {!hasCheckedOut && (
                  <>
                    <SignaturePad ref={sigRef} />
                    <div className="flex gap-3">
                      {!hasCheckedIn && myStatus?.can_checkin && (
                        <Button onClick={supportCheckIn} loading={submitting} className="flex-1">
                          <LogIn size={16} /> تسجيل الحضور
                        </Button>
                      )}
                      {hasCheckedIn && !hasCheckedOut && myStatus?.can_checkout && (
                        <Button onClick={supportCheckOut} loading={submitting} className="flex-1" variant="secondary">
                          <LogOut size={16} /> تسجيل الانصراف
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  return <Card><p className="text-center text-gray-400 py-8">ليس لديك صلاحية الوصول لهذه الصفحة</p></Card>;
}
