import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import simpleGit from "simple-git";
import { Project, SourceFile } from "ts-morph";

import type { IngestedRepoSummary } from "./api-types";
import { closeNeo4jDriver, withNeo4jSession } from "./cognodb";

export type IngestJobStatus = "queued" | "cloning" | "parsing" | "writing_graph" | "ready" | "failed";

export type IngestRepoInput = {
  repoUrl: string;
  branch?: string;
  maxRepoBytes?: number;
};

export type IngestRepoResult = {
  repoId: string;
  repoName: string;
  branch: string;
  parsedFiles: number;
  parsedSymbols: number;
  parsedDependencies: number;
};

type Neo4jIntegerLike = {
  toNumber?: () => number;
  low?: number;
};

export type IngestHooks = {
  onStatus?: (status: IngestJobStatus) => void;
};

type FileRow = {
  id: string;
  repoId: string;
  path: string;
};

type SymbolRow = {
  id: string;
  fqn: string;
  name: string;
  kind: string;
  filePath: string | null;
  repoId: string | null;
};

type RepoRow = {
  id: string;
  url: string;
  name: string;
  branch: string;
  isReact: boolean;
  ingestedAt: string;
};

type GraphData = {
  repo: RepoRow;
  files: FileRow[];
  symbols: SymbolRow[];
  declares: Array<{ fileId: string; symbolId: string }>;
  dependsOn: Array<{ fromId: string; toId: string }>;
  hasSymbolIds: string[];
};

const DEFAULT_MAX_REPO_BYTES = 75 * 1024 * 1024;

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function relativePosix(root: string, absolutePath: string): string {
  return toPosixPath(path.relative(root, absolutePath));
}

function buildRepoId(repoUrl: string, branch: string): string {
  return createHash("sha1").update(`${repoUrl}#${branch}`).digest("hex").slice(0, 24);
}

function deriveRepoName(repoUrl: string): string {
  const sanitized = repoUrl.endsWith("/") ? repoUrl.slice(0, -1) : repoUrl;
  const leaf = sanitized.split("/").at(-1) ?? "repo";
  return leaf.endsWith(".git") ? leaf.slice(0, -4) : leaf;
}

function isIgnoredPath(filePath: string): boolean {
  const normalized = toPosixPath(filePath);
  return ["/node_modules/", "/.next/", "/dist/", "/build/", "/coverage/", "/.git/"].some((segment) =>
    normalized.includes(segment),
  );
}

async function cloneRepository(repoUrl: string, branch?: string): Promise<{ tempDir: string; repoDir: string }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "blast-radius-"));
  const repoDir = path.join(tempDir, "repo");

  const cloneArgs = ["--depth", "1"];
  if (branch) {
    cloneArgs.push("--branch", branch);
  }

  await simpleGit().clone(repoUrl, repoDir, cloneArgs);
  return { tempDir, repoDir };
}

async function detectCurrentBranch(repoDir: string): Promise<string> {
  const branch = await simpleGit(repoDir).revparse(["--abbrev-ref", "HEAD"]);
  return branch.trim();
}

async function isReactRepository(repoDir: string): Promise<boolean> {
  const packageJsonPath = path.join(repoDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  const raw = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  const deps = {
    ...(parsed.dependencies ?? {}),
    ...(parsed.devDependencies ?? {}),
    ...(parsed.peerDependencies ?? {}),
  };

  return Boolean(deps.react || deps["react-dom"] || deps.next);
}

async function calculateDirectorySizeBytes(rootDir: string): Promise<number> {
  let total = 0;
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        const details = await stat(fullPath);
        total += details.size;
      }
    }
  }

  return total;
}

function collectDeclarationSymbols(sourceFile: SourceFile): Array<{ name: string; kind: string }> {
  const output = new Map<string, { name: string; kind: string }>();

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (name) {
      output.set(`function:${name}`, { name, kind: "function" });
    }
  }

  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (name) {
      output.set(`class:${name}`, { name, kind: "class" });
    }
  }

  for (const intf of sourceFile.getInterfaces()) {
    const name = intf.getName();
    if (name) {
      output.set(`interface:${name}`, { name, kind: "interface" });
    }
  }

  for (const enm of sourceFile.getEnums()) {
    const name = enm.getName();
    if (name) {
      output.set(`enum:${name}`, { name, kind: "enum" });
    }
  }

  for (const alias of sourceFile.getTypeAliases()) {
    const name = alias.getName();
    if (name) {
      output.set(`type:${name}`, { name, kind: "type" });
    }
  }

  for (const variableStatement of sourceFile.getVariableStatements()) {
    for (const declaration of variableStatement.getDeclarations()) {
      const name = declaration.getName();
      if (name) {
        output.set(`variable:${name}`, { name, kind: "variable" });
      }
    }
  }

  return [...output.values()];
}

function addSymbol(symbolMap: Map<string, SymbolRow>, symbol: SymbolRow): void {
  if (!symbolMap.has(symbol.id)) {
    symbolMap.set(symbol.id, symbol);
  }
}

function addDependsOnEdge(
  edgeSet: Set<string>,
  edges: Array<{ fromId: string; toId: string }>,
  fromId: string,
  toId: string,
): void {
  const key = `${fromId}->${toId}`;
  if (!edgeSet.has(key)) {
    edgeSet.add(key);
    edges.push({ fromId, toId });
  }
}

function addDeclareEdge(
  edgeSet: Set<string>,
  edges: Array<{ fileId: string; symbolId: string }>,
  fileId: string,
  symbolId: string,
): void {
  const key = `${fileId}->${symbolId}`;
  if (!edgeSet.has(key)) {
    edgeSet.add(key);
    edges.push({ fileId, symbolId });
  }
}

async function parseRepositoryGraph(repoDir: string, repo: RepoRow): Promise<GraphData> {
  // Try to load tsconfig.json so path aliases (@/, ~/, etc.) are resolved correctly.
  const tsconfigPath = path.join(repoDir, "tsconfig.json");
  const hasTsconfig = existsSync(tsconfigPath);

  const project = new Project({
    tsConfigFilePath: hasTsconfig ? tsconfigPath : undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
    },
  });

  project.addSourceFilesAtPaths([
    path.join(repoDir, "**/*.{ts,tsx,js,jsx,mts,cts}"),
    `!${path.join(repoDir, "**/node_modules/**")}`,
    `!${path.join(repoDir, "**/.next/**")}`,
    `!${path.join(repoDir, "**/dist/**")}`,
    `!${path.join(repoDir, "**/build/**")}`,
    `!${path.join(repoDir, "**/coverage/**")}`,
  ]);

  const sourceFiles = project.getSourceFiles().filter((file) => !isIgnoredPath(file.getFilePath()));

  const files: FileRow[] = [];
  const symbols = new Map<string, SymbolRow>();
  const declares: Array<{ fileId: string; symbolId: string }> = [];
  const declareEdgeSet = new Set<string>();
  const dependsOn: Array<{ fromId: string; toId: string }> = [];
  const dependsOnEdgeSet = new Set<string>();

  for (const sourceFile of sourceFiles) {
    const absolutePath = sourceFile.getFilePath();
    const relPath = relativePosix(repoDir, absolutePath);
    if (!relPath || relPath.startsWith("..")) {
      continue;
    }

    const fileId = `${repo.id}:${relPath}`;
    files.push({ id: fileId, repoId: repo.id, path: relPath });

    const moduleSymbolId = `${fileId}#module`;
    addSymbol(symbols, {
      id: moduleSymbolId,
      fqn: moduleSymbolId,
      name: path.basename(relPath),
      kind: "module",
      filePath: relPath,
      repoId: repo.id,
    });

    addDeclareEdge(declareEdgeSet, declares, fileId, moduleSymbolId);

    const localSymbolIds: string[] = [moduleSymbolId];

    for (const declaration of collectDeclarationSymbols(sourceFile)) {
      const symbolId = `${fileId}#${declaration.name}`;
      addSymbol(symbols, {
        id: symbolId,
        fqn: symbolId,
        name: declaration.name,
        kind: declaration.kind,
        filePath: relPath,
        repoId: repo.id,
      });
      addDeclareEdge(declareEdgeSet, declares, fileId, symbolId);
      localSymbolIds.push(symbolId);
    }

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      // Always try to resolve via ts-morph first — this handles relative imports,
      // path aliases (@/, ~/, #/), and tsconfig paths automatically.
      const targetSourceFile = importDeclaration.getModuleSpecifierSourceFile();

      if (!targetSourceFile) {
        // Unresolved or external npm package — skip entirely
        continue;
      }

      const targetAbsolute = path.resolve(targetSourceFile.getFilePath());
      const targetRelPath = relativePosix(repoDir, targetAbsolute);
      if (!targetRelPath || targetRelPath.startsWith("..") || isIgnoredPath(targetAbsolute)) {
        // Resolved to node_modules or outside repo — skip
        continue;
      }

      const targetFileId = `${repo.id}:${targetRelPath}`;
      const targetSymbolId = `${targetFileId}#module`;

      addSymbol(symbols, {
        id: targetSymbolId,
        fqn: targetSymbolId,
        name: path.basename(targetRelPath),
        kind: "module",
        filePath: targetRelPath,
        repoId: repo.id,
      });

      for (const localSymbolId of localSymbolIds) {
        addDependsOnEdge(dependsOnEdgeSet, dependsOn, localSymbolId, targetSymbolId);
      }
    }
  }

  return {
    repo,
    files,
    symbols: [...symbols.values()],
    declares,
    dependsOn,
    hasSymbolIds: [...symbols.keys()],
  };
}

async function ensureConstraints(): Promise<void> {
  await withNeo4jSession(async (session) => {
    await session.executeWrite((tx) =>
      tx.run("CREATE CONSTRAINT repository_id_unique IF NOT EXISTS FOR (r:Repository) REQUIRE r.id IS UNIQUE"),
    );
    await session.executeWrite((tx) =>
      tx.run("CREATE CONSTRAINT file_id_unique IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE"),
    );
    await session.executeWrite((tx) =>
      tx.run("CREATE CONSTRAINT symbol_id_unique IF NOT EXISTS FOR (s:Symbol) REQUIRE s.id IS UNIQUE"),
    );
  });
}

async function writeGraph(data: GraphData): Promise<void> {
  await withNeo4jSession(async (session) => {
    await session.executeWrite((tx) =>
      tx.run(
        `
          MATCH (f:File {repoId: $repoId})
          DETACH DELETE f
        `,
        { repoId: data.repo.id },
      ),
    );

    await session.executeWrite((tx) =>
      tx.run(
        `
          MATCH (s:Symbol {repoId: $repoId})
          DETACH DELETE s
        `,
        { repoId: data.repo.id },
      ),
    );

    await session.executeWrite((tx) =>
      tx.run(
        `
          MATCH (r:Repository {id: $repoId})
          DETACH DELETE r
        `,
        { repoId: data.repo.id },
      ),
    );

    await session.executeWrite((tx) =>
      tx.run(
        `
          MERGE (r:Repository {id: $id})
          SET r.url = $url,
              r.name = $name,
              r.branch = $branch,
              r.isReact = $isReact,
              r.ingestedAt = $ingestedAt
        `,
        data.repo,
      ),
    );

    if (data.files.length > 0) {
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $rows AS row
            MERGE (f:File {id: row.id})
            SET f.repoId = row.repoId,
                f.path = row.path
            WITH f, row
            MATCH (r:Repository {id: row.repoId})
            MERGE (r)-[:HAS_FILE]->(f)
          `,
          { rows: data.files },
        ),
      );
    }

    if (data.symbols.length > 0) {
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $rows AS row
            MERGE (s:Symbol {id: row.id})
            SET s.fqn = row.fqn,
                s.name = row.name,
                s.kind = row.kind,
                s.filePath = row.filePath,
                s.repoId = row.repoId
          `,
          { rows: data.symbols },
        ),
      );
    }

    if (data.declares.length > 0) {
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $rows AS row
            MATCH (f:File {id: row.fileId})
            MATCH (s:Symbol {id: row.symbolId})
            MERGE (f)-[:DECLARES]->(s)
          `,
          { rows: data.declares },
        ),
      );
    }

    if (data.dependsOn.length > 0) {
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $rows AS row
            MATCH (from:Symbol {id: row.fromId})
            MATCH (to:Symbol {id: row.toId})
            MERGE (from)-[:DEPENDS_ON]->(to)
          `,
          { rows: data.dependsOn },
        ),
      );
    }

    if (data.hasSymbolIds.length > 0) {
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $symbolIds AS symbolId
            MATCH (r:Repository {id: $repoId})
            MATCH (s:Symbol {id: symbolId})
            MERGE (r)-[:HAS_SYMBOL]->(s)
          `,
          { repoId: data.repo.id, symbolIds: data.hasSymbolIds },
        ),
      );
    }
  });
}

function resolveMaxRepoBytes(inputBytes?: number): number {
  if (typeof inputBytes === "number" && Number.isFinite(inputBytes) && inputBytes > 0) {
    return inputBytes;
  }

  const fromEnv = Number(process.env.BLAST_RADIUS_MAX_REPO_BYTES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return DEFAULT_MAX_REPO_BYTES;
}

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

export async function getCachedIngestResult(input: {
  repoUrl: string;
  branch?: string;
}): Promise<IngestRepoResult | null> {
  const result = await withNeo4jSession(
    async (session) =>
      session.executeRead((tx) =>
        tx.run(
          `
            MATCH (r:Repository {url: $repoUrl})
            WHERE $branch IS NULL OR r.branch = $branch
            OPTIONAL MATCH (r)-[:HAS_FILE]->(f:File)
            WITH r, count(DISTINCT f) AS parsedFiles
            OPTIONAL MATCH (r)-[:HAS_SYMBOL]->(s:Symbol)
            WITH r, parsedFiles, count(DISTINCT s) AS parsedSymbols
            OPTIONAL MATCH (:Symbol {repoId: r.id})-[d:DEPENDS_ON]->(:Symbol)
            WITH r, parsedFiles, parsedSymbols, count(d) AS parsedDependencies
            RETURN
              r.id AS repoId,
              r.name AS repoName,
              r.branch AS branch,
              parsedFiles,
              parsedSymbols,
              parsedDependencies
            ORDER BY r.ingestedAt DESC
            LIMIT 1
          `,
          {
            repoUrl: input.repoUrl,
            branch: input.branch ?? null,
          },
        ),
      ),
    "READ",
  );

  const record = result.records[0];
  if (!record) {
    return null;
  }

  return {
    repoId: String(record.get("repoId")),
    repoName: String(record.get("repoName")),
    branch: String(record.get("branch")),
    parsedFiles: toNumber(record.get("parsedFiles")),
    parsedSymbols: toNumber(record.get("parsedSymbols")),
    parsedDependencies: toNumber(record.get("parsedDependencies")),
  };
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

export async function ingestRepository(input: IngestRepoInput, hooks: IngestHooks = {}): Promise<IngestRepoResult> {
  hooks.onStatus?.("cloning");
  const { tempDir, repoDir } = await cloneRepository(input.repoUrl, input.branch);

  try {
    const maxRepoBytes = resolveMaxRepoBytes(input.maxRepoBytes);
    const repoBytes = await calculateDirectorySizeBytes(repoDir);
    if (repoBytes > maxRepoBytes) {
      throw new Error(`Repository size ${repoBytes} bytes exceeds limit ${maxRepoBytes} bytes`);
    }

    const branch = input.branch ?? (await detectCurrentBranch(repoDir));
    const repoId = buildRepoId(input.repoUrl, branch);
    const isReact = await isReactRepository(repoDir);

    if (!isReact) {
      throw new Error("Repository does not appear to be a React/Next.js project (react/react-dom/next dependency missing)");
    }

    const repo: RepoRow = {
      id: repoId,
      url: input.repoUrl,
      name: deriveRepoName(input.repoUrl),
      branch,
      isReact,
      ingestedAt: new Date().toISOString(),
    };

    hooks.onStatus?.("parsing");
    const graphData = await parseRepositoryGraph(repoDir, repo);

    hooks.onStatus?.("writing_graph");
    await ensureConstraints();
    await writeGraph(graphData);

    hooks.onStatus?.("ready");

    return {
      repoId,
      repoName: repo.name,
      branch,
      parsedFiles: graphData.files.length,
      parsedSymbols: graphData.symbols.length,
      parsedDependencies: graphData.dependsOn.length,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function closeIngestPipeline(): Promise<void> {
  await closeNeo4jDriver();
}
