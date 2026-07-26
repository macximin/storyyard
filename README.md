# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes
- `npm run canon:export`: rebuild the bundled Foundry canon snapshot

## Human Canon Review

`/canon` is an administrator-only review surface. Foundry remains the source of
truth: Storyyard imports an immutable `firefly_story_package_v1` snapshot and
stores human decisions as `pending`. It does not edit manuscripts, Story Plan,
or Narrative State and it never promotes a version automatically.

The bundled packages are `afterlife_restaurant`, `knights_restaurant`,
`romance_fantasy_restaurant`, and `tyrant_restaurant`. The export verifies the
owner-approved episode hashes in each Foundry manuscript manifest before writing
`data/canon/<work_slug>.json`. By default it reads the sibling
`v3_firefly_studio/edge_repos/v3_ff_foundry` checkout. Set `FOUNDRY_ROOT` to an
explicit Foundry root when the checkout lives elsewhere, and set `WORK_SLUG` for
the package to rebuild.

After a Foundry canon change:

```bash
npm run canon:export
npm run db:generate # only when db/schema.ts changed
npm test
```

Decisions are recorded in `canon_decisions` with the exact bundle and artifact
SHA-256. An external, separately authorized apply worker may later consume
pending decisions; that worker is intentionally outside Storyyard.

### Foundry arc and episode projection

An administrator who owns a Storyyard project with the same title as a bundled
canon package can use `정본 아크·화 동기화` from the plot board. The projection
creates a separate `Foundry · <title>` plot and maps:

- one closed, active, or provisional B-Rail entry to one Storyyard arc;
- one committed or current-corridor episode to one Storyyard block;
- `work_slug + B ID + episode ID` to stable upstream identities in metadata.

If owner-approved opening episodes precede the first formal B-Rail arc,
Storyyard groups them under a projection-only `승인 오프닝 이력` arc. This does
not create or rename a Foundry B-Rail entry and never writes the grouping back
to Foundry.

The projection never deletes Storyyard content and never writes back to
Foundry. Source commit and hashes are retained. If a projected arc or episode
was edited locally after the last sync, the next sync reports a conflict and
preserves the local edit instead of overwriting it.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
