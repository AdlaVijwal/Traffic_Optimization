import { Radio } from "lucide-react";
import { useUploadsData } from "../hooks/useUploadsData";
import { UploadsOverview } from "../components/uploads/UploadsOverview";
import { FrameGallery } from "../components/uploads/FrameGallery";
import { UploadDropzone } from "../components/uploads/UploadDropzone";

export function UploadsPage() {
  const {
    uploads,
    manifest,
    isLoading,
    isFetching,
    refetchUploads,
    refetchManifest,
    clearManifest,
    hasActiveRuns,
  } = useUploadsData();

  return (
    <div className="flex flex-col gap-8 pb-10">
      {hasActiveRuns && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <Radio className="h-4 w-4 animate-pulse" />
          <span>
            Auto-refreshing every 10s while uploads are active
            {isFetching && (
              <span className="ml-2 text-emerald-400/70">(syncing...)</span>
            )}
          </span>
        </div>
      )}
      <UploadDropzone
        hasActiveRuns={hasActiveRuns}
        onUploadTriggered={() => {
          clearManifest();
          void Promise.all([refetchUploads(), refetchManifest()]);
        }}
      />
      <UploadsOverview
        uploads={uploads}
        manifest={manifest}
        isLoading={isLoading}
        onUploadsChange={() => {
          void Promise.all([refetchUploads(), refetchManifest()]);
        }}
      />
      <FrameGallery manifest={manifest} />
    </div>
  );
}
