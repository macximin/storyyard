# Storyyard design QA

## Visual truth

- Block relationship picker reference: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-df7c2c65-e440-449f-9ee3-64bfe9dccad3.png` (352×330)
- Character detail reference: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-837bf6ea-48a7-4d3b-bb5d-b3d80399040a.png` (702×471)
- Multi-plot tabs reference: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-45911c72-db25-41e8-814f-c5ba1e08dd75.png` (575×166)
- Implementation captures: `work/design-qa/block-inspector-local.png` (1265×712), `work/design-qa/character-list-local.png` (1280×720), `work/design-qa/character-detail-local-top.png` (1280×720), `work/design-qa/multi-plot-local.png` (1265×712), `work/design-qa/character-links-local.png` (1280×720)
- Side-by-side normalized comparisons: `work/design-qa/compare-block-picker.png`, `work/design-qa/compare-character-detail.png` (1400×760 each), `work/design-qa/compare-multi-plot.png` (1400×430)

## State and viewport

- Local authenticated development state at 1265×712 and 1280×720.
- Plot inspector: one saved block with one linked character and one linked document.
- Character inspector: one character with a tag, description, custom field, and one linked plot block.
- Multi-plot state: two plot tabs, plot-specific titles and descriptions, different arc copy, and isolated block sets.
- Reference and implementation were normalized into shared comparison canvases without changing source aspect ratio. The multi-plot comparison uses a focused 720×180 implementation crop aligned to the reference's top tab-and-heading region.

## Fidelity review

- Typography: existing Storyyard display/body type system is retained. Hierarchy matches the references: oversized editable character name, compact section labels, readable body controls.
- Spacing: right inspectors use full-height, left-aligned sections with consistent separators and no centered Notion-style content column.
- Color: white, black, gray, and pale yellow remain the only dominant interface colors.
- Components: selected items are chips with immediate removal; search results are grouped in bordered selectors and show selected state; character metadata is broken into scannable sections.
- Plot tabs: the selected tab uses the same raised-tab silhouette and top-of-page placement as the reference. The source green accent is intentionally mapped to Storyyard's pale-yellow product token.
- Icons: new plot actions use Phosphor interface icons rather than text-drawn icon substitutes.
- Copy: product language uses `아크`; unassigned arc descriptions use `TBD`.
- Image quality: no supplied raster assets are stretched. Avatar uploads are resized before storage and rendered with `object-fit: cover`.

## Interaction audit

- Block creation waits for the first nonblank title or body.
- Block edits autosave after 600 ms and expose saving, saved, failed, and recovered states.
- Closing a block waits for queued edits; failed content remains in browser draft storage.
- Character/document pickers support search, chips, add/remove, quick create, Arrow keys, Enter, and Escape.
- Character edits autosave after 600 ms and support tags, avatar, custom fields, pin/delete menu, sorting/filtering, linked-block backlinks, and linked-block creation.
- Character backlink opened the corresponding plot block inspector successfully.
- Character list rows expose up to three linked block titles and preserve linked-block-count sorting.
- Created a second plot, renamed it, edited its description and first arc, created a block, linked a character, switched between plots, and verified that blocks and arc copy do not leak across tabs.
- Created and deleted a temporary third plot, confirming the destructive confirmation flow and return to a surviving plot. The final plot cannot be deleted.
- Current-route browser interaction produced no new console warning or error. Two earlier local-library JSON errors predated local database initialization and did not recur after initialization.

## Comparison history

1. Compared the supplied picker reference and rendered block inspector in one image. The same selection hierarchy, chips, search field, result list, and remove action are present; the implementation intentionally adds quick create and saved-state feedback.
2. Compared the supplied character reference and rendered character inspector in one image. The same avatar/name/metadata hierarchy is present; the implementation intentionally adds direct editing, autosave, custom fields, and linked-block actions.
3. Reopened both inspectors after saving and verified that saved content and relationships persisted.
4. Compared the supplied multi-plot header and the rendered two-tab plot workspace in one focused image. Tab placement, selected state, add action, page title, overflow menu, and one-line description are all present. No P0/P1/P2 mismatch remained.
5. Captured the revised character list and verified that linked block names are readable in the third column without collapsing the name or description columns.

## Public community expansion QA

### Visual truth

- Ranking/card references: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-2a4e6483-d714-4fa2-b441-16d9fd6cea68.png` and `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-de2d8979-1383-4d7d-9932-fb09645fa554.png`
- Embedded account form reference: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-31ac690c-5a2f-41bf-8738-cd04a20ccd65.png`
- Production captures: `work/design-qa-public/community-viewport.png`, `work/design-qa-public/community-mobile.png`, and `work/design-qa-public/community-mobile-auth.png`
- Shared comparison canvas: `work/design-qa-public/community-comparison.png`

### Production state and viewport

- Production URL verified at 1366×768 and 390×844.
- Anonymous state with the first-admin setup form visible inside the desktop sidebar.
- Mobile account panel opened from the fixed header and remained fully usable without a separate login route.
- Public database intentionally has no publication until the first administrator selects and publishes at least one manuscript.

### Fidelity review

- The production page retains Storyyard's white, black, gray, and pale-yellow system while adopting the reference ranking-grid hierarchy.
- The embedded account form is compact, visually subordinate to the community content, and matches the supplied pale-blue input treatment.
- Desktop uses a fixed 220 px navigation rail and a wide left-aligned content canvas; mobile reduces navigation to icon actions without squeezing the main content.
- The empty publication state preserves the future grid footprint rather than collapsing the page.
- Cover cards use a 2:3 slot, ranking number, title, pen name, rating, episode count, and favorite action. The first live grid remains data-gated, but its backing list/detail APIs were exercised with realistic local publication data.

### Interaction and release audit

- Local end-to-end API flow passed: first administrator setup, second user registration, project creation, manuscript autosave, publication snapshot, rating, comment, favorite, community listing, admin overview, and cascading project deletion.
- Production `/`, `/api/auth/status`, and `/api/community` returned 200 after deployment and database migration.
- Desktop and mobile account controls opened correctly; the mobile form includes display name, ID, password visibility, setup code, and persistent-login option.
- The release keeps raw passwords out of storage. PBKDF2-SHA256 password hashes and a 30-day HttpOnly, Secure, SameSite=Lax session cookie are used.
- No separate login landing page is required; anonymous reading remains available.

final result: passed
