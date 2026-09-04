import { and, desc, eq, or } from "drizzle-orm";
import { getChatGPTUser, runtimeSecret } from "@/app/chatgpt-auth";
import { validateAppliedReceipt, validateEvaluationAck } from "@/app/firefly-review-ack";
import { validateFireflyDecisionIntent } from "@/app/firefly-review-decision-intent";
import { ensureFireflyReviewSnapshot, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { allSurfaceMatches } from "@/app/firefly-review-contract";
import { FireflyDecision, getFireflyReviewPacket, SurfaceClassification } from "@/app/firefly-review-packets";
import { hasDistinctBearerAuthority } from "@/app/firefly-review-service-auth";
import { getDb } from "@/db";
import { fireflyReviewDecisions } from "@/db/schema";

const allowedSurfaceClassifications = new Set<SurfaceClassification>(["engine", "genre-convention", "source-surface", "canon-leak"]);

function decisionSchemaForPacket(schemaVersion: string): string {
  if (schemaVersion === "firefly_review_packet/v4") return "firefly_review_decision/v4";
  if (schemaVersion === "firefly_review_packet/v3") return "firefly_review_decision/v3";
  if (schemaVersion === "firefly_review_packet/v2") return "firefly_review_decision/v2";
  return "firefly_review_decision/v1";
}

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user?.role === "admin" ? user : null;
}

function hasReceiptAckAuthority(request: Request): boolean {
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
      or(
        eq(fireflyReviewDecisions.status, "applied"),
        eq(fireflyReviewDecisions.status, "acknowledged"),
      ),
    ))
    .limit(1);
  if (terminalDecision) {
    return Response.json({ error: "종료 확인된 검토 패킷임. 새 판정을 만들 수 없음." }, { status: 409 });
  }
  const intent = validateFireflyDecisionIntent(packet, input);
  if (!intent.ok) return Response.json({ error: intent.error }, { status: intent.status });
  const { comment, decision: decisionChoice, storedCandidateId, storedCandidateSha256 } = intent.value;

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
    const selectedCandidate = packet.candidates.find((item) => item.id === storedCandidateId);
    const selectedMatchIds = new Set(selectedCandidate?.review.surfaceComparison.surfaceMatches.map((match) => match.matchId) ?? []);
    if (decisionChoice === "select" && surfaceClassifications.some((item) => selectedMatchIds.has(item.matchId) && item.classification === "canon-leak")) {
      return Response.json({ error: "캐논 유입으로 분류된 후보는 선택할 수 없음. 동률·페어 무효를 검토해 줘." }, { status: 400 });
    }
  } else if (input.surfaceClassifications !== undefined) {
    return Response.json({ error: "이 패킷에는 v2 표면 분류를 기록할 수 없음." }, { status: 400 });
  }
  const surfaceClassificationsJson = JSON.stringify(surfaceClassifications);

  await ensureFireflyReviewSnapshot(packet);
  const [duplicate] = await getDb().select().from(fireflyReviewDecisions).where(and(
    eq(fireflyReviewDecisions.actorUserId, user.id),
    eq(fireflyReviewDecisions.schemaVersion, decisionSchemaForPacket(packet.schemaVersion)),
    eq(fireflyReviewDecisions.packetId, packet.packetId),
    eq(fireflyReviewDecisions.candidateId, storedCandidateId),
    eq(fireflyReviewDecisions.decision, decisionChoice),
    eq(fireflyReviewDecisions.comment, comment),
    eq(fireflyReviewDecisions.surfaceClassifications, surfaceClassificationsJson),
    eq(fireflyReviewDecisions.status, "pending"),
  )).orderBy(desc(fireflyReviewDecisions.createdAt)).limit(1);
  if (duplicate && duplicate.createdAt >= new Date(Date.now() - 10_000).toISOString()) {
    return Response.json({ decision: toFireflyReviewDecisionContract(duplicate) });
  }
  const decision = {
    id: crypto.randomUUID(),
    schemaVersion: decisionSchemaForPacket(packet.schemaVersion),
    packetId: packet.packetId, packetSha256: packet.packetSha256,
    bookId: packet.schemaVersion === "firefly_review_packet/v3" || packet.schemaVersion === "firefly_review_packet/v4" ? packet.source.slateId : packet.source.bookId,
    candidateId: storedCandidateId, candidateSha256: storedCandidateSha256,
    decision: decisionChoice, comment, surfaceClassifications: surfaceClassificationsJson,
    actorUserId: user.id, actorEmail: user.email,
    status: "pending", createdAt: new Date().toISOString(), appliedAt: null, applyReceiptPath: null,
  };
  await getDb().insert(fireflyReviewDecisions).values(decision);
  return Response.json({ decision: toFireflyReviewDecisionContract(decision) }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasReceiptAckAuthority(request)) {
    return Response.json({ error: "InkOS 영수증 확인 권한이 필요함." }, { status: 403 });
  }
  const input = await request.json().catch(() => null);
  const decisionId = typeof input === "object" && input !== null && "decisionId" in input
    ? String(input.decisionId)
    : "";
  const [stored] = await getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.id, decisionId)).limit(1);
  if (!stored) return Response.json({ error: "원판정을 찾지 못했음." }, { status: 404 });
  const packet = getFireflyReviewPacket(stored.packetId);
  if (!packet || packet.packetSha256 !== stored.packetSha256) {
    return Response.json({ error: "등록된 검토 패킷과 원판정이 일치하지 않음." }, { status: 409 });
  }
  if (packet.schemaVersion === "firefly_review_packet/v3" || packet.schemaVersion === "firefly_review_packet/v4") {
    return Response.json({ error: "기획 판정 적용 영수증은 InkOS 기획 경로에서 처리해야 함." }, { status: 409 });
  }
  const validation = packet.schemaVersion === "firefly_review_packet/v2"
    ? validateEvaluationAck(stored, input, packet.comparison.pairId)
    : validateAppliedReceipt(stored, input);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: validation.status });
  const { receipt } = validation;
  const terminalStatus = packet.schemaVersion === "firefly_review_packet/v2" ? "acknowledged" : "applied";
  const terminalAt = packet.schemaVersion === "firefly_review_packet/v2" ? receipt.acknowledgedAt : receipt.appliedAt;
  const terminalPath = packet.schemaVersion === "firefly_review_packet/v2" ? receipt.ackReceiptPath : receipt.applyReceiptPath;
  if (stored.status === terminalStatus) {
    if (stored.appliedAt !== terminalAt || stored.applyReceiptPath !== terminalPath) {
      return Response.json({ error: "이미 다른 영수증으로 종료 확인된 판정임." }, { status: 409 });
    }
    return Response.json({ decision: toFireflyReviewDecisionContract(stored) });
  }
  if (stored.status !== "pending") {
    return Response.json({ error: "종료 확인할 수 없는 판정 상태임." }, { status: 409 });
  }

  const [applied] = await getDb().update(fireflyReviewDecisions).set({
    status: terminalStatus,
    appliedAt: terminalAt,
    applyReceiptPath: terminalPath,
  }).where(and(
    eq(fireflyReviewDecisions.id, stored.id),
    eq(fireflyReviewDecisions.status, "pending"),
  )).returning();
  if (applied) return Response.json({ decision: toFireflyReviewDecisionContract(applied) });

  const [raced] = await getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.id, stored.id)).limit(1);
  if (raced?.status === terminalStatus
    && raced.appliedAt === terminalAt
    && raced.applyReceiptPath === terminalPath) {
    return Response.json({ decision: toFireflyReviewDecisionContract(raced) });
  }
  return Response.json({ error: "종료 확인 중 다른 영수증이 먼저 기록됐음." }, { status: 409 });
}
