import packet from "../data/firefly/review-packets/current.json";
import { validateFireflyReviewPacket } from "./firefly-review-contract";
export type { FireflyDecision, FireflyReviewPacket, FireflySurfaceClassificationReceipt, FireflySurfaceMatch, SurfaceClassification } from "./firefly-review-contract";
import type { FireflyReviewPacket } from "./firefly-review-contract";

const packets = [validateFireflyReviewPacket(packet)];
export function listFireflyReviewPackets(): FireflyReviewPacket[] { return packets; }
export function getFireflyReviewPacket(id: string): FireflyReviewPacket | undefined {
  return packets.find((item) => item.packetId === id);
}
