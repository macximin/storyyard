import { getChatGPTUser, runtimeSecret } from "@/app/chatgpt-auth";
import { allSurfaceMatches } from "@/app/firefly-review-contract";
import { getFireflyReviewPacket } from "@/app/firefly-review-packets";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (user?.role !== "admin") return jsonError("관리자 권한이 필요함.", 403);
  const input = await request.json().catch(() => null);
  if (!isExactSliceRequest(input)) return jsonError("패킷과 match 식별자만 보내야 함.", 400);
  const packet = getFireflyReviewPacket(input.packetId);
  if (!packet || packet.schemaVersion !== "firefly_review_packet/v2") return jsonError("등록된 v2 검토 패킷이 아님.", 404);
  if (packet.packetSha256 !== input.packetSha256) return jsonError("화면의 패킷 SHA가 현재 스냅샷과 다름.", 409);
  const match = allSurfaceMatches(packet).find((item) => item.matchId === input.matchId);
  if (!match) return jsonError("패킷에 없는 표면 일치임.", 404);

  const gatewayUrl = runtimeSecret("STORYYARD_SOURCE_GATEWAY_URL");
  const privateJwkText = runtimeSecret("STORYYARD_SOURCE_GRANT_PRIVATE_JWK");
  const keyId = runtimeSecret("STORYYARD_SOURCE_GRANT_KEY_ID");
  if (!gatewayUrl || !privateJwkText || !keyId) return jsonError("private resolver가 준비되지 않았음.", 503);
  let gateway: URL;
  try { gateway = new URL(gatewayUrl); } catch { return jsonError("private resolver 주소가 올바르지 않음.", 503); }
  if (gateway.protocol !== "https:" || gateway.username || gateway.password || gateway.search || gateway.hash) {
    return jsonError("private resolver는 고정 HTTPS 주소여야 함.", 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  const claims = {
    iss: "storyyard",
    aud: "firefly-hq-source-slice",
    sub: user.id,
    authenticatedRole: "admin",
    ownerScope: user.email,
    iat: now,
    exp: now + 60,
    jti: crypto.randomUUID(),
    requestId,
    packetId: packet.packetId,
    packetSha256: packet.packetSha256,
    matchId: match.matchId,
    selectorSha256: match.selectorSha256,
    coordinateKind: match.source.coordinateKind,
    sourceId: match.source.sourceId,
    sourceSha256: match.source.sourceSha256,
    startByte: match.source.startByte,
    endByte: match.source.endByte,
    expectedSliceSha256: match.source.sliceSha256,
    maxBytes: 32_768,
  };
  let grant: string;
  try { grant = await signGrant(claims, privateJwkText, keyId); }
  catch { return jsonError("private resolver grant를 만들지 못했음.", 503); }

  let upstream: Response;
  try {
    upstream = await fetch(gateway, {
      method: "POST",
      headers: {
        authorization: `Bearer ${grant}`,
        "x-firefly-storyyard-service": "storyyard/v1",
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array(),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return jsonError("private resolver에 연결할 수 없음.", 503);
  }
  if (!upstream.ok) return jsonError("private resolver가 원문 구간 제공을 거절했음.", upstream.status === 401 || upstream.status === 403 ? 403 : 503);
  const declaredSha = upstream.headers.get("x-firefly-slice-sha256");
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > 32_768 || declaredSha !== match.source.sliceSha256 || await sha256(bytes) !== match.source.sliceSha256) {
    return jsonError("private resolver 응답 SHA가 selector와 다름.", 409);
  }
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return jsonError("private resolver 응답이 UTF-8 텍스트가 아님.", 409); }
  return new Response(bytes, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "content-type": "text/plain; charset=utf-8",
      "x-firefly-slice-sha256": match.source.sliceSha256,
      "x-firefly-request-id": requestId,
    },
  });
}

function isExactSliceRequest(value: unknown): value is { packetId: string; packetSha256: string; matchId: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(",") === "matchId,packetId,packetSha256"
    && typeof record.packetId === "string" && typeof record.packetSha256 === "string" && typeof record.matchId === "string";
}

async function signGrant(claims: Record<string, unknown>, privateJwkText: string, keyId: string): Promise<string> {
  const jwk = JSON.parse(privateJwkText) as JsonWebKey;
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d || !jwk.x) throw new Error("invalid Ed25519 JWK");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: keyId })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${base64Url(signature)}`;
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}
