import type React from "react";
import type { IngestedRepoSummary } from "@/lib/api-types";

import { EllipsisVerticalIcon, RefreshCcwIcon } from "./shared";

type ReposSectionProps = {
  repositories: IngestedRepoSummary[];
  isPending: boolean;
  isRefreshing: boolean;
  selectedRepoId: string | null;
  openRepoMenuId: string | null;
  isDeletePending: boolean;
  deleteTargetRepoId?: string;
  failedJobError?: string;
  onRefresh: () => void;
  onOpenAddRepo: () => void;
  onToggleRepoMenu: (repoId: string) => void;
  onMakeRepoCurrent: (repo: IngestedRepoSummary) => void;
  onDeleteRepo: (repo: IngestedRepoSummary) => void;
};

export function ReposSection(props: ReposSectionProps): React.JSX.Element {
  const {
    repositories,
    isPending,
    isRefreshing,
    selectedRepoId,
    openRepoMenuId,
    isDeletePending,
    deleteTargetRepoId,
    failedJobError,
    onRefresh,
    onOpenAddRepo,
    onToggleRepoMenu,
    onMakeRepoCurrent,
    onDeleteRepo,
  } = props;

  return (
    <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-semibold">Repos</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcwIcon className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onOpenAddRepo}
              className="rounded-md bg-black px-2.5 py-1 text-xs font-semibold text-white"
            >
              Add repo
            </button>
          </div>
        </div>

        {isPending ? <p className="text-sm text-zinc-500">Loading existing repositories...</p> : null}
        {!isPending && repositories.length === 0 ? (
          <p className="text-sm text-zinc-500">No previously dumped repositories found.</p>
        ) : null}

        {repositories.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
            {repositories.slice(0, 9).map((repo) => {
              const active = selectedRepoId === repo.repoId;
              const deletingThisRepo = isDeletePending && deleteTargetRepoId === repo.repoId;
              return (
                <div
                  key={`${repo.repoId}:${repo.ingestedAt}`}
                  className={`group relative rounded-md border ${
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <div className="rounded-md px-3 py-2 pr-10 text-left text-xs">
                    <p className="font-semibold">{repo.repoName} · {repo.branch}</p>
                    <p className="truncate">{repo.repoUrl}</p>
                    <p className="text-[11px] text-zinc-500">
                      files {repo.parsedFiles} · symbols {repo.parsedSymbols} · deps {repo.parsedDependencies}
                    </p>
                  </div>

                  <div className="absolute top-2 right-2">
                    <button
                      type="button"
                      aria-label={`Open options for ${repo.repoName}`}
                      title="More options"
                      onClick={() => onToggleRepoMenu(repo.repoId)}
                      className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100"
                    >
                      <EllipsisVerticalIcon className="h-3.5 w-3.5" />
                    </button>

                    {openRepoMenuId === repo.repoId ? (
                      <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => onMakeRepoCurrent(repo)}
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                        >
                          Make repo current
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRepo(repo)}
                          disabled={isDeletePending}
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingThisRepo ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {failedJobError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Job failed: {failedJobError}
        </p>
      ) : null}
    </section>
  );
}
