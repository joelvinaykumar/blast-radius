import "dotenv/config";

import { createIngestJob, getIngestJob } from "../worker/job-manager";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const repoUrl = process.argv[2];
  const branch = process.argv[3];

  if (!repoUrl) {
    throw new Error("Usage: npm run test:job -- <repo-url-or-local-path> [branch]");
  }

  const job = createIngestJob({ repoUrl, branch });
  console.log(`🧪 Started job ${job.id} for ${repoUrl}`);

  let previousStatus = job.status;
  console.log(`status=${previousStatus}`);

  while (true) {
    await sleep(750);
    const current = getIngestJob(job.id);

    if (!current) {
      throw new Error("Job disappeared before completion (may have been pruned by retention policy)");
    }

    if (current.status !== previousStatus) {
      previousStatus = current.status;
      console.log(`status=${current.status}`);
    }

    if (current.status === "ready") {
      console.log("✅ Job finished", current.result);
      return;
    }

    if (current.status === "failed") {
      throw new Error(current.error ?? "Job failed with unknown error");
    }
  }
}

main().catch((error: unknown) => {
  console.error("❌ Job lifecycle test failed:", error);
  process.exitCode = 1;
});
