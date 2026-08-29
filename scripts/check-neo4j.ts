import "dotenv/config";
import { closeNeo4jDriver, verifyNeo4jConnectivity } from "../lib/cognodb";

async function main(): Promise<void> {
  const result = await verifyNeo4jConnectivity();

  if (!result.ok) {
    console.error("❌ Neo4j connectivity check failed:", result.error);
    process.exitCode = 1;
    return;
  }

  console.log("✅ Neo4j connectivity check passed");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Neo4j connectivity check crashed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4jDriver();
  });
