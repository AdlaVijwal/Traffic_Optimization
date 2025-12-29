import type { ReactNode } from "react";
import clsx from "clsx";

interface PanelProps {
  children: ReactNode;
  accent?: "primary" | "secondary" | "neutral";
  padded?: boolean;
  className?: string;
}

const accentClasses: Record<NonNullable<PanelProps["accent"]>, string> = {
  primary: "border-control-accent/50 bg-control-panel/80",
  secondary: "border-sky-500/40 bg-sky-500/10",
  neutral: "border-white/10 bg-control-panel/60",
};

export function Panel({
  children,
  accent = "neutral",
  padded = true,
  className,
}: PanelProps) {
  return (
    <section
      className={clsx(
        "rounded-3xl border shadow-2xl shadow-black/40 backdrop-blur-xl",
        accentClasses[accent],
        padded && "p-6",
        className
      )}
    >
      {children}
    </section>
  );
}
