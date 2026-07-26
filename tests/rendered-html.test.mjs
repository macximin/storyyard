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
  const [sidebar, community, page, library, styles] = await Promise.all([
    read("app/global-sidebar.tsx"),
    read("app/community-home.tsx"),
    read("app/page.tsx"),
    read("app/library.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(sidebar, /커뮤니티/);
  assert.match(sidebar, /전체장르/);
  assert.match(sidebar, /선호작/);
  assert.match(sidebar, /개인 작업실/);
  assert.match(sidebar, /내 작품/);
  assert.match(community, /랭킹순/);
  assert.match(community, /신작순/);
  assert.match(community, /default-cover-card\.webp/);
  assert.match(community, /loading=\{index === 0 \? "eager" : "lazy"\}/);
  assert.match(page, /CommunityHome/);
  assert.match(library, /work-card-cover/);
  assert.match(library, /default-cover-card\.webp/);
  assert.match(library, /loading=\{index === 0 \? "eager" : "lazy"\}/);
  assert.match(library, /fetchPriority=\{index === 0 \? "high" : "auto"\}/);
  assert.match(styles, /\.work-grid \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.work-card-cover \{[^}]*aspect-ratio: 2 \/ 3/);
  await access(new URL("public/default-cover.png", root));
  await access(new URL("public/default-cover-card.webp", root));
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
  assert.match(publicationRoute, /publishCanon/);
  assert.match(publicationRoute, /canonEpisodeNos/);
  assert.match(publicationRoute, /readFoundryWorkSlug/);
  assert.match(publicationRoute, /validItemKinds/);
  assert.match(contentRoute, /p\.status = 'published'/);
  assert.match(projectRoute, /UPDATE publications SET title = \?, logline = \?, genre = \?/);
  assert.match(workspace, /전체 공개본 갱신/);
  assert.match(workspace, /publishAll: true/);
  assert.match(workspace, /items\.some\(\(item\) => Boolean\(readFoundrySyncInfo\(item\.meta\)\)\)/);
  for (const tab of ["원고", "등장인물", "자료실", "플롯"]) {
    assert.match(publicWork, new RegExp(`>${tab}<`));
  }
  assert.doesNotMatch(publicWork, /\/content\?type=/);
  assert.match(publicWork, /className="plot-board-scroll public-plot-board-scroll"/);
  assert.match(publicWork, /className="plot-board"/);
  assert.match(publicWork, /오른쪽으로 계속 이어지는 보드/);
  assert.match(publicWork, /scrollBy\(\{ left:/);
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

test("ships a five-work admin-only Foundry canon review board with pending decisions", async () => {
  const [page, board, route, schema, packages, sidebar, canonPackage, cheongmaPackage, knightPackage, romancePackage, tyrantPackage, exporter] = await Promise.all([
    read("app/canon/page.tsx"),
    read("app/canon/canon-review-board.tsx"),
    read("app/api/canon/decisions/route.ts"),
    read("db/schema.ts"),
    read("app/canon-packages.ts"),
    read("app/global-sidebar.tsx"),
    read("data/canon/afterlife_restaurant.json"),
    read("data/canon/cheongma_restaurant.json"),
    read("data/canon/knights_restaurant.json"),
    read("data/canon/romance_fantasy_restaurant.json"),
    read("data/canon/tyrant_restaurant.json"),
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
  assert.match(packages, /cheongma_restaurant/);
  assert.match(packages, /romance_fantasy_restaurant/);
  assert.match(packages, /tyrant_restaurant/);
  assert.match(packages, /listSyncableCanonPackages/);
  assert.match(knightPackage, /"title": "기사식당"/);
  assert.match(cheongmaPackage, /"title": "천마식당"/);
  assert.match(cheongmaPackage, /"sourceState": "committed"/);
  assert.match(cheongmaPackage, /"revisionSetSha256": "fe88f1f2672da3027998c4f99a8aa0272fb5fe32aff6003530f9023382a132e3"/);
  assert.match(cheongmaPackage, /"verdict": "pass"/);
  assert.match(knightPackage, /"sourceState": "committed"/);
  assert.match(knightPackage, /"productionSystem": "v3_firefly_studio"/);
  assert.match(romancePackage, /"title": "로판식당"/);
  assert.match(romancePackage, /"sourceState": "committed"/);
  assert.match(romancePackage, /"revisionSetSha256": "23d513fa4eef9796228b6b4d3822767ca21007957010338e8c3ab5d2b5f912b4"/);
  assert.match(romancePackage, /"sourceGitCommit": "[0-9a-f]{40}"/);
  assert.match(romancePackage, /"schemaVersion": "storyyard_canon_consistency_audit_v1"/);
  assert.match(romancePackage, /"verdict": "pass"/);
  assert.match(tyrantPackage, /"title": "폭군식당"/);
  assert.match(tyrantPackage, /"sourceState": "committed"/);
  assert.match(tyrantPackage, /"mappingVersion": "foundry_storyyard_arc_episode_v2"/);
  assert.match(tyrantPackage, /"bId": "APPROVED_OPENING_HISTORY"/);
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
  assert.match(canonPackage, /"revisionSetSha256": "2fb3648e1c57ab5f5a1e55a86e61edc150e118bd37e774be5615a4bcd97b02a7"/);
  assert.match(canonPackage, /"sourceGitCommit": "[0-9a-f]{40}"/);
  for (const hash of [
    "23a22f298b4ea37499b80ec55c0e86b3816604328255aee3529e7013a0712244",
    "01802d4862a5b607f42b335c7a3126c0418a3ac2a2a406199f090d046d45595a",
    "7138bace3e357d2e6369cdf27445c6c92e0a70bbf429632b88c7d4982ceb3f5a",
    "f5ec74b51a97e76d2accf20a1b39bf00dc57d525df917876f35eae9c04b40dcc",
  ]) {
    assert.match(canonPackage, new RegExp(hash));
  }
});

test("atomically projects the full Foundry canon into private and public Storyyard views", async () => {
  const [canonSource, syncRoute, workspace, exporter, manuscriptRoute, publicationRoute, migration] = await Promise.all([
    read("data/canon/afterlife_restaurant.json"),
    read("app/api/projects/[id]/foundry-sync/route.ts"),
    read("app/project-workspace.tsx"),
    read("scripts/export-firefly-canon-package.mjs"),
    read("app/api/manuscripts/[id]/route.ts"),
    read("app/api/projects/[id]/publication/route.ts"),
    read("drizzle/0009_yummy_masked_marvel.sql"),
  ]);
  const canonPackage = JSON.parse(canonSource);
  const projection = canonPackage.storyyardProjection;
  assert.equal(projection.mappingVersion, "foundry_storyyard_arc_episode_v2");
  assert.equal(projection.arcUnit, "b_rail_arc");
  assert.equal(projection.blockUnit, "episode");
  assert.equal(projection.reverseSync, false);
  assert.deepEqual(
    projection.arcs.map((item) => [item.bId, item.status]),
    [
      ["B001", "closed"],
      ["B002", "active"],
      ["B003", "provisional"],
      ["B004", "provisional"],
      ["B005", "provisional"],
    ],
  );
  assert.deepEqual(
    projection.episodeBlocks.map((item) => [item.episode, item.bId, item.status]),
    [
      ["ep001", "B001", "committed"],
      ["ep002", "B001", "committed"],
      ["ep003", "B001", "committed"],
      ["ep004", "B002", "committed"],
      ["ep005", "B002", "provisional"],
      ["ep006", "B002", "provisional"],
    ],
  );
  assert.equal(
    new Set(projection.episodeBlocks.map((item) => item.episode)).size,
    projection.episodeBlocks.length,
  );
  assert.equal(canonPackage.workspaceProjection.mappingVersion, "foundry_storyyard_workspace_v1");
  assert.equal(canonPackage.workspaceProjection.reverseSync, false);
  assert.equal(canonPackage.workspaceProjection.manuscripts.length, 4);
  assert.equal(canonPackage.workspaceProjection.characters.length, 6);
  assert.match(exporter, /committedEpisodeBets/);
  assert.match(exporter, /parseProvisionalEpisodes/);
  assert.match(exporter, /buildWorkspaceProjection/);
  assert.match(syncRoute, /loadAdminOwnerState/);
  assert.match(syncRoute, /u\.role = 'admin'/);
  assert.match(syncRoute, /projectedContentSha256/);
  assert.match(syncRoute, /report\.conflicts\.push/);
  assert.match(syncRoute, /reverseSync: false/);
  assert.match(syncRoute, /foundry_storyyard_arc_episode_v2/);
  assert.match(syncRoute, /preserveConflicts\?: boolean/);
  assert.match(syncRoute, /input\?\.preserveConflicts !== true/);
  assert.match(syncRoute, /manuscriptIds\.set\(manuscript\.episodeNo, existing\.id\)/);
  assert.match(syncRoute, /env\.DB\.batch\(writes\)/);
  assert.match(syncRoute, /if \(writes\.length\)/);
  assert.doesNotMatch(syncRoute, /\.delete\(|DELETE FROM/);
  assert.match(syncRoute, /UPDATE publication_episodes/);
  assert.match(syncRoute, /ON CONFLICT\(project_id\) DO UPDATE/);
  assert.match(syncRoute, /canon_bindings/);
  assert.match(manuscriptRoute, /Foundry 승인 정본은 Storyyard에서 직접 수정할 수 없음/);
  assert.match(publicationRoute, /정본 전체 동기화로만 갱신/);
  assert.match(migration, /ALTER TABLE `manuscripts` ADD `meta`/);
  assert.match(migration, /ALTER TABLE `publication_episodes` ADD `meta`/);
  assert.match(workspace, /정본 전체 동기화/);
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
