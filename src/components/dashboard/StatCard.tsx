import React, { ReactNode } from 'react';

interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'emerald' | 'orange' | 'blue' | 'amber' | 'rose' | 'slate';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon,
  variant = 'slate',
  onClick,
}) => {
  const variantStyles = {
    emerald: {
      card: 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-900/90 to-slate-900/90 hover:border-emerald-400/50 shadow-emerald-950/20',
      badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      valueColor: 'text-emerald-300',
    },
    orange: {
      card: 'border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-slate-900/90 to-slate-900/90 hover:border-orange-400/50 shadow-orange-950/20',
      badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      valueColor: 'text-orange-300',
    },
    blue: {
      card: 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-slate-900/90 to-slate-900/90 hover:border-blue-400/50 shadow-blue-950/20',
      badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      valueColor: 'text-blue-300',
    },
    amber: {
      card: 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900/90 to-slate-900/90 hover:border-amber-400/50 shadow-amber-950/20',
      badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      valueColor: 'text-amber-300',
    },
    rose: {
      card: 'border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-slate-900/90 to-slate-900/90 hover:border-rose-400/50 shadow-rose-950/20',
      badge: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
      valueColor: 'text-rose-300',
    },
    slate: {
      card: 'border-white/10 bg-slate-900/80 hover:border-white/20 shadow-slate-950/30',
      badge: 'bg-slate-800/80 text-slate-300 border border-slate-700/60',
      valueColor: 'text-white',
    },
  };

  const style = variantStyles[variant] || variantStyles.slate;

  return (
    <div
      id={id}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur-md transition-all duration-200 ${
        style.card
      } ${
        onClick
          ? 'cursor-pointer hover:scale-[1.01] hover:shadow-xl active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
          : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.badge}`}>
          {icon}
        </div>
      </div>
      <div className="mt-2.5">
        <span className={`text-2xl font-black tracking-tight tabular-nums ${style.valueColor}`}>
          {value}
        </span>
      </div>
      {subtitle && <p className="mt-1 text-xs text-slate-400 font-medium">{subtitle}</p>}
    </div>
  );
};
