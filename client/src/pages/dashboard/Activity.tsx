import { useState, useEffect } from 'react';
import { api } from '../../hooks/useApi';
import { Card, SectionHeader, EmptyState, Skeleton } from '../../components/UI';
import { Activity as ActivityIcon, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ActivityLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/stats/activity?limit=100').then(d => { setLogs(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader title="سجل النشاطات" subtitle="آخر 100 نشاط" />
      {loading ? <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14" />)}</div> :
       logs.length === 0 ? <Card><EmptyState message="لا يوجد نشاطات" icon={<ActivityIcon size={48} />} /></Card> : (
        <Card padding={false}>
          <div className="divide-y divide-gray-50">
            {logs.map((log, i) => (
              <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <ActivityIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    <span className="font-semibold">{log.user_name}</span>
                    <span className="text-gray-500"> {log.action}</span>
                    {log.target_name && <span className="font-medium"> "{log.target_name}"</span>}
                  </p>
                  {log.details && <p className="text-xs text-gray-400 truncate">{log.details}</p>}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                  <Clock size={12} />
                  <span>{new Date(log.created_at + 'Z').toLocaleString('ar-SA')}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
