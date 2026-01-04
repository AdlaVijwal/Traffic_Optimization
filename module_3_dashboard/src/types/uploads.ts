export interface UploadRun {
  id: string;
  createdAt: string;
  status: "pending" | "processing" | "completed" | "failed";
  junctionId?: string;
  analysisType?: string;
  laneHint?: string;
  progress?: number;
  framesProcessed?: number;
  totalFrames?: number;
  notes?: string;
  siteLabel?: string;
  cameraLabel?: string;
  locationLabel?: string;
  displayName?: string;
  laneCount?: number;
  directions?: string[];
}

export interface FrameManifest {
  generatedAt: string;
  frames: Record<string, string>;
}

export type OutputFrameCategory = "full" | "class" | "other";

export interface OutputFrameInfo {
  id: string;
  url: string;
  lane?: string;
  laneLabel?: string;
  capturedAt?: string;
  annotation?: string;
  label?: string;
  category?: OutputFrameCategory;
}

export interface OutputFrameGroup {
  id: string;
  label: string;
  description?: string;
  frames: OutputFrameInfo[];
}

export interface OutputLaneDescriptor {
  id: string;
  label: string;
  alias?: string;
  order: number;
  original?: string;
}

export interface OutputFrameManifest {
  generatedAt: string;
  groups: OutputFrameGroup[];
  laneAliases?: Record<string, string>;
  lanes?: OutputLaneDescriptor[];
}
