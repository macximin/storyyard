import { readFile } from "node:fs/promises";
import process from "node:process";

const [receiptPath, endpoint = "https://storyyard-wjjo.macximin11123.chatgpt.site/api/firefly/review-decisions"] = process.argv.slice(2);
if (!receiptPath) {
  console.error("사용법: npm run firefly:ack-review -- <InkOS 적용 영수증.json> [Storyyard API URL]");
  process.exit(2);
}
const token = process.env.STORYYARD_APPLY_TOKEN?.trim();
if (!token) {
  console.error("STORYYARD_APPLY_TOKEN이 필요함.");
  process.exit(2);
}
const target = new URL(endpoint);
if (target.protocol !== "https:") {
  console.error("Storyyard 적용 확인은 HTTPS URL만 허용함.");
  process.exit(2);
}
const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const response = await fetch(target, {
  method: "PATCH",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(receipt),
});
const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
if (!response.ok) {
  console.error(body.error ?? `HTTP ${response.status}`);
  process.exit(1);
}
console.log(JSON.stringify(body, null, 2));
