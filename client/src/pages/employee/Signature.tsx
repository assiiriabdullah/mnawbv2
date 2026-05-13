import { useState, useRef, useEffect } from 'react';
import { api } from '../../hooks/useApi';
import { useToast } from '../../components/Toast';
import { Card, SectionHeader, Button } from '../../components/UI';
import SignaturePad from '../../components/SignaturePad';
import type { SignaturePadRef } from '../../components/SignaturePad';
import { FileSignature, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Signature() {
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const sigRef = useRef<SignaturePadRef>(null);
  const { toast } = useToast();

  useEffect(() => {
    api('/api/attendance/signature').then(d => { setSavedSig(d.signature_data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    const data = sigRef.current?.getData();
    if (!data) { toast('ارسم توقيعك أولاً', 'error'); return; }
    setSaving(true);
    try {
      await api('/api/attendance/signature', 'POST', { signature_data: data });
      toast('تم حفظ التوقيع بنجاح ✓');
      setSavedSig(data);
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="التوقيع الإلكتروني" subtitle="ارسم توقيعك وسيتم حفظه للاستخدام التلقائي" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
              <FileSignature size={26} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">توقيعك الإلكتروني</h3>
              <p className="text-sm text-gray-500">{savedSig ? 'لديك توقيع محفوظ - يمكنك تحديثه' : 'لم يتم حفظ توقيع بعد'}</p>
            </div>
          </div>

          {savedSig && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 mb-2">التوقيع الحالي:</p>
              <img src={savedSig} alt="التوقيع" className="max-h-24 mx-auto border border-gray-200 rounded-lg bg-white p-2" />
            </div>
          )}

          <p className="text-sm text-gray-600 mb-3">ارسم توقيعك الجديد:</p>
          <SignaturePad ref={sigRef} initialData={null} />

          <div className="flex gap-3 mt-4">
            <Button onClick={save} loading={saving} className="flex-1">
              <Save size={16} /> حفظ التوقيع
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
