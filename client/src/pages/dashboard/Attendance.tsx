import { useState, useEffect } from 'react';
import { api } from '../../hooks/useApi';
import Modal, { Card, SectionHeader, EmptyState, Skeleton } from '../../components/UI';
import { StatusBadge } from '../../components/Badge';
import { ClipboardCheck, Eye, Calendar, Search } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Attendance() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [detailRecords, setDetailRecords] = useState<any[]>([]);
  const [shiftFilter, setShiftFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = () => {
    setLoading(true);
    let url = '/api/attendance/approved?';
    if (shiftFilter) url += `shift=${shiftFilter}&`;
    if (dateFrom) url += `date_from=${dateFrom}&`;
    if (dateTo) url += `date_to=${dateTo}&`;
    api(url).then(d => { setSessions(d); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, [shiftFilter, dateFrom, dateTo]);

  const viewDetail = async (id: number) => {
    try {
      const data = await api(`/api/attendance/approved/${id}`);
      setDetail(data.session);
      setDetailRecords(data.records);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="سجلات الحضور المعتمدة" subtitle={`${sessions.length} كشف`} />

      <Card className="flex flex-wrap gap-3">
        <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none">
          <option value="">كل المناوبات</option>
          <option value="أ">مناوبة أ</option><option value="ب">مناوبة ب</option>
          <option value="ج">مناوبة ج</option><option value="د">مناوبة د</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">من</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
          <span className="text-xs text-gray-500">إلى</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
        </div>
      </Card>

      {loading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div> :
       sessions.length === 0 ? <Card><EmptyState message="لا توجد كشوفات معتمدة" icon={<ClipboardCheck size={48} />} /></Card> : (
        <div className="grid gap-4">
          {sessions.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="hover:shadow-md transition cursor-pointer" onClick={() => viewDetail(s.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <ClipboardCheck size={22} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">مناوبة {s.shift} - {s.date}</p>
                      <p className="text-xs text-gray-500">المشرف: {s.supervisor_name} • {s.shift_start_time || '-'} → {s.shift_end_time || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3 text-xs">
                      <span className="px-2 py-1 rounded-lg bg-green-50 text-green-700 font-bold">حاضر {s.present_count}</span>
                      <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700 font-bold">غائب {s.absent_count}</span>
                      {s.late_count > 0 && <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold">متأخر {s.late_count}</span>}
                    </div>
                    <Eye size={18} className="text-gray-400" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `كشف مناوبة ${detail.shift} - ${detail.date}` : ''} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-xl bg-gray-50"><span className="text-gray-500">المشرف:</span> <strong>{detail.supervisor_name}</strong></div>
              <div className="p-3 rounded-xl bg-gray-50"><span className="text-gray-500">الفترة:</span> <strong>{detail.shift_start_time || '-'} → {detail.shift_end_time || '-'}</strong></div>
              {detail.notes && <div className="col-span-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-xs">{detail.notes}</div>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>
                <th className="px-4 py-2 text-right font-medium text-gray-500">#</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">الموظف</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">الحالة</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">الحضور</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">الانصراف</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">ملاحظة</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {detailRecords.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.employee_name}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {r.check_in_time ? new Date(r.check_in_time + 'Z').toLocaleTimeString('ar-SA') : '-'}
                      {r.check_in_signature && <span className="text-emerald-500 mr-1">✓</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {r.check_out_time ? new Date(r.check_out_time + 'Z').toLocaleTimeString('ar-SA') : '-'}
                      {r.check_out_signature && <span className="text-emerald-500 mr-1">✓</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{r.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
