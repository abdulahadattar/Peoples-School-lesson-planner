import React from 'react';
import { ShieldCheck, UserCheck } from 'lucide-react';

export interface AdminAccessBadgeProps {
  isAdmin: boolean;
  className?: string;
  adminLabel?: string;
  teacherLabel?: string;
  email?: string | null;
}

export const AdminAccessBadge: React.FC<AdminAccessBadgeProps> = ({
  isAdmin,
  className = '',
  adminLabel = 'Admin Access',
  teacherLabel = 'Teacher Mode',
  email,
}) => {
  if (isAdmin) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 select-none shadow-2xs ${className}`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>{email ? `${adminLabel}: ${email}` : adminLabel}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 select-none shadow-2xs ${className}`}
    >
      <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      <span>{email ? `Signed in as ${email}` : teacherLabel}</span>
    </span>
  );
};

export const AdminStatusBadge = AdminAccessBadge;
export type AdminStatusBadgeProps = AdminAccessBadgeProps;

