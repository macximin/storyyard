import { createHash } from "node:crypto";
import { validateFireflyReviewPacket } from "./firefly-review-contract.ts";

export const FIREFLY_REVIEW_PACKET_INDEX_SCHEMA = "firefly_review_packet_static_index/v1";

const SHA256 = /^[0-9a-f]{64}$/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePackets(left, right) {
  const leftPlanning = left.schemaVersion === "firefly_review_packet/v3" ? 0 : 1;
  const rightPlanning = right.schemaVersion === "firefly_review_packet/v3" ? 0 : 1;
  if (leftPlanning !== rightPlanning) return leftPlanning - rightPlanning;
  return compareText(left.work.genre, right.work.genre)
    || compareText(left.work.id, right.work.id)
    || ((left.comparison?.round ?? 0) - (right.comparison?.round ?? 0))
    || compareText(left.comparison?.pairId ?? "", right.comparison?.pairId ?? "")
    || compareText(left.packetId, right.packetId);
}

export function buildFireflyReviewPacketStaticIndex(values) {
  const packets = values.map((value) => {
    const packet = validateFireflyReviewPacket(value);
    if (!["firefly_review_packet/v2", "firefly_review_packet/v3"].includes(packet.schemaVersion)) {
      throw new Error("The generated static index accepts immutable Firefly review packet v2 or v3 values only.");
    }
    return packet;
  }).sort(comparePackets);

  const packetIds = new Set();
  const packetShas = new Set();
  for (const packet of packets) {
    if (packetIds.has(packet.packetId)) throw new Error(`Duplicate Firefly review packet ID: ${packet.packetId}`);
    if (packetShas.has(packet.packetSha256)) throw new Error(`Duplicate Firefly review packet SHA-256: ${packet.packetSha256}`);
    packetIds.add(packet.packetId);
    packetShas.add(packet.packetSha256);
  }

  return {
    schemaVersion: FIREFLY_REVIEW_PACKET_INDEX_SCHEMA,
    indexSha256: sha256(JSON.stringify(packets)),
    packets,
  };
}

export function validateFireflyReviewPacketStaticIndex(value) {
  if (!isRecord(value)) throw new Error("Firefly review packet static index must be an object.");
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["indexSha256", "packets", "schemaVersion"])) {
    throw new Error("Firefly review packet static index has missing or unknown fields.");
  }
  if (value.schemaVersion !== FIREFLY_REVIEW_PACKET_INDEX_SCHEMA) {
    throw new Error("Unsupported Firefly review packet static index schema.");
  }
  if (typeof value.indexSha256 !== "string" || !SHA256.test(value.indexSha256)) {
    throw new Error("Firefly review packet static index SHA-256 is invalid.");
  }
  if (!Array.isArray(value.packets)) throw new Error("Firefly review packet static index packets must be an array.");

  const normalized = buildFireflyReviewPacketStaticIndex(value.packets);
  if (normalized.indexSha256 !== value.indexSha256) {
    throw new Error("Firefly review packet static index SHA-256 mismatch.");
  }
  if (JSON.stringify(normalized.packets) !== JSON.stringify(value.packets)) {
    throw new Error("Firefly review packet static index packets are not in canonical order.");
  }
  return normalized;
}

export function mergeFireflyReviewPackets(indexedPackets, legacyPackets) {
  const packets = [];
  const byId = new Map();
  for (const packet of [...indexedPackets, ...legacyPackets]) {
    const existing = byId.get(packet.packetId);
    if (existing) {
      if (existing.packetSha256 !== packet.packetSha256) {
        throw new Error(`Conflicting Firefly review packet ID: ${packet.packetId}`);
      }
      continue;
    }
    byId.set(packet.packetId, packet);
    packets.push(packet);
  }
  return packets;
}
