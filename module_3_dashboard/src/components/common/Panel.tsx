import type { ReactNode } from "react";
import clsx from "clsx";

interface PanelProps {
  children: ReactNode;
  accent?: "primary" | "secondary" | "neutral";
  padded?: boolean;
  className?: string;
}

const accentClasses: Record<NonNullable<PanelProps["accent"]>, string> = {
  primary: "border-control-accent/60 bg-control-surface/90 shadow-accent-ring",
  secondary:
    "border-severity-info/45 bg-control-overlay/80 shadow-[0_20px_60px_rgba(10,18,32,0.45)]",
  neutral:
    "border-control-borderSoft/70 bg-control-surfaceMuted/85 shadow-[0_18px_48px_rgba(5,8,18,0.55)]",
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
