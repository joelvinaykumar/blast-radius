import { errorResponse, parseJsonBody } from "@/lib/api-helpers";
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
    const raw = await parseJsonBody(request);
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
    return errorResponse(error);
  }
}
