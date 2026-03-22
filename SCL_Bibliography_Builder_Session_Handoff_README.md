# SCL Resource Tools / Bibliography Builder Session Handoff

## Goal of this work
Turn the already-working local bibliography scripts into a reusable, staff-friendly Sunflower County Library workflow that can also become a strong portfolio piece.

## What is already real
- The local Node terminal pipeline works.
- `generate_list.js` is the stable text-only generator.
- `generate_cover_list.js` is the working cover-image bibliography generator.
- The current gap is not feasibility. The gap is productization and staff usability.

## Working product model
This should be **one document engine with multiple modes**, not separate products.

### Mode 0: ISBN Blooper
Purpose:
- Single-ISBN lookup for cataloging verification or quick metadata checks.

Input:
- One ISBN

Output:
- One JSON object with metadata, cover status, source info, and optional raw payload.

### Mode 1: Text-only bibliography
Input:
- Staff export text

Output:
- Branded `.docx` bibliography
- Call numbers included
- No covers

### Mode 2: Cover bibliography
Input:
- Staff export text
- RSS feed from the **same** ILS list

Output:
- Branded `.docx` bibliography
- Call numbers included where available
- Covers included where ISBN lookup succeeds

## Critical workflow rule
If the user wants covers, they must generate:
1. the staff export text
2. the RSS feed

Both must come from the **same ILS list** without adding or removing titles in between.

## Matching and merge rules
- Order does **not** matter.
- Titles should be alphabetized by title, but alphabetical order is **not** the merge key.
- Every title in the staff export must have exactly one counterpart in the RSS feed.
- Merge by normalized title.
- Use author only as a duplicate-title fallback.
- Fail if:
  - title counts differ
  - titles are missing on either side
  - extra titles appear
  - duplicate titles cannot be matched safely

## Visual rendering rules
- Print and digital resources should use the **same visual entry design**.
- Digital resources with ISBNs should support covers too, including Hoopla items.
- There should not be separate print and digital layouts.
- Each entry can optionally include:
  - cover
  - title
  - author
  - collection/platform/source label
  - call number (if available)

## Annotation design decision
Future annotations should be an **optional enrichment layer**, not a separate product.

Desired annotation modes:
- none
- auto
- manual_only
- auto_with_manual_override

Design decision:
- add annotation fields to item schema now so later expansion is easier
- manual override should always win over generated annotation

## Top-level architecture decision
The whole project should be framed as **SCL Resource Tools**, not just a bibliography builder.

Top-level job types:
- `isbn_blooper`
- `text_only_bibliography`
- `cover_bibliography`

## Script inventory / files already in play

### Existing local / uploaded scripts and files
- `/mnt/data/generate_list.js`
  - Stable text-only branded bibliography generator
- `/mnt/data/generate_cover_list.js`
  - Working cover-image bibliography generator
- `/mnt/data/README-bibliography-builder.md`
  - Existing notes on what has been tried and decided
- `/mnt/data/SKILL-ill-resource-list.md`
  - Skill file / bibliography-related instructions or format reference
- `/mnt/data/scl-logo.png`
  - SCL logo asset used in document branding

### Modules planned but not yet created in this chat
These were designed conceptually today, but **not yet implemented as code files**:
- `parseStaffExport.js`
- `parseRssFeed.js`
- `normalize.js`
- `mergeItems.js`
- `fetchCovers.js`
- `fetchIsbnMetadata.js`
- `enrichWithAnnotations.js`
- `applyManualAnnotations.js`
- `buildDocx.js` or `buildDocxFromJob.js`
- `runIsbnBlooperJob.js`
- `runBibliographyJob.js`
- `runSclToolJob.js`
- validation modules for job types
- model files for `BaseJob`, `BibliographyJob`, `IsbnBlooperJob`, `BibliographyItem`

## Schemas designed today

### Bibliography item
A single canonical `BibliographyItem` should support:
- core title fields
- source classification
- call number
- ISBN
- optional cover fields
- optional annotation fields
- provenance flags
- match status
- warnings/errors
- display order

### Bibliography job
A `BibliographyJob` should control:
- mode
- title / age group / prepared by / date
- inputs
- annotation mode
- cover flags
- output format
- final items
- output path / filename

### ISBN Blooper job
An `IsbnBlooperJob` should control:
- one ISBN
- optional cover check
- one JSON result object

## Honest current status
- We **analyzed and designed** the architecture today.
- We **did not yet implement** the modularized scripts in this chat.
- We **did not yet build** the staff-facing wrapper or UI.
- We **did not yet create** the blooper code.
- The Node scripts you already built remain the working prototype.

## Portfolio framing
This project should be described as:
- a reusable library workflow
- not just a generated document
- not just a one-off script

Strong framing:
- reconciles incomplete ILS outputs into one patron-facing deliverable
- supports both print and digital resources
- designed for eventual staff use
- documents architecture, validation rules, and deployment constraints
- shows product thinking, debugging, workflow design, and library operations insight

## Recommended starting point for tomorrow
Do **not** try to solve everything at once.

### Best next build target
Start with the smallest high-value win:
1. define the real shared code structure
2. extract parsing and merge logic into modules
3. implement ISBN Blooper
4. move toward one canonical renderer
5. only then build a staff-facing wrapper

## Suggested tomorrow task order

### Option A: smallest rewarding win
1. Build `fetchIsbnMetadata.js`
2. Build `runIsbnBlooperJob.js`
3. Return one clean JSON result for a single ISBN

### Option B: architecture-first cleanup
1. Extract `normalize.js`
2. Extract `parseStaffExport.js`
3. Build `parseRssFeed.js`
4. Build `mergeItems.js`
5. Refactor toward one shared renderer

## Important guardrails
- Do not maintain two unrelated document generators long-term.
- Do not use fuzzy matching for cover-mode merges.
- Do not degrade digital items visually.
- Do not let annotation become a separate product branch.
- Do not confuse “working local prototype” with “staff-ready deployment.”

## Short version for tomorrow morning
You already have a working prototype.
The problem is now packaging, validation, modularization, and staff usability.
The cleanest next move is either:
- build the ISBN Blooper first, or
- refactor parsing/merge into reusable modules.
