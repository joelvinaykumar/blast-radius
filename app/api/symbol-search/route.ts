import { errorResponse } from "@/lib/api-helpers";
import {
  SymbolSearchItemSchema,
  SymbolSearchQuerySchema,
  SymbolSearchResponseSchema,
  type SymbolSearchItem,
  type SymbolSearchResponse,
} from "@/lib/api-types";
import { withNeo4jSession } from "@/lib/cognodb";
import { SYMBOL_SEARCH_QUERY, buildSymbolSearchParams } from "@/lib/queries";

export const runtime = "nodejs";

type RawSymbolRecord = {
  symbol?: unknown;
  label?: unknown;
  filePath?: unknown;
};

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
    const params = buildSymbolSearchParams(input);

    const result = await withNeo4jSession(
      async (session) =>
        session.executeRead((tx) =>
          tx.run(SYMBOL_SEARCH_QUERY, params),
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
    return errorResponse(error);
  }
}
