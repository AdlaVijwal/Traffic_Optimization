import type { ReactNode } from "react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: ReactNode;
  trend?: "up" | "down" | "steady";
  hint?: string;
  icon?: ReactNode;
  accent?: "neutral" | "accent" | "warning" | "success";
}

const accentTone: Record<NonNullable<StatCardProps["accent"]>, string> = {
  neutral: "border-white/10 bg-white/5",
  accent: "border-control-accent/50 bg-control-accent/10",
  warning: "border-amber-500/50 bg-amber-500/10",
  success: "border-emerald-500/40 bg-emerald-500/10",
};

const trendCopy: Record<Exclude<StatCardProps["trend"], undefined>, string> = {
  up: "Improving",
  down: "Trending down",
  steady: "Steady",
};

export function StatCard({
  label,
  value,
  trend,
  hint,
  icon,
  accent = "neutral",
}: StatCardProps) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-3 rounded-2xl border px-5 py-4 text-sm text-white/80",
        accentTone[accent]
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.35em] text-control-muted">
          {label}
        </p>
        {icon}
      </div>
      <div className="text-3xl font-semibold text-white">{value}</div>
      {(trend || hint) && (
        <div className="text-xs text-control-muted">
          {trend ? trendCopy[trend] : null}
          {trend && hint ? " · " : null}
          {hint}
        </div>
      )}
    </div>
  );
}
