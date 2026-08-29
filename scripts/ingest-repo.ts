import "dotenv/config";
import { closeIngestPipeline, ingestRepository } from "../lib/ingest-pipeline";

async function run(): Promise<void> {
  const repoUrl = process.argv[2];
  const branchArg = process.argv[3];

  if (!repoUrl) {
    throw new Error("Usage: npm run ingest:repo -- <repo-url-or-local-path> [branch]");
  }

  try {
    const result = await ingestRepository(
      { repoUrl, branch: branchArg },
      {
        onStatus(status) {
          if (status === "cloning") {
            console.log("🔄 Cloning repository...");
            return;
          }

          if (status === "parsing") {
            console.log("🧠 Parsing source with ts-morph...");
            return;
          }

          if (status === "writing_graph") {
            console.log("🗄️ Writing graph to Cognodb...");
            return;
          }
        },
      },
    );

    console.log(
      `📦 Parsed ${result.parsedFiles} files, ${result.parsedSymbols} symbols, ${result.parsedDependencies} dependencies`,
    );
    console.log(`✅ Ingestion complete. repoId=${result.repoId}`);
  } finally {
    await closeIngestPipeline();
  }
}

run().catch((error: unknown) => {
  console.error("❌ Ingestion failed:", error);
  process.exitCode = 1;
});
