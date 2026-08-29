/**
 * Read-only repository queries against the Neo4j graph.
 *
 * Separated from `ingest-pipeline.ts` (Single Responsibility):
 * the pipeline is responsible for *writing* the graph;
 * this module is responsible for *reading* it.
 */

import type { IngestedRepoSummary } from "./api-types";
import { withNeo4jSession } from "./cognodb";

type Neo4jIntegerLike = {
  toNumber?: () => number;
  low?: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as Neo4jIntegerLike;
    if (typeof candidate.toNumber === "function") {
      return candidate.toNumber();
    }

    if (typeof candidate.low === "number") {
      return candidate.low;
    }
  }

  return 0;
}

export async function listIngestedRepositories(limit = 20): Promise<IngestedRepoSummary[]> {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 200)) : 20;

  const result = await withNeo4jSession(
    async (session) =>
      session.executeRead((tx) =>
        tx.run(
          `
            MATCH (r:Repository)
            OPTIONAL MATCH (r)-[:HAS_FILE]->(f:File)
            WITH r, count(DISTINCT f) AS parsedFiles
            OPTIONAL MATCH (r)-[:HAS_SYMBOL]->(s:Symbol)
            WITH r, parsedFiles, count(DISTINCT s) AS parsedSymbols
            OPTIONAL MATCH (:Symbol {repoId: r.id})-[d:DEPENDS_ON]->(:Symbol)
            WITH r, parsedFiles, parsedSymbols, count(d) AS parsedDependencies
            RETURN
              r.id AS repoId,
              r.url AS repoUrl,
              r.name AS repoName,
              r.branch AS branch,
              r.ingestedAt AS ingestedAt,
              parsedFiles,
              parsedSymbols,
              parsedDependencies
            ORDER BY r.ingestedAt DESC
            LIMIT $limit
          `,
          { limit: normalizedLimit },
        ),
      ),
    "READ",
  );

  return result.records.map((record) => ({
    repoId: String(record.get("repoId")),
    repoUrl: String(record.get("repoUrl")),
    repoName: String(record.get("repoName")),
    branch: String(record.get("branch")),
    ingestedAt: String(record.get("ingestedAt")),
    parsedFiles: toNumber(record.get("parsedFiles")),
    parsedSymbols: toNumber(record.get("parsedSymbols")),
    parsedDependencies: toNumber(record.get("parsedDependencies")),
  }));
}

export async function deleteIngestedRepositoryById(repoId: string): Promise<boolean> {
  const normalizedRepoId = repoId.trim();
  if (!normalizedRepoId) {
    throw new Error("repoId is required");
  }

  const result = await withNeo4jSession(
    async (session) =>
      session.executeWrite((tx) =>
        tx.run(
          `
            OPTIONAL MATCH (r:Repository {id: $repoId})
            WITH r
            CALL {
              WITH r
              OPTIONAL MATCH (f:File {repoId: $repoId})
              DETACH DELETE f
              RETURN count(*) AS deletedFiles
            }
            CALL {
              WITH r
              OPTIONAL MATCH (s:Symbol {repoId: $repoId})
              DETACH DELETE s
              RETURN count(*) AS deletedSymbols
            }
            WITH r
            FOREACH (_ IN CASE WHEN r IS NULL THEN [] ELSE [1] END |
              DETACH DELETE r
            )
            RETURN r IS NOT NULL AS deleted
          `,
          { repoId: normalizedRepoId },
        ),
      ),
  );

  const record = result.records[0];
  if (!record) {
    return false;
  }

  return Boolean(record.get("deleted"));
}
