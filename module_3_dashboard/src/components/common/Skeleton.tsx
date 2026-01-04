export function SkeletonCard() {
  return (
    <div className="animate-shimmer rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="mt-3 h-8 w-16 rounded bg-white/10" />
      <div className="mt-2 h-2 w-32 rounded bg-white/10" />
    </div>
  );
}

export function SkeletonPanel() {
  return (
    <div className="glass-panel-muted animate-shimmer space-y-4">
      <div className="h-6 w-40 rounded bg-white/10" />
      <div className="h-4 w-64 rounded bg-white/10" />
      <div className="mt-6 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex animate-shimmer items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded bg-white/10" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-3 w-48 rounded bg-white/10" />
            </div>
          </div>
          <div className="space-y-2 text-right">
            <div className="h-3 w-16 rounded bg-white/10" />
            <div className="h-3 w-24 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonLaneMap() {
  return (
    <div className="glass-panel-muted animate-shimmer">
      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
        <div className="h-10 w-10 rounded-2xl bg-white/10" />
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="h-3 w-48 rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="relative aspect-square max-w-[420px] rounded-3xl border border-white/10 bg-black/20">
          <div className="absolute inset-8 rounded-[40px] border border-white/10" />
          <div className="absolute inset-[28%] rounded-3xl border border-white/10" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
