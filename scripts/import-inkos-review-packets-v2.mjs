import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importFireflyReviewPacketBatch } from "./firefly-review-packet-index-lib.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePaths = process.argv.slice(2).map((path) => resolve(path));
if (sourcePaths.length === 0) {
  console.error("사용법: npm run firefly:import-review-batch -- <packet-v2-v3-v4-or-v5.json> [packet.json ...]");
  process.exit(2);
}

try {
  const receipt = await importFireflyReviewPacketBatch({
    sourcePaths,
    targetDir: resolve(repoRoot, "data/firefly/review-packets"),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
