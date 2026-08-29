"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import "reactflow/dist/style.css";

import { QueryControlsPanel } from "@/app/components/blast-radius/query-controls-panel";
import { RepoIntakeDialog } from "@/app/components/blast-radius/repo-intake-dialog";
import { ReposSection } from "@/app/components/blast-radius/repos-section";
import { ResultsPanel } from "@/app/components/blast-radius/results-panel";
import {
  buildPrompt,
  normalizeRepoInput,
  readJsonOrThrow,
  toGraphEdges,
  toGraphNodes,
  type TabKey,
} from "@/app/components/blast-radius/shared";

import type {
  AffectedPagesResponse,
  BlastRadiusResponse,
  CreateRepoResponse,
  IngestedRepoSummary,
  IngestedReposResponse,
  JobStatusResponse,
} from "@/lib/api-types";

function extractFilePathFromSymbol(symbolFqn: string): string | null {
  // Symbol format: "repoId:path/to/file.tsx#symbolName"
  const colonIndex = symbolFqn.indexOf(":");
  if (colonIndex === -1) return null;
  const rest = symbolFqn.slice(colonIndex + 1);
  const hashIndex = rest.indexOf("#");
  return hashIndex === -1 ? rest : rest.slice(0, hashIndex);
}

function BlastRadiusApp(): React.JSX.Element {
  const [repoInput, setRepoInput] = useState("");
  const [branch, setBranch] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<IngestedRepoSummary | null>(null);
  const [symbol, setSymbol] = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [activeTab, setActiveTab] = useState<TabKey>("graph");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [isRepoModalRendered, setIsRepoModalRendered] = useState(false);
  const [isRepoModalClosing, setIsRepoModalClosing] = useState(false);
  const [openRepoMenuId, setOpenRepoMenuId] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const createRepoMutation = useMutation({
    mutationFn: async () => {
      const normalizedRepoUrl = normalizeRepoInput(repoInput);
      const response = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoUrl: normalizedRepoUrl,
          branch: branch.trim() || undefined,
        }),
      });

      return readJsonOrThrow<CreateRepoResponse>(response);
    },
    onSuccess(data) {
      setJobId(data.jobId);
      setSelectedRepo(null);
      setSymbol("");
      setFocusedNodeId(null);
    },
  });

  const dumpedReposQuery = useQuery({
    queryKey: ["ingested-repositories"],
    queryFn: async () => {
      const response = await fetch("/api/repos?limit=20");
      return readJsonOrThrow<IngestedReposResponse>(response);
    },
    // refetchInterval: 10_000,
  });

  const deleteRepoMutation = useMutation({
    mutationFn: async (targetRepoId: string) => {
      const response = await fetch(`/api/repos?repoId=${encodeURIComponent(targetRepoId)}`, {
        method: "DELETE",
      });

      return readJsonOrThrow<{ success: true }>(response);
    },
    onSuccess(_, deletedRepoId) {
      if (selectedRepo?.repoId === deletedRepoId) {
        setSelectedRepo(null);
        setSymbol("");
        setFocusedNodeId(null);
      }

      void dumpedReposQuery.refetch();
    },
  });

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    enabled: Boolean(jobId),
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      return readJsonOrThrow<JobStatusResponse>(response);
    },
    refetchInterval(query) {
      const status = query.state.data?.status;
      return status === "ready" || status === "failed" ? false : 1000;
    },
  });

  const repoId = jobQuery.data?.result?.repoId ?? selectedRepo?.repoId ?? "";
  const effectiveSymbol = symbol.trim() || (repoId ? `${repoId}:app/page.tsx#module` : "");
  const blastMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/blast-radius", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoId,
          symbol: effectiveSymbol,
          maxDepth,
        }),
      });

      return readJsonOrThrow<BlastRadiusResponse>(response);
    },
    onSuccess() {
      setActiveTab("graph");
      // Auto-run affected pages using the seed symbol's file path
      const filePath = extractFilePathFromSymbol(effectiveSymbol);
      if (filePath) {
        affectedPagesMutation.mutate([filePath]);
      }
    },
  });

  const affectedPagesMutation = useMutation({
    mutationFn: async (changedFiles: string[]) => {
      if (changedFiles.length < 1) {
        throw new Error("Affected pages requires at least 1 changed file.");
      }

      const response = await fetch("/api/affected-pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoId,
          changedFiles,
        }),
      });

      return readJsonOrThrow<AffectedPagesResponse>(response);
    },
  });

  const graphNodes = useMemo(() => {
    if (!blastMutation.data) {
      return [];
    }

    return toGraphNodes(blastMutation.data, effectiveSymbol, focusedNodeId);
  }, [blastMutation.data, effectiveSymbol, focusedNodeId]);

  const graphEdges = useMemo(() => {
    if (!blastMutation.data) {
      return [];
    }

    return toGraphEdges(blastMutation.data, focusedNodeId);
  }, [blastMutation.data, focusedNodeId]);

  const promptText = useMemo(() => {
    if (!repoId || !effectiveSymbol) {
      return "Run ingestion and at least one query to generate a prompt.";
    }

    return buildPrompt({
      repoId,
      symbol: effectiveSymbol,
      blast: blastMutation.data ?? null,
      affected: affectedPagesMutation.data ?? null,
    });
  }, [affectedPagesMutation.data, blastMutation.data, effectiveSymbol, repoId]);

  const globalError =
    deleteRepoMutation.error?.message ||
    dumpedReposQuery.error?.message ||
    createRepoMutation.error?.message ||
    jobQuery.error?.message ||
    blastMutation.error?.message ||
    affectedPagesMutation.error?.message ||
    null;

  const isJobActive =
    createRepoMutation.isPending ||
    (Boolean(jobId) && jobQuery.data?.status !== "ready" && jobQuery.data?.status !== "failed");

  function openRepoModal(): void {
    setIsRepoModalRendered(true);
    setIsRepoModalClosing(false);
    window.requestAnimationFrame(() => {
      setIsRepoModalOpen(true);
    });
  }

  function closeRepoModal(): void {
    if (isJobActive) {
      return;
    }

    setIsRepoModalOpen(false);
    setIsRepoModalClosing(true);

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsRepoModalRendered(false);
      setIsRepoModalClosing(false);
      closeTimerRef.current = null;
    }, 180);
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1200);
  }

  function confirmAndDeleteRepo(repo: IngestedRepoSummary): void {
    const confirmation = window.confirm(
      `Delete repo "${repo.repoName}" (${repo.branch})?\n\nThis is destructive: all graph data for this repository will be permanently deleted and cannot be recovered.`,
    );

    if (!confirmation || deleteRepoMutation.isPending) {
      return;
    }

    setOpenRepoMenuId(null);
    deleteRepoMutation.mutate(repo.repoId);
  }

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Blast Radius</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Ingest a repository, poll job status, visualize dependency blast radius, and export an AI-ready prompt.
          </p>
        </header>

        <ReposSection
          repositories={dumpedReposQuery.data?.repositories ?? []}
          isPending={dumpedReposQuery.isPending}
          isRefreshing={dumpedReposQuery.isFetching}
          selectedRepoId={selectedRepo?.repoId ?? null}
          openRepoMenuId={openRepoMenuId}
          isDeletePending={deleteRepoMutation.isPending}
          deleteTargetRepoId={deleteRepoMutation.variables}
          failedJobError={jobQuery.data?.status === "failed" ? (jobQuery.data.error ?? "unknown error") : undefined}
          onRefresh={() => {
            void dumpedReposQuery.refetch();
          }}
          onOpenAddRepo={openRepoModal}
          onToggleRepoMenu={(repoMenuId) => {
            setOpenRepoMenuId((current) => (current === repoMenuId ? null : repoMenuId));
          }}
          onMakeRepoCurrent={(repo) => {
            setSelectedRepo(repo);
            setJobId(null);
            setSymbol("");
            setFocusedNodeId(null);
            setOpenRepoMenuId(null);
          }}
          onDeleteRepo={confirmAndDeleteRepo}
        />

        <RepoIntakeDialog
          isRendered={isRepoModalRendered}
          isOpen={isRepoModalOpen}
          isClosing={isRepoModalClosing}
          isJobActive={isJobActive}
          repoInput={repoInput}
          branch={branch}
          isStarting={createRepoMutation.isPending}
          jobId={jobId}
          jobStatus={jobQuery.data?.status ?? "idle"}
          selectedCachedRepoLabel={selectedRepo ? `${selectedRepo.repoName} (${selectedRepo.branch})` : "none"}
          repoId={repoId}
          onChangeRepoInput={setRepoInput}
          onChangeBranch={setBranch}
          onClose={closeRepoModal}
          onStartIngestion={() => createRepoMutation.mutate()}
        />

        <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-3">
          <QueryControlsPanel
            repoId={repoId}
            symbol={symbol}
            maxDepth={maxDepth}
            effectiveSymbol={effectiveSymbol}
            onSymbolChange={setSymbol}
            onMaxDepthChange={setMaxDepth}
            onRunBlast={() => blastMutation.mutate()}
            isBlastPending={blastMutation.isPending}
            isAffectedPending={affectedPagesMutation.isPending}
          />

          <ResultsPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            blastPending={blastMutation.isPending}
            blastData={blastMutation.data}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            onNodeClick={setFocusedNodeId}
            affectedPending={affectedPagesMutation.isPending}
            affectedData={affectedPagesMutation.data}
            promptText={promptText}
            onCopyPrompt={copyPrompt}
            copyState={copyState}
          />
        </section>

        {globalError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {globalError}</section>
        ) : null}
      </main>
    </div>
  );
}

export default function BlastRadiusClient(): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <BlastRadiusApp />
    </QueryClientProvider>
  );
}
