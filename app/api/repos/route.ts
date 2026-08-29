import { z } from "zod";

import {
  CreateRepoRequestSchema,
  CreateRepoResponseSchema,
  IngestedReposResponseSchema,
  type CreateRepoResponse,
  type IngestedReposResponse,
} from "@/lib/api-types";
import {
  deleteIngestedRepositoryById,
  listIngestedRepositories,
} from "@/lib/ingest-pipeline";
import { createIngestJob } from "@/worker/job-manager";

export const runtime = "nodejs";

type ErrorBody = { error: string; details?: unknown };

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await parseJson(request);
    const input = CreateRepoRequestSchema.parse(raw);

    const job = createIngestJob({
      repoUrl: input.repoUrl,
      branch: input.branch,
    });

    const payload: CreateRepoResponse = CreateRepoResponseSchema.parse({
      jobId: job.id,
      status: job.status,
    });

    return Response.json(payload, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const body: ErrorBody = {
        error: "Validation failed",
        details: error.issues,
      };
      return Response.json(body, { status: 400 });
    }

    const body: ErrorBody = {
      error: error instanceof Error ? error.message : "Unknown server error",
    };

    return Response.json(body, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limitQuery = url.searchParams.get("limit");
    const limit = limitQuery ? Number(limitQuery) : 20;

    const repositories = await listIngestedRepositories(limit);
    const payload: IngestedReposResponse = IngestedReposResponseSchema.parse({ repositories });

    return Response.json(payload);
  } catch (error) {
    const body: ErrorBody = {
      error: error instanceof Error ? error.message : "Unknown server error",
    };

    return Response.json(body, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const repoId = url.searchParams.get("repoId")?.trim();

    if (!repoId) {
      return Response.json({ error: "repoId query parameter is required" }, { status: 400 });
    }

    const deleted = await deleteIngestedRepositoryById(repoId);
    if (!deleted) {
      return Response.json({ error: "Repository not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    const body: ErrorBody = {
      error: error instanceof Error ? error.message : "Unknown server error",
    };

    return Response.json(body, { status: 500 });
  }
}
