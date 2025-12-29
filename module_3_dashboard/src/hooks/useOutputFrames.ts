import { useQuery } from "@tanstack/react-query";
import { fetchOutputFrameManifest } from "../services/api";
import type { OutputFrameManifest } from "../types/uploads";

export function useOutputFrames() {
  return useQuery<OutputFrameManifest>({
    queryKey: ["output-frame-manifest"],
    queryFn: fetchOutputFrameManifest,
    staleTime: 30_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });
}
