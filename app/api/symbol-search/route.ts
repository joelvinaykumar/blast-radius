import { z } from "zod";

import {
  SymbolSearchItemSchema,
  SymbolSearchQuerySchema,
  SymbolSearchResponseSchema,
  type SymbolSearchItem,
  type SymbolSearchResponse,
} from "@/lib/api-types";
import { withNeo4jSession } from "@/lib/cognodb";

export const runtime = "nodejs";

type ErrorBody = { error: string; details?: unknown };

type RawSymbolRecord = {
  symbol?: unknown;
  label?: unknown;
  filePath?: unknown;
};

const SYMBOL_SEARCH_LIMIT = 5;

function normalizeSymbolResult(value: unknown): SymbolSearchItem | null {
  const item = value as RawSymbolRecord;
  const parsed = SymbolSearchItemSchema.safeParse({
    symbol: typeof item?.symbol === "string" ? item.symbol : "",
    label: typeof item?.label === "string" ? item.label : "",
    filePath: typeof item?.filePath === "string" ? item.filePath : null,
  });

  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawInput = {
      repoId: url.searchParams.get("repoId") ?? "",
      query: url.searchParams.get("query") ?? "",
    };

    const input = SymbolSearchQuerySchema.parse(rawInput);

    const result = await withNeo4jSession(
      async (session) =>
        session.executeRead((tx) =>
          tx.run(
            `
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
            `,
            {
              repoId: input.repoId,
              query: input.query.trim(),
              limit: SYMBOL_SEARCH_LIMIT,
            },
          ),
        ),
      "READ",
    );

    const results = result.records
      .map((record) => normalizeSymbolResult(record.get("result")))
      .filter((item): item is SymbolSearchItem => item !== null);

    const payload: SymbolSearchResponse = SymbolSearchResponseSchema.parse({
      results,
    });

    return Response.json(payload);
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
