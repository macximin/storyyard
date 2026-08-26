import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.argv[2] ?? "../inkos/.inkos/exports/storyyard/current.json");
const target = resolve("data/firefly/review-packets/current.json");
const raw = await readFile(source, "utf8");
const packet = JSON.parse(raw);
if (packet.schemaVersion !== "firefly_review_packet/v1" || packet.authority?.reverseSync !== false) {
  throw new Error("Refusing a packet that is not the one-way Firefly review contract.");
}
const { packetSha256, packetId } = packet;
const body = { ...packet };
delete body.schemaVersion;
delete body.packetId;
delete body.packetSha256;
delete body.generatedAt;
const actual = createHash("sha256").update(JSON.stringify(body)).digest("hex");
if (actual !== packetSha256 || packetId !== `frp-${actual.slice(0, 24)}`) {
  throw new Error("Review packet identity or SHA-256 mismatch.");
}
await mkdir(resolve("data/firefly/review-packets"), { recursive: true });
await writeFile(target, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
process.stdout.write(`${target}\n`);
