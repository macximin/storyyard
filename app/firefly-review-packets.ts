import packet from "../data/firefly/review-packets/current.json";
import packetIndex from "../data/firefly/review-packets/index.json";
import packetInvalidations from "../data/firefly/review-packets/invalidations.json";
import { validateFireflyReviewPacket } from "./firefly-review-contract";
import { mergeFireflyReviewPackets, validateFireflyReviewPacketStaticIndex } from "./firefly-review-packet-index.mjs";
export type { FireflyDecision, FireflyHumanPremiseCandidateV4, FireflyPitchReviewCandidateV3, FireflyReviewPacket, FireflySurfaceClassificationReceipt, FireflySurfaceMatch, SurfaceClassification } from "./firefly-review-contract";
import type { FireflyReviewPacket } from "./firefly-review-contract";

const indexedPackets = validateFireflyReviewPacketStaticIndex(packetIndex).packets;
if (packetInvalidations.schemaVersion !== "firefly_review_packet_invalidations/v1"
  || !Array.isArray(packetInvalidations.invalidations)) throw new Error("Invalid Firefly review packet invalidation registry.");
const invalidatedPacketIds = new Set(packetInvalidations.invalidations.map((item) => item.packetId));
const packets = mergeFireflyReviewPackets(indexedPackets, [validateFireflyReviewPacket(packet)])
  .filter((item) => !invalidatedPacketIds.has(item.packetId));
export function listFireflyReviewPackets(): FireflyReviewPacket[] { return [...packets]; }
export function getFireflyReviewPacket(id: string): FireflyReviewPacket | undefined {
  return packets.find((item) => item.packetId === id);
}
