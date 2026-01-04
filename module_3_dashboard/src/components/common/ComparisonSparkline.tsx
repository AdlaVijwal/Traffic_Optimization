import { useId } from "react";
import clsx from "clsx";

interface ComparisonSparklineProps {
  current: number[];
  baseline: number[];
  className?: string;
}

function resample(series: number[], targetLength: number): number[] {
  if (targetLength <= 0) {
    return [];
  }
  if (series.length === targetLength) {
    return series;
  }
  if (series.length === 0) {
    return Array.from({ length: targetLength }, () => 0);
  }
  const lastIndex = series.length - 1;
  return Array.from({ length: targetLength }, (_, index) => {
    const ratio = index / Math.max(1, targetLength - 1);
    const sourceIndex = Math.min(lastIndex, Math.round(ratio * lastIndex));
    return series[sourceIndex];
  });
}

function toPath(series: number[], maxValue: number) {
  const safeSeries = series.length > 1 ? series : [0, ...series];
  return safeSeries
    .map((value, index) => {
      const x = (index / (safeSeries.length - 1)) * 100;
      const normalized = maxValue > 0 ? value / maxValue : 0;
      const y = 100 - normalized * 100;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

export function ComparisonSparkline({
  current,
  baseline,
  className,
}: ComparisonSparklineProps) {
  const rawId = useId();
  const gradientId = `comparison-${rawId.replace(/[:]/g, "")}`;
  const targetLength = Math.max(current.length, baseline.length, 2);
  const currentSeries = resample(current, targetLength);
  const baselineSeries = resample(baseline, targetLength);
  const maxValue = Math.max(...currentSeries, ...baselineSeries, 1);
  const currentPath = toPath(currentSeries, maxValue);
  const baselinePath = toPath(baselineSeries, maxValue);

  return (
    <svg
      className={clsx("h-20 w-full", className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={baselinePath}
        fill="none"
        stroke="rgba(148, 163, 184, 0.35)"
        strokeWidth={2}
        strokeDasharray="4 6"
      />
      <path
        d={currentPath}
        fill="none"
        stroke="rgba(47, 214, 166, 0.85)"
        strokeWidth={2.5}
      />
      <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="rgba(47, 214, 166, 0.32)" />
        <stop offset="100%" stopColor="rgba(47, 214, 166, 0)" />
      </linearGradient>
      <path
        d={`${currentPath} L100,100 L0,100 Z`}
        fill={`url(#${gradientId})`}
        opacity={0.6}
      />
    </svg>
  );
}
