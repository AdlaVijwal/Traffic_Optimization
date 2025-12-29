import { UploadCloud, Video } from "lucide-react";
import type { OutputFrameManifest, UploadRun } from "../../types/uploads";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";

interface UploadsOverviewProps {
  uploads: UploadRun[];
  manifest?: OutputFrameManifest;
  isLoading: boolean;
}

const statusTone: Record<UploadRun["status"], string> = {
  pending: "text-amber-300",
  processing: "text-sky-300",
  completed: "text-emerald-300",
  failed: "text-red-400",
};

export function UploadsOverview({
  uploads,
  manifest,
  isLoading,
}: UploadsOverviewProps) {
  const active = uploads.filter(
    (item) => item.status === "processing" || item.status === "pending"
  );
  const completed = uploads.filter((item) => item.status === "completed");
  const failed = uploads.filter((item) => item.status === "failed");

  return (
    <Panel accent="neutral">
      <SectionHeader
        title="Upload activity"
        subtitle="Module 1 ingestion timeline and processed frame manifests"
        actions={
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-white/60">
            <UploadCloud className="h-4 w-4" />
            Status feed
          </span>
        }
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Active jobs
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {active.length}
          </p>
          <p className="text-xs text-white/60">
            {isLoading
              ? "Fetching latest status…"
              : "Includes pending and processing runs."}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Completed
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {completed.length}
          </p>
          <p className="text-xs text-white/60">
            Last manifest{" "}
            {manifest?.generatedAt
              ? new Date(manifest.generatedAt).toLocaleString()
              : "N/A"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Failed
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {failed.length}
          </p>
          <p className="text-xs text-white/60">
            Investigate camera connectivity or thresholds.
          </p>
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {uploads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            No uploads yet. Drag a traffic video into Module 1 to populate this
            feed.
          </div>
        ) : (
          uploads.slice(0, 10).map((upload) => (
            <div
              key={upload.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"
            >
              <div className="flex items-start gap-3">
                <Video className="mt-1 h-4 w-4 text-sky-300" />
                <div>
                  <p className="font-medium text-white">Run {upload.id}</p>
                  <p className="text-xs text-white/50">
                    {upload.analysisType ?? "General analysis"} ·{" "}
                    {upload.junctionId ?? "Unknown junction"}
                  </p>
                  {upload.notes ? (
                    <p className="mt-1 text-xs text-white/40">{upload.notes}</p>
                  ) : null}
                </div>
              </div>
              <div className="text-right text-xs text-white/60">
                <p className={statusTone[upload.status]}>{upload.status}</p>
                <p>{new Date(upload.createdAt).toLocaleString()}</p>
                {typeof upload.progress === "number" ? (
                  <p>{Math.round(upload.progress)}% complete</p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
