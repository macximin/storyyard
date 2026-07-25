import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const storyyardRoot = process.cwd();
const foundryRoot = process.env.FOUNDRY_ROOT
  ? path.resolve(process.env.FOUNDRY_ROOT)
  : path.resolve(storyyardRoot, "../company_firefly_studio/edge_repos/company_ff_foundry");
const workSlug = process.env.WORK_SLUG || "afterlife_restaurant";
const allowWorkingTree = process.env.CANON_ALLOW_WORKTREE === "1";
const workRoot = path.join(foundryRoot, "40_works", workSlug);
const outputPath = path.join(storyyardRoot, "data", "canon", `${workSlug}.json`);
const foundryWorkPath = `40_works/${workSlug}`;
const manifestRelativePath = `${foundryWorkPath}/04_manuscript/manifest.yaml`;

const definitions = [
  ["status", "운영 상태", "status", "00_status.md", "work_status"],
  ["frozen_pitch", "Frozen Pitch", "pitch", "01_pitch/pitch.md", "owner_approved"],
  ["living_spine", "Living Spine", "story_plan", "02_story/living_spine.md", "owner_approved"],
  ["a_rail", "A-Rail · 장기 앵커", "story_plan", "02_story/anchor_rail.md", "owner_approved"],
  ["b_rail", "B-Rail · 1~5화 아크 경로", "story_plan", "02_story/arc_route_rail.md", "owner_approved"],
  ["rolling_corridor", "Rolling Corridor", "story_plan", "02_story/rolling_corridor.md", "owner_approved"],
  ["ep001", "1화 승인 원고", "manuscript", "04_manuscript/ep001_manuscript.md", "owner_approved"],
  ["ep002", "2화 승인 원고", "manuscript", "04_manuscript/ep002_manuscript.md", "owner_approved"],
  ["ep003", "3화 승인 원고", "manuscript", "04_manuscript/ep003_manuscript.md", "owner_approved"],
  ["adoption_review", "1~3화 승격 영수증", "review", "05_review/ep001-003_adoption_review.md", "owner_approved"],
  ["narrative_state", "Narrative State", "state", "08_state/narrative_state.yaml", "derived_projection"],
];
const committedEpisodeBets = ["ep001", "ep002", "ep003"].map((episode) => ({
  episode,
  relativePath: `03_episode_bet/${episode}_episode_bet.md`,
}));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args) {
  return execFileSync("git", ["-C", foundryRoot, ...args], { encoding: "utf8" }).trim();
}

function yamlScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function indentedYamlScalar(source, key, spaces = 2) {
  const match = source.match(new RegExp(`^\\s{${spaces}}${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function parseManifestEntries(source) {
  return source.split("\n").flatMap((line) => {
    const match = line.match(/^  - \{ (.+) \}$/);
    if (!match) return [];
    return [Object.fromEntries(match[1].split(", ").map((field) => {
      const separator = field.indexOf(": ");
      return [field.slice(0, separator), field.slice(separator + 2).replace(/^["']|["']$/g, "")];
    }))];
  });
}

function parseStatus(source) {
  return {
    workflowSchema: yamlScalar(source, "workflow_schema"),
    title: yamlScalar(source, "title"),
    productionStage: yamlScalar(source, "production_stage"),
    currentEpisode: yamlScalar(source, "current_episode"),
    currentBArc: yamlScalar(source, "current_b_arc"),
    manuscriptThrough: yamlScalar(source, "manuscript_through"),
    approvedThrough: yamlScalar(source, "approved_through"),
    reviewedThrough: yamlScalar(source, "reviewed_through"),
    stateThrough: yamlScalar(source, "state_through"),
    nextAction: yamlScalar(source, "next_action"),
    updatedAt: yamlScalar(source, "updated_at"),
  };
}

function parseAnchors(source) {
  return source
    .split(/^## 앵커별 구조 상승$/m)[0]
    .split("\n")
    .filter((line) => /^\|\s*A\d{2}\s/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        id: cells[0]?.match(/^A\d{2}/)?.[0] ?? "",
        label: cells[0] ?? "",
        status: cells[1] ?? "",
        trigger: cells[3] ?? "",
        irreversibleExchange: cells[4] ?? "",
        nextPressure: cells[7] ?? "",
      };
    });
}

function parseBRail(source) {
  const slotsSource = source.split(/^slots:\s*$/m)[1] ?? "";
  const chunks = slotsSource.split(/\n(?=\s{2}- b_id:)/);
  return chunks.flatMap((chunk) => {
    const id = chunk.match(/^\s{2}- b_id:\s*(B\d+)/m)?.[1];
    if (!id) return [];
    const get = (key) => chunk
      .match(new RegExp(`^\\s{4}${key}:\\s*(.+)$`, "m"))?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
    return [{
      id,
      order: Number(get("route_order")) || 0,
      status: get("status"),
      targetAnchor: get("target_anchor"),
      narrativeFunction: get("narrative_function"),
      payoffAxis: get("payoff_axis"),
      readerDebt: get("carried_reader_debt"),
      contrast: get("contrast_requirement"),
      startEpisode: get("start_episode"),
      endEpisode: get("end_episode"),
    }];
  });
}

function episodeNumber(value) {
  return Number(value.replace(/^ep/, "")) || 0;
}

function compactArcTitle(bArc) {
  const summary = bArc.narrativeFunction.replace(/[.。]\s*$/, "").trim();
  const leadingPhrase = summary.split(/으로|[를을] 통해|하고/)[0]?.trim() ?? "";
  const candidate = leadingPhrase.length >= 6 ? leadingPhrase : summary;
  const compact = candidate.length > 26 ? `${candidate.slice(0, 26).trim()}…` : candidate;
  return `${bArc.id} · ${compact}`;
}

function episodeArcId(episode, bArcs) {
  const number = episodeNumber(episode);
  return bArcs.find((bArc) => {
    const start = episodeNumber(bArc.startEpisode);
    const end = episodeNumber(bArc.endEpisode);
    return start > 0 && end >= start && number >= start && number <= end;
  })?.id ?? "";
}

function parseProvisionalEpisodes(source) {
  const currentBArc = source.match(/current_b_arc:\s*\n\s+b_id:\s*(B\d+)/m)?.[1] ?? "";
  const hypothesisSource = source
    .split(/^## 현재 B 회차 가설\s*$/m)[1]
    ?.split(/^## 회차 가치 순환\s*$/m)[0]
    ?.trim() ?? "";
  if (!currentBArc || !hypothesisSource) return [];
  return hypothesisSource.split(/\n(?=###\s+ep\d+\s+—\s+)/).flatMap((chunk) => {
    const match = chunk.match(/^###\s+(ep\d+)\s+—\s+(.+)\n+([\s\S]+)$/);
    if (!match) return [];
    const [, episode, title, body] = match;
    const normalizedBody = body.trim();
    return [{
      episode,
      bId: currentBArc,
      title: `${episode} · ${title.trim()}`,
      body: normalizedBody,
      status: "provisional",
      authority: "owner_approved_story_plan_hypothesis",
      sourcePath: `${foundryWorkPath}/02_story/rolling_corridor.md#${episode}`,
      sourceSha256: sha256(`${title.trim()}\n${normalizedBody}`),
      sortOrder: episodeNumber(episode) * 100,
    }];
  });
}

const sourcePaths = [
  ...definitions.map(([, , , relativePath]) => `${foundryWorkPath}/${relativePath}`),
  ...committedEpisodeBets.map(({ relativePath }) => `${foundryWorkPath}/${relativePath}`),
  manifestRelativePath,
];
const sourceGitCommit = git("rev-parse", "HEAD");
let sourceState = "committed";
try {
  git("ls-files", "--error-unmatch", "--", ...sourcePaths);
} catch {
  if (!allowWorkingTree) {
    throw new Error("Canon export refused: every included Foundry source must be tracked by Git.");
  }
  sourceState = "working_tree";
}
const sourceStatus = git("status", "--porcelain", "--untracked-files=all", "--", ...sourcePaths);
if (sourceStatus) {
  if (!allowWorkingTree) {
    throw new Error(`Canon export refused: included Foundry sources have uncommitted changes.\n${sourceStatus}`);
  }
  sourceState = "working_tree";
}

const artifactRows = await Promise.all(definitions.map(async ([key, label, kind, relativePath, authority]) => {
  const body = await readFile(path.join(workRoot, relativePath), "utf8");
  return {
    key,
    label,
    kind,
    authority,
    sourcePath: `40_works/${workSlug}/${relativePath}`,
    sha256: sha256(body),
    body,
  };
}));
const artifactByKey = Object.fromEntries(artifactRows.map((artifact) => [artifact.key, artifact]));
const episodeBetRows = await Promise.all(committedEpisodeBets.map(async ({ episode, relativePath }) => {
  const body = await readFile(path.join(workRoot, relativePath), "utf8");
  return {
    episode,
    relativePath,
    body,
    sourceSha256: sha256(body),
  };
}));
const manifest = await readFile(path.join(workRoot, "04_manuscript/manifest.yaml"), "utf8");
const status = parseStatus(artifactByKey.status.body);
const adoptionReceipt = artifactByKey.adoption_review.body;
const adoptionDecisionId = yamlScalar(adoptionReceipt, "decision_id");
const exactManuscriptRevision = indentedYamlScalar(adoptionReceipt, "exact_manuscript_revision");
if (
  !adoptionDecisionId
  || indentedYamlScalar(adoptionReceipt, "frozen_pitch") !== "approved"
  || indentedYamlScalar(adoptionReceipt, "story_plan") !== "approved"
  || !exactManuscriptRevision
) {
  throw new Error("Canon export refused: owner adoption receipt does not approve the pitch, Story Plan, and exact manuscript revision.");
}
if (!artifactByKey.status.body.includes(`  - ${adoptionDecisionId}`)) {
  throw new Error(`Canon export refused: status does not reference owner decision ${adoptionDecisionId}.`);
}

const expectedEpisodes = ["ep001", "ep002", "ep003"];
const manifestEntries = parseManifestEntries(manifest);
if (
  manifestEntries.length !== expectedEpisodes.length
  || manifestEntries.some((entry, index) => entry.episode !== expectedEpisodes[index])
) {
  throw new Error("Canon export refused: manuscript manifest must contain ep001~ep003 in canonical order.");
}

for (const entry of manifestEntries) {
  const artifact = artifactByKey[entry.episode];
  if (!artifact || entry.sha256 !== artifact.sha256) {
    throw new Error(`${entry.episode} canonical hash mismatch: expected ${entry.sha256}, got ${artifact?.sha256}`);
  }
  if (entry.authority !== "owner_approved" || entry.owner_decision !== adoptionDecisionId) {
    throw new Error(`Canon export refused: ${entry.episode} is not tied to owner decision ${adoptionDecisionId}.`);
  }
  if (!adoptionReceipt.includes(`| ${entry.episode} | \`${entry.sha256}\``)) {
    throw new Error(`Canon export refused: adoption receipt does not attest ${entry.episode} hash ${entry.sha256}.`);
  }
}

const declaredRevisionSet = yamlScalar(manifest, "revision_set_sha256");
const computedRevisionSet = sha256(manifestEntries.map(
  (entry) => `${entry.sha256}  ${foundryWorkPath}/04_manuscript/${entry.repo_snapshot}\n`,
).join(""));
if (computedRevisionSet !== declaredRevisionSet) {
  throw new Error(`Canon revision-set mismatch: expected ${declaredRevisionSet}, got ${computedRevisionSet}.`);
}
if (!adoptionReceipt.includes(`승인 revision-set SHA-256: \`${declaredRevisionSet}\``)) {
  throw new Error("Canon export refused: adoption receipt does not attest the manifest revision set.");
}

const anchors = parseAnchors(artifactByKey.a_rail.body);
const bArcs = parseBRail(artifactByKey.b_rail.body);
const projectedArcs = bArcs
  .filter((bArc) => ["closed", "active", "provisional"].includes(bArc.status))
  .map((bArc) => ({
    bId: bArc.id,
    routeOrder: bArc.order,
    status: bArc.status,
    targetAnchor: bArc.targetAnchor,
    title: compactArcTitle(bArc),
    body: [
      `상태: ${bArc.status}`,
      `목표 앵커: ${bArc.targetAnchor}`,
      `서사 기능: ${bArc.narrativeFunction}`,
      `보상 축: ${bArc.payoffAxis}`,
      `이어받은 독자 부채: ${bArc.readerDebt}`,
      `대비 조건: ${bArc.contrast}`,
    ].join("\n"),
    sourceSha256: sha256(JSON.stringify(bArc)),
  }));
const committedBlocks = episodeBetRows.map((row) => ({
  episode: row.episode,
  bId: episodeArcId(row.episode, bArcs),
  title: `${row.episode} · 화별 약속`,
  body: row.body,
  status: "committed",
  authority: "owner_approved",
  sourcePath: `${foundryWorkPath}/${row.relativePath}`,
  sourceSha256: row.sourceSha256,
  sortOrder: episodeNumber(row.episode) * 100,
}));
if (committedBlocks.some((block) => !block.bId)) {
  throw new Error("Canon export refused: every committed Episode Bet must belong to a closed B-Rail arc.");
}
const provisionalBlocks = parseProvisionalEpisodes(artifactByKey.rolling_corridor.body);

const packageWithoutHash = {
  schemaVersion: "firefly_story_package_v1",
  workSlug,
  title: status.title,
  workflowSchema: status.workflowSchema,
  sourcePath: `40_works/${workSlug}`,
  sourceGitCommit,
  sourceState,
  sourceUpdatedAt: status.updatedAt,
  revisionSetSha256: declaredRevisionSet,
  scope: {
    includes: ["Frozen Pitch", "Story Plan 4 surfaces", "owner-approved ep001~ep003", "adoption review", "Narrative State"],
    excludes: ["30_materials", "unapproved ep004+", "automatic Foundry mutation"],
  },
  status,
  anchors,
  bArcs,
  storyyardProjection: {
    mappingVersion: "foundry_storyyard_arc_episode_v1",
    arcUnit: "b_rail_arc",
    blockUnit: "episode",
    reverseSync: false,
    arcs: projectedArcs,
    episodeBlocks: [...committedBlocks, ...provisionalBlocks],
  },
  artifacts: artifactRows,
};
const output = {
  ...packageWithoutHash,
  bundleSha256: sha256(JSON.stringify(packageWithoutHash)),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(storyyardRoot, outputPath)}`);
console.log(`bundle_sha256=${output.bundleSha256}`);
console.log(`source_state=${output.sourceState}`);
console.log(`artifacts=${output.artifacts.length}, b_arcs=${output.bArcs.length}, anchors=${output.anchors.length}`);
