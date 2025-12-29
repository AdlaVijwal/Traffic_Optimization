import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import type {
  OutputFrameManifest,
  OutputFrameGroup,
  OutputFrameInfo,
  OutputFrameCategory,
} from "../../types/uploads";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";
import { clearOutputFrames } from "../../services/api";

const FALLBACK_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="360" fill="#0F172A" />
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="'Space Grotesk', sans-serif" font-size="36" fill="#38BDF8" opacity="0.85">No preview</text>
</svg>`;

const FALLBACK_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
  FALLBACK_SVG
)}`;

interface OutputGalleryProps {
  manifest: OutputFrameManifest;
  onRefresh?: () => Promise<void> | void;
}

function resolveFrameCategory(frame: OutputFrameInfo): OutputFrameCategory {
  const allowed: OutputFrameCategory[] = ["full", "class", "other"];
  if (frame.category && allowed.includes(frame.category)) {
    return frame.category;
  }
  if (frame.url.includes("/classes/")) {
    return "class";
  }
  if (frame.id.includes("frame_") || frame.id.endsWith("-latest")) {
    return "full";
  }
  return "other";
}

function sortByCapturedAtDesc(frames: OutputFrameInfo[]): OutputFrameInfo[] {
  return [...frames].sort((a, b) => {
    const aTime = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
    const bTime = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function FrameCard({
  frame,
  group,
  isLive = false,
  onClick,
}: {
  frame: OutputFrameInfo;
  group: OutputFrameGroup;
  isLive?: boolean;
  onClick?: () => void;
}) {
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  const baseUrl = frame.url && frame.url.length > 0 ? frame.url : null;
  const imageSrc = baseUrl
    ? isLive
      ? `${baseUrl}?t=${timestamp}`
      : baseUrl
    : FALLBACK_DATA_URL;

  const caption =
    frame.label ??
    frame.annotation ??
    `${group.label} · ${frame.lane ?? "Lane"}`;

  const isInteractive = typeof onClick === "function";

  const handleKeyPress = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      className={`flex flex-col gap-3 ${isInteractive ? "cursor-zoom-in" : ""}`}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={handleKeyPress}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-lg shadow-black/40">
        <img
          src={imageSrc}
          alt={caption}
          className="h-48 w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          loading="lazy"
        />
        {isLive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
            </span>
            Live
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 text-xs text-white/80">
          <p className="font-medium text-white">
            {frame.label || frame.annotation || group.label}
          </p>
          <p className="text-white/60">
            {frame.lane?.toUpperCase() ?? "Lane"}
            {frame.capturedAt
              ? ` · ${new Date(frame.capturedAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <a
          href={imageSrc}
          download
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/70 opacity-0 transition group-hover:opacity-100"
          aria-label="Download frame"
          onClick={(event) => event.stopPropagation()}
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export function OutputGallery({ manifest, onRefresh }: OutputGalleryProps) {
  const [selectedFrame, setSelectedFrame] = useState<{
    frame: OutputFrameInfo;
    group: OutputFrameGroup;
  }>();
  const [isClearing, setIsClearing] = useState(false);

  if (!manifest.groups.length) {
    return null;
  }

  const closeModal = () => setSelectedFrame(undefined);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await clearOutputFrames();
      await onRefresh?.();
      setSelectedFrame(undefined);
    } catch (error) {
      console.error("Failed to clear frames", error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <button
          onClick={handleClear}
          disabled={isClearing}
          className={`inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm font-medium transition ${
            isClearing
              ? "bg-slate-700 text-slate-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          <RefreshCw
            className={`h-4 w-4 ${isClearing ? "animate-spin" : ""}`}
          />
          {isClearing ? "Clearing..." : "Clear Frames"}
        </button>
      </div>
      {manifest.groups.map((group) => {
        const categorized = group.frames.map((frame) => ({
          frame,
          category: resolveFrameCategory(frame),
        }));

        const latestEntry = categorized.find(
          ({ frame, category }) =>
            category === "full" && frame.id.endsWith("-latest")
        );
        const latestFrame = latestEntry?.frame;
        const latestFrameId = latestFrame?.id;

        const historicalFullFrames = sortByCapturedAtDesc(
          categorized
            .filter(
              ({ frame, category }) =>
                category === "full" &&
                (!latestFrameId || frame.id !== latestFrameId)
            )
            .map(({ frame }) => frame)
        );

        const classFrames = sortByCapturedAtDesc(
          categorized
            .filter(({ category }) => category === "class")
            .map(({ frame }) => frame)
        );

        const otherFrames = sortByCapturedAtDesc(
          categorized
            .filter(({ category }) => category === "other")
            .map(({ frame }) => frame)
        );

        return (
          <Panel key={group.id}>
            <SectionHeader
              title={group.label}
              subtitle={group.description ?? "Latest detections and overlays"}
              actions={
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-white/60">
                  {group.frames.length} frame
                  {group.frames.length === 1 ? "" : "s"}
                </span>
              }
            />

            {latestFrame ? (
              <div className="mt-6 mb-8">
                <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
                  Live Feed
                </h4>
                <div className="max-w-2xl">
                  <FrameCard
                    frame={latestFrame}
                    group={group}
                    isLive={true}
                    onClick={() =>
                      setSelectedFrame({ frame: latestFrame, group })
                    }
                  />
                </div>
              </div>
            ) : null}

            {historicalFullFrames.length > 0 ? (
              <div className="mb-8">
                <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
                  Recent Frames
                </h4>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {historicalFullFrames.map((frame) => (
                    <FrameCard
                      key={frame.id}
                      frame={frame}
                      group={group}
                      isLive={false}
                      onClick={() => setSelectedFrame({ frame, group })}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {classFrames.length > 0 ? (
              <div className="mb-8">
                <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
                  Detected Objects
                </h4>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
                  {classFrames.map((frame) => (
                    <FrameCard
                      key={frame.id}
                      frame={frame}
                      group={group}
                      isLive={frame.id.endsWith("-latest")}
                      onClick={() => setSelectedFrame({ frame, group })}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {otherFrames.length > 0 ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
                  Additional Frames
                </h4>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
                  {otherFrames.map((frame) => (
                    <FrameCard
                      key={frame.id}
                      frame={frame}
                      group={group}
                      isLive={frame.id.endsWith("-latest")}
                      onClick={() => setSelectedFrame({ frame, group })}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>
        );
      })}
      {selectedFrame ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/70 hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                <img
                  src={
                    selectedFrame.frame.url &&
                    selectedFrame.frame.url.length > 0
                      ? `${selectedFrame.frame.url}?t=${Date.now()}`
                      : FALLBACK_DATA_URL
                  }
                  alt={
                    selectedFrame.frame.annotation ?? selectedFrame.group.label
                  }
                  className="max-h-[65vh] w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-1 text-sm text-white/80">
                <span className="text-base font-semibold text-white">
                  {selectedFrame.group.label} ·{" "}
                  {selectedFrame.frame.label ?? "Frame"}
                </span>
                {selectedFrame.frame.capturedAt ? (
                  <span>
                    Captured{" "}
                    {new Date(selectedFrame.frame.capturedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
