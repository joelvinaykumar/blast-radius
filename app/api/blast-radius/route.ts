import { z } from "zod";

import {
  BlastEdgeSchema,
  BlastNodeSchema,
  BlastRadiusQuerySchema,
  BlastRadiusResponseSchema,
  type BlastEdge,
  type BlastNode,
  type BlastRadiusResponse,
} from "@/lib/api-types";
import { withNeo4jSession } from "@/lib/cognodb";
import { buildBlastRadiusQuery } from "@/lib/queries";

export const runtime = "nodejs";

type ErrorBody = { error: string; details?: unknown };

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function normalizeNode(value: unknown): BlastNode | null {
  const parsed = BlastNodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeEdge(value: unknown): BlastEdge | null {
  const parsed = BlastEdgeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await parseJson(request);
    const input = BlastRadiusQuerySchema.parse(raw);
    const built = buildBlastRadiusQuery(input);

    const result = await withNeo4jSession(
      async (session) => session.executeRead((tx) => tx.run(built.cypher, built.params)),
      "READ",
    );

    const first = result.records[0];
    if (!first) {
      const emptyPayload: BlastRadiusResponse = {
        nodes: [],
        edges: [],
        impactedFileCount: 0,
        impactedSymbolCount: 0,
      };

      return Response.json(BlastRadiusResponseSchema.parse(emptyPayload));
    }

    const rawNodes = first.get("nodes") as unknown[];
    const rawEdges = first.get("edges") as unknown[];

    const nodes = rawNodes.map(normalizeNode).filter((item): item is BlastNode => item !== null);
    const edges = rawEdges.map(normalizeEdge).filter((item): item is BlastEdge => item !== null);

    const impactedFileCount = new Set(nodes.map((node) => node.filePath).filter((value): value is string => Boolean(value))).size;

    const payload: BlastRadiusResponse = BlastRadiusResponseSchema.parse({
      nodes,
      edges,
      impactedFileCount,
      impactedSymbolCount: nodes.length,
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
