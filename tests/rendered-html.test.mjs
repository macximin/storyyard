import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

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
