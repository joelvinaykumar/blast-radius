import neo4j, { Driver, Session, SessionMode } from "neo4j-driver";
import { z } from "zod";

const Neo4jEnvSchema = z.object({
  COGNODB_URI: z.string().url(),
  COGNODB_USER: z.string().min(1, "COGNODB_USER is required"),
  COGNODB_PASSWORD: z.string().min(1, "COGNODB_PASSWORD is required"),
  COGNODB_DATABASE: z.string().min(1).default("neo4j"),
});

type Neo4jEnv = z.infer<typeof Neo4jEnvSchema>;

declare global {
  var __blastRadiusNeo4jDriver: Driver | undefined;
}

let cachedEnv: Neo4jEnv | null = null;

function getNeo4jEnv(): Neo4jEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = Neo4jEnvSchema.safeParse({
    COGNODB_URI: process.env.COGNODB_URI ?? process.env.NEO4J_URI,
    COGNODB_USER: process.env.COGNODB_USER ?? process.env.NEO4J_USERNAME ?? "neo4j",
    COGNODB_PASSWORD: process.env.COGNODB_PASSWORD ?? process.env.NEO4J_PASSWORD,
    COGNODB_DATABASE: process.env.COGNODB_DATABASE ?? process.env.NEO4J_DATABASE ?? "neo4j",
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid Neo4j environment configuration: ${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getNeo4jDriver(): Driver {
  if (globalThis.__blastRadiusNeo4jDriver) {
    return globalThis.__blastRadiusNeo4jDriver;
  }

  const env = getNeo4jEnv();
  const driver = neo4j.driver(
    env.COGNODB_URI,
    neo4j.auth.basic(env.COGNODB_USER, env.COGNODB_PASSWORD),
  );

  globalThis.__blastRadiusNeo4jDriver = driver;
  return driver;
}

export async function withNeo4jSession<T>(
  work: (session: Session) => Promise<T>,
  mode: SessionMode = "WRITE",
): Promise<T> {
  const env = getNeo4jEnv();
  const driver = getNeo4jDriver();
  const session = driver.session({ database: env.COGNODB_DATABASE, defaultAccessMode: mode });

  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

export async function verifyNeo4jConnectivity(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Neo4j connectivity error",
    };
  }
}

export function getCognodbConfig(): Pick<Neo4jEnv, "COGNODB_URI" | "COGNODB_USER" | "COGNODB_DATABASE"> {
  const env = getNeo4jEnv();
  return {
    COGNODB_URI: env.COGNODB_URI,
    COGNODB_USER: env.COGNODB_USER,
    COGNODB_DATABASE: env.COGNODB_DATABASE,
  };
}

export async function closeNeo4jDriver(): Promise<void> {
  if (!globalThis.__blastRadiusNeo4jDriver) {
    return;
  }

  await globalThis.__blastRadiusNeo4jDriver.close();
  globalThis.__blastRadiusNeo4jDriver = undefined;
}
