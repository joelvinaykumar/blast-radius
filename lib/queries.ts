export type BlastRadiusParams = {
  repoId: string;
  symbol: string;
  maxDepth?: number;
};

export type AffectedPagesParams = {
  repoId: string;
  changedFiles: string[];
};

const DEFAULT_MAX_DEPTH = 3;
const MAX_SUPPORTED_DEPTH = 8;

function clampDepth(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_MAX_DEPTH;
  }

  return Math.max(1, Math.min(value, MAX_SUPPORTED_DEPTH));
}

export function buildBlastRadiusQuery(params: BlastRadiusParams): {
  cypher: string;
  params: { repoId: string; symbol: string; maxDepth: number };
} {
  return {
    cypher: `
      MATCH (repo:Repository {id: $repoId})
      MATCH (repo)-[:HAS_SYMBOL]->(seed:Symbol {fqn: $symbol})

      // Forward: what the seed depends on (downstream imports)
      OPTIONAL MATCH fwdPath=(seed)-[:DEPENDS_ON*1..8]->(downstream:Symbol)
      WHERE length(fwdPath) <= $maxDepth
        AND (repo)-[:HAS_SYMBOL]->(downstream)

      // Reverse: what depends on the seed (upstream consumers = blast radius)
      OPTIONAL MATCH revPath=(seed)<-[:DEPENDS_ON*1..8]-(upstream:Symbol)
      WHERE length(revPath) <= $maxDepth
        AND upstream.repoId = $repoId

      WITH seed,
           collect(DISTINCT downstream) AS downstreamNodes,
           collect(DISTINCT upstream)   AS upstreamNodes,
           collect(DISTINCT fwdPath)    AS fwdPaths,
           collect(DISTINCT revPath)    AS revPaths

      WITH [seed] + downstreamNodes + upstreamNodes AS nodes,
           fwdPaths + revPaths AS paths

      UNWIND nodes AS node
      WITH collect(DISTINCT {
        id: coalesce(node.id, elementId(node)),
        label: coalesce(node.name, node.fqn, node.id, elementId(node)),
        kind: coalesce(node.kind, 'symbol'),
        filePath: node.filePath,
        score: null
      }) AS normalizedNodes, paths

      UNWIND paths AS p
      UNWIND relationships(p) AS rel
      WITH normalizedNodes, collect(DISTINCT {
        id: elementId(rel),
        source: coalesce(startNode(rel).id, elementId(startNode(rel))),
        target: coalesce(endNode(rel).id, elementId(endNode(rel))),
        type: type(rel)
      }) AS normalizedEdges

      RETURN normalizedNodes AS nodes, normalizedEdges AS edges
    `,
    params: {
      repoId: params.repoId,
      symbol: params.symbol,
      maxDepth: clampDepth(params.maxDepth),
    },
  };
}

export const AFFECTED_PAGES_QUERY = `
  MATCH (repo:Repository {id: $repoId})
  UNWIND $changedFiles AS changedFile
  MATCH (repo)-[:HAS_FILE]->(changed:File {path: changedFile})
  MATCH (changed)-[:DECLARES]->(changedSymbol:Symbol)

  OPTIONAL MATCH (changedSymbol)<-[:DEPENDS_ON*1..8]-(consumer:Symbol)
  WHERE consumer.repoId = $repoId

  WITH changed, collect(DISTINCT consumer) + collect(DISTINCT changedSymbol) AS allAffected
  UNWIND allAffected AS affected

  MATCH (affectedFile:File)-[:DECLARES]->(affected)
  WHERE affectedFile.repoId = $repoId
    AND (
      (affectedFile.path STARTS WITH 'app/'
       AND affectedFile.path =~ '.*(page|layout|route)\\.(ts|tsx|js|jsx|mts|cts)$')
      OR
      (affectedFile.path =~ '(src/)?routes/.*\\.(ts|tsx|js|jsx|mts|cts)$')
      OR
      (affectedFile.path =~ '(src/)?(main|index|App)\\.(ts|tsx|js|jsx)$')
    )

  WITH affectedFile.path AS filePath,
       collect(DISTINCT changed.path) AS reasons,
       collect(DISTINCT affected.name) AS symbols

  RETURN {
    route: filePath,
    filePath: filePath,
    reasons: reasons,
    symbols: symbols
  } AS page
  ORDER BY page.route ASC
`;

export function buildAffectedPagesParams(params: AffectedPagesParams): {
  repoId: string;
  changedFiles: string[];
} {
  return {
    repoId: params.repoId,
    changedFiles: Array.from(new Set(params.changedFiles.filter(Boolean))),
  };
}

export const SYMBOL_SEARCH_LIMIT = 5;

export const SYMBOL_SEARCH_QUERY = `
  MATCH (repo:Repository {id: $repoId})-[:HAS_SYMBOL]->(symbol:Symbol)
  WITH symbol, toLower($query) AS searchTerm
  WHERE toLower(coalesce(symbol.fqn, symbol.id, symbol.name, "")) CONTAINS searchTerm
     OR toLower(coalesce(symbol.name, "")) CONTAINS searchTerm
     OR toLower(coalesce(symbol.filePath, "")) CONTAINS searchTerm
  RETURN {
    symbol: coalesce(symbol.fqn, symbol.id, symbol.name),
    label: coalesce(symbol.name, '') + CASE WHEN symbol.filePath IS NOT NULL THEN ' / ' + symbol.filePath ELSE '' END,
    filePath: symbol.filePath
  } AS result
  ORDER BY result.symbol ASC
  LIMIT $limit
`;

export function buildSymbolSearchParams(params: {
  repoId: string;
  query: string;
}): { repoId: string; query: string; limit: number } {
  return {
    repoId: params.repoId,
    query: params.query.trim(),
    limit: SYMBOL_SEARCH_LIMIT,
  };
}
