import { ReactNode } from 'react';

const variants = {
  primary: 'bg-emerald-100 text-emerald-700',
  secondary: 'bg-gray-100 text-gray-600',
  success: 'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  teal: 'bg-teal-100 text-teal-700',
};

interface BadgeProps {
  variant?: keyof typeof variants;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export default function Badge({ variant = 'secondary', children, className = '', dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold ${variants[variant]} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

// Pre-built badges
export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; variant: keyof typeof variants }> = {
    general_manager: { label: 'المدير العام', variant: 'purple' },
    dept_manager: { label: 'مدير إدارة', variant: 'info' },
    supervisor: { label: 'ضابط', variant: 'primary' },
    operator: { label: 'منفذ', variant: 'teal' },
  };
  const cfg = map[role] || { label: role, variant: 'secondary' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function DeptBadge({ dept }: { dept: string | null }) {
  const map: Record<string, string> = {
    shifts: 'المناوبات',
    hr: 'الموارد البشرية',
    operations: 'العمليات',
    workforce: 'القوى العاملة',
  };
  if (!dept) return <Badge variant="secondary">الإدارة العامة</Badge>;
  return <Badge variant="secondary">{map[dept] || dept}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: keyof typeof variants }> = {
    pending: { label: 'قيد المراجعة', variant: 'warning' },
    approved: { label: 'مقبول', variant: 'success' },
    rejected: { label: 'مرفوض', variant: 'danger' },
    present: { label: 'حاضر', variant: 'success' },
    absent: { label: 'غائب', variant: 'danger' },
    late: { label: 'متأخر', variant: 'warning' },
    excused: { label: 'معذور', variant: 'info' },
    active: { label: 'نشط', variant: 'success' },
    completed: { label: 'مرفوع', variant: 'info' },
    open: { label: 'مفتوح', variant: 'success' },
    closed: { label: 'مغلق', variant: 'secondary' },
  };
  const cfg = map[status] || { label: status, variant: 'secondary' as const };
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
}

export function ShiftBadge({ shift }: { shift: string | null }) {
  if (!shift) return null;
  return <Badge variant="warning">مناوبة {shift}</Badge>;
}

export function SubDeptBadge({ subDept }: { subDept: string | null }) {
  const map: Record<string, string> = {
    shifts_rotation: 'المناوبات',
    shifts_support: 'المساندة',
    shifts_executive: 'التنفيذي',
    shifts_base: 'القاعدة',
    ops_staff: 'موظفي العمليات',
    ops_cameras: 'الكاميرات',
  };
  if (!subDept) return null;
  return <Badge variant="teal">{map[subDept] || subDept}</Badge>;
}
