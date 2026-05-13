import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import Modal, { Card, SectionHeader, Button, Input, Select, EmptyState, Skeleton } from '../../components/UI';
import { RoleBadge, DeptBadge, ShiftBadge, SubDeptBadge } from '../../components/Badge';
import { UserPlus, Search, Eye, Pencil, Trash2, Users } from 'lucide-react';

interface Employee {
  id: number; name: string; username: string; role: string;
  department: string | null; sub_department: string | null; shift: string | null; join_date: string;
  annual_leave_balance: number;
}

const subDeptOptions: Record<string, { value: string; label: string }[]> = {
  shifts: [
    { value: '', label: 'اختر القسم الفرعي' },
    { value: 'shifts_rotation', label: 'المناوبات' },
    { value: 'shifts_support', label: 'المساندة' },
    { value: 'shifts_executive', label: 'التنفيذي' },
    { value: 'shifts_base', label: 'القاعدة' },
  ],
  operations: [
    { value: '', label: 'اختر القسم الفرعي' },
    { value: 'ops_staff', label: 'موظفي العمليات' },
    { value: 'ops_cameras', label: 'الكاميرات' },
  ],
};

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [subDeptFilter, setSubDeptFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'operator', department: 'shifts', sub_department: '', shift: '', join_date: '' });
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api<Employee[]>('/api/employees').then(d => { setEmployees(d); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = employees.filter(e => {
    if (deptFilter && e.department !== deptFilter) return false;
    if (subDeptFilter && e.sub_department !== subDeptFilter) return false;
    if (search && !e.name.includes(search) && !e.username.includes(search)) return false;
    return true;
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ name: '', username: '', password: '', role: 'operator', department: 'shifts', sub_department: '', shift: '', join_date: new Date().toISOString().split('T')[0] });
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditId(emp.id);
    setForm({ name: emp.name, username: emp.username, password: '', role: emp.role, department: emp.department || 'shifts', sub_department: emp.sub_department || '', shift: emp.shift || '', join_date: emp.join_date });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload: any = { ...form, shift: form.shift || null, sub_department: form.sub_department || null };
      if (!payload.password && !editId) { toast('كلمة المرور مطلوبة', 'error'); return; }
      if (!payload.password) delete payload.password;

      if (editId) {
        await api(`/api/employees/${editId}`, 'PUT', payload);
        toast('تم تعديل الموظف بنجاح');
      } else {
        await api('/api/employees', 'POST', payload);
        toast('تم إضافة الموظف بنجاح');
      }
      setModalOpen(false);
      load();
    } catch (err: any) { toast(err.message, 'error'); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟`)) return;
    try { await api(`/api/employees/${id}`, 'DELETE'); toast('تم حذف الموظف'); load(); }
    catch (err: any) { toast(err.message, 'error'); }
  };

  const shiftLabel = (s: string | null) => s ? `مناوبة ${s}` : '-';
  const hasSubDepts = form.department === 'shifts' || form.department === 'operations';
  const currentSubDeptOptions = subDeptOptions[form.department] || [];

  // Get available sub-dept options for the filter
  const filterSubDeptOptions = deptFilter ? (subDeptOptions[deptFilter] || []).filter(o => o.value !== '') : [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="إدارة الموظفين"
        subtitle={`${employees.length} موظف`}
        actions={<Button onClick={openAdd}><UserPlus size={16} /> إضافة موظف</Button>}
      />

      {/* Filters */}
      <Card className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو المستخدم..." className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setSubDeptFilter(''); }} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="">كل الإدارات</option>
          <option value="shifts">المناوبات</option>
          <option value="hr">الموارد البشرية</option>
          <option value="operations">العمليات</option>
          <option value="workforce">القوى العاملة</option>
        </select>
        {filterSubDeptOptions.length > 0 && (
          <select value={subDeptFilter} onChange={e => setSubDeptFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">كل الأقسام</option>
            {filterSubDeptOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </Card>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState message="لا يوجد موظفين" icon={<Users size={48} />} /></Card>
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">#</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الاسم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">المستخدم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الدور</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الإدارة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">القسم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">المناوبة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">التعيين</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((emp, i) => (
                  <motion.tr key={emp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs" dir="ltr">{emp.username}</td>
                    <td className="px-4 py-3"><RoleBadge role={emp.role} /></td>
                    <td className="px-4 py-3"><DeptBadge dept={emp.department} /></td>
                    <td className="px-4 py-3"><SubDeptBadge subDept={emp.sub_department} /></td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{shiftLabel(emp.shift)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{emp.join_date}</td>
                    <td className="px-4 py-3">
                      {emp.role !== 'general_manager' && (
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(emp)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition"><Pencil size={16} /></button>
                          <button onClick={() => handleDelete(emp.id, emp.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل موظف' : 'إضافة موظف جديد'}>
        <div className="space-y-4">
          <Input label="الاسم الكامل" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input label="اسم المستخدم" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required dir="ltr" />
          <Input label={editId ? 'كلمة المرور (اتركها فارغة لعدم التغيير)' : 'كلمة المرور'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editId} />
          <Select label="الدور" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} options={[
            { value: 'operator', label: 'منفذ' },
            { value: 'supervisor', label: 'ضابط (مشرف)' },
            { value: 'dept_manager', label: 'مدير إدارة' },
          ]} />
          <Select label="الإدارة" value={form.department} onChange={e => setForm({ ...form, department: e.target.value, sub_department: '', shift: '' })} options={[
            { value: 'shifts', label: 'إدارة المناوبات' },
            { value: 'hr', label: 'الموارد البشرية' },
            { value: 'operations', label: 'العمليات' },
            { value: 'workforce', label: 'القوى العاملة' },
          ]} />
          {hasSubDepts && form.role !== 'dept_manager' && (
            <Select label="القسم الفرعي" value={form.sub_department} onChange={e => setForm({ ...form, sub_department: e.target.value })} options={currentSubDeptOptions} />
          )}
          {form.department === 'shifts' && form.role !== 'dept_manager' && (form.sub_department === 'shifts_rotation' || form.sub_department === '') && (
            <Select label="المناوبة" value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })} options={[
              { value: '', label: 'اختر المناوبة' },
              { value: 'أ', label: 'مناوبة أ' },
              { value: 'ب', label: 'مناوبة ب' },
              { value: 'ج', label: 'مناوبة ج' },
              { value: 'د', label: 'مناوبة د' },
            ]} />
          )}
          <Input label="تاريخ التعيين" type="date" value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })} required />
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} className="flex-1">{editId ? 'حفظ التعديلات' : 'إضافة'}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
