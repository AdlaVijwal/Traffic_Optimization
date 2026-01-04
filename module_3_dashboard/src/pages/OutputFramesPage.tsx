import { useMemo } from "react";
import { useOutputFrames } from "../hooks/useOutputFrames";
import { mockOutputFrameManifest } from "../services/mockData";
import { OutputHero } from "../components/output/OutputHero";
import { OutputGallery } from "../components/output/OutputGallery";

export function OutputFramesPage() {
  const { data, isFetching, isError, refetch } = useOutputFrames();
  const manifest = useMemo(() => {
    if (data) {
      return data;
    }
    if (isError) {
      return mockOutputFrameManifest();
    }
    return undefined;
  }, [data, isError]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <OutputHero manifest={manifest} isFetching={isFetching} />
      <OutputGallery manifest={manifest} onRefresh={refetch} />
    </div>
  );
}
