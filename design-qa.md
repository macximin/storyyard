# Storyyard design QA

## Visual truth

- Block relationship picker reference: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-df7c2c65-e440-449f-9ee3-64bfe9dccad3.png` (352×330)
- Character detail reference: `C:\Users\wjjo\AppData\Local\Temp\codex-clipboard-837bf6ea-48a7-4d3b-bb5d-b3d80399040a.png` (702×471)
- Implementation captures: `work/design-qa/block-inspector-local.png` (1265×712), `work/design-qa/character-list-local.png` (1280×720), `work/design-qa/character-detail-local-top.png` (1280×720)
- Side-by-side normalized comparisons: `work/design-qa/compare-block-picker.png`, `work/design-qa/compare-character-detail.png` (1400×760 each)

## State and viewport

- Local authenticated development state at 1265×712 and 1280×720.
- Plot inspector: one saved block with one linked character and one linked document.
- Character inspector: one character with a tag, description, custom field, and one linked plot block.
- Reference and implementation were normalized into the same 1400×760 comparison canvas without changing source aspect ratio.

## Fidelity review

- Typography: existing Storyyard display/body type system is retained. Hierarchy matches the references: oversized editable character name, compact section labels, readable body controls.
- Spacing: right inspectors use full-height, left-aligned sections with consistent separators and no centered Notion-style content column.
- Color: white, black, gray, and pale yellow remain the only dominant interface colors.
- Components: selected items are chips with immediate removal; search results are grouped in bordered selectors and show selected state; character metadata is broken into scannable sections.
- Copy: product language uses `아크`; unassigned arc descriptions use `TBD`.
- Image quality: no supplied raster assets are stretched. Avatar uploads are resized before storage and rendered with `object-fit: cover`.

## Interaction audit

- Block creation waits for the first nonblank title or body.
- Block edits autosave after 600 ms and expose saving, saved, failed, and recovered states.
- Closing a block waits for queued edits; failed content remains in browser draft storage.
- Character/document pickers support search, chips, add/remove, quick create, Arrow keys, Enter, and Escape.
- Character edits autosave after 600 ms and support tags, avatar, custom fields, pin/delete menu, sorting/filtering, linked-block backlinks, and linked-block creation.
- Character backlink opened the corresponding plot block inspector successfully.
- Current-route browser interaction produced no new console warning or error. Two earlier local-library JSON errors predated local database initialization and did not recur after initialization.

## Comparison history

1. Compared the supplied picker reference and rendered block inspector in one image. The same selection hierarchy, chips, search field, result list, and remove action are present; the implementation intentionally adds quick create and saved-state feedback.
2. Compared the supplied character reference and rendered character inspector in one image. The same avatar/name/metadata hierarchy is present; the implementation intentionally adds direct editing, autosave, custom fields, and linked-block actions.
3. Reopened both inspectors after saving and verified that saved content and relationships persisted.

final result: passed
