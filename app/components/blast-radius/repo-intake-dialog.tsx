import type React from "react";

type JobStatusKey = "idle" | "queued" | "cloning" | "parsing" | "writing_graph" | "ready" | "failed";

const STATUS_CONFIG: Record<JobStatusKey, { label: string; color: string; bg: string; ring: string; dot: string }> = {
  idle:          { label: "Not started",    color: "text-zinc-500",  bg: "bg-zinc-50",   ring: "ring-zinc-200", dot: "bg-zinc-400"  },
  queued:        { label: "Queued",         color: "text-amber-600", bg: "bg-amber-50",  ring: "ring-amber-200", dot: "bg-amber-500" },
  cloning:       { label: "Cloning repo",   color: "text-blue-600",  bg: "bg-blue-50",   ring: "ring-blue-200", dot: "bg-blue-500"  },
  parsing:       { label: "Parsing source", color: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-200", dot: "bg-violet-500" },
  writing_graph: { label: "Writing graph",  color: "text-indigo-600", bg: "bg-indigo-50", ring: "ring-indigo-200", dot: "bg-indigo-500" },
  ready:         { label: "Complete",       color: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  failed:        { label: "Failed",         color: "text-red-600",   bg: "bg-red-50",    ring: "ring-red-200", dot: "bg-red-500"   },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status as JobStatusKey] ?? STATUS_CONFIG.idle;
}

type RepoIntakeDialogProps = {
  isRendered: boolean;
  isOpen: boolean;
  isClosing: boolean;
  isJobActive: boolean;
  repoInput: string;
  branch: string;
  isStarting: boolean;
  jobId: string | null;
  jobStatus: string;
  selectedCachedRepoLabel: string;
  repoId: string;
  onChangeRepoInput: (value: string) => void;
  onChangeBranch: (value: string) => void;
  onClose: () => void;
  onStartIngestion: () => void;
};

export function RepoIntakeDialog(props: RepoIntakeDialogProps): React.JSX.Element | null {
  const {
    isRendered,
    isOpen,
    isClosing,
    isJobActive,
    repoInput,
    branch,
    isStarting,
    jobId,
    jobStatus,
    selectedCachedRepoLabel,
    repoId,
    onChangeRepoInput,
    onChangeBranch,
    onClose,
    onStartIngestion,
  } = props;

  if (!isRendered) {
    return null;
  }

  return (
    <dialog
      open
      aria-label="Repository intake and job details"
      onCancel={(event) => {
        if (isJobActive) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-30 m-0 h-full w-full max-w-none overflow-visible bg-transparent p-0"
    >
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-200 ${
          isOpen && !isClosing ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <div
        className={`relative flex min-h-full items-center justify-center px-4 transition-opacity duration-200 ${
          isOpen && !isClosing ? "opacity-100" : "opacity-0"
        }`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className={`w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl transition-all duration-200 ${
            isOpen && !isClosing
              ? "translate-y-0 scale-100 opacity-100"
              : "translate-y-1 scale-[0.99] opacity-0"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Repository intake & job details</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={isJobActive}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Repository URI</label>
            <input
              value={repoInput}
              onChange={(event) => onChangeRepoInput(event.target.value)}
              placeholder="https://github.com/org/repo.git or file:///absolute/path"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
            />
            <p className="mt-2 text-xs text-zinc-500">Tip: local paths should be entered as file URIs.</p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={branch}
              onChange={(event) => onChangeBranch(event.target.value)}
              placeholder="branch (optional)"
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={onStartIngestion}
              disabled={isStarting || !repoInput.trim()}
              className="h-10 rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isStarting ? "Starting..." : "Start ingestion"}
            </button>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm">
            <p>
              <span className="font-semibold">Job:</span> {jobId ?? "not started"}
            </p>
            <p>
              <span className="font-semibold">Selected cached repo:</span> {selectedCachedRepoLabel}
            </p>
            <p>
              <span className="font-semibold">Repo ID:</span> {repoId || "n/a"}
            </p>
          </div>

          {/* Status indicator */}
          {(() => {
            const cfg = getStatusConfig(jobStatus);
            const isInProgress = ["queued", "cloning", "parsing", "writing_graph"].includes(jobStatus);
            const isComplete = jobStatus === "ready";
            const isFailed = jobStatus === "failed";

            return (
              <div className={`mt-3 rounded-lg p-3 ring-1 ${cfg.bg} ${cfg.ring} transition-colors duration-300`}>
                <div className="flex items-center gap-2.5">
                  {/* Animated dot / static icon */}
                  {isInProgress ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${cfg.dot}`} />
                      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                    </span>
                  ) : (
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  )}

                  <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>

                  {isInProgress ? (
                    <svg className={`ml-auto h-4 w-4 animate-spin ${cfg.color}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : null}
                </div>

                {isComplete ? (
                  <p className={`mt-1.5 text-xs ${cfg.color}`}>
                    ✅ Ingestion complete — the repository graph is ready. You can close this dialog and start querying.
                  </p>
                ) : null}

                {isFailed ? (
                  <p className={`mt-1.5 text-xs ${cfg.color}`}>
                    Ingestion failed. Check the server logs, fix the issue, and try again.
                  </p>
                ) : null}

                {/* Progress steps */}
                {isInProgress || isComplete ? (
                  <div className="mt-2.5 flex gap-1">
                    {(["queued", "cloning", "parsing", "writing_graph", "ready"] as const).map((step) => {
                      const stepIndex = ["queued", "cloning", "parsing", "writing_graph", "ready"].indexOf(step);
                      const currentIndex = ["queued", "cloning", "parsing", "writing_graph", "ready"].indexOf(jobStatus as typeof step);
                      const isPast = stepIndex < currentIndex;
                      const isCurrent = stepIndex === currentIndex;
                      return (
                        <div
                          key={step}
                          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                            isPast || (isCurrent && isComplete)
                              ? "bg-emerald-500"
                              : isCurrent
                                ? `${cfg.dot} animate-pulse`
                                : "bg-zinc-200"
                          }`}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })()}

          {isJobActive ? (
            <p className="mt-3 text-xs text-zinc-500">Close is disabled while ingestion is active.</p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
