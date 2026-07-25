import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("formats canon decision timestamps identically across host time zones", () => {
  const formatterUrl = new URL("../app/canon/decision-time.ts", import.meta.url).href;
  const timestamp = "2026-07-25T04:26:47.000Z";
  const script = [
    `import { formatCanonDecisionTime } from ${JSON.stringify(formatterUrl)};`,
    `process.stdout.write(formatCanonDecisionTime(${JSON.stringify(timestamp)}));`,
  ].join("\n");
  const renderIn = (timeZone) => execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { encoding: "utf8", env: { ...process.env, TZ: timeZone } },
  );

  const expected = "2026. 7. 25. 13:26:47";
  assert.equal(renderIn("UTC"), expected);
  assert.equal(renderIn("Asia/Seoul"), expected);
  assert.equal(renderIn("America/Los_Angeles"), expected);
});

test("ships the public community and private studio navigation", async () => {
  const [sidebar, community, page] = await Promise.all([
    read("app/global-sidebar.tsx"),
    read("app/community-home.tsx"),
    read("app/page.tsx"),
  ]);
  assert.match(sidebar, /커뮤니티/);
  assert.match(sidebar, /전체장르/);
  assert.match(sidebar, /선호작/);
  assert.match(sidebar, /개인 작업실/);
  assert.match(sidebar, /내 작품/);
  assert.match(community, /랭킹순/);
  assert.match(community, /신작순/);
  assert.match(page, /CommunityHome/);
  await access(new URL("public/default-cover.png", root));
});

test("primes navigation data on the server and sorts community works locally", async () => {
  const [community, home, studio, library, publicWork, plotPage, communityData, workspaceData, publicWorkData] = await Promise.all([
    read("app/community-home.tsx"),
    read("app/page.tsx"),
    read("app/studio/page.tsx"),
    read("app/library.tsx"),
    read("app/public-work.tsx"),
    read("app/project/[id]/plot/page.tsx"),
    read("app/community-data.ts"),
    read("app/workspace-data.ts"),
    read("app/public-work-data.ts"),
  ]);
  assert.match(home, /getCommunityPageData/);
  assert.match(home, /initialWorks/);
  assert.doesNotMatch(community, /fetch\(`\/api\/community\?sort=/);
  assert.doesNotMatch(community, /공개 작품을 불러오는 중/);
  assert.match(studio, /initialProjects/);
  assert.doesNotMatch(library, /작품 목록 불러오는 중/);
  assert.doesNotMatch(publicWork, /작품을 불러오는 중/);
  assert.match(plotPage, /initialSnapshot/);
  assert.match(communityData, /env\.DB\.batch/);
  assert.match(workspaceData, /env\.DB\.batch/);
  assert.match(publicWorkData, /env\.DB\.batch/);
});

test("avoids duplicate route prefetches and shows navigation progress", async () => {
  const [sidebar, work, reader, library, workspace, progress, layout] = await Promise.all([
    read("app/global-sidebar.tsx"),
    read("app/public-work.tsx"),
    read("app/public-episode-reader.tsx"),
    read("app/library.tsx"),
    read("app/project-workspace.tsx"),
    read("app/navigation-progress.tsx"),
    read("app/layout.tsx"),
  ]);
  assert.doesNotMatch(`${work}\n${reader}\n${library}\n${workspace}`, /router\.prefetch/);
  assert.match(sidebar, /prefetch=\{false\}/);
  assert.match(work, /prefetch=\{false\}/);
  assert.match(reader, /prefetch=\{false\}/);
  assert.match(progress, /storyyard:navigation-start/);
  assert.match(layout, /NavigationProgress/);
  assert.doesNotMatch(layout, /Geist_Mono|Geist\(/);
});

test("keeps credentials out of browser storage and uses durable secure sessions", async () => {
  const [auth, sidebar, schema] = await Promise.all([
    read("app/chatgpt-auth.ts"),
    read("app/global-sidebar.tsx"),
    read("db/schema.ts"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /sameSite:\s*"lax"/);
  assert.match(auth, /SESSION_DAYS\s*=\s*30/);
  assert.doesNotMatch(`${auth}\n${sidebar}`, /localStorage.*password|password.*localStorage/i);
  assert.match(schema, /sessions/);
  assert.match(schema, /passwordHash/);
});

test("publishes only selected manuscript and planning snapshots", async () => {
  const [schema, publicationRoute, contentRoute, projectRoute, workspace, publicWork] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/projects/[id]/publication/route.ts"),
    read("app/api/community/[id]/content/route.ts"),
    read("app/api/projects/[id]/route.ts"),
    read("app/project-workspace.tsx"),
    read("app/public-work.tsx"),
  ]);
  assert.match(schema, /publicationEpisodes/);
  assert.match(schema, /publicationContent/);
  assert.match(publicationRoute, /INSERT INTO publication_episodes/);
  assert.match(publicationRoute, /INSERT INTO publication_content/);
  assert.match(publicationRoute, /characterFieldIds/);
  assert.match(publicationRoute, /validItemKinds/);
  assert.match(contentRoute, /p\.status = 'published'/);
  assert.match(projectRoute, /UPDATE publications SET title = \?, logline = \?, genre = \?/);
  for (const label of ["공개할 원고", "공개할 등장인물", "공개할 자료", "공개할 플롯"]) {
    assert.match(workspace, new RegExp(label));
  }
  for (const tab of ["원고", "등장인물", "자료실", "플롯"]) {
    assert.match(publicWork, new RegExp(`>${tab}<`));
  }
  assert.match(publicWork, /fetch\(`\/api\/community\/\$\{work\.id\}\/content\?type=\$\{nextTab\}`\)/);
});

test("cascades project deletion through public and private records", async () => {
  const route = await read("app/api/projects/[id]/route.ts");
  for (const table of [
    "comments",
    "ratings",
    "publication_favorites",
    "publication_episodes",
    "publication_content",
    "publications",
    "manuscripts",
    "plot_blocks",
    "project_items",
    "projects",
  ]) {
    assert.match(route, new RegExp(`DELETE FROM ${table}`));
  }
});

test("opens manuscripts as dedicated episode pages with episode comments and deletion", async () => {
  const [work, reader, episodeData, episodeComments, commentDelete, schema] = await Promise.all([
    read("app/public-work.tsx"),
    read("app/public-episode-reader.tsx"),
    read("app/public-episode-data.ts"),
    read("app/api/community/[id]/episodes/[episodeId]/comments/route.ts"),
    read("app/api/comments/[id]/route.ts"),
    read("db/schema.ts"),
  ]);
  assert.match(work, /\/episodes\/\$\{episode\.episode_no\}/);
  assert.doesNotMatch(work, /openEpisode|episode-body/);
  assert.match(reader, /회차 목차/);
  assert.match(reader, /화 댓글/);
  assert.match(episodeData, /episode_id/);
  assert.match(episodeComments, /INSERT INTO comments/);
  assert.match(commentDelete, /user\.role !== "admin"/);
  assert.match(commentDelete, /DELETE FROM comments/);
  assert.match(schema, /episodeId/);
});

test("ships an admin-only Foundry canon review board with pending decisions", async () => {
  const [page, board, route, schema, packages, sidebar, canonPackage] = await Promise.all([
    read("app/canon/page.tsx"),
    read("app/canon/canon-review-board.tsx"),
    read("app/api/canon/decisions/route.ts"),
    read("db/schema.ts"),
    read("app/canon-packages.ts"),
    read("app/global-sidebar.tsx"),
    read("data/canon/afterlife_restaurant.json"),
  ]);
  assert.match(page, /user\.role !== "admin"/);
  assert.match(page, /ensureCanonSnapshot/);
  assert.match(sidebar, /캐논 확인판/);
  assert.match(board, /Foundry SSOT/);
  assert.match(board, /자동 승격 꺼짐/);
  assert.match(board, /Living Spine/);
  assert.match(board, /A-Rail/);
  assert.match(board, /B-Rail/);
  assert.match(board, /Rolling Corridor/);
  assert.match(board, /pending 판정 기록/);
  assert.match(route, /user\?\.role === "admin"/);
  assert.match(route, /artifact\.sha256 !== input\.artifactSha256/);
  assert.match(route, /status: "pending"/);
  assert.match(schema, /canonSnapshots/);
  assert.match(schema, /canonDecisions/);
  assert.match(packages, /firefly_story_package_v1/);
  assert.match(canonPackage, /"revisionSetSha256": "4aa9de3ba689973cd86ba45377387024ca6d09ed2ac4e52eb6e22aa7a3483ea6"/);
  for (const hash of [
    "2b8d1bca981c1c7b0731c918e581b36ce7d4d1dc169bec4571311eab72eb241a",
    "6baec3ac49cc771f6e9be445347bfda6faa5dea0de9281d6e1dbf33b8aebb94c",
    "65ab2508218b7dfb1b462f2daa37d96712e307d9cc4ce554575675eca320d6ad",
  ]) {
    assert.match(canonPackage, new RegExp(hash));
  }
});
