import { useState } from 'react';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import { Card, SectionHeader, Button, Input } from '../../components/UI';
import { KeyRound, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Password() {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!current || !newPass || !confirm) { toast('جميع الحقول مطلوبة', 'error'); return; }
    if (newPass !== confirm) { toast('كلمة المرور الجديدة غير متطابقة', 'error'); return; }
    if (newPass.length < 6) { toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); return; }

    setSaving(true);
    try {
      await api('/api/auth/change-password', 'PUT', { current_password: current, new_password: newPass });
      toast('تم تغيير كلمة المرور بنجاح ✓');
      setCurrent(''); setNewPass(''); setConfirm('');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="تغيير كلمة المرور" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="max-w-lg">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-lg">
              <KeyRound size={26} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">تغيير كلمة المرور</h3>
              <p className="text-sm text-gray-500">أدخل كلمة المرور الحالية والجديدة</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input label="كلمة المرور الحالية" type="password" value={current} onChange={e => setCurrent(e.target.value)} />
            <Input label="كلمة المرور الجديدة" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} />
            <Input label="تأكيد كلمة المرور الجديدة" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            <Button onClick={save} loading={saving} className="w-full">
              <Save size={16} /> تغيير كلمة المرور
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
