import { randomUUID } from "node:crypto";

import type { JobStatus } from "../lib/api-types";
import {
  closeIngestPipeline,
  getCachedIngestResult,
  ingestRepository,
  type IngestRepoResult,
} from "../lib/ingest-pipeline";

export type IngestJob = {
  id: string;
  repoUrl: string;
  branch?: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  result: IngestRepoResult | null;
};

type JobStore = Map<string, IngestJob>;

declare global {
  var __blastRadiusJobs: JobStore | undefined;
}

function getJobStore(): JobStore {
  if (!globalThis.__blastRadiusJobs) {
    globalThis.__blastRadiusJobs = new Map<string, IngestJob>();
  }

  return globalThis.__blastRadiusJobs;
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveRetentionMs(): number {
  const fromEnv = Number(process.env.BLAST_RADIUS_JOB_RETENTION_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return 60 * 60 * 1000;
}

function pruneOldJobs(): void {
  const store = getJobStore();
  const retentionMs = resolveRetentionMs();
  const now = Date.now();

  for (const [id, job] of store.entries()) {
    if (job.status !== "ready" && job.status !== "failed") {
      continue;
    }

    const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : new Date(job.createdAt).getTime();
    if (now - completedAt > retentionMs) {
      store.delete(id);
    }
  }
}

function updateJob(id: string, updates: Partial<IngestJob>): void {
  const store = getJobStore();
  const existing = store.get(id);
  if (!existing) {
    return;
  }

  store.set(id, { ...existing, ...updates });
}

function startBackgroundIngest(jobId: string): void {
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    return;
  }

  void (async () => {
    try {
      updateJob(jobId, { status: "cloning", startedAt: nowIso() });

      const cached = await getCachedIngestResult({
        repoUrl: job.repoUrl,
        branch: job.branch,
      });

      if (cached) {
        updateJob(jobId, {
          status: "ready",
          result: cached,
          completedAt: nowIso(),
        });
        return;
      }

      const result = await ingestRepository(
        {
          repoUrl: job.repoUrl,
          branch: job.branch,
        },
        {
          onStatus(status) {
            updateJob(jobId, { status });
          },
        },
      );

      updateJob(jobId, {
        status: "ready",
        result,
        completedAt: nowIso(),
      });
    } catch (error) {
      updateJob(jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown ingestion failure",
        completedAt: nowIso(),
      });
    } finally {
      await closeIngestPipeline();
      pruneOldJobs();
    }
  })();
}

export function createIngestJob(input: { repoUrl: string; branch?: string }): IngestJob {
  pruneOldJobs();

  const id = randomUUID();
  const job: IngestJob = {
    id,
    repoUrl: input.repoUrl,
    branch: input.branch,
    status: "queued",
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
  };

  getJobStore().set(id, job);
  startBackgroundIngest(id);

  return job;
}

export function getIngestJob(id: string): IngestJob | null {
  pruneOldJobs();
  return getJobStore().get(id) ?? null;
}

export function listIngestJobs(limit = 50): IngestJob[] {
  pruneOldJobs();
  return [...getJobStore().values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, limit));
}
