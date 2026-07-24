import { clearUserSession } from "@/app/chatgpt-auth";

export async function POST() {
  await clearUserSession();
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  await clearUserSession();
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") || "/";
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return Response.redirect(new URL(safe, url.origin), 303);
}
