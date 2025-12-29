interface SparklineProps {
  data: number[];
}

export function Sparkline({ data }: SparklineProps) {
  const safeData = data.length > 1 ? data : [0, ...data];
  const max = Math.max(...safeData, 1);
  const path = safeData
    .map((value, index) => {
      const x = (index / (safeData.length - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-16 w-full"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="rgba(54, 251, 161, 0.7)"
        strokeWidth={2}
      />
      <polyline
        points={safeData
          .map((value, index) => {
            const x = (index / (safeData.length - 1)) * 100;
            const y = 100 - (value / max) * 100;
            return `${x},${y}`;
          })
          .join(" ")}
        fill="rgba(54, 251, 161, 0.1)"
        stroke="none"
      />
    </svg>
  );
}
