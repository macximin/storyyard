import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";

const source = resolve(process.argv[2] ?? "../inkos/.inkos/exports/storyyard/current.json");
const target = resolve("data/firefly/review-packets/current.json");
const raw = await readFile(source, "utf8");
const packet = validateFireflyReviewPacket(JSON.parse(raw));
await mkdir(resolve("data/firefly/review-packets"), { recursive: true });
await writeFile(target, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
process.stdout.write(`${target}\n`);
