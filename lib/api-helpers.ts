import { z } from "zod";

export type ErrorBody = { error: string; details?: unknown };

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function errorResponse(error: unknown, fallbackStatus = 500): Response {
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

  return Response.json(body, { status: fallbackStatus });
}
