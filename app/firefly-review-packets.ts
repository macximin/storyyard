import packet from "../data/firefly/review-packets/current.json";
import packetIndex from "../data/firefly/review-packets/index.json";
import { validateFireflyReviewPacket } from "./firefly-review-contract";
import { mergeFireflyReviewPackets, validateFireflyReviewPacketStaticIndex } from "./firefly-review-packet-index.mjs";
export type { FireflyDecision, FireflyPitchReviewCandidateV3, FireflyReviewPacket, FireflySurfaceClassificationReceipt, FireflySurfaceMatch, SurfaceClassification } from "./firefly-review-contract";
import type { FireflyReviewPacket } from "./firefly-review-contract";

const indexedPackets = validateFireflyReviewPacketStaticIndex(packetIndex).packets;
const packets = mergeFireflyReviewPackets(indexedPackets, [validateFireflyReviewPacket(packet)]);
export function listFireflyReviewPackets(): FireflyReviewPacket[] { return [...packets]; }
export function getFireflyReviewPacket(id: string): FireflyReviewPacket | undefined {
  return packets.find((item) => item.packetId === id);
}
