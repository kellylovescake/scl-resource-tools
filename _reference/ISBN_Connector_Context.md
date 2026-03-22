# ISBN MCP Connector — Session Context
*Compiled from working session 03/18/2026*

---

## What We're Building

An MCP connector that accepts an ISBN and returns structured book metadata
and/or a cover image. It is a **fetch-on-demand, pass-through pipe** — no
data is stored in the connector's database. It fetches from external APIs
at call time, returns the result to Claude, and discards it.

This connector will be called by Claude during bibliography skill workflows
instead of requiring manual cover downloads or copy-paste metadata.

---

## Why We're Building It This Way

The Claude sandbox (bash environment) has outbound networking disabled at
the infrastructure level — not a code problem, an Anthropic infrastructure
decision. This means cover fetching cannot happen inside a Claude session.

MCP connectors run on their **own server** (Supabase Edge Functions in our
case), which has normal outbound network access. So the connector can reach
Syndetics, Open Library, or Google Books without restriction.

This is not a jailbreak or workaround — it's the intended architecture.
Connectors are the legitimate channel for network-dependent tool calls.

---

## Data Sources

### Cover Images
**Primary: Syndetics**
- URLs are embedded in the LS2 PAC RSS feed for each catalog list
- Format: `https://secure.syndetics.com/api/image?size=mc&isbn={ISBN}&noimage=unbound&client=sunflowerco`
- These are **public-facing URLs** — no ILS login required to fetch
- `noimage=unbound` returns a placeholder when no cover exists
- Placeholder detection: images ≤ 2KB are placeholders, skip them
- `mc` = medium cover size (~100×133px, about 1" wide)

**Fallback: Google Books API**
- `https://www.googleapis.com/books/v1/volumes?q=isbn:{ISBN13}`
- No API key required for basic use
- Returns a `thumbnail` URL in the JSON response
- Good ISBN coverage for modern titles

### Book Metadata
**Open Library**
- REST API, no key required
- Returns: title, author, subjects, description, edition notes, publish date
- Endpoint: `https://openlibrary.org/api/books?bibkeys=ISBN:{ISBN}&format=json&jscmd=data`
- Use case: correcting thin/old copy cataloging records at SCL
- Could flag records missing subjects, summaries, or normalized author data

---

## Tools the Connector Should Expose

Based on this session's identified use cases:

1. **get_cover(isbn)** → returns cover image bytes or null
2. **get_metadata(isbn)** → returns title, author, subjects, description, publish date
3. **get_full(isbn)** → cover + metadata in one call (for bibliography generation)

Possibly later:
4. **flag_thin_record(isbn)** → returns a quality score / list of missing fields
5. **batch_lookup(isbns[])** → accepts a list, returns array of results

---

## Infrastructure

### Existing Pattern to Crib From
- Open Brain MCP connector lives on Supabase (Edge Functions)
- Kelly already has a working Supabase instance with a deployed connector
- The ISBN connector needs its **own separate Supabase database** — do not
  mix with Open Brain
- Setup pattern (project creation, Edge Function deployment, MCP config) can
  be copied directly from Open Brain documentation Kelly already has

### What the Connector Stores
**Almost nothing.** The connector is stateless for cover fetches.
Optional light storage: a simple ISBN → metadata cache table to avoid
redundant API calls for frequently-used titles. Even then, text only —
covers are never stored, always fetched fresh.

### Why Supabase Cost Stays Low
- No image files stored
- Text metadata records are tiny
- Edge Function invocations are cheap at library-scale volume
- SCL will never hit free tier limits for this use case

---

## Downstream Skills That Will Use This Connector

1. **Cover Image Bibliography** (`generate_cover_list.js`) — currently
   requires covers to be fetched locally via Node.js; connector eliminates
   that requirement
2. **Standard Bibliography Builder** — could optionally pull metadata to
   pre-fill title/author from ISBN rather than requiring manual entry
3. **Annotated Bibliography** — could supplement Claude's annotations with
   real subject headings and descriptions from Open Library
4. **Catalog Quality Checker** (not yet built) — correction report tool
   for old copy cataloging records

---

## RSS Feed Structure (LS2 PAC)

Pulling from: `https://tlc.sunflower.lib.ms.us/list/static/{LIST_ID}/rss`

Each `<item>` contains:
- `<title>` — book title (may have trailing ` :` artifacts, clean them)
- `<dc:creator>` — author (may be empty for corporate/anonymous authors)
- `<description>` — HTML block containing a Syndetics `<img src="...">` URL
- `<description>` — also contains ISBN(s) in plain text

**What the RSS does NOT contain:** collection, call number. These must come
from a separate ILS export or user input.

The user must pull the RSS URL from LS2 PAC themselves — Claude cannot log
into the ILS. Instructions are in `COVER_SKILL.md`.

---

## Cover Image Layout (Finalized)

For the Cover Image Bibliography document:

```
[cover 1.3" col]  │  Title (bold, 10pt)
                  │  ── light rule ──
                  │  Author · Collection        Call #
```

- Cover column: 1.3" wide
- Gutter: 0.15"
- Text column: ~5.05"
- Cover display size: 96×128px (~1.0"×1.33")
- Entry numbers suppressed when real cover is present
- `cantSplit: true` on all rows — entries never split across pages

---

## Scripts Built This Session

All live in `scripts/` alongside `assets/scl-logo.png`:

| Script | Purpose |
|---|---|
| `generate_list.js` | Standard Bibliography Builder (existing) |
| `generate_annotated_list.js` | Annotated Bibliography (new this session) |
| `generate_cover_list.js` | Cover Image Bibliography (new this session) |

Color scheme swappable via four constants in any script:
- `SCL_ORANGE` — section headers, rules
- `SCL_DARK` — title text, bold elements
- `SCL_LIGHT` — title band background
- `SCL_RULE` — light separator rules

Dino test palette: green `#4A7C3F`, brown `#3B2A1A`, yellow `#D4A829` / `#FDFAE8`

---

## Node.js Context

- Kelly has Node.js installed (confirmed — used for Open Brain setup)
- Node runs JavaScript locally on her machine
- Local scripts have normal internet access — no sandbox restrictions
- The cover fetch script will run from terminal:
  ```bash
  node generate_cover_bibliography.js "https://tlc.sunflower.lib.ms.us/list/static/{ID}/rss" "Title" "Age Group" "Kelly Waddell, MLIS"
  ```
- A how-to doc for this local workflow is planned but not yet built

---

## Open Questions / Next Steps

- [ ] Build the ISBN MCP connector (new Supabase project, separate from Open Brain)
- [ ] Build the local Node.js how-to doc for cover bibliography script
- [ ] Suppress entry numbers in cover bibliography when cover is present (code change pending)
- [ ] Decide whether to cache metadata in connector DB or stay fully stateless
- [ ] Scope the catalog quality checker tool
