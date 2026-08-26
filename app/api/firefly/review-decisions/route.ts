import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureFireflyReviewSnapshot, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { FireflyDecision, getFireflyReviewPacket } from "@/app/firefly-review-packets";
import { getDb } from "@/db";
import { fireflyReviewDecisions } from "@/db/schema";

const allowed = new Set<FireflyDecision>(["approve", "polish", "hold", "reject"]);

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const packetId = new URL(request.url).searchParams.get("packet_id")?.trim() ?? "";
  if (!getFireflyReviewPacket(packetId)) return Response.json({ error: "등록되지 않은 검토 패킷임." }, { status: 404 });
  const decisions = await getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.packetId, packetId))
    .orderBy(desc(fireflyReviewDecisions.createdAt));
  return Response.json({ decisions: decisions.map(toFireflyReviewDecisionContract) });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const input = await request.json().catch(() => null) as Partial<{
    packetId: string; packetSha256: string; candidateId: string;
    candidateSha256: string; decision: FireflyDecision; comment: string;
  }> | null;
  const packet = getFireflyReviewPacket(input?.packetId?.trim() ?? "");
  if (!packet) return Response.json({ error: "등록되지 않은 검토 패킷임." }, { status: 404 });
  if (input?.packetSha256 !== packet.packetSha256) {
    return Response.json({ error: "화면의 패킷이 현재 InkOS 스냅샷과 다름. 새로 열어 확인해 줘." }, { status: 409 });
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

  await ensureFireflyReviewSnapshot(packet);
  const [duplicate] = await getDb().select().from(fireflyReviewDecisions).where(and(
    eq(fireflyReviewDecisions.actorUserId, user.id),
    eq(fireflyReviewDecisions.packetId, packet.packetId),
    eq(fireflyReviewDecisions.candidateId, candidate.id),
    eq(fireflyReviewDecisions.decision, input.decision),
    eq(fireflyReviewDecisions.comment, comment),
    eq(fireflyReviewDecisions.status, "pending"),
  )).orderBy(desc(fireflyReviewDecisions.createdAt)).limit(1);
  if (duplicate && duplicate.createdAt >= new Date(Date.now() - 10_000).toISOString()) {
    return Response.json({ decision: toFireflyReviewDecisionContract(duplicate) });
  }
  const decision = {
    id: crypto.randomUUID(), packetId: packet.packetId, packetSha256: packet.packetSha256,
    bookId: packet.source.bookId, artifactId: packet.artifact.id,
    candidateId: candidate.id, candidateSha256: candidate.sha256,
    decision: input.decision, comment, actorUserId: user.id, actorEmail: user.email,
    status: "pending", createdAt: new Date().toISOString(), appliedAt: null, applyReceiptPath: null,
  };
  await getDb().insert(fireflyReviewDecisions).values(decision);
  return Response.json({ decision: toFireflyReviewDecisionContract(decision) }, { status: 201 });
}
