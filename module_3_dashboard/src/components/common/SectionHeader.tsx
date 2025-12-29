import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: SectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-control-muted">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-1 text-sm text-white/70">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
