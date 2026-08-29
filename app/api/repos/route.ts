import { errorResponse, parseJsonBody } from "@/lib/api-helpers";
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
} from "@/lib/repo-queries";
import { createIngestJob } from "@/worker/job-manager";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await parseJsonBody(request);
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
    return errorResponse(error);
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
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
