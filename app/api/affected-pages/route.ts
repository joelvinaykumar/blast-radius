import { z } from "zod";

import {
  AffectedPageSchema,
  AffectedPagesQuerySchema,
  AffectedPagesResponseSchema,
  type AffectedPage,
  type AffectedPagesResponse,
} from "@/lib/api-types";
import { withNeo4jSession } from "@/lib/cognodb";
import { AFFECTED_PAGES_QUERY, buildAffectedPagesParams } from "@/lib/queries";

export const runtime = "nodejs";

type ErrorBody = { error: string; details?: unknown };

type RawAffectedPage = {
  route?: unknown;
  filePath?: unknown;
  reasons?: unknown;
  symbols?: unknown;
};

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function normalizeAffectedPage(value: unknown): AffectedPage | null {
  const item = value as RawAffectedPage;
  if (typeof item?.filePath !== "string" || item.filePath.length === 0) {
    return null;
  }

  const reasons = Array.isArray(item?.reasons)
    ? item.reasons.filter((entry): entry is string => typeof entry === "string")
    : [];

  const symbols = Array.isArray(item?.symbols)
    ? item.symbols.filter((entry): entry is string => typeof entry === "string")
    : [];

  const parsed = AffectedPageSchema.safeParse({
    route: typeof item?.route === "string" ? item.route : "",
    filePath: item.filePath,
    reasons,
    symbols,
  });

  return parsed.success ? parsed.data : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await parseJson(request);
    const input = AffectedPagesQuerySchema.parse(raw);
    const params = buildAffectedPagesParams(input);

    const result = await withNeo4jSession(
      async (session) => session.executeRead((tx) => tx.run(AFFECTED_PAGES_QUERY, params)),
      "READ",
    );

    const pages = result.records
      .map((record) => normalizeAffectedPage(record.get("page")))
      .filter((item): item is AffectedPage => item !== null);

    const payload: AffectedPagesResponse = AffectedPagesResponseSchema.parse({ pages });
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
