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
  const [sidebar, community, page, library, coverOptions, styles] = await Promise.all([
    read("app/global-sidebar.tsx"),
    read("app/community-home.tsx"),
    read("app/page.tsx"),
    read("app/library.tsx"),
    read("app/cover-options.ts"),
    read("app/globals.css"),
  ]);
  assert.match(sidebar, /커뮤니티/);
  assert.match(sidebar, /전체장르/);
  assert.match(sidebar, /선호작/);
  assert.match(sidebar, /개인 작업실/);
  assert.match(sidebar, /내 작품/);
  assert.match(community, /랭킹순/);
  assert.match(community, /최신순/);
  assert.match(community, /resolveCoverSrc\(work\.coverKey\)/);
  assert.match(community, /loading=\{index === 0 \? "eager" : "lazy"\}/);
  assert.match(page, /CommunityHome/);
  assert.match(library, /work-card-cover/);
  assert.match(library, /resolveCoverSrc\(project\.coverKey\)/);
  assert.doesNotMatch(library, /default-cover-card\.webp/);
  assert.equal((coverOptions.match(/key: "/g) ?? []).length, 7);
  assert.match(library, /loading=\{index === 0 \? "eager" : "lazy"\}/);
  assert.match(library, /fetchPriority=\{index === 0 \? "high" : "auto"\}/);
  assert.match(styles, /\.work-grid \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.work-card-cover \{[^}]*aspect-ratio: 2 \/ 3/);
  await access(new URL("public/default-cover.png", root));
  for (const cover of [
    "first-confirmed.png",
    "launch-complete.png",
    "unlimited-contest-expected-pass.png",
    "market-testing.png",
    "overall-revision.png",
    "kakao-expected-pass.png",
    "submission-complete.png",
  ]) await access(new URL(`public/covers/${cover}`, root));
  await access(new URL("public/default-cover-card.webp", root));
});

test("routes Firefly review packets one way and archives legacy works without deletion", async () => {
  const [schema, migration, v2Migration, sidebar, reviewPage, reviewBoard, decisionRoute, sliceRoute, packet, studio, projectsRoute] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0012_glorious_major_mapleleaf.sql"),
    read("drizzle/0013_secret_the_spike.sql"),
    read("app/global-sidebar.tsx"),
    read("app/review/page.tsx"),
    read("app/review/review-board.tsx"),
    read("app/api/firefly/review-decisions/route.ts"),
    read("app/api/firefly/source-slices/route.ts"),
    read("data/firefly/review-packets/current.json"),
    read("app/studio/page.tsx"),
    read("app/api/projects/route.ts"),
  ]);
  const parsed = JSON.parse(packet);
  assert.equal(parsed.schemaVersion, "firefly_review_packet/v1");
  assert.equal(parsed.authority.canon, "inkos");
  assert.equal(parsed.authority.apply, "inkos");
  assert.equal(parsed.authority.reverseSync, false);
  assert.equal(parsed.candidates.length, 2);
  assert.match(schema, /fireflyReviewSnapshots/);
  assert.match(schema, /fireflyReviewDecisions/);
  assert.match(schema, /surfaceClassifications/);
  assert.match(v2Migration, /surface_classifications/);
  assert.match(migration, /SET `lifecycle` = 'legacy'/);
  assert.match(migration, /UPDATE `publications` SET `status` = 'archived'/);
  assert.doesNotMatch(migration, /DELETE FROM/);
  assert.match(sidebar, /검토 대기/);
  assert.match(sidebar, /이전 작품/);
  assert.match(reviewPage, /user\.role !== "admin"/);
  assert.match(reviewBoard, /정본은 InkOS/);
  assert.match(reviewBoard, /재미와 도파민을 먼저/);
  assert.match(reviewBoard, /독립 blind pair/);
  assert.match(reviewBoard, /표면 비교/);
  assert.match(decisionRoute, /status: "pending"/);
  assert.match(decisionRoute, /후보 원고의 해시/);
  assert.match(decisionRoute, /export async function PATCH/);
  assert.match(decisionRoute, /STORYYARD_APPLY_TOKEN/);
  assert.match(decisionRoute, /validateAppliedReceipt/);
  assert.match(decisionRoute, /모든 표면 일치를 사람이 분류/);
  assert.match(decisionRoute, /캐논 유입으로 분류된 후보는 승인할 수 없음/);
  assert.match(decisionRoute, /\.returning\(\)/);
  assert.match(sliceRoute, /STORYYARD_SOURCE_GRANT_PRIVATE_JWK/);
  assert.match(sliceRoute, /private, no-store/);
  assert.match(sliceRoute, /packetId.*packetSha256.*matchId/);
  assert.match(studio, /projects\.lifecycle, "active"/);
  assert.match(projectsRoute, /projects\.lifecycle, "active"/);
});

test("uses seven persisted cover keys and refreshes published views without exposing drafts", async () => {
  const [schema, migration, projectRoute, publicationRoute, workspace, library, community, publicWork, events] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0010_needy_scream.sql"),
    read("app/api/projects/[id]/route.ts"),
    read("app/api/projects/[id]/publication/route.ts"),
    read("app/project-workspace.tsx"),
    read("app/library.tsx"),
    read("app/community-home.tsx"),
    read("app/public-work.tsx"),
    read("app/publication-events.ts"),
  ]);
  assert.match(schema, /coverKey: text\("cover_key"\)/);
  assert.match(schema, /contentRevision: text\("content_revision"\)/);
  assert.match(schema, /publishedRevision: text\("published_revision"\)/);
  assert.match(migration, /unlimited-contest-expected-pass/);
  assert.match(projectRoute, /isCoverKey\(input\.coverKey\)/);
  assert.match(projectRoute, /허용되지 않은 표지임/);
  assert.match(projectRoute, /UPDATE publications/);
  assert.match(publicationRoute, /getCoverOption\(project\.coverKey\)/);
  assert.match(publicationRoute, /revision: timestamp/);
  assert.match(publicationRoute, /env\.DB\.batch\(batch\)/);
  assert.match(workspace, /prefetch=\{false\}/);
  assert.match(workspace, /공개본 업데이트 필요/);
  assert.match(workspace, /if \(!response\.ok\) throw new Error/);
  assert.match(library, /CoverPicker/);
  assert.match(community, /useEffect\(\(\) => setWorks\(initialWorks\)/);
  assert.match(publicWork, /setWork\(initialSnapshot\?\.work/);
  assert.match(events, /BroadcastChannel\(CHANNEL_NAME\)/);
  assert.doesNotMatch(`${community}\n${publicWork}\n${workspace}`, /title === "저승식당"/);
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
  assert.match(communityData, /right\.updatedAt/);
  assert.match(community, /right\.updatedAt/);
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
  const [auth, humanActionRoute, sidebar, workspace, schema, migration] = await Promise.all([
    read("app/chatgpt-auth.ts"),
    read("app/api/auth/human-action/route.ts"),
    read("app/global-sidebar.tsx"),
    read("app/project-workspace.tsx"),
    read("db/schema.ts"),
    read("drizzle/0011_reflective_outlaw_kid.sql"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /sameSite:\s*"lax"/);
  assert.match(auth, /SESSION_DAYS\s*=\s*30/);
  assert.doesNotMatch(`${auth}\n${sidebar}\n${workspace}`, /localStorage.*password|password.*localStorage/i);
  assert.match(schema, /sessions/);
  assert.match(schema, /passwordHash/);
  assert.match(schema, /humanActionTokenHash/);
  assert.match(migration, /human_action_token_hash/);
  assert.match(humanActionRoute, /verifyPassword/);
  assert.match(humanActionRoute, /user\.role !== "admin"/);
  assert.match(auth, /human_action_project_id = \?/);
  assert.match(auth, /human_action_kind = \?/);
  assert.match(auth, /human_action_expires_at > \?/);
  assert.match(auth, /SET human_action_token_hash = ''/);
  assert.match(workspace, /\/api\/auth\/human-action/);
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
  assert.match(publicationRoute, /matchesCurrentCanon/);
  assert.match(publicationRoute, /expectedManuscriptKeys/);
  assert.match(publicationRoute, /expectedItemKeys/);
  assert.match(publicationRoute, /consumeHumanActionGrant/);
  assert.match(publicationRoute, /humanActionRequired: "publication\.write"/);
  assert.match(publicationRoute, /humanActionRequired: "publication\.delete"/);
  assert.match(publicationRoute, /validItemKinds/);
  assert.match(contentRoute, /p\.status = 'published'/);
  assert.match(projectRoute, /UPDATE publications/);
  assert.match(projectRoute, /cover_key = \?, cover_url = \?/);
  assert.match(projectRoute, /humanActionRequired: "project\.public-metadata"/);
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

test("ships a six-work admin-only Foundry canon review board with pending decisions", async () => {
  const [page, board, route, schema, packages, sidebar, canonPackage, cheongmaPackage, isekaiPackage, knightPackage, romancePackage, tyrantPackage, exporter] = await Promise.all([
    read("app/canon/page.tsx"),
    read("app/canon/canon-review-board.tsx"),
    read("app/api/canon/decisions/route.ts"),
    read("db/schema.ts"),
    read("app/canon-packages.ts"),
    read("app/global-sidebar.tsx"),
    read("data/canon/afterlife_restaurant.json"),
    read("data/canon/cheongma_restaurant.json"),
    read("data/canon/isekai_restaurant.json"),
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
  assert.match(packages, /isekai_restaurant/);
  assert.match(packages, /romance_fantasy_restaurant/);
  assert.match(packages, /tyrant_restaurant/);
  assert.match(packages, /listSyncableCanonPackages/);
  assert.match(knightPackage, /"title": "기사식당"/);
  assert.match(cheongmaPackage, /"title": "천마식당"/);
  assert.match(cheongmaPackage, /"sourceState": "committed"/);
  assert.match(cheongmaPackage, /"revisionSetSha256": "fe88f1f2672da3027998c4f99a8aa0272fb5fe32aff6003530f9023382a132e3"/);
  assert.match(cheongmaPackage, /"verdict": "pass"/);
  assert.match(isekaiPackage, /"title": "이계식당"/);
  assert.match(isekaiPackage, /"revisionSetSha256": "5118946b0745debd337e640725e8685c4ec3dc1bdd48617c8645e2a3b6f93dc5"/);
  assert.match(isekaiPackage, /"entityKey": "seo_jeongwoo"/);
  assert.match(isekaiPackage, /"bId": "B001"/);
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
  assert.match(canonPackage, /"revisionSetSha256": "632cb40c1a5297bf9ca0ab628a5dc63d27625c7e4b199f45ea6c65168bc0432b"/);
  assert.match(canonPackage, /"sourceGitCommit": "[0-9a-f]{40}"/);
  for (const hash of [
    "1217fa881b90d951de0c8169a2d07bdc185b7a17e8b96d8e6e985dd60ce05082",
    "701bf3b86420d71a78adfc81f230d1bb7c13ac401efe16aeb834cd810aac744f",
    "9d2d0f273269e04bf72f875972cdc8a60be1a0f300d016f6f849319c4d54d824",
    "23285a3853e6be3a82961368fbb4e7e2aaec8b0079d9d88eb8af55cbf1fbc0fb",
  ]) {
    assert.match(canonPackage, new RegExp(hash));
  }
});

test("projects Foundry canon fail-closed into the private workspace without mutating publication surfaces", async () => {
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
  assert.match(syncRoute, /storyyardProjection\.reverseSync !== false/);
  assert.match(syncRoute, /workspaceProjection\.reverseSync !== false/);
  assert.match(syncRoute, /foundry_storyyard_arc_episode_v2/);
  assert.doesNotMatch(syncRoute, /preserveConflicts/);
  assert.match(syncRoute, /repairLegacySnapshot\?: boolean/);
  assert.match(syncRoute, /input\?\.repairLegacySnapshot === true/);
  assert.match(syncRoute, /dryRun\?: boolean/);
  assert.match(syncRoute, /executeFoundryWrites\(env\.DB, writes, \{ dryRun \}\)/);
  assert.match(syncRoute, /publicationMutated: false/);
  assert.match(syncRoute, /access\.binding\.workSlug !== canonPackage\.workSlug/);
  assert.match(syncRoute, /normalizedTitle\(access\.project\.title\) !== normalizedTitle/);
  assert.match(syncRoute, /if \(report\.conflicts\.length\)/);
  assert.match(syncRoute, /const contentWriteCount = writes\.length/);
  assert.match(syncRoute, /contentWriteCount > 0 \|\| bindingNeedsUpdate/);
  assert.doesNotMatch(syncRoute, /UPDATE projects SET title = \?, logline = \?/);
  assert.doesNotMatch(syncRoute, /\.delete\(/);
  assert.doesNotMatch(syncRoute, /\bpublications\b/);
  assert.doesNotMatch(syncRoute, /\bpublication_episodes\b/);
  assert.doesNotMatch(syncRoute, /\bpublication_content\b/);
  assert.match(syncRoute, /ON CONFLICT\(project_id\) DO UPDATE/);
  assert.match(syncRoute, /canon_bindings/);
  assert.match(manuscriptRoute, /Foundry 승인 정본은 Storyyard에서 직접 수정할 수 없음/);
  assert.match(publicationRoute, /인간 관리자 확인이 있는 별도 정본 공개 작업/);
  assert.match(migration, /ALTER TABLE `manuscripts` ADD `meta`/);
  assert.match(migration, /ALTER TABLE `publication_episodes` ADD `meta`/);
  assert.match(workspace, /정본 전체 동기화/);
  assert.match(workspace, /repairLegacySnapshot: false/);
  assert.doesNotMatch(workspace, /preserveConflicts/);
  assert.match(workspace, /공개본은 변경하지 않음/);
  assert.match(workspace, /blockBodyPreview\(block\.body\)/);
  assert.match(workspace, /\.\.\.\(existingBlock \? readObject\(existingBlock\.meta\) : \{\}\)/);
  assert.match(workspace, /\.\.\.\(existing \? readObject\(existing\.meta\) : \{\}\)/);
});

test("executes no Foundry writes for dry-run or an empty plan", async () => {
  const { executeFoundryWrites } = await import("../app/foundry-sync-write-policy.mjs");
  const batches = [];
  const db = {
    async batch(statements) {
      batches.push(statements);
    },
  };
  const planned = [{ sql: "private write 1" }, { sql: "private write 2" }];
  await executeFoundryWrites(db, planned, { dryRun: true });
  await executeFoundryWrites(db, [], { dryRun: false });
  assert.equal(batches.length, 0);
  await executeFoundryWrites(db, planned, { dryRun: false });
  assert.equal(batches.length, 1);
  assert.equal(batches[0], planned);
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
