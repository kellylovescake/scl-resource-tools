---
name: ill-resource-list
description: >
  Generates a branded, print-ready Word document (.docx) resource list for
  Sunflower County Library System from an ILL (Interlibrary Loan) book list.
  Use this skill whenever the user pastes or mentions a list of library books,
  ILL requests, titles, or reading recommendations and wants to turn it into a
  formatted patron handout, reading list, or resource guide — even if they don't
  say "ILL" explicitly. The skill collaborates with the user on a title, prompts
  for digital resources to add, then produces a polished branded .docx with the
  library logo, age group, call numbers right-justified, and a professional footer.
  Trigger whenever the user mentions: book lists, reading lists, ILL lists, patron
  handouts, resource guides, recommended reads, coding club, program lists, or
  wants to format library materials as a document.
---

# ILL Resource List Skill

Produces a branded .docx reading/resource list for Sunflower County Library System.

## What this skill produces

- Warm off-white title band with the list title (large, bold)
- Age group in italic gray directly beneath the title
- Orange rule separator
- **Print Resources** section: numbered entries, author + collection italic below,
  call number right-justified on the same row
- **Digital Resources** section (if provided): bulleted with ▸
- Footer on every page: SCL logo left | page X/Y centered | Prepared by + date right
- Thin double black page border (thicker outer band)

## Hardcoded library constants

| Field | Value |
|---|---|
| Library name | Sunflower County Library System |
| Phone | 662-887-1672 |
| Website | https://sunflower.lib.ms.us/ |
| Logo | `assets/scl-logo.png` |

## Full conversational workflow

Work through these steps in order before generating anything.

---

### Step 1 — Receive the ILL list

Ask the user to paste their ILL book list if they haven't already.

The script handles this ILL export format automatically:
```
* __Title.__ Author. Collection: X, Call #: Y
```
It also handles plain formats: `Title / Author`, `Title — Author`, bare titles.
Numbered or bulleted prefixes are stripped. Trailing punctuation artifacts (` :.`) are cleaned.

---

### Step 2 — Collaborate on a title

Do NOT just use the topic as-is. Look at the books and suggest 2–3 specific,
patron-friendly title options. For example, if the list is coding books for kids:

> "Here are a few title ideas based on your list:
> 1. **Coding Club** — clean and simple
> 2. **Let's Code!** — energetic, kid-friendly
> 3. **Get Into Coding** — inviting for hesitant beginners
>
> Want one of these, or something different?"

Wait for the user to choose or provide their own before proceeding.

---

### Step 3 — Age group

Ask which age group this list is for. Options:
- **for Children** (ages 0–12)
- **for Teens & Young Adults** (ages 13–17)
- **for Adults** (ages 18+)
- **Leave blank** (no age group shown)

The age group appears in italic gray beneath the title — it is NOT part of the title string.

---

### Step 4 — Prepared by

Ask: *"Prepared by — what name should appear in the footer?"*
No default. Always ask. Accept full names, credentials, etc. (e.g. "Kelly Waddell, MLIS").

---

### Step 5 — Digital resources (always prompt, never skip)

This step is mandatory — always ask before generating.

Say something like:
> "Before I build the document — would you like to include any digital resources?
> Here are some common options for Sunflower County Library patrons:
>
> 1. OverDrive (via Libby app) – ebooks & audiobooks
> 2. Hoopla – streaming movies, music, comics & ebooks
> 3. Kanopy – free film streaming for cardholders
> 4. Mississippi Digital Library – online research databases
>
> Type the numbers you'd like to include, add your own, or press Enter to skip."

Accept: numbers from the list, free-text additions, a mix of both, or blank to skip.
If the user adds custom entries, include them exactly as typed.

---

### Step 6 — Generate the document

Call the generation script:

```bash
node scripts/generate_list.js '<json>'
```

JSON shape:
```json
{
  "title": "Coding Club",
  "ageGroup": "for Children",
  "preparedBy": "Kelly Waddell, MLIS",
  "dateStr": "02/28/2026",
  "books": [
    {
      "title": "Coding for kids in easy steps",
      "author": "McGrath, Mike",
      "collection": "Adult Non-Fiction",
      "callNumber": "005 M"
    }
  ],
  "digitalResources": [
    "OverDrive (via Libby app) – ebooks & audiobooks"
  ],
  "outputPath": "/mnt/user-data/outputs/Coding_Club_for_Children_20250228.docx"
}
```

**Output filename**: `{Title}_{AgeGroup}_{YYYYMMDD}.docx` with spaces replaced by underscores.
**dateStr**: today's date formatted as `MM/DD/YYYY`.
**ageGroup**: use `""` (empty string) if user chose to leave it blank.

To parse the ILL list in Python before passing to the script:
```python
import sys, json, subprocess, re
sys.path.insert(0, "scripts")
# Use the parseIllList logic from generate_list.js, or replicate in Python:
# Strip * prefix, extract Call #: and Collection: fields, then __Title__ Author pattern.
```

Or parse inline in the JS call by passing `rawIllText` and letting the script's
`parseIllList()` function handle it — pass books as an empty array and add a
`rawIllText` key instead (the script checks for this).

---

### Step 7 — Deliver

Use `present_files` to share the .docx with the user.
Mention they can print directly from Word or save as PDF via File → Save As.

---

## Design spec

| Element | Value |
|---|---|
| Page size | US Letter (8.5 × 11 in) |
| Margins | 1 inch all sides |
| Font | Calibri throughout |
| Title | 22pt bold, near-black `#1A1A1A` |
| Age group | 12pt italic gray `#6B6B6B` |
| Section headers | 13pt bold SCL orange `#C97C2E` |
| Body text | 10pt |
| Call numbers | 9pt bold, right-aligned |
| Title band background | Warm off-white `#FDF6EC` |
| Page border | `THICK_THIN_SMALL_GAP`, black, offset from edge |
| Footer rule | 1pt orange, full width |
| Footer layout | 3-column invisible table: logo / page num / prepared by+date |

## Assets

- `assets/scl-logo.png` — Sunflower County Library System transparent RGBA PNG (1125×400px)
  This is the canonical logo file. Do not replace without updating LOGO_PX_W/H in the script.

## Error notes

- If logo file is missing the script will crash — ensure `assets/scl-logo.png` is present.
- If `ageGroup` is empty string, the age paragraph is omitted entirely (no blank line).
- `digitalResources` empty array → Digital Resources section omitted entirely.
