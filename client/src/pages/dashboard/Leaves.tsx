import { useState, useEffect, useMemo } from 'react';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import { Card, SectionHeader, EmptyState, Skeleton, Button } from '../../components/UI';
import { DeptBadge, ShiftBadge, StatusBadge, SubDeptBadge } from '../../components/Badge';
import { CalendarDays, Check, X, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Leaves() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'month'>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const { toast } = useToast();

  const load = () => { api('/api/leaves').then(d => { setLeaves(d); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(load, []);

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

  const filtered = useMemo(() => {
    let result = leaves;

    // Month filter
    if (viewMode === 'month') {
      const [year, mon] = selectedMonth.split('-');
      const monthStart = new Date(`${year}-${mon}-01`);
      const monthEnd = new Date(parseInt(year), parseInt(mon), 0);
      result = result.filter(l => {
        const leaveStart = new Date(l.start_date);
        const leaveEnd = new Date(l.end_date);
        return leaveStart <= monthEnd && leaveEnd >= monthStart;
      });
    }

    if (deptFilter) result = result.filter(l => l.employee_department === deptFilter);
    if (statusFilter) result = result.filter(l => l.status === statusFilter);

    return result;
  }, [leaves, viewMode, selectedMonth, deptFilter, statusFilter]);

  // Month stats
  const monthStats = useMemo(() => {
    if (viewMode !== 'month') return null;
    const approved = filtered.filter(l => l.status === 'approved').length;
    const pending = filtered.filter(l => l.status === 'pending').length;
    return { approved, pending, total: filtered.length };
  }, [filtered, viewMode]);

  const calcDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const approve = async (id: number) => { try { await api(`/api/leaves/${id}/approve`, 'PUT'); toast('تمت الموافقة'); load(); } catch (e: any) { toast(e.message, 'error'); } };
  const reject = async (id: number) => { try { await api(`/api/leaves/${id}/reject`, 'PUT'); toast('تم الرفض'); load(); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async (id: number) => { if (!confirm('حذف؟')) return; try { await api(`/api/leaves/${id}`, 'DELETE'); toast('تم الحذف'); load(); } catch (e: any) { toast(e.message, 'error'); } };

  return (
    <div className="space-y-6">
      <SectionHeader title="إدارة الإجازات" subtitle={`${leaves.length} طلب`} />

      {/* View mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setViewMode('all')} className={`px-4 py-2 rounded-xl text-xs font-medium transition ${viewMode === 'all' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          عرض الكل
        </button>
        <button onClick={() => setViewMode('month')} className={`px-4 py-2 rounded-xl text-xs font-medium transition ${viewMode === 'month' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          حسب الشهر
        </button>
      </div>

      {/* Month navigation */}
      {viewMode === 'month' && (
        <Card className="flex items-center justify-between">
          <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <ChevronRight size={20} />
          </button>
          <div className="text-center">
            <h3 className="text-lg font-bold text-gray-800">{monthNameAr(selectedMonth)}</h3>
            {monthStats && (
              <p className="text-xs text-gray-400 mt-0.5">
                {monthStats.total} طلب • {monthStats.approved} مقبول • {monthStats.pending} معلق
              </p>
            )}
          </div>
          <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <ChevronLeft size={20} />
          </button>
        </Card>
      )}

      {/* Filters */}
      <Card className="flex flex-wrap gap-3">
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none">
          <option value="">كل الإدارات</option>
          <option value="shifts">المناوبات</option><option value="hr">الموارد البشرية</option>
          <option value="operations">العمليات</option><option value="workforce">القوى العاملة</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none">
          <option value="">كل الحالات</option>
          <option value="pending">معلقة</option><option value="approved">مقبولة</option><option value="rejected">مرفوضة</option>
        </select>
      </Card>

      {loading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div> :
       filtered.length === 0 ? <Card><EmptyState message="لا يوجد إجازات" icon={<CalendarDays size={48} />} /></Card> : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الموظف</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الإدارة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">القسم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">المناوبة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">من</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">إلى</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">المدة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الحالة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((l, i) => (
                  <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 font-medium text-gray-800">{l.employee_name}</td>
                    <td className="px-4 py-3"><DeptBadge dept={l.employee_department} /></td>
                    <td className="px-4 py-3"><SubDeptBadge subDept={l.employee_sub_department} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{l.employee_shift ? `مناوبة ${l.employee_shift}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{l.start_date}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{l.end_date}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-medium">{calcDays(l.start_date, l.end_date)} يوم</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {l.status === 'pending' && <>
                          <button onClick={() => approve(l.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition"><Check size={16} /></button>
                          <button onClick={() => reject(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition"><X size={16} /></button>
                        </>}
                        <button onClick={() => del(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
