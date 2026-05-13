import { useState, useEffect } from 'react';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import Modal, { Card, SectionHeader, Button, Input, Select, EmptyState, Skeleton } from '../../components/UI';
import { RoleBadge, ShiftBadge } from '../../components/Badge';
import { GraduationCap, Plus, Trash2, Pencil, Search, Award } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Courses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [nominees, setNominees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'nominate'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', location: '', date: '', employee_id: '' });
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api('/api/courses').then(d => { setCourses(d); setLoading(false); }).catch(() => setLoading(false));
  };
  const loadNominees = () => {
    api('/api/courses/nominations').then(setNominees).catch(() => {});
  };
  useEffect(() => { load(); loadNominees(); }, []);

  const openAdd = (empId?: number) => {
    setEditId(null);
    setForm({ title: '', location: '', date: new Date().toISOString().split('T')[0], employee_id: empId?.toString() || '' });
    setModalOpen(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ title: c.title, location: c.location, date: c.date, employee_id: c.employee_id.toString() });
    setModalOpen(true);
  };

  const save = async () => {
    try {
      if (!form.title || !form.location || !form.date || !form.employee_id) { toast('جميع الحقول مطلوبة', 'error'); return; }
      if (editId) {
        await api(`/api/courses/${editId}`, 'PUT', { ...form, employee_id: Number(form.employee_id) });
        toast('تم تعديل الدورة');
      } else {
        await api('/api/courses', 'POST', { ...form, employee_id: Number(form.employee_id) });
        toast('تم إسناد الدورة بنجاح');
      }
      setModalOpen(false); load(); loadNominees();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const del = async (id: number) => {
    if (!confirm('حذف الدورة؟')) return;
    try { await api(`/api/courses/${id}`, 'DELETE'); toast('تم الحذف'); load(); loadNominees(); } catch (e: any) { toast(e.message, 'error'); }
  };

  const filtered = courses.filter(c => !search || c.employee_name?.includes(search) || c.title?.includes(search));

  return (
    <div className="space-y-6">
      <SectionHeader title="إدارة الدورات" subtitle={`${courses.length} دورة`} actions={<Button onClick={() => openAdd()}><Plus size={16} /> إسناد دورة</Button>} />

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('list')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
          <GraduationCap size={16} className="inline ml-1" /> سجل الدورات
        </button>
        <button onClick={() => setTab('nominate')} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${tab === 'nominate' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
          <Award size={16} className="inline ml-1" /> الترشيح
        </button>
      </div>

      {tab === 'list' && (
        <>
          <Card className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </Card>
          {loading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div> :
           filtered.length === 0 ? <Card><EmptyState message="لا توجد دورات" icon={<GraduationCap size={48} />} /></Card> : (
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">الموظف</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">الدورة</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">المكان</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((c, i) => (
                      <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 font-medium text-gray-800">{c.employee_name}</td>
                        <td className="px-4 py-3 text-gray-700">{c.title}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.location}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.date}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition"><Pencil size={16} /></button>
                            <button onClick={() => del(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'nominate' && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-500">الموظفون مرتبون بالأولوية (الأقدم بدون دورة أولاً)</p>
          </div>
          <div className="divide-y divide-gray-50">
            {nominees.map((n, i) => (
              <div key={n.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">{i + 1}</span>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{n.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      <RoleBadge role={n.role} />
                      {n.shift && <ShiftBadge shift={n.shift} />}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{n.last_course_date ? `آخر دورة: ${n.last_course_date}` : 'لم يحضر دورة'}</span>
                  <Button size="sm" onClick={() => openAdd(n.id)}>إسناد دورة</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل دورة' : 'إسناد دورة جديدة'}>
        <div className="space-y-4">
          <Input label="عنوان الدورة" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input label="المكان" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          <Input label="التاريخ" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Select label="الموظف" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} options={[
            { value: '', label: 'اختر الموظف' },
            ...nominees.map(n => ({ value: n.id.toString(), label: `${n.name} (${n.role === 'supervisor' ? 'ضابط' : 'منفذ'})` }))
          ]} />
          <div className="flex gap-3 pt-2">
            <Button onClick={save} className="flex-1">{editId ? 'حفظ' : 'إسناد'}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
