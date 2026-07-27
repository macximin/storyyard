import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse as parseYaml } from "yaml";

const storyyardRoot = process.cwd();
const foundryRoot = process.env.FOUNDRY_ROOT
  ? path.resolve(process.env.FOUNDRY_ROOT)
  : path.resolve(storyyardRoot, "../v3_firefly_studio/edge_repos/v3_ff_foundry");
const workSlug = process.env.WORK_SLUG || "afterlife_restaurant";
const allowWorkingTree = process.env.CANON_ALLOW_WORKTREE === "1";
const workRoot = path.join(foundryRoot, "40_works", workSlug);
const outputPath = path.join(storyyardRoot, "data", "canon", `${workSlug}.json`);
const foundryWorkPath = `40_works/${workSlug}`;
const manifestRelativePath = `${foundryWorkPath}/04_manuscript/manifest.yaml`;
const approvedOpeningHistoryId = "APPROVED_OPENING_HISTORY";

const manuscriptDefinitions = workSlug === "afterlife_restaurant"
  ? [
      ["ep001", "1화 승인 원고", "manuscript", "04_manuscript/ep001_v2_manuscript.md", "owner_approved"],
      ["ep002", "2화 승인 원고", "manuscript", "04_manuscript/ep002_v2_manuscript.md", "owner_approved"],
      ["ep003", "3화 승인 원고", "manuscript", "04_manuscript/ep003_v3_manuscript.md", "owner_approved"],
      ["ep004", "4화 승인 원고", "manuscript", "04_manuscript/ep004_manuscript.md", "owner_approved"],
    ]
  : [
      ["ep001", "1화 승인 원고", "manuscript", "04_manuscript/ep001_manuscript.md", "owner_approved"],
      ["ep002", "2화 승인 원고", "manuscript", "04_manuscript/ep002_manuscript.md", "owner_approved"],
      ["ep003", "3화 승인 원고", "manuscript", "04_manuscript/ep003_manuscript.md", "owner_approved"],
    ];
const adoptionReviewDefinition = workSlug === "afterlife_restaurant"
  ? ["adoption_review", "1~4화 승격 영수증", "review", "05_review/ep001-004_owner_direct_adoption_20260727.md", "owner_approved"]
  : ["adoption_review", "1~3화 승격 영수증", "review", "05_review/ep001-003_adoption_review.md", "owner_approved"];
const definitions = [
  ["status", "운영 상태", "status", "00_status.md", "work_status"],
  ["frozen_pitch", "Frozen Pitch", "pitch", "01_pitch/pitch.md", "owner_approved"],
  ["living_spine", "Living Spine", "story_plan", "02_story/living_spine.md", "owner_approved"],
  ["a_rail", "A-Rail · 장기 앵커", "story_plan", "02_story/anchor_rail.md", "owner_approved"],
  ["b_rail", "B-Rail · 1~5화 아크 경로", "story_plan", "02_story/arc_route_rail.md", "owner_approved"],
  ["rolling_corridor", "Rolling Corridor", "story_plan", "02_story/rolling_corridor.md", "owner_approved"],
  ...manuscriptDefinitions,
  adoptionReviewDefinition,
  ["narrative_state", "Narrative State", "state", "08_state/narrative_state.yaml", "derived_projection"],
];
const committedEpisodeIds = workSlug === "afterlife_restaurant"
  ? ["ep001", "ep002", "ep003", "ep004"]
  : ["ep001", "ep002", "ep003"];
const committedEpisodeBets = committedEpisodeIds.map((episode) => ({
  episode,
  relativePath: `03_episode_bet/${episode}_episode_bet.md`,
}));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const match = line.match(/^  - \{ (.+) \}\r?$/);
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
    ownerId: yamlScalar(source, "owner_id"),
    ownershipScope: yamlScalar(source, "ownership_scope"),
    productionSystem: yamlScalar(source, "production_system"),
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

function pitchLogline(source) {
  return source
    .split(/^## 한 줄\s*$/m)[1]
    ?.split(/^## /m)[0]
    ?.trim() ?? "";
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, child]) => `${key}: ${displayValue(child)}`)
      .join(", ");
  }
  if (value === null || value === undefined) return "미공개";
  return String(value);
}

function buildWorkspaceProjection({ status, artifacts, revisionSetSha256 }) {
  const artifactByKey = Object.fromEntries(artifacts.map((artifact) => [artifact.key, artifact]));
  const narrativeState = parseYaml(artifactByKey.narrative_state.body);
  const characters = narrativeState?.characters && typeof narrativeState.characters === "object"
    ? Object.entries(narrativeState.characters).map(([entityKey, value], index) => {
      const fields = value && typeof value === "object" ? value : {};
      const record = fields;
      const title = record.name
        ? String(record.name)
        : record.role
          ? displayValue(record.role)
          : entityKey.replaceAll("_", " ");
      const characterFields = Object.entries(record)
        .filter(([key]) => key !== "name")
        .map(([key, child]) => ({
          id: `${entityKey}:${key}`,
          label: key,
          value: displayValue(child),
        }));
      return {
        entityKey,
        title,
        body: characterFields.map((field) => `${field.label}: ${field.value}`).join("\n"),
        tags: [],
        fields: characterFields,
        sortOrder: index,
        sourceSha256: sha256(JSON.stringify(record)),
      };
    })
    : [];
  const manuscripts = artifacts
    .filter((artifact) => artifact.kind === "manuscript")
    .map((artifact, index) => {
      const firstLine = artifact.body.split("\n")[0]?.trim() || `${index + 1}화`;
      return {
        episodeNo: index + 1,
        entityKey: artifact.key,
        title: firstLine,
        body: artifact.body,
        status: "published",
        sourcePath: artifact.sourcePath,
        sourceSha256: artifact.sha256,
      };
    });
  return {
    mappingVersion: "foundry_storyyard_workspace_v1",
    reverseSync: false,
    overview: {
      title: status.title,
      logline: pitchLogline(artifactByKey.frozen_pitch.body),
      sourceSha256: artifactByKey.frozen_pitch.sha256,
    },
    characters,
    manuscripts,
    revisionSetSha256,
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
  const multilineRows = chunks.flatMap((chunk) => {
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
  const inlineRows = slotsSource.split("\n").flatMap((line) => {
    const id = line.match(/^\s{2}- \{\s*b_id:\s*(B\d+)/)?.[1];
    if (!id) return [];
    const get = (key) => line.match(
      new RegExp(`${key}:\\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))`),
    )?.slice(1).find((value) => value !== undefined)?.trim() ?? "";
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
  const tableRows = source.split("\n").flatMap((line) => {
    if (!/^\|\s*B\d{3}\b/.test(line)) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const id = cells[0]?.match(/^B\d{3}/)?.[0] ?? "";
    const compactTable = cells.length === 5;
    const span = compactTable ? cells[1] ?? "" : cells[2] ?? "";
    const compactRange = span.match(/ep(\d+)~(?:ep)?(\d+)/);
    const episodes = compactRange
      ? [`ep${compactRange[1]}`, `ep${compactRange[2]}`]
      : [...span.matchAll(/ep\d+/g)].map((match) => match[0]);
    const rawStatus = (compactTable ? cells[2] : cells[6] ?? "").toLowerCase();
    const status = rawStatus.includes("closed")
      ? "closed"
      : rawStatus.includes("active")
        ? "active"
        : "provisional";
    return [{
      id,
      order: Number(id.replace(/^B/, "")) || 0,
      status,
      targetAnchor: compactTable ? "" : cells[1] ?? "",
      narrativeFunction: cells[3] ?? "",
      payoffAxis: cells[4] ?? "",
      readerDebt: compactTable ? cells[4] ?? "" : cells[5] ?? "",
      contrast: "",
      startEpisode: episodes[0] ?? "",
      endEpisode: episodes[1] ?? episodes[0] ?? "",
    }];
  });
  return multilineRows.length ? multilineRows : inlineRows.length ? inlineRows : tableRows;
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
  const sectionRows = hypothesisSource.split(/\n(?=###\s+ep\d+\s+—\s+)/).flatMap((chunk) => {
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
  if (sectionRows.length) return sectionRows;
  return hypothesisSource.split("\n").flatMap((line) => {
    const match = line.match(/^-\s+(ep\d+):\s+(.+)$/);
    if (!match) return [];
    const [, episode, body] = match;
    const normalizedBody = body.trim();
    return [{
      episode,
      bId: currentBArc,
      title: `${episode} · 회차 가설`,
      body: normalizedBody,
      status: "provisional",
      authority: "owner_approved_story_plan_hypothesis",
      sourcePath: `${foundryWorkPath}/02_story/rolling_corridor.md#${episode}`,
      sourceSha256: sha256(normalizedBody),
      sortOrder: episodeNumber(episode) * 100,
    }];
  });
}

function buildConsistencyAudit({
  status,
  artifacts,
  anchors,
  bArcs,
  projectedArcs,
  committedBlocks,
  revisionSetSha256,
  sourceGitCommit,
}) {
  const artifactMap = Object.fromEntries(artifacts.map((artifact) => [artifact.key, artifact]));
  const narrativeState = artifactMap.narrative_state.body;
  const characterSection = narrativeState.split(/^characters:\s*$/m)[1]?.split(/^assets:\s*$/m)[0] ?? "";
  const characterNames = [...characterSection.matchAll(/^    name:\s*(.+)$/gm)]
    .map((match) => match[1].trim().replace(/^["']|["']$/g, ""))
    .filter((name) => name && !["null", "unknown", "unspecified"].includes(name.toLowerCase()));
  const plans = artifacts
    .filter((artifact) => artifact.kind === "pitch" || artifact.kind === "story_plan")
    .map((artifact) => artifact.body)
    .join("\n");
  const manuscripts = artifacts
    .filter((artifact) => artifact.kind === "manuscript")
    .map((artifact) => artifact.body)
    .join("\n");
  const appears = (text, name) => [name, name.split(/\s+/)[0]]
    .filter(Boolean)
    .some((candidate) => text.includes(candidate));
  const missingFromPlan = characterNames.filter((name) => !appears(plans, name));
  const missingFromManuscript = characterNames.filter((name) => !appears(manuscripts, name));
  const stateRevisionSet = indentedYamlScalar(narrativeState, "repo_revision_set_sha256")
    || indentedYamlScalar(narrativeState, "revision_set_sha256");
  const stateThrough = indentedYamlScalar(narrativeState, "state_through");
  const currentArc = bArcs.find((arc) => arc.id === status.currentBArc);
  const manuscriptArtifacts = artifacts.filter((artifact) => artifact.kind === "manuscript");

  const checks = [
    {
      axis: "overview",
      label: "작품 개요",
      verdict: status.title && status.title === yamlScalar(artifactMap.status.body, "title") ? "pass" : "review",
      summary: "작품명·제작 단계·현재 화·승인 범위를 정본 상태와 대조",
      evidence: [
        `title=${status.title}`,
        `stage=${status.productionStage}`,
        `current=${status.currentEpisode}`,
        `approved=${status.approvedThrough}`,
      ],
    },
    {
      axis: "characters",
      label: "등장인물",
      verdict: missingFromPlan.length === 0 && missingFromManuscript.length === 0 ? "pass" : "review",
      summary: "Narrative State의 실명 인물이 작품 계획과 승인 원고에서 식별되는지 대조",
      evidence: [
        `named_characters=${characterNames.length}`,
        `missing_in_plan=${missingFromPlan.join(",") || "none"}`,
        `missing_in_manuscript=${missingFromManuscript.join(",") || "none"}`,
      ],
    },
    {
      axis: "plot",
      label: "플롯",
      verdict: anchors.length > 0
        && currentArc?.status === "active"
        && committedBlocks.every((block) => projectedArcs.some(
          (arc) => arc.bId === block.bId && ["closed", "active"].includes(arc.status),
        ))
        ? "pass"
        : "review",
      summary: "A-Rail·현재 B-Rail·승인 회차의 B 소속을 대조",
      evidence: [
        `anchors=${anchors.length}`,
        `current_b=${status.currentBArc}:${currentArc?.status ?? "missing"}`,
        `committed_episode_blocks=${committedBlocks.length}`,
      ],
    },
    {
      axis: "manuscript",
      label: "원고",
      verdict: manuscriptArtifacts.length === committedEpisodeIds.length
        && status.approvedThrough === committedEpisodeIds.at(-1)
        && status.reviewedThrough === committedEpisodeIds.at(-1)
        && status.stateThrough === committedEpisodeIds.at(-1)
        && stateThrough === committedEpisodeIds.at(-1)
        && stateRevisionSet === revisionSetSha256
        ? "pass"
        : "review",
      summary: `승인 1~${committedEpisodeIds.length}화·감리 범위·Narrative State 투영·revision-set을 대조`,
      evidence: [
        `approved_manuscripts=${manuscriptArtifacts.length}`,
        `reviewed_through=${status.reviewedThrough}`,
        `state_through=${stateThrough}`,
        `revision_set=${revisionSetSha256}`,
      ],
    },
  ];
  return {
    schemaVersion: "storyyard_canon_consistency_audit_v1",
    sourceGitCommit,
    verdict: checks.every((check) => check.verdict === "pass") ? "pass" : "review",
    checks,
    note: "구조·참조·승인 범위 정합성 감리. 문학적 품질 판정이나 Foundry 역수정은 포함하지 않음.",
  };
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
const structuredDecision = yamlScalar(adoptionReceipt, "decision");
const structuredRevisionSet = yamlScalar(adoptionReceipt, "manifest_revision_set_sha256");
const legacyScopeApproved = indentedYamlScalar(adoptionReceipt, "frozen_pitch") === "approved"
  && indentedYamlScalar(adoptionReceipt, "story_plan") === "approved"
  && Boolean(exactManuscriptRevision);
const structuredScopeApproved = ["adopt_all_exact_revisions", "ADOPT"].includes(structuredDecision)
  && Boolean(structuredRevisionSet);
const ownerDirectScopeApproved = structuredDecision === "ADOPT"
  && adoptionReceipt.includes("exact_manuscript_revision");
if (
  !adoptionDecisionId
  || (!legacyScopeApproved && !structuredScopeApproved && !ownerDirectScopeApproved)
) {
  throw new Error("Canon export refused: owner adoption receipt does not approve the pitch, Story Plan, and exact manuscript revision.");
}
if (!artifactByKey.status.body.includes(`  - ${adoptionDecisionId}`)) {
  throw new Error(`Canon export refused: status does not reference owner decision ${adoptionDecisionId}.`);
}

const expectedEpisodes = committedEpisodeIds;
const manifestEntries = parseManifestEntries(manifest);
if (
  manifestEntries.length !== expectedEpisodes.length
  || manifestEntries.some((entry, index) => entry.episode !== expectedEpisodes[index])
) {
  throw new Error(`Canon export refused: manuscript manifest must contain ${expectedEpisodes.join("~")} in canonical order.`);
}

for (const entry of manifestEntries) {
  const artifact = artifactByKey[entry.episode];
  if (!artifact || entry.sha256 !== artifact.sha256) {
    throw new Error(`${entry.episode} canonical hash mismatch: expected ${entry.sha256}, got ${artifact?.sha256}`);
  }
  if (entry.authority !== "owner_approved" || entry.owner_decision !== adoptionDecisionId) {
    throw new Error(`Canon export refused: ${entry.episode} is not tied to owner decision ${adoptionDecisionId}.`);
  }
  const markdownAttestation = new RegExp(
    `^\\|\\s*${escapeRegex(entry.episode)}\\s*\\|.*\\x60${escapeRegex(entry.sha256)}\\x60.*\\|\\s*$`,
    "m",
  ).test(adoptionReceipt);
  const structuredAttestation = new RegExp(
    `^\\s*- \\{ episode: ${escapeRegex(entry.episode)}, source: [^,}]+, sha256: ${escapeRegex(entry.sha256)} \\}\\s*$`,
    "m",
  ).test(adoptionReceipt);
  if (!markdownAttestation && !structuredAttestation) {
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
if (
  !adoptionReceipt.includes(`revision-set SHA-256: \`${declaredRevisionSet}\``)
  && structuredRevisionSet !== declaredRevisionSet
) {
  throw new Error("Canon export refused: adoption receipt does not attest the manifest revision set.");
}

const anchors = parseAnchors(artifactByKey.a_rail.body);
const bArcs = parseBRail(artifactByKey.b_rail.body);
const canonicalProjectedArcs = bArcs
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
let committedBlocks = episodeBetRows.map((row) => ({
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
const unassignedCommittedBlocks = committedBlocks.filter((block) => !block.bId);
const firstBRailEpisode = Math.min(
  ...bArcs.map((arc) => episodeNumber(arc.startEpisode)).filter((episode) => episode > 0),
);
const canProjectApprovedOpeningHistory = unassignedCommittedBlocks.length > 0
  && Number.isFinite(firstBRailEpisode)
  && unassignedCommittedBlocks.every((block) => episodeNumber(block.episode) < firstBRailEpisode);
if (unassignedCommittedBlocks.length > 0 && !canProjectApprovedOpeningHistory) {
  throw new Error("Canon export refused: an unassigned committed Episode Bet is not approved opening history before the first B-Rail arc.");
}
const approvedOpeningHistoryArc = canProjectApprovedOpeningHistory
  ? {
      bId: approvedOpeningHistoryId,
      routeOrder: 0,
      status: "closed",
      targetAnchor: "pre_b_rail_history",
      title: "승인 오프닝 이력",
      body: [
        "상태: closed",
        "유형: Storyyard projection-only history group",
        `승인 회차: ${unassignedCommittedBlocks.map((block) => block.episode).join(", ")}`,
        `첫 정식 B-Rail 시작: ep${String(firstBRailEpisode).padStart(3, "0")}`,
        "Foundry의 B-Rail ID나 원고는 변경하지 않는다.",
      ].join("\n"),
      sourceSha256: sha256(JSON.stringify({
        type: "approved_opening_history",
        episodes: unassignedCommittedBlocks.map((block) => block.episode),
        firstBRailEpisode,
      })),
    }
  : null;
if (approvedOpeningHistoryArc) {
  committedBlocks = committedBlocks.map((block) => (
    block.bId ? block : { ...block, bId: approvedOpeningHistoryId }
  ));
}
const projectedArcs = [
  ...(approvedOpeningHistoryArc ? [approvedOpeningHistoryArc] : []),
  ...canonicalProjectedArcs,
];
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
  ownership: {
    ownerId: status.ownerId,
    scope: status.ownershipScope,
    productionSystem: status.productionSystem,
  },
  revisionSetSha256: declaredRevisionSet,
  scope: {
    includes: ["Frozen Pitch", "Story Plan 4 surfaces", `owner-approved ep001~${expectedEpisodes.at(-1)}`, "adoption review", "Narrative State"],
    excludes: ["30_materials", `unapproved ep${String(expectedEpisodes.length + 1).padStart(3, "0")}+`, "automatic Foundry mutation"],
  },
  status,
  anchors,
  bArcs,
  storyyardProjection: {
    mappingVersion: "foundry_storyyard_arc_episode_v2",
    arcUnit: "b_rail_arc",
    blockUnit: "episode",
    reverseSync: false,
    arcs: projectedArcs,
    episodeBlocks: [...committedBlocks, ...provisionalBlocks],
  },
  workspaceProjection: buildWorkspaceProjection({
    status,
    artifacts: artifactRows,
    revisionSetSha256: declaredRevisionSet,
  }),
  consistencyAudit: buildConsistencyAudit({
    status,
    artifacts: artifactRows,
    anchors,
    bArcs,
    projectedArcs,
    committedBlocks,
    revisionSetSha256: declaredRevisionSet,
    sourceGitCommit,
  }),
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
