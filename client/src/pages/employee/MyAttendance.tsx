import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import { Card, SectionHeader, Button } from '../../components/UI';
import { StatusBadge } from '../../components/Badge';
import SignaturePad from '../../components/SignaturePad';
import type { SignaturePadRef } from '../../components/SignaturePad';
import { ClipboardCheck, LogIn, LogOut, Clock, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MyAttendance() {
  const { user } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const sigRef = useRef<SignaturePadRef>(null);
  const { toast } = useToast();

  // Supervisor state
  const [session, setSession] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);

  const isSupervisor = user?.role === 'supervisor';

  const loadStatus = () => {
    api('/api/attendance/my-status').then(d => { setStatus(d); setLoading(false); }).catch(() => setLoading(false));
  };

  const loadSession = () => {
    if (!isSupervisor) return;
    api('/api/attendance/sessions/current').then(d => {
      setSession(d.session);
      setRecords(d.records || []);
    }).catch(() => {});
  };

  useEffect(() => { loadStatus(); if (isSupervisor) loadSession(); }, []);

  const checkIn = async () => {
    const sig = sigRef.current?.getData();
    if (!sig) { toast('التوقيع مطلوب', 'error'); return; }
    setSubmitting(true);
    try {
      await api('/api/attendance/check-in', 'POST', { signature: sig });
      toast('تم تسجيل حضورك بنجاح ✓');
      loadStatus(); if (isSupervisor) loadSession();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const checkOut = async () => {
    const sig = sigRef.current?.getData();
    if (!sig) { toast('التوقيع مطلوب', 'error'); return; }
    setSubmitting(true);
    try {
      await api('/api/attendance/check-out', 'POST', { signature: sig });
      toast('تم تسجيل انصرافك بنجاح ✓');
      loadStatus(); if (isSupervisor) loadSession();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSubmitting(false); }
  };

  // Supervisor: open session
  const openSession = async () => {
    try {
      await api('/api/attendance/sessions', 'POST', {});
      toast('تم فتح جلسة التحضير');
      loadSession();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const closeSession = async () => {
    if (!session) return;
    try { await api(`/api/attendance/sessions/${session.id}/close`, 'PUT'); toast('تم إغلاق الجلسة'); loadSession(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  const approveSession = async () => {
    if (!session) return;
    const sig = sigRef.current?.getData();
    if (!sig) { toast('التوقيع مطلوب لاعتماد الكشف', 'error'); return; }
    try {
      await api(`/api/attendance/sessions/${session.id}/approve`, 'PUT', { supervisor_signature: sig });
      toast('تم اعتماد الكشف وإرساله للإدارة ✓');
      loadSession();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const updateRecord = async (recordId: number, newStatus: string) => {
    try { await api(`/api/attendance/records/${recordId}`, 'PUT', { status: newStatus }); loadSession(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  const hasCheckedIn = status?.record?.check_in_time;
  const hasCheckedOut = status?.record?.check_out_time;

  return (
    <div className="space-y-6">
      <SectionHeader title="تسجيل الحضور" subtitle={`مناوبة ${user?.shift || '-'} • ${new Date().toLocaleDateString('ar-SA')}`} />

      {/* Employee attendance status */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-lg">
              <ClipboardCheck size={26} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">حالة الحضور اليوم</h3>
              <p className="text-sm text-gray-500">
                {!status?.has_session ? 'لا توجد جلسة تحضير مفتوحة' :
                 hasCheckedOut ? 'تم تسجيل الحضور والانصراف ✓' :
                 hasCheckedIn ? 'تم تسجيل الحضور - بانتظار الانصراف' :
                 'بانتظار تسجيل الحضور'}
              </p>
            </div>
          </div>

          {status?.has_session && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className={`flex-1 px-4 py-3 rounded-xl text-center text-sm font-medium ${hasCheckedIn ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                  <LogIn size={18} className="mx-auto mb-1" />
                  {hasCheckedIn ? `حضور: ${new Date(status.record.check_in_time + 'Z').toLocaleTimeString('ar-SA')}` : 'لم يسجل الحضور'}
                </div>
                <div className={`flex-1 px-4 py-3 rounded-xl text-center text-sm font-medium ${hasCheckedOut ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                  <LogOut size={18} className="mx-auto mb-1" />
                  {hasCheckedOut ? `انصراف: ${new Date(status.record.check_out_time + 'Z').toLocaleTimeString('ar-SA')}` : 'لم يسجل الانصراف'}
                </div>
              </div>

              {!hasCheckedOut && (
                <>
                  <SignaturePad ref={sigRef} />
                  <div className="flex gap-3">
                    {!hasCheckedIn && (
                      <Button onClick={checkIn} loading={submitting} className="flex-1">
                        <LogIn size={16} /> تسجيل الحضور
                      </Button>
                    )}
                    {hasCheckedIn && !hasCheckedOut && (
                      <Button onClick={checkOut} loading={submitting} className="flex-1" variant="secondary">
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

      {/* Supervisor: Session management */}
      {isSupervisor && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <h3 className="text-lg font-bold text-gray-800 mb-4">إدارة جلسة التحضير</h3>

            {!session ? (
              <div className="text-center py-8">
                <ClipboardCheck size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm mb-4">لا توجد جلسة تحضير مفتوحة لليوم</p>
                <Button onClick={openSession}>فتح جلسة تحضير</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <span className="text-sm text-gray-600">حالة الجلسة</span>
                  <StatusBadge status={session.status} />
                </div>

                {/* Records table */}
                {records.length > 0 && (
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-4 py-2 text-right font-medium text-gray-500">#</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500">الموظف</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500">الحالة</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500">الحضور</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500">الانصراف</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {records.map((r: any, i: number) => (
                          <tr key={r.id}>
                            <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-4 py-2 font-medium text-gray-800">{r.employee_name}</td>
                            <td className="px-4 py-2">
                              {session.status !== 'approved' ? (
                                <select value={r.status} onChange={e => updateRecord(r.id, e.target.value)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg">
                                  <option value="absent">غائب</option><option value="present">حاضر</option>
                                  <option value="late">متأخر</option><option value="excused">معذور</option>
                                </select>
                              ) : <StatusBadge status={r.status} />}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">{r.check_in_time ? '✓' : '-'}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{r.check_out_time ? '✓' : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {session.status !== 'approved' && (
                  <div className="flex gap-3">
                    {session.status === 'open' && <Button variant="secondary" onClick={closeSession}>إغلاق الجلسة</Button>}
                    <Button onClick={approveSession} className="flex-1">
                      <CheckCircle size={16} /> اعتماد ورفع الكشف
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
