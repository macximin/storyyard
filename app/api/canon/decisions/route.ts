import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureCanonSnapshot } from "@/app/canon-data";
import { CanonDecisionValue, getCanonPackage } from "@/app/canon-packages";
import { getDb } from "@/db";
import { canonDecisions } from "@/db/schema";

const decisions = new Set<CanonDecisionValue>(["approve", "conditional", "revise", "reject"]);

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const workSlug = new URL(request.url).searchParams.get("work_slug")?.trim() ?? "";
  if (!getCanonPackage(workSlug)) {
    return Response.json({ error: "등록되지 않은 캐논 패키지임." }, { status: 404 });
  }
  const rows = await getDb().select().from(canonDecisions)
    .where(eq(canonDecisions.workSlug, workSlug))
    .orderBy(desc(canonDecisions.createdAt));
  return Response.json({ decisions: rows });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const input = await request.json().catch(() => null) as Partial<{
    workSlug: string;
    bundleSha256: string;
    artifactKey: string;
    artifactSha256: string;
    decision: CanonDecisionValue;
    comment: string;
  }> | null;
  const workSlug = input?.workSlug?.trim() ?? "";
  const canonPackage = getCanonPackage(workSlug);
  if (!canonPackage) return Response.json({ error: "등록되지 않은 캐논 패키지임." }, { status: 404 });
  if (input?.bundleSha256 !== canonPackage.bundleSha256) {
    return Response.json({ error: "화면의 패키지가 최신 스냅샷과 다름. 새로 열어 확인해 줘." }, { status: 409 });
  }
  if (!input.decision || !decisions.has(input.decision)) {
    return Response.json({ error: "판정값이 올바르지 않음." }, { status: 400 });
  }
  const artifact = input.artifactKey === "__bundle__"
    ? { key: "__bundle__", sha256: canonPackage.bundleSha256 }
    : canonPackage.artifacts.find((item) => item.key === input.artifactKey);
  if (!artifact || artifact.sha256 !== input.artifactSha256) {
    return Response.json({ error: "판정 대상의 해시가 캐논 스냅샷과 다름." }, { status: 409 });
  }
  const comment = input.comment?.trim() ?? "";
  if (comment.length > 2_000) {
    return Response.json({ error: "의견은 2,000자 이내로 작성해 줘." }, { status: 400 });
  }
  if (input.decision !== "approve" && !comment) {
    return Response.json({ error: "조건부 승인·수정·반려에는 근거가 필요함." }, { status: 400 });
  }

  await ensureCanonSnapshot(canonPackage);
  const duplicateWindow = new Date(Date.now() - 10_000).toISOString();
  const [duplicate] = await getDb().select({ id: canonDecisions.id })
    .from(canonDecisions)
    .where(and(
      eq(canonDecisions.actorUserId, user.id),
      eq(canonDecisions.bundleSha256, canonPackage.bundleSha256),
      eq(canonDecisions.artifactKey, artifact.key),
      eq(canonDecisions.decision, input.decision),
      eq(canonDecisions.comment, comment),
      eq(canonDecisions.status, "pending"),
    ))
    .orderBy(desc(canonDecisions.createdAt))
    .limit(1);
  if (duplicate) {
    const [row] = await getDb().select().from(canonDecisions).where(eq(canonDecisions.id, duplicate.id));
    if (row && row.createdAt >= duplicateWindow) return Response.json({ decision: row });
  }

  const row = {
    id: crypto.randomUUID(),
    workSlug,
    bundleSha256: canonPackage.bundleSha256,
    artifactKey: artifact.key,
    artifactSha256: artifact.sha256,
    decision: input.decision,
    comment,
    actorUserId: user.id,
    actorEmail: user.email,
    status: "pending",
    createdAt: new Date().toISOString(),
    appliedAt: null,
    applyReceiptPath: null,
  };
  await getDb().insert(canonDecisions).values(row);
  return Response.json({ decision: row }, { status: 201 });
}
