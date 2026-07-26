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

test("batches authenticated workspace reads and primes Foundry packages on the plot route", async () => {
  const [auth, workspaceData, workspaceRoute, plotPage, workspace] = await Promise.all([
    read("app/chatgpt-auth.ts"),
    read("app/workspace-data.ts"),
    read("app/api/projects/[id]/workspace/route.ts"),
    read("app/project/[id]/plot/page.tsx"),
    read("app/project-workspace.tsx"),
  ]);
  assert.match(auth, /getSessionTokenHash/);
  assert.match(workspaceData, /getAuthenticatedWorkspace/);
  assert.match(workspaceData, /env\.DB\.batch/);
  assert.match(workspaceData, /FROM sessions s/);
  assert.match(workspaceData, /requireAuthenticatedWorkspace/);
  assert.doesNotMatch(workspaceRoute, /getChatGPTUser/);
  assert.match(plotPage, /initialFoundryPackages/);
  assert.match(plotPage, /listSyncableCanonPackages/);
  assert.match(workspace, /initialFoundryPackages !== undefined/);
});

test("uses route prefetching and shows navigation progress", async () => {
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
  assert.doesNotMatch(sidebar, /prefetch=\{false\}/);
  assert.doesNotMatch(work, /prefetch=\{false\}/);
  assert.doesNotMatch(reader, /prefetch=\{false\}/);
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

test("publishes the entire workspace and renders public planning snapshots immediately", async () => {
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
  assert.match(publicationRoute, /publishAll/);
  assert.match(publicationRoute, /validItemKinds/);
  assert.match(contentRoute, /p\.status = 'published'/);
  assert.match(projectRoute, /UPDATE publications SET title = \?, logline = \?, genre = \?/);
  assert.match(workspace, /전체 공개본 갱신/);
  assert.match(workspace, /publishAll: true/);
  for (const tab of ["원고", "등장인물", "자료실", "플롯"]) {
    assert.match(publicWork, new RegExp(`>${tab}<`));
  }
  assert.doesNotMatch(publicWork, /\/content\?type=/);
  assert.match(publicWork, /className="plot-board"/);
  assert.match(publicWork, /className="plot-card public"/);
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

test("ships a three-work admin-only Foundry canon review board with pending decisions", async () => {
  const [page, board, route, schema, packages, sidebar, canonPackage, knightPackage, romancePackage, exporter] = await Promise.all([
    read("app/canon/page.tsx"),
    read("app/canon/canon-review-board.tsx"),
    read("app/api/canon/decisions/route.ts"),
    read("db/schema.ts"),
    read("app/canon-packages.ts"),
    read("app/global-sidebar.tsx"),
    read("data/canon/afterlife_restaurant.json"),
    read("data/canon/knights_restaurant.json"),
    read("data/canon/romance_fantasy_restaurant.json"),
    read("scripts/export-firefly-canon-package.mjs"),
  ]);
  assert.match(page, /user\.role !== "admin"/);
  assert.match(page, /ensureCanonSnapshot/);
  assert.match(sidebar, /캐논 확인판/);
  assert.match(board, /Foundry SSOT/);
  assert.match(board, /정합성 감리/);
  assert.match(board, /canonPackage\.consistencyAudit\.checks/);
  assert.match(board, /자동 승격 꺼짐/);
  assert.match(board, /Living Spine/);
  assert.match(board, /A-Rail/);
  assert.match(board, /B-Rail/);
  assert.match(board, /Rolling Corridor/);
  assert.match(board, /상태 스냅샷/);
  assert.match(board, /ArtifactReader artifact=\{artifacts\.a_rail\}/);
  assert.match(board, /ArtifactReader artifact=\{artifacts\.b_rail\}/);
  assert.match(board, /sourceGitCommit/);
  assert.match(board, /pending 판정 기록/);
  assert.match(board, /승격 준비 스냅샷/);
  assert.match(packages, /knights_restaurant/);
  assert.match(packages, /romance_fantasy_restaurant/);
  assert.match(packages, /listSyncableCanonPackages/);
  assert.match(knightPackage, /"title": "기사식당"/);
  assert.match(knightPackage, /"sourceState": "committed"/);
  assert.match(knightPackage, /"productionSystem": "v3_firefly_studio"/);
  assert.match(romancePackage, /"title": "로판식당"/);
  assert.match(romancePackage, /"sourceState": "committed"/);
  assert.match(romancePackage, /"revisionSetSha256": "23d513fa4eef9796228b6b4d3822767ca21007957010338e8c3ab5d2b5f912b4"/);
  assert.match(romancePackage, /"sourceGitCommit": "[0-9a-f]{40}"/);
  assert.match(romancePackage, /"schemaVersion": "storyyard_canon_consistency_audit_v1"/);
  assert.match(romancePackage, /"verdict": "pass"/);
  assert.match(board, /canonPackage\.ownership\.ownerId/);
  assert.match(route, /user\?\.role === "admin"/);
  assert.match(route, /artifact\.sha256 !== input\.artifactSha256/);
  assert.match(route, /status: "pending"/);
  assert.match(schema, /canonSnapshots/);
  assert.match(schema, /canonDecisions/);
  assert.match(packages, /firefly_story_package_v1/);
  assert.match(packages, /sourceGitCommit: string/);
  assert.match(exporter, /ls-files/);
  assert.match(exporter, /included Foundry sources have uncommitted changes/);
  assert.match(exporter, /owner adoption receipt/);
  assert.match(exporter, /adopt_all_exact_revisions/);
  assert.match(exporter, /inlineRows/);
  assert.match(exporter, /buildConsistencyAudit/);
  assert.match(exporter, /computedRevisionSet/);
  assert.match(canonPackage, /"revisionSetSha256": "4aa9de3ba689973cd86ba45377387024ca6d09ed2ac4e52eb6e22aa7a3483ea6"/);
  assert.match(canonPackage, /"sourceGitCommit": "[0-9a-f]{40}"/);
  for (const hash of [
    "2b8d1bca981c1c7b0731c918e581b36ce7d4d1dc169bec4571311eab72eb241a",
    "6baec3ac49cc771f6e9be445347bfda6faa5dea0de9281d6e1dbf33b8aebb94c",
    "65ab2508218b7dfb1b462f2daa37d96712e307d9cc4ce554575675eca320d6ad",
  ]) {
    assert.match(canonPackage, new RegExp(hash));
  }
});

test("projects Foundry B-Rail arcs into one Storyyard block per episode without reverse sync", async () => {
  const [canonSource, syncRoute, workspace, exporter] = await Promise.all([
    read("data/canon/afterlife_restaurant.json"),
    read("app/api/projects/[id]/foundry-sync/route.ts"),
    read("app/project-workspace.tsx"),
    read("scripts/export-firefly-canon-package.mjs"),
  ]);
  const canonPackage = JSON.parse(canonSource);
  const projection = canonPackage.storyyardProjection;
  assert.equal(projection.mappingVersion, "foundry_storyyard_arc_episode_v1");
  assert.equal(projection.arcUnit, "b_rail_arc");
  assert.equal(projection.blockUnit, "episode");
  assert.equal(projection.reverseSync, false);
  assert.deepEqual(
    projection.arcs.map((item) => [item.bId, item.status]),
    [["B001", "closed"], ["B002", "active"], ["B003", "provisional"]],
  );
  assert.deepEqual(
    projection.episodeBlocks.map((item) => [item.episode, item.bId, item.status]),
    [
      ["ep001", "B001", "committed"],
      ["ep002", "B001", "committed"],
      ["ep003", "B001", "committed"],
      ["ep004", "B002", "provisional"],
      ["ep005", "B002", "provisional"],
      ["ep006", "B002", "provisional"],
    ],
  );
  assert.equal(
    new Set(projection.episodeBlocks.map((item) => item.episode)).size,
    projection.episodeBlocks.length,
  );
  assert.match(exporter, /committedEpisodeBets/);
  assert.match(exporter, /parseProvisionalEpisodes/);
  assert.match(syncRoute, /loadAdminOwnerState/);
  assert.match(syncRoute, /u\.role = 'admin'/);
  assert.match(syncRoute, /projectedContentSha256/);
  assert.match(syncRoute, /report\.conflicts\.push/);
  assert.match(syncRoute, /reverseSync: false/);
  assert.match(syncRoute, /env\.DB\.batch\(writes\)/);
  assert.match(syncRoute, /if \(writes\.length\)/);
  assert.doesNotMatch(syncRoute, /\.delete\(|DELETE FROM/);
  assert.match(workspace, /정본 아크·화 동기화/);
  assert.match(workspace, /blockBodyPreview\(block\.body\)/);
  assert.match(workspace, /\.\.\.\(existingBlock \? readObject\(existingBlock\.meta\) : \{\}\)/);
  assert.match(workspace, /\.\.\.\(existing \? readObject\(existing\.meta\) : \{\}\)/);
});

test("indexes the private workspace lookup paths", async () => {
  const [schema, migration] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0008_youthful_doctor_faustus.sql"),
  ]);
  for (const indexName of [
    "projects_owner_updated_idx",
    "project_items_project_kind_updated_idx",
    "plot_blocks_project_act_sort_idx",
  ]) {
    assert.match(schema, new RegExp(indexName));
    assert.match(migration, new RegExp(`CREATE INDEX \\\`${indexName}\\\``));
  }
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE/);
});
