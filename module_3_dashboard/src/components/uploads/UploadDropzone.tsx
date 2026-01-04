import { useState, useRef, DragEvent } from "react";
import { Upload, X, FileVideo, Lock } from "lucide-react";
import { Panel } from "../common/Panel";
import { uploadJunctionVideos } from "../../services/api";
import { useToast } from "../common/Toast";

interface UploadDropzoneProps {
  hasActiveRuns: boolean;
  onUploadTriggered: () => void;
}

export function UploadDropzone({
  hasActiveRuns,
  onUploadTriggered,
}: UploadDropzoneProps) {
  const toast = useToast();
  const [junctionType, setJunctionType] = useState<
    "single" | "two_way" | "four_way"
  >("four_way");
  const [files, setFiles] = useState<{ [key: string]: File | null }>({
    north: null,
    south: null,
    east: null,
    west: null,
  });
  const [siteLabel, setSiteLabel] = useState("");
  const [cameraLabel, setCameraLabel] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [retainUploads, setRetainUploads] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const directions =
    junctionType === "single"
      ? ["north"]
      : junctionType === "two_way"
      ? ["north", "south"]
      : ["north", "east", "south", "west"];

  const handleFileChange = (direction: string, file: File | null) => {
    if (file && !file.type.startsWith("video/")) {
      toast.error("Invalid file type", "Please select a video file");
      return;
    }
    setFiles((prev) => ({ ...prev, [direction]: file }));
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (isBusy) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileChange(direction, droppedFile);
    }
  };

  const isBusy = isUploading || hasActiveRuns;

  const handleSubmit = async () => {
    const filesToUpload: { [key: string]: File } = {};
    directions.forEach((dir) => {
      if (files[dir]) {
        filesToUpload[dir] = files[dir]!;
      }
    });

    if (Object.keys(filesToUpload).length === 0) {
      toast.error("No videos selected", "Please select at least one video");
      return;
    }

    const metadata = {
      siteLabel: siteLabel.trim(),
      cameraLabel: cameraLabel.trim(),
      locationLabel: locationLabel.trim(),
      contextNotes: contextNotes.trim(),
      retainUploads,
    };

    setIsUploading(true);

    try {
      await uploadJunctionVideos(junctionType, filesToUpload, metadata);
      const successNotice = retainUploads
        ? "Upload started! Original videos will stay on disk."
        : "Upload started! Uploaded files will be removed after processing completes.";
      toast.success("Upload successful", successNotice);
      // Reset files
      setFiles({ north: null, south: null, east: null, west: null });
      setSiteLabel("");
      setCameraLabel("");
      setLocationLabel("");
      setContextNotes("");
      setRetainUploads(false);
      onUploadTriggered();
    } catch (error) {
      console.error(error);
      toast.error(
        "Upload failed",
        error instanceof Error ? error.message : "Check console for details"
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Panel>
      <div className="space-y-6">
        <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
          <h2 className="text-xl font-semibold text-white">New Upload</h2>
          <p className="text-sm text-slate-400">
            Stage fresh observation videos for the camera analysis service. The
            pipeline locks while analysis runs to protect in-flight jobs.
          </p>
        </div>
        {hasActiveRuns ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <Lock size={16} />
            <span>
              Processing current upload. New uploads will unlock once analysis
              finishes.
            </span>
          </div>
        ) : null}
        {/* Junction Type Selector */}
        <div>
          <span className="block text-sm font-medium text-slate-300 mb-2">
            Junction Type
          </span>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="junctionType"
                value="four_way"
                checked={junctionType === "four_way"}
                onChange={() => setJunctionType("four_way")}
                className="form-radio text-indigo-500"
                disabled={isBusy}
              />
              <span className={`text-slate-200 ${isBusy ? "opacity-50" : ""}`}>
                4-Way
              </span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="junctionType"
                value="two_way"
                checked={junctionType === "two_way"}
                onChange={() => setJunctionType("two_way")}
                className="form-radio text-indigo-500"
                disabled={isBusy}
              />
              <span className={`text-slate-200 ${isBusy ? "opacity-50" : ""}`}>
                2-Way
              </span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="junctionType"
                value="single"
                checked={junctionType === "single"}
                onChange={() => setJunctionType("single")}
                className="form-radio text-indigo-500"
                disabled={isBusy}
              />
              <span className={`text-slate-200 ${isBusy ? "opacity-50" : ""}`}>
                Single
              </span>
            </label>
          </div>
        </div>

        {/* Upload Metadata */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-slate-300"
              htmlFor="site-label"
            >
              Site label
            </label>
            <input
              id="site-label"
              type="text"
              placeholder="e.g. Junction 12 - Downtown"
              value={siteLabel}
              onChange={(event) => setSiteLabel(event.target.value)}
              disabled={isBusy}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-slate-300"
              htmlFor="camera-label"
            >
              Camera label
            </label>
            <input
              id="camera-label"
              type="text"
              placeholder="e.g. Northbound Pole A"
              value={cameraLabel}
              onChange={(event) => setCameraLabel(event.target.value)}
              disabled={isBusy}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-slate-300"
              htmlFor="location-label"
            >
              Location label
            </label>
            <input
              id="location-label"
              type="text"
              placeholder="e.g. 5th Ave & Pine"
              value={locationLabel}
              onChange={(event) => setLocationLabel(event.target.value)}
              disabled={isBusy}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label
              className="block text-sm font-medium text-slate-300"
              htmlFor="context-notes"
            >
              Notes for analysts
            </label>
            <textarea
              id="context-notes"
              placeholder="Operational context, anomalies to watch for, or incident notes"
              value={contextNotes}
              onChange={(event) => setContextNotes(event.target.value)}
              disabled={isBusy}
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4">
          <input
            id="retain-uploads-toggle"
            type="checkbox"
            checked={retainUploads}
            onChange={(event) => setRetainUploads(event.target.checked)}
            disabled={isBusy}
            className="mt-1 h-4 w-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500"
          />
          <label
            htmlFor="retain-uploads-toggle"
            className="text-sm text-slate-200"
          >
            Keep uploaded video files on disk after processing completes. Leave
            unchecked to remove the files once the camera analysis service
            finishes so the observation folder stays clean.
          </label>
        </div>

        {/* File Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {directions.map((direction) => {
            const inputId = `${direction}-video-input`;

            return (
              <div
                key={direction}
                className="border border-slate-700 rounded-lg p-4 bg-slate-800/50"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={(e) => handleDrop(e, direction)}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-slate-300 capitalize">
                    {direction}
                  </span>
                  {files[direction] && (
                    <button
                      onClick={() => handleFileChange(direction, null)}
                      className="text-slate-500 hover:text-red-400"
                      disabled={isBusy}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {files[direction] ? (
                  <div className="flex items-center space-x-2">
                    <FileVideo
                      size={16}
                      className="text-emerald-400 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-emerald-400">
                        {files[direction]?.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {((files[direction]?.size ?? 0) / 1024 / 1024).toFixed(
                          2
                        )}{" "}
                        MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor={inputId}
                    className={`flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-md transition-all ${
                      dragActive && !isBusy
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-slate-600"
                    } ${
                      isBusy
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:border-indigo-500 hover:bg-slate-800"
                    }`}
                  >
                    <Upload className="text-slate-500 mb-1" size={20} />
                    <span className="text-xs text-slate-400">
                      Click or drag video here
                    </span>
                    <input
                      ref={(el) => (inputRefs.current[direction] = el)}
                      id={inputId}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={isBusy}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileChange(direction, e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end pt-4 border-t border-slate-700">
          <button
            onClick={handleSubmit}
            disabled={isBusy}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              isBusy
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {isUploading
              ? "Uploading..."
              : hasActiveRuns
              ? "Processing..."
              : "Start Processing"}
          </button>
        </div>
      </div>
    </Panel>
  );
}
