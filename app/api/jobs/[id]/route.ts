import {
  JobStatusResponseSchema,
  type JobStatusResponse,
} from "@/lib/api-types";
import { getIngestJob } from "@/worker/job-manager";

export const runtime = "nodejs";

type Params = { id: string };

export async function GET(
  _request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { id } = await context.params;
  const job = getIngestJob(id);

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const payload: JobStatusResponse = JobStatusResponseSchema.parse({
    jobId: job.id,
    status: job.status,
    repoUrl: job.repoUrl,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    result: job.result,
  });

  return Response.json(payload);
}
