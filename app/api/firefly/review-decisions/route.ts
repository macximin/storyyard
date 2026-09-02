import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser, runtimeSecret } from "@/app/chatgpt-auth";
import { validateAppliedReceipt } from "@/app/firefly-review-ack";
import { ensureFireflyReviewSnapshot, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { allSurfaceMatches } from "@/app/firefly-review-contract";
import { FireflyDecision, getFireflyReviewPacket, SurfaceClassification } from "@/app/firefly-review-packets";
import { hasDistinctBearerAuthority } from "@/app/firefly-review-service-auth";
import { getDb } from "@/db";
import { fireflyReviewDecisions } from "@/db/schema";

const allowed = new Set<FireflyDecision>(["approve", "polish", "hold", "reject"]);
const allowedSurfaceClassifications = new Set<SurfaceClassification>(["engine", "genre-convention", "source-surface", "canon-leak"]);

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user?.role === "admin" ? user : null;
}

function hasApplyAuthority(request: Request): boolean {
  return hasDistinctBearerAuthority(
    request,
    runtimeSecret("STORYYARD_APPLY_TOKEN"),
    runtimeSecret("STORYYARD_REVIEW_SYNC_TOKEN"),
  );
}

function hasReviewSyncAuthority(request: Request): boolean {
  return hasDistinctBearerAuthority(
    request,
    runtimeSecret("STORYYARD_REVIEW_SYNC_TOKEN"),
    runtimeSecret("STORYYARD_APPLY_TOKEN"),
  );
}

export async function GET(request: Request) {
  if (!hasReviewSyncAuthority(request)) {
    const user = await requireAdmin();
    if (!user) return Response.json({ error: "관리자 또는 검토 동기화 읽기 권한이 필요함." }, { status: 403 });
  }
  const packetId = new URL(request.url).searchParams.get("packet_id")?.trim() ?? "";
  if (!packetId) return Response.json({ error: "packet_id가 필요함." }, { status: 400 });
  if (!getFireflyReviewPacket(packetId)) return Response.json({ error: "등록되지 않은 검토 패킷임." }, { status: 404 });
  const decisions = await getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.packetId, packetId))
    .orderBy(desc(fireflyReviewDecisions.createdAt));
  return Response.json(
    { decisions: decisions.map(toFireflyReviewDecisionContract) },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const input = await request.json().catch(() => null) as Partial<{
    packetId: string; packetSha256: string; candidateId: string;
    candidateSha256: string; decision: FireflyDecision; comment: string;
    surfaceClassifications: Array<{ matchId: string; selectorSha256: string; classification: SurfaceClassification }>;
  }> | null;
  const packet = getFireflyReviewPacket(input?.packetId?.trim() ?? "");
  if (!packet) return Response.json({ error: "등록되지 않은 검토 패킷임." }, { status: 404 });
  if (input?.packetSha256 !== packet.packetSha256) {
    return Response.json({ error: "화면의 패킷이 현재 InkOS 스냅샷과 다름. 새로 열어 확인해 줘." }, { status: 409 });
  }
  const [terminalDecision] = await getDb().select({ id: fireflyReviewDecisions.id })
    .from(fireflyReviewDecisions)
    .where(and(
      eq(fireflyReviewDecisions.packetId, packet.packetId),
      eq(fireflyReviewDecisions.status, "applied"),
    ))
    .limit(1);
  if (terminalDecision) {
    return Response.json({ error: "InkOS 적용까지 끝난 검토 패킷임. 새 판정을 만들 수 없음." }, { status: 409 });
  }
  if (!input.decision || !allowed.has(input.decision)) return Response.json({ error: "판정값이 올바르지 않음." }, { status: 400 });
  const candidate = packet.candidates.find((item) => item.id === input.candidateId);
  if (!candidate || candidate.sha256 !== input.candidateSha256) {
    return Response.json({ error: "후보 원고의 해시가 검토 패킷과 다름." }, { status: 409 });
  }
  const comment = input.comment?.trim() ?? "";
  if (comment.length > 2_000) return Response.json({ error: "의견은 2,000자 이내로 작성해 줘." }, { status: 400 });
  if (input.decision !== "approve" && !comment) {
    return Response.json({ error: "폴리싱·보류·반려에는 작업 지시나 근거가 필요함." }, { status: 400 });
  }

  const classifiedAt = new Date().toISOString();
  let surfaceClassifications: Array<{
    matchId: string; selectorSha256: string; classification: SurfaceClassification;
    classifiedByActorId: string; classifiedByRole: "admin"; ownerScope: string; classifiedAt: string;
  }> = [];
  if (packet.schemaVersion === "firefly_review_packet/v2") {
    const expectedMatches = allSurfaceMatches(packet);
    const supplied = input.surfaceClassifications;
    if (!Array.isArray(supplied) || supplied.length !== expectedMatches.length) {
      return Response.json({ error: "v2 판정 전 모든 표면 일치를 사람이 분류해야 함." }, { status: 400 });
    }
    const suppliedById = new Map<string, typeof supplied[number]>();
    for (const item of supplied) {
      if (!item || typeof item.matchId !== "string" || suppliedById.has(item.matchId)
        || typeof item.selectorSha256 !== "string" || !allowedSurfaceClassifications.has(item.classification)) {
        return Response.json({ error: "표면 일치 분류값이 올바르지 않음." }, { status: 400 });
      }
      suppliedById.set(item.matchId, item);
    }
    if (expectedMatches.some((match) => suppliedById.get(match.matchId)?.selectorSha256 !== match.selectorSha256)) {
      return Response.json({ error: "표면 일치 selector가 현재 패킷과 다름." }, { status: 409 });
    }
    surfaceClassifications = expectedMatches.map((match) => {
      const item = suppliedById.get(match.matchId);
      if (!item) throw new Error("validated surface classification disappeared");
      return {
        matchId: match.matchId,
        selectorSha256: match.selectorSha256,
        classification: item.classification,
        classifiedByActorId: user.id,
        classifiedByRole: "admin" as const,
        ownerScope: user.email,
        classifiedAt,
      };
    });
    if (input.decision === "approve" && surfaceClassifications.some((item) => item.classification === "canon-leak")) {
      return Response.json({ error: "캐논 유입으로 분류된 후보는 승인할 수 없음. 폴리싱·보류·반려를 선택해 줘." }, { status: 400 });
    }
  } else if (input.surfaceClassifications !== undefined) {
    return Response.json({ error: "v1 패킷에는 v2 표면 분류를 기록할 수 없음." }, { status: 400 });
  }
  const surfaceClassificationsJson = JSON.stringify(surfaceClassifications);

  await ensureFireflyReviewSnapshot(packet);
  const [duplicate] = await getDb().select().from(fireflyReviewDecisions).where(and(
    eq(fireflyReviewDecisions.actorUserId, user.id),
    eq(fireflyReviewDecisions.schemaVersion, packet.schemaVersion === "firefly_review_packet/v2" ? "firefly_review_decision/v2" : "firefly_review_decision/v1"),
    eq(fireflyReviewDecisions.packetId, packet.packetId),
    eq(fireflyReviewDecisions.candidateId, candidate.id),
    eq(fireflyReviewDecisions.decision, input.decision),
    eq(fireflyReviewDecisions.comment, comment),
    eq(fireflyReviewDecisions.surfaceClassifications, surfaceClassificationsJson),
    eq(fireflyReviewDecisions.status, "pending"),
  )).orderBy(desc(fireflyReviewDecisions.createdAt)).limit(1);
  if (duplicate && duplicate.createdAt >= new Date(Date.now() - 10_000).toISOString()) {
    return Response.json({ decision: toFireflyReviewDecisionContract(duplicate) });
  }
  const decision = {
    id: crypto.randomUUID(),
    schemaVersion: packet.schemaVersion === "firefly_review_packet/v2" ? "firefly_review_decision/v2" : "firefly_review_decision/v1",
    packetId: packet.packetId, packetSha256: packet.packetSha256,
    bookId: packet.source.bookId, artifactId: packet.artifact.id,
    candidateId: candidate.id, candidateSha256: candidate.sha256,
    decision: input.decision, comment, surfaceClassifications: surfaceClassificationsJson,
    actorUserId: user.id, actorEmail: user.email,
    status: "pending", createdAt: new Date().toISOString(), appliedAt: null, applyReceiptPath: null,
  };
  await getDb().insert(fireflyReviewDecisions).values(decision);
  return Response.json({ decision: toFireflyReviewDecisionContract(decision) }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasApplyAuthority(request)) {
    return Response.json({ error: "InkOS 적용 확인 권한이 필요함." }, { status: 403 });
  }
  const input = await request.json().catch(() => null);
  const decisionId = typeof input === "object" && input !== null && "decisionId" in input
    ? String(input.decisionId)
    : "";
  const [stored] = await getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.id, decisionId)).limit(1);
  if (!stored) return Response.json({ error: "원판정을 찾지 못했음." }, { status: 404 });
  const validation = validateAppliedReceipt(stored, input);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: validation.status });
  const { receipt } = validation;
  if (stored.status === "applied") {
    if (stored.appliedAt !== receipt.appliedAt || stored.applyReceiptPath !== receipt.applyReceiptPath) {
      return Response.json({ error: "이미 다른 InkOS 영수증으로 적용 확인된 판정임." }, { status: 409 });
    }
    return Response.json({ decision: toFireflyReviewDecisionContract(stored) });
  }
  if (stored.status !== "pending") {
    return Response.json({ error: "적용 확인할 수 없는 판정 상태임." }, { status: 409 });
  }

  const [applied] = await getDb().update(fireflyReviewDecisions).set({
    status: "applied",
    appliedAt: receipt.appliedAt,
    applyReceiptPath: receipt.applyReceiptPath,
  }).where(and(
    eq(fireflyReviewDecisions.id, stored.id),
    eq(fireflyReviewDecisions.status, "pending"),
  )).returning();
  if (applied) return Response.json({ decision: toFireflyReviewDecisionContract(applied) });

  const [raced] = await getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.id, stored.id)).limit(1);
  if (raced?.status === "applied"
    && raced.appliedAt === receipt.appliedAt
    && raced.applyReceiptPath === receipt.applyReceiptPath) {
    return Response.json({ decision: toFireflyReviewDecisionContract(raced) });
  }
  return Response.json({ error: "적용 확인 중 다른 영수증이 먼저 기록됐음." }, { status: 409 });
}
