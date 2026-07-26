import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, child]) => `${key}: ${displayValue(child)}`).join(", ");
  }
  if (value === null || value === undefined) return "미공개";
  return String(value);
}

function pitchLogline(source) {
  return source.split(/^## 한 줄\s*$/m)[1]?.split(/^## /m)[0]?.trim() ?? "";
}

const useGitHead = process.argv.includes("--git-head");
for (const filePath of process.argv.slice(2).filter((value) => value !== "--git-head")) {
  const source = useGitHead
    ? execFileSync("git", ["show", `HEAD:${filePath}`], { encoding: "utf8" })
    : await readFile(filePath, "utf8");
  const current = JSON.parse(source);
  const artifactByKey = Object.fromEntries(current.artifacts.map((artifact) => [artifact.key, artifact]));
  const state = parseYaml(artifactByKey.narrative_state.body);
  const characters = Object.entries(state?.characters ?? {}).map(([entityKey, value], index) => {
    const record = value && typeof value === "object" ? value : {};
    const fields = Object.entries(record)
      .filter(([key]) => key !== "name")
      .map(([key, child]) => ({ id: `${entityKey}:${key}`, label: key, value: displayValue(child) }));
    return {
      entityKey,
      title: record.name ? String(record.name) : record.role ? displayValue(record.role) : entityKey.replaceAll("_", " "),
      body: fields.map((field) => `${field.label}: ${field.value}`).join("\n"),
      tags: [],
      fields,
      sortOrder: index,
      sourceSha256: sha256(JSON.stringify(record)),
    };
  });
  const manuscripts = current.artifacts
    .filter((artifact) => artifact.kind === "manuscript")
    .map((artifact, index) => ({
      episodeNo: index + 1,
      entityKey: artifact.key,
      title: artifact.body.split("\n")[0]?.trim() || `${index + 1}화`,
      body: artifact.body,
      status: "published",
      sourcePath: artifact.sourcePath,
      sourceSha256: artifact.sha256,
    }));
  const packageWithoutHash = {
    ...current,
    workspaceProjection: {
      mappingVersion: "foundry_storyyard_workspace_v1",
      reverseSync: false,
      overview: {
        title: current.status.title,
        logline: pitchLogline(artifactByKey.frozen_pitch.body),
        sourceSha256: artifactByKey.frozen_pitch.sha256,
      },
      characters,
      manuscripts,
      revisionSetSha256: current.revisionSetSha256,
    },
  };
  delete packageWithoutHash.bundleSha256;
  const output = {
    ...packageWithoutHash,
    bundleSha256: sha256(JSON.stringify(packageWithoutHash)),
  };
  await writeFile(filePath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`${filePath}: ${output.bundleSha256}`);
}
