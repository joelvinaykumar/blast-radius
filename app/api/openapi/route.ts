import path from "node:path";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

const OPENAPI_FILE_PATH = path.join(process.cwd(), "docs", "api", "openapi.yaml");

export async function GET(): Promise<Response> {
  try {
    const content = await readFile(OPENAPI_FILE_PATH, "utf8");

    return new Response(content, {
      status: 200,
      headers: {
        "content-type": "application/yaml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to load OpenAPI specification",
      },
      { status: 500 },
    );
  }
}
