import { Camera, CloudLightning, Images, RefreshCw } from "lucide-react";
import type { OutputFrameManifest } from "../../types/uploads";
import { Panel } from "../common/Panel";

interface OutputHeroProps {
  manifest?: OutputFrameManifest;
  isFetching: boolean;
}

export function OutputHero({ manifest, isFetching }: OutputHeroProps) {
  const groups = manifest?.groups ?? [];
  const totalGroups = groups.length;
  const totalFrames = groups.reduce(
    (acc, group) => acc + group.frames.length,
    0
  );
  const latestCapture = groups
    .flatMap((group) => group.frames)
    .reduce<string | undefined>((latest, frame) => {
      if (!frame.capturedAt) {
        return latest;
      }
      if (!latest) {
        return frame.capturedAt;
      }
      return new Date(frame.capturedAt) > new Date(latest)
        ? frame.capturedAt
        : latest;
    }, undefined);

  return (
    <Panel accent="primary" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-control-accent/40 blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-sky-500/30 blur-[140px]" />
      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-[0.45em] text-white/70">
            Processed evidence wall
          </p>
          <h1 className="text-4xl font-semibold text-white md:text-5xl">
            Camera analysis output frames
          </h1>
          <p className="max-w-2xl text-base text-white/70">
            Review the annotated frames produced after detection. Each tile
            captures vehicle counts, lane assignments and timestamped evidence,
            ready for downstream audit or sharing with the operations team.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-white/80">
            <span className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2">
              <Camera className="h-4 w-4 text-control-accent" />
              {totalFrames} frames
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <Images className="h-4 w-4 text-sky-300" />
              {totalGroups} lanes
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <CloudLightning className="h-4 w-4 text-emerald-300" />
              {manifest?.generatedAt
                ? `Updated ${new Date(manifest.generatedAt).toLocaleString()}`
                : "Awaiting output"}
            </span>
            {latestCapture ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Latest capture {new Date(latestCapture).toLocaleString()}
              </span>
            ) : null}
            {isFetching ? (
              <span className="flex items-center gap-2 rounded-full border border-control-accent/50 bg-control-accent/10 px-4 py-2 text-control-accent">
                <RefreshCw className="h-4 w-4 animate-spin" /> Syncing output
                feed…
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">
            How it works
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed">
            <li>
              The camera analysis service captures detection output frames for
              each active lane and stores them in the media bucket.
            </li>
            <li>
              Each frame is tagged with the predicted lane, vehicle count and
              capture timestamp for traceability.
            </li>
            <li>
              Use this gallery to validate detection quality or export evidence
              when sharing incidents with external teams.
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}
