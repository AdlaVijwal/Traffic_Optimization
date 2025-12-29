import { useUploadsData } from "../hooks/useUploadsData";
import { UploadsOverview } from "../components/uploads/UploadsOverview";
import { FrameGallery } from "../components/uploads/FrameGallery";
import { UploadDropzone } from "../components/uploads/UploadDropzone";

export function UploadsPage() {
  const { uploads, manifest, isLoading, refetchUploads, hasActiveRuns } =
    useUploadsData();

  return (
    <div className="flex flex-col gap-8 pb-10">
      <UploadDropzone
        hasActiveRuns={hasActiveRuns}
        onUploadTriggered={() => {
          void refetchUploads();
        }}
      />
      <UploadsOverview
        uploads={uploads}
        manifest={manifest}
        isLoading={isLoading}
      />
      <FrameGallery manifest={manifest} />
    </div>
  );
}
