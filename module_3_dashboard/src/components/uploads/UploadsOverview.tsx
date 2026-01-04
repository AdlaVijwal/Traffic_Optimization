import { useState, useMemo } from "react";
import {
  UploadCloud,
  Video,
  Search,
  Filter,
  X,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { OutputFrameManifest, UploadRun } from "../../types/uploads";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";
import { SkeletonTable } from "../common/Skeleton";
import { deleteUploads } from "../../services/api";
import { useToast } from "../common/Toast";

interface UploadsOverviewProps {
  uploads: UploadRun[];
  manifest?: OutputFrameManifest;
  isLoading: boolean;
  onUploadsChange?: () => void;
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
  onUploadsChange,
}: UploadsOverviewProps) {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UploadRun["status"] | "all">(
    "all"
  );
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredUploads = useMemo(() => {
    return uploads.filter((upload) => {
      // Status filter
      if (statusFilter !== "all" && upload.status !== statusFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== "all" && upload.analysisType !== typeFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableText = [
          upload.displayName,
          upload.siteLabel,
          upload.cameraLabel,
          upload.locationLabel,
          upload.junctionId,
          upload.notes,
          upload.analysisType,
          upload.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [uploads, searchQuery, statusFilter, typeFilter]);

  const active = filteredUploads.filter(
    (item) => item.status === "processing" || item.status === "pending"
  );
  const completed = filteredUploads.filter(
    (item) => item.status === "completed"
  );
  const failed = filteredUploads.filter((item) => item.status === "failed");

  const analysisTypes = useMemo(() => {
    const types = new Set<string>();
    uploads.forEach((upload) => {
      if (upload.analysisType) {
        types.add(upload.analysisType);
      }
    });
    return Array.from(types).sort();
  }, [uploads]);

  const hasActiveFilters =
    searchQuery.trim() !== "" || statusFilter !== "all" || typeFilter !== "all";

  const totalPages = Math.ceil(filteredUploads.length / pageSize);
  const paginatedUploads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUploads.slice(start, start + pageSize);
  }, [filteredUploads, currentPage, pageSize]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUploads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUploads.map((u) => u.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      const result = await deleteUploads(idsArray);
      toast.success(
        "Uploads deleted",
        `Deleted ${result.deleted} upload${result.deleted !== 1 ? "s" : ""}`
      );
      setSelectedIds(new Set());
      onUploadsChange?.();
    } catch (error) {
      toast.error(
        "Delete failed",
        error instanceof Error ? error.message : "Failed to delete uploads"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "ID",
      "Created",
      "Status",
      "Type",
      "Junction",
      "Lanes",
      "Directions",
      "Notes",
    ];
    const rows = filteredUploads.map((upload) => [
      upload.id,
      new Date(upload.createdAt).toLocaleString(),
      upload.status,
      upload.analysisType?.replace(/_/g, " ") || "",
      upload.junctionId || "",
      upload.laneCount?.toString() || "",
      upload.directions?.join(", ") || "",
      upload.notes?.replace(/"/g, '""') || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `upload-history-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      "Export complete",
      `Exported ${filteredUploads.length} upload${
        filteredUploads.length !== 1 ? "s" : ""
      } to CSV`
    );
  };

  return (
    <Panel accent="neutral">
      <SectionHeader
        title="Upload activity"
        subtitle="Camera analysis timeline and processed frame snapshots"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              disabled={filteredUploads.length === 0}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-wide text-white/60 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-white/60">
              <UploadCloud className="h-4 w-4" />
              Status feed
            </span>
          </div>
        }
      />

      {/* Search and Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search uploads by name, junction, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/40" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as UploadRun["status"] | "all")
            }
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          >
            <option value="all">All Types</option>
            {analysisTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mt-3 text-xs text-white/50">
          Showing {filteredUploads.length} of {uploads.length} uploads
        </div>
      )}

      {/* Bulk Actions */}
      {filteredUploads.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={
                  selectedIds.size === filteredUploads.length &&
                  filteredUploads.length > 0
                }
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-white/20 bg-white/10 text-sky-500 focus:ring-2 focus:ring-sky-500/50"
              />
              <span className="text-sm text-white/70">
                Select All ({selectedIds.size} selected)
              </span>
            </label>
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition hover:border-red-500 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting
                ? "Deleting..."
                : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
      )}

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
            Last frame summary{" "}
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
        {isLoading ? (
          <SkeletonTable />
        ) : filteredUploads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {hasActiveFilters
              ? "No uploads match your filters. Try adjusting your search criteria."
              : "No uploads yet. Drag a traffic video into the camera analysis service to populate this feed."}
          </div>
        ) : (
          paginatedUploads.map((upload) => {
            const displayName =
              upload.displayName ??
              upload.siteLabel ??
              upload.cameraLabel ??
              `Run ${upload.id}`;
            const isSelected = selectedIds.has(upload.id);
            const primaryMeta = [
              upload.analysisType
                ? upload.analysisType.replace(/_/g, " ")
                : "General analysis",
              upload.junctionId ?? "Unknown junction",
            ].filter(Boolean);
            const secondaryMeta = [upload.cameraLabel, upload.locationLabel]
              .filter((value) => Boolean(value && value.trim()))
              .join(" · ");
            const laneDescriptor =
              typeof upload.laneCount === "number" && upload.laneCount > 0
                ? `${upload.laneCount} lane${
                    upload.laneCount === 1 ? "" : "s"
                  } captured`
                : null;

            return (
              <div
                key={upload.id}
                className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm text-white/70 transition ${
                  isSelected
                    ? "border-sky-500/50 bg-sky-500/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(upload.id)}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-sky-500 focus:ring-2 focus:ring-sky-500/50"
                  />
                  <Video className="mt-1 h-4 w-4 text-sky-300" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{displayName}</p>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-[2px] text-[10px] uppercase tracking-wide text-white/50">
                        #{upload.id}
                      </span>
                    </div>
                    <p className="text-xs text-white/50">
                      {primaryMeta.join(" · ")}
                    </p>
                    {secondaryMeta ? (
                      <p className="text-xs text-white/45">{secondaryMeta}</p>
                    ) : null}
                    {laneDescriptor ? (
                      <p className="text-[11px] text-white/40">
                        {laneDescriptor}
                      </p>
                    ) : null}
                    {upload.notes ? (
                      <p className="mt-1 text-xs text-white/40">
                        {upload.notes}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-xs text-white/60">
                  <p className={statusTone[upload.status]}>
                    {upload.status}
                    {upload.status === "processing" &&
                      typeof upload.progress === "number" && (
                        <span className="ml-1">
                          ({Math.round(upload.progress)}%)
                        </span>
                      )}
                  </p>
                  <p>{new Date(upload.createdAt).toLocaleString()}</p>
                  {upload.status === "processing" &&
                    typeof upload.progress === "number" && (
                      <div className="mt-2 w-24">
                        <div className="h-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-sky-400 transition-all duration-300"
                            style={{ width: `${upload.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {filteredUploads.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="10">10 per page</option>
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">
              Page {currentPage} of {totalPages} ({filteredUploads.length}{" "}
              total)
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white transition hover:border-sky-500/50 hover:bg-sky-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white transition hover:border-sky-500/50 hover:bg-sky-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
