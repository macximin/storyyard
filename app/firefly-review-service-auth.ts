function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function constantTimeMatch(expected: string, actual: string): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return mismatch === 0;
}

export function hasDistinctBearerAuthority(
  request: Request,
  expectedToken: string,
  forbiddenToken: string,
): boolean {
  if (!expectedToken || (forbiddenToken && expectedToken === forbiddenToken)) return false;
  return constantTimeMatch(expectedToken, bearerToken(request));
}
