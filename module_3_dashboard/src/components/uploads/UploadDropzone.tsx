import { useState } from "react";
import { Upload, X, FileVideo, Lock } from "lucide-react";
import { Panel } from "../common/Panel";
import { uploadJunctionVideos } from "../../services/api";

interface UploadDropzoneProps {
  hasActiveRuns: boolean;
  onUploadTriggered: () => void;
}

export function UploadDropzone({
  hasActiveRuns,
  onUploadTriggered,
}: UploadDropzoneProps) {
  const [junctionType, setJunctionType] = useState<
    "single" | "two_way" | "four_way"
  >("four_way");
  const [files, setFiles] = useState<{ [key: string]: File | null }>({
    north: null,
    south: null,
    east: null,
    west: null,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const directions =
    junctionType === "single"
      ? ["north"]
      : junctionType === "two_way"
      ? ["north", "south"]
      : ["north", "east", "south", "west"];

  const handleFileChange = (direction: string, file: File | null) => {
    setFiles((prev) => ({ ...prev, [direction]: file }));
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
      setMessage({ type: "error", text: "Please select at least one video." });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      await uploadJunctionVideos(junctionType, filesToUpload);
      setMessage({
        type: "success",
        text: "Upload started! Processing in background.",
      });
      // Reset files
      setFiles({ north: null, south: null, east: null, west: null });
      onUploadTriggered();
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Upload failed. Check console for details.",
      });
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
            Stage fresh observation videos for Module 1 processing. The pipeline
            locks while analysis runs to protect in-flight jobs.
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

        {/* File Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {directions.map((direction) => {
            const inputId = `${direction}-video-input`;

            return (
              <div
                key={direction}
                className="border border-slate-700 rounded-lg p-4 bg-slate-800/50"
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
                  <div className="flex items-center space-x-2 text-emerald-400 text-sm">
                    <FileVideo size={16} />
                    <span className="truncate">{files[direction]?.name}</span>
                  </div>
                ) : (
                  <label
                    htmlFor={inputId}
                    className={`flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-600 rounded-md ${
                      isBusy
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:border-indigo-500 hover:bg-slate-800"
                    } transition-colors`}
                  >
                    <Upload className="text-slate-500 mb-1" size={20} />
                    <span className="text-xs text-slate-400">Select Video</span>
                    <input
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
        <div className="flex items-center justify-between pt-4 border-t border-slate-700">
          <div className="text-sm">
            {message && (
              <span
                className={
                  message.type === "success"
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {message.text}
              </span>
            )}
          </div>
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
