import { useQuery } from "@tanstack/react-query";
import { fetchOutputFrameManifest, fetchUploadRuns } from "../services/api";

export function useUploadsData() {
  const uploadsQuery = useQuery({
    queryKey: ["uploads"],
    queryFn: fetchUploadRuns,
    refetchInterval: 10_000,
  });

  const manifestQuery = useQuery({
    queryKey: ["output-frame-manifest"],
    queryFn: fetchOutputFrameManifest,
    staleTime: 30_000,
  });

  return {
    uploads: uploadsQuery.data ?? [],
    isLoading: uploadsQuery.isLoading,
    isFetching: uploadsQuery.isFetching,
    error: uploadsQuery.error,
    manifest: manifestQuery.data,
    isManifestLoading: manifestQuery.isLoading,
    refetchUploads: uploadsQuery.refetch,
    hasActiveRuns: (uploadsQuery.data ?? []).some((run) =>
      run.status === "processing" || run.status === "pending"
    ),
  };
}
