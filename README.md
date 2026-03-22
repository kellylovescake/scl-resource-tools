# SCL Resource Tools

Staff-facing web application for creating bibliographies and resource lists.
Built for Sunflower County Library System.

**Status:** All phases complete. App is fully functional and ready to deploy to Vercel.

---

## Table of Contents

1. [What this is](#what-this-is)
2. [Project structure](#project-structure)
3. [Local setup](#local-setup)
4. [Deployment (Vercel)](#deployment-vercel)
5. [The three modes](#the-three-modes)
6. [Manual QA checklist](#manual-qa-checklist)
7. [Known limitations](#known-limitations)
8. [Preserved baseline behavior](#preserved-baseline-behavior)
9. [Future seams](#future-seams)
10. [Safe edit points](#safe-edit-points)
11. [Marker index](#marker-index)
12. [Decision log](#decision-log)

---

## What this is

SCL Resource Tools is a staff-facing web app that wraps a core document
generation engine. Staff can:

- Look up a single ISBN and see metadata + cover image (**ISBN Blooper**)
- Paste an ILS staff export and download a branded DOCX bibliography (**Text Bibliography**)
- Paste a staff export + RSS feed and download a bibliography with cover images (**Cover Bibliography**)

The app is designed to be:
- Used internally by library staff
- Clean enough to include in a portfolio without modification
- Architecturally reusable (the engine is separate from the web wrapper)
- Ready for a future AI-enhanced version to be built on the same engine

---

## Project structure

```
/
├── _reference/              Reference-only copies of original working scripts.
│                            These are source of truth for baseline behavior.
│                            Do not modify them — compare against them.
│
├── public/
│   └── scl-logo.png        SCL brand logo. Used in DOCX footers and web UI.
│
├── src/
│   ├── app/                Next.js App Router pages and API routes.
│   │   ├── layout.tsx      App shell: top bar, footer, global layout.
│   │   ├── page.tsx        Home page: mode selection.
│   │   ├── blooper/        ISBN Blooper workflow pages.
│   │   ├── text-bibliography/   Text bibliography workflow pages.
│   │   ├── cover-bibliography/  Cover bibliography workflow pages.
│   │   └── api/            Server-side API routes (call the engine, return results).
│   │       ├── isbn-blooper/
│   │       ├── text-bibliography/
│   │       └── cover-bibliography/
│   │
│   ├── core/               THE ENGINE. Business logic lives here.
│   │   ├── colorways.ts    Brand color constants and layout dimensions.
│   │   ├── normalize.ts    Title and ISBN normalization utilities.
│   │   ├── parseStaffExport.ts  Parser for ILS staff export text.
│   │   ├── parseRssFeed.ts      RSS feed fetcher and parser.
│   │   ├── mergeItems.ts        Strict merge logic for cover bibliography.
│   │   ├── isbnService.ts       ISBN metadata and cover image fetching.
│   │   ├── annotationProvider.ts  Annotation provider interface + V1 manual impl.
│   │   └── buildDocx.ts    DOCX document builder for all three modes.
│   │
│   ├── components/         Reusable UI components (buttons, cards, forms, etc.)
│   │   └── ui/
│   │
│   ├── lib/                Shared utility functions for the web layer.
│   │
│   └── types/
│       └── index.ts        All shared TypeScript type definitions.
│
├── .env.local.example      Template for environment variables (copy → .env.local).
├── next.config.ts          Next.js configuration.
├── tailwind.config.ts      Tailwind CSS configuration (web UI colors).
├── tsconfig.json           TypeScript configuration.
└── README.md               This file.
```

---

## Local setup

> **If this is your first time:** Follow every step in order.
> Ask for help at any step — don't skip.

### Step 1 — Make sure Node.js is installed

Open a terminal (search "Terminal" or "Command Prompt" on your PC).
Type this and press Enter:

```
node --version
```

You should see something like `v20.x.x` or higher. If you see an error,
install Node.js from https://nodejs.org (choose the LTS version).

### Step 2 — Open the project folder in your terminal

In your terminal, navigate to this project folder:

```
cd "C:\Users\kelly\Bib Builder Website"
```

(Adjust the path if you moved the folder.)

### Step 3 — Install dependencies

This downloads all the libraries the project needs. Run:

```
npm install
```

This may take a minute. You should see a `node_modules` folder appear.
You only need to do this once (and again if `package.json` changes).

### Step 4 — Create your environment file

```
copy .env.local.example .env.local
```

The `.env.local` file is where secrets go. For V1, it contains no secrets —
the APIs used (Syndetics, Open Library, Google Books) require no API keys.
Still, create the file so the app knows where to look.

### Step 5 — Start the development server

```
npm run dev
```

You should see output ending in something like:
```
▲ Next.js ready on http://localhost:3000
```

Open your browser and go to: **http://localhost:3000**

You should see the SCL Resource Tools home page.

### Step 6 — Stop the server

Press `Ctrl + C` in the terminal to stop the dev server.

---

## Deployment (Vercel)

> Vercel is a hosting service that specializes in Next.js apps.
> It takes your code and makes it available on the internet.

### First deployment

1. Create a free account at https://vercel.com
2. Connect your GitHub account (or upload the project directly)
3. Import this project — Vercel will detect it is a Next.js app automatically
4. Click Deploy — no special configuration needed for V1

### Environment variables on Vercel

- Go to your project on vercel.com → Settings → Environment Variables
- Add any variables from `.env.local.example` that have real values
- For V1, no variables are required — all APIs used are unauthenticated

### Re-deploying after changes

If you push changes to GitHub, Vercel re-deploys automatically.
If you upload manually, use the Vercel CLI: `npx vercel --prod`

### Custom domain

Vercel gives you a free `.vercel.app` subdomain automatically.
To use a custom domain (e.g., `tools.sunflower.lib.ms.us`):
go to your project on vercel.com → Settings → Domains.

---

## The three modes

### ISBN Blooper

Single-ISBN lookup. Staff enters one ISBN and gets:
- Normalized ISBN (ISBN-10 and ISBN-13)
- Title, author, publisher, publication date
- Cover image (from Syndetics; Google Books fallback)
- Metadata source attribution
- Warning if no cover is found
- Copy JSON button (for debugging or record-keeping)

### Text Bibliography

Staff pastes ILS export text → reviews parsed items → optionally adds
annotations → reviews summary → downloads DOCX and merged JSON.

Input format handled (ILS export format):
```
* __Title.__ Author. Collection: Adult Non-Fiction, Call #: 005 M
```
Also handles: `Title / Author`, `Title — Author`, bare titles.

Annotations: optional, all-or-nothing. If enabled, every item gets one
plain-text field. Staff types them; AI annotations are a future feature.

### Cover Bibliography

Same as Text Bibliography, plus:
- Staff also pastes the RSS URL from the same ILS list
- App fetches the RSS, parses titles/ISBNs/cover URLs
- App merges staff export + RSS (strict rules — see below)
- App fetches cover images during generation
- Numbers are suppressed in cover mode (entries identified by cover + title)

Merge rules are strict: any mismatch blocks generation entirely.
See [Preserved baseline behavior](#preserved-baseline-behavior) and
`src/core/mergeItems.ts` for details.

---

## Manual QA checklist

Run these checks after every deployment or major change.
They do not require code — just a browser and one of your real lists.

### ISBN Blooper

- [ ] Open `/blooper`. Page loads with the input form.
- [ ] Click "Try a sample →". The Big Golden Book of Dinosaurs appears with a cover image.
- [ ] Enter a known ISBN by hand. Metadata and cover load correctly.
- [ ] Enter a clearly invalid string (e.g. `NOTANISBN`). Error card appears with a helpful message.
- [ ] Enter an ISBN for a book with no Syndetics cover. A "No cover found" placeholder appears (not a broken image).
- [ ] Click "Copy JSON". Paste into a text editor — confirms the raw JSON is valid.

### Text Bibliography

- [ ] Open `/text-bibliography`. Page loads with the input form.
- [ ] Paste a real staff export (at least 3 items). Enter title and "Prepared by". Click "Parse and preview →".
- [ ] Preview step shows the correct item count. Titles, authors, and call numbers look right.
- [ ] Click "Continue to review →". Summary card shows correct metadata and item count.
- [ ] Click "Generate bibliography →". DOCX downloads.
- [ ] Open the DOCX in Word. Check: SCL orange top border, logo in footer, "Prepared by: name" on one line, correct item count.
- [ ] Repeat with "Add annotations" checked. Confirm the annotation step appears and all-or-nothing rule blocks proceeding with empty fields.
- [ ] Open the DOCX with annotations. Check: annotation text appears below each item.
- [ ] Try "Include Hoopla". Open DOCX — Hoopla note appears.
- [ ] Download JSON. Open it — items array matches what was in the preview.

### Cover Bibliography

- [ ] Open `/cover-bibliography`. Page loads.
- [ ] Paste a real staff export AND its matching RSS URL. Click "Parse and merge →".
- [ ] Preview step shows "✓ Merge successful". Items and cover URL indicators look right.
- [ ] Click through to "Generate bibliography →". DOCX downloads.
- [ ] Open the DOCX in Word. Check: cover images appear beside items, no item numbers, correct layout.
- [ ] Try with a mismatched RSS URL (different list). Confirm the merge error screen appears with a clear explanation.
- [ ] Try with a staff export that has more items than the RSS. Confirm a count mismatch error appears.
- [ ] Click "← Go back and fix" from the merge error screen. Input form reappears with fields preserved.

### General

- [ ] Home page shows all three mode cards as active links.
- [ ] "← All tools" link works from every workflow page.
- [ ] "Start over" from any result screen returns to a blank input form.
- [ ] Test on a narrow browser window (simulating a tablet). Layout should not break.
- [ ] Confirm there are no browser console errors on any page.

---

## Known limitations

These are expected constraints in V1. They are not bugs.

| Limitation | Detail | Workaround |
|---|---|---|
| Vercel Hobby plan 10s timeout | Cover generation fetches images over the network. For lists of ~20 items this is usually under 10s, but slow Syndetics responses could time out. `maxDuration = 60` is set; it takes effect automatically if you upgrade to Vercel Pro. | Upgrade to Vercel Pro ($20/month) or retry if generation times out. |
| No authentication | V1 has no login. The app is accessible to anyone with the URL. | Deploy to Vercel with a custom domain and restrict at the DNS/firewall level, or add Vercel Password Protection (free tier option). |
| All-or-nothing annotations | If any item is missing an annotation, generation is blocked. There is no "skip this item" option. | Leave annotations off if you don't want to annotate every item. |
| Strict title matching for merge | Cover bibliography merge uses normalized title matching. Minor title differences between staff export and RSS can cause unmatched items. | Check that the staff export and RSS were both taken from the same list without edits. |
| Cover images: Syndetics only | Cover sources are Syndetics (primary) and Google Books (fallback for ISBN Blooper). Cover bibliography uses only Syndetics (from the RSS feed). If an item has no Syndetics cover, it renders without one. | No workaround in V1. Future: add Google Books fallback in cover mode. |

---

## Preserved baseline behavior

These behaviors come from the original working scripts and must not change
without explicit approval. The `_reference/` folder contains the original
scripts as source of truth.

| Behavior | Source file | Where it lives now |
|---|---|---|
| Staff export parsing | `generate_list.js` `parseIllList()` | `src/core/parseStaffExport.ts` |
| DOCX document layout (text mode) | `generate_list.js` `buildDocument()` | `src/core/buildDocx.ts` |
| DOCX document layout (annotated) | `generate_annotated_list.js` | `src/core/buildDocx.ts` |
| DOCX document layout (cover mode) | `generate_cover_list.js` | `src/core/buildDocx.ts` |
| SCL brand colors and dimensions | All three scripts | `src/core/colorways.ts` |
| Annotation rendering | `generate_annotated_list.js` | `src/core/buildDocx.ts` |

**New behaviors (approved during Phase 0):**
- Cover mode: numbers suppressed (was pending in original scripts; now locked)
- Footer: "Prepared by: name" must never wrap to a second line
- Footer: Page numbers hidden when document is only one page

---

## Future seams

These are architectural hooks preserved for future features.
They are not current features — they are clearly marked in the code.

### A. Future ISBN staff export format
Location: `src/core/parseStaffExport.ts`
Marker: `MARKER: FUTURE ISBN STAFF EXPORT SUPPORT`
When to use: if the ILS export ever includes ISBNs directly in the export text,
add a new parser here. The switch point is clearly marked.

### B. Future AI annotation provider
Location: `src/core/annotationProvider.ts`
Marker: `MARKER: FUTURE AI ANNOTATION PROVIDER`
When to use: to add AI-generated annotations, implement the AnnotationProvider
interface and add a case to `getAnnotationProvider()`.

### C. Future colorway / style selection
Location: `src/core/colorways.ts`, `tailwind.config.ts`
Marker: `MARKER: FUTURE AI STYLE SELECTION`
When to use: to support multiple visual themes (seasonal, subject-based, etc.),
define new colorway objects here and pass them into the DOCX builder.

### D. Future ISBN service provider (web → AI context)
Location: `src/core/isbnService.ts`
Marker: `MARKER: ISBN SERVICE PROVIDER`
When to use: when the AI wrapper needs to call ISBNs via MCP connector instead
of direct HTTP, implement an McpIsbnService and swap it in here.

### E. Future authentication
Location: `src/app/layout.tsx`, `.env.local.example`
Marker: `MARKER: FUTURE AUTH CONFIG`
When to use: wrap `{children}` in layout.tsx with an auth provider.
No other files need to change for basic auth.

---

## Safe edit points

Things that are safe to change without risk of breaking the engine:

| What | Where | Risk |
|---|---|---|
| UI text, labels, descriptions | `src/app/**/*.tsx` | None |
| Color values (brand update) | `src/core/colorways.ts` + `tailwind.config.ts` | Low — update both files |
| Error messages shown to staff | `src/core/mergeItems.ts`, API routes | None |
| Card layout on home page | `src/app/page.tsx` | None |
| App title and metadata | `src/app/layout.tsx` | None |
| Digital resources suggestions | UI components | None |

Things that are **not** safe to change without careful review:

| What | Why |
|---|---|
| `normalizeTitle()` in `normalize.ts` | Changing this changes merge keys — breaks existing merges |
| Merge rules in `mergeItems.ts` | Intentionally strict by design — see MARKER: STRICT MERGE RULES |
| DOCX dimensions in `colorways.ts` | Values are exact — changing them changes document layout |
| `parseIllExport()` regex patterns | Must match behavior of original `parseIllList()` |

---

## Marker index

Every major decision or seam point in the codebase is marked with a visible
`MARKER:` comment. Find any marker by searching the codebase for the marker name.

| Marker | File | Controls |
|---|---|---|
| `MARKER: ENGINE ENTRY` | `src/types/index.ts` | BibliographyJob and IsbnBlooperJob types — the contract between UI and engine |
| `MARKER: ENGINE ENTRY (ISBN Blooper)` | `src/core/isbnService.ts` | lookupIsbn() — main entry for Blooper |
| `MARKER: MODE ROUTING` | `src/app/page.tsx` | Where the three mode routes are defined |
| `MARKER: STAFF EXPORT PARSER SELECTION` | `src/core/parseStaffExport.ts` | Where to add a new staff export format |
| `MARKER: FUTURE ISBN STAFF EXPORT SUPPORT` | `src/core/parseStaffExport.ts` | Stub and instructions for ISBN-bearing export format |
| `MARKER: STRICT MERGE RULES` | `src/core/mergeItems.ts` | All cover bibliography merge validation |
| `MARKER: ANNOTATION MODE` | `src/core/annotationProvider.ts`, `src/types/index.ts` | Annotation mode switching and all-or-nothing enforcement |
| `MARKER: FUTURE AI ANNOTATION PROVIDER` | `src/core/annotationProvider.ts` | Where to plug in AI annotation generation |
| `MARKER: COLORWAY POLICY` | `src/core/colorways.ts`, `tailwind.config.ts` | Brand color constants for DOCX and web UI |
| `MARKER: FUTURE AI STYLE SELECTION` | `src/core/colorways.ts` | Where future AI-driven colorway selection would be added |
| `MARKER: ISBN SERVICE PROVIDER` | `src/core/isbnService.ts`, `.env.local.example` | Switch point between direct HTTP and MCP connector |
| `MARKER: ISBN BLOOPER DISPLAY` | `src/types/index.ts`, `src/app/blooper/` | IsbnBlooperResult shape and Blooper UI |
| `MARKER: REVIEW SUMMARY` | `src/types/index.ts` | ResultSummary shape used in review and result screens |
| `MARKER: DOCX GENERATION` | `src/core/buildDocx.ts` | Main DOCX builder — all three modes |
| `MARKER: FUTURE AUTH CONFIG` | `src/app/layout.tsx`, `.env.local.example` | Where to add authentication if needed |

*(buildDocx.ts markers will be added in Phase 1)*

---

## Decision log

Decisions made during planning and development. Most recent first.

---

### Phase 5 — 2026-03-21

**All phases complete. App is ready to deploy.**

**Tests:** 76/76 unit tests passing (`npm test`).

**Build:** `npm run build` passes cleanly. 10 routes total (4 static, 6 dynamic API routes).

**Changes in this phase:**
- `src/app/api/text-bibliography/generate/route.ts` — added `export const maxDuration = 60` (Vercel function timeout; capped at 10s on Hobby plan, full 60s on Pro)
- `src/app/api/cover-bibliography/generate/route.ts` — same `maxDuration` export (important here — cover generation makes network calls to Syndetics)
- `README.md` — added Manual QA Checklist and Known Limitations sections; updated status to "all phases complete"

**`maxDuration` rationale:**
Setting `maxDuration = 60` does not break the Hobby plan — Vercel silently caps it at 10s. On Pro/Enterprise it uses the full value. This means upgrading the plan automatically gives more headroom with zero code changes.

**Deployment recommendation:**
Start with Vercel Hobby (free). If cover generation times out on large lists (> ~25 items with slow Syndetics responses), upgrade to Pro. Text bibliography and ISBN Blooper have no network dependencies in their generate routes and will not time out.

---

### Phase 4 — 2026-03-21

**Cover Bibliography complete.** All three modes are now live and functional.

**Files added:**
- `src/app/api/cover-bibliography/parse/route.ts` — POST handler; runs `parseStaffExport()` and `parseRssFeed()` concurrently, then `mergeItems()`; returns `{ mergedItems, staffCount, rssCount }` on success or `{ mergeErrors, staffCount, rssCount }` with HTTP 409 on merge failure
- `src/app/api/cover-bibliography/generate/route.ts` — POST handler; fetches all cover images concurrently via `fetchCoverBytes()`; calls `buildDocx()`; returns `{ docxBase64, jsonData, summary }` with cover counts in summary
- `src/app/cover-bibliography/page.tsx` — 9-step state machine: `input → parsing → mergeError (if failed) → preview → annotating → review → generating → result → error`

**Home page:** All three mode cards are now "ready" and live links.

**Build verified:** `npm run build` passed cleanly. All 10 routes compiled.

**Merge error step:** Distinct from the generic error step. HTTP 409 signals a merge conflict (both inputs valid but incompatible). The UI renders each `MergeError` with its type heading, message, affects, action, and specific titles involved. Generation is blocked until the user fixes their inputs. See `MARKER: STRICT MERGE RULES`.

**Concurrent cover fetching:** `Promise.all` fetches all cover images in parallel in the generate route. `fetchCoverBytes()` has an 8-second per-request timeout. Failed/placeholder fetches set `hasCover: false` but do not block generation — the document generates with a blank cell for that item.

**Cover stats in result:** `ResultSummary` includes `itemsWithCovers` and `itemsWithoutCovers`. The result screen shows both counts and warns if any items had no cover image.

**RSS URL validation:** Basic `new URL()` check before attempting fetch. Meaningful error if the URL is not http/https format.

**409 vs 400 design decision:** Merge failures return 409 (Conflict) rather than 400 (Bad Request) because both inputs were syntactically valid — the conflict is semantic. The client uses the status code to decide whether to render `MergeErrorStep` (409) or `ErrorCard` (4xx/5xx).

---

### Phase 3 — 2026-03-21

**Text Bibliography complete.** Full end-to-end multi-step bibliography workflow is live.

**Files added:**
- `src/app/api/text-bibliography/parse/route.ts` — POST handler; calls `parseStaffExport()`; returns `{ items, warnings }` or `{ error }`
- `src/app/api/text-bibliography/generate/route.ts` — POST handler; validates job; calls `buildDocx()`; returns `{ docxBase64, jsonData, summary }` or `{ error }`
- `src/app/text-bibliography/page.tsx` — multi-step workflow client component with 8 states: `input → parsing → preview → annotating → review → generating → result → error`

**Home page:** Text Bibliography card activated (`"coming-soon"` → `"ready"`).

**Build verified:** `npm run build` passed cleanly. All 7 routes compiled.

**State machine design:** Flat `useState` hooks for each slice of data (parsedItems, parseWarnings, annotations, error, result) with a single `step` string variable controlling which component renders. Chosen over a discriminated union because back-navigation requires restoring data from multiple prior steps; flat state avoids carrying everything in every union variant.

**Annotation flow:** Annotation step only renders when `annotationMode === "manual"`. Word count shown live per item. Validation: all-or-nothing — every item must have a non-empty annotation before proceeding. Error banner and red field outlines on submit attempt with empty fields.

**Download mechanism:** API returns DOCX as base64 string in JSON (`docxBase64`). Client converts to `Uint8Array`, creates a `Blob`, and uses `URL.createObjectURL` + programmatic `<a>` click. JSON download uses the same pattern with `application/json` MIME type.

**Filename:** `SCL-{title-slug}.docx` / `SCL-{title-slug}.json` — title slugified (lowercase, hyphens, no special chars).

**Back navigation:** Each step has a "← Back" that returns to the previous step with all data preserved. Going back from `annotating` to `preview` preserves the in-progress annotation text (stored in page-level `annotations` state).

---

### Phase 2 — 2026-03-21

**ISBN Blooper complete.** Full end-to-end single-ISBN lookup feature is live.

**Files added:**
- `src/app/api/isbn-blooper/route.ts` — POST handler; calls `lookupIsbn()`; classifies errors as `input_format` (400) vs `external_service` (500)
- `src/components/ui/ErrorCard.tsx` — reusable product-shaped error display (amber for input/workflow errors, red for service errors)
- `src/components/ui/LoadingSpinner.tsx` — reusable spinner with sm/md/lg size prop
- `src/app/blooper/page.tsx` — full client-side Blooper UI: `BlooperPage`, `IsbnInputForm`, `BlooperResultCard`, `CoverDisplay`, `CopyJsonButton`, `IsbnBadge`, `SourceBadge`

**Home page:** Blooper card changed from `"coming-soon"` to `"ready"` and is now a live link.

**Build verified:** `npm run build` passed cleanly. All four routes compiled:
- `/` — static home (mode selection)
- `/blooper` — ISBN Blooper page
- `/api/isbn-blooper` — POST API route (dynamic)
- `/_not-found` — 404

**Sample ISBN:** `9780375859588` (*The Big Golden Book of Dinosaurs*) — hardcoded as `SAMPLE_ISBN` in `blooper/page.tsx` for the "Try a sample →" button.

**Cover display:** Base64-encoded JPEG via `data:image/jpeg;base64,...` inline `<img>`. Placeholder shown if `hasCover` is false or `coverImageData` is absent.

---

### Phase 1 — 2026-03-21

**Engine complete.** `src/core/buildDocx.ts` built and verified.

**Docx v9 API differences from v8 (discovered during port):**
- Page borders: `display` and `offsetFrom` moved into `pageBorders: { display, offsetFrom }` inside the borders object. Used `PageBorderDisplay.ALL_PAGES` and `PageBorderOffsetFrom.PAGE` enums.
- Page numbering: `pageNumberStart` / `pageNumberFormatType` moved into `page.pageNumbers: { start, formatType }`.

**Conditional page number implementation:**
Used `XmlComponent.prepForXml()` override to inject raw OOXML for a Word IF field: `{ IF { NUMPAGES } > 1 "{ PAGE } / { NUMPAGES }" "" }`. Requires `as unknown as Paragraph` cast at the TableCell insertion point — safe at runtime, documented in code. All 15 field runs documented by sequence in `buildDocx.ts`.

**Footer column widths (approved fix):**
`FOOTER_COL_MID` overridden to `1.8"` locally in `buildDocx.ts` (not in `colorways.ts`, which retains the original `2.0"` value for reference). `FOOTER_COL_RIGHT` becomes `~2.4"`, sufficient for typical staff names.

**cantSplit behavior confirmed:**
- Text-only rows: `cantSplit: false` (matches `generate_list.js`)
- Annotated rows: `cantSplit: true` (matches `generate_annotated_list.js`)
- Cover rows: `cantSplit: true` (matches `generate_cover_list.js`)

**Unit tests: 76 tests, all passing.**
- `normalize.test.ts` — 33 tests covering normalizeTitle, validateIsbn, ISBN conversion, cleanTrailingPunctuation, formatDateStr
- `parseStaffExport.test.ts` — 19 tests covering all input formats, edge cases, empty input, missing fields
- `mergeItems.test.ts` — 24 tests covering successful merges, count mismatch, unmatched titles, empty inputs, result metadata

**Test fixture correction:** `059046675X` is not a valid ISBN-10 (sum mod 11 ≠ 0). Replaced with `080442957X` (verified: sum = 209 = 19×11).

---

### Phase 0 — 2026-03-21

**Q: Do annotations apply to text-only bibliography only, or also cover bibliography?**
Decision: Both. Text-only and cover bibliography both support the annotation toggle.

**Q: In cover mode, when are entry numbers suppressed?**
Decision: Always. Cover mode never shows entry numbers, regardless of whether
a cover image loads. (The original scripts always showed numbers — this is an
approved behavior change.)

**Q: Should "Prepared by" have a default value?**
Decision: No default. Plain text field, required, always blank on first load.

**New footer behaviors (approved):**
- "Prepared by: name" must fit on one line — no wrapping
- Page numbers are hidden when the document is only one page

**Architecture decision: ISBN service split**
The web app uses direct HTTP calls to Syndetics/Open Library/Google Books.
A future AI wrapper would use the MCP connector on Supabase instead.
The switch point is clearly marked in `src/core/isbnService.ts`.

**Stack confirmed:** Next.js 15 + TypeScript + Tailwind CSS + Vercel

**Annotation mode:** Optional, all-or-nothing per bibliography.
V1: manual only. Future: AI-generated annotations via the provider seam.

**Digital resources:** Hoopla only in UI suggestion list.

**Date field:** Defaults to today. Not user-editable.

**`generate_annotated_list.js`:** Confirmed as real baseline behavior.
Folds into the text bibliography and cover bibliography modes as an
annotation toggle — not a separate mode.

**`generate_annotated_list (1).js`:** Accidental duplicate — ignored.
