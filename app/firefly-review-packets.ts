import packet from "../data/firefly/review-packets/current.json";

export type FireflyDecision = "approve" | "polish" | "hold" | "reject";
export type FireflyReviewCandidate = {
  id: string;
  body: string;
  sha256: string;
  preparedAt: string;
  commercialScore: number | null;
  review: { status: string; retained: string[]; variedSurface: string[]; linkedConsequences: string[] };
};
export type FireflyReviewPacket = {
  schemaVersion: "firefly_review_packet/v1";
  packetId: string;
  packetSha256: string;
  generatedAt: string;
  source: { system: "inkos"; bookId: string; sourceRevision: string };
  work: { id: string; title: string; genre: string; status: string; targetChapters: number };
  artifact: { id: string; chapterNumber: number; title: string; status: string; currentContent: string; currentContentSha256: string };
  candidates: FireflyReviewCandidate[];
  recommendation: { candidateId: string; reason: string } | null;
  actions: ["approve", "polish", "hold", "reject"];
  authority: { canon: "inkos"; decisionSurface: "storyyard"; apply: "inkos"; reverseSync: false };
};

const packets = [packet as FireflyReviewPacket];
export function listFireflyReviewPackets(): FireflyReviewPacket[] { return packets; }
export function getFireflyReviewPacket(id: string): FireflyReviewPacket | undefined {
  return packets.find((item) => item.packetId === id);
}
