---
name: cover-image-bibliography
description: >
  Generates a branded, print-ready cover image bibliography (.docx) for Sunflower
  County Library System. Each entry displays the book's cover art left-justified
  beside the title, author, collection, and call number. Use when patrons would
  benefit from visual browsing — display lists, reading fair handouts, program
  lists, or any list where seeing the cover helps. Trigger when the user says
  "cover images," "with pictures," "show the covers," or provides an ILS RSS feed URL.
---

# Cover Image Bibliography Skill

Produces a branded .docx bibliography with left-justified cover images for
Sunflower County Library System. Separate mode from the standard Bibliography
Builder and Annotated Bibliography — use when visual browsing matters.

## What this produces

Same branding and layout as the other bibliography skills, plus:
- A left-justified cover image (~0.64" × 0.96") per entry
- Title + call number on the same row (call number right-aligned)
- Author · Collection beneath in italic gray
- Entries never split across pages (`cantSplit: true`)
- Entries without a retrievable cover render with a blank left cell

## ⚠️ IMPORTANT: How to get the RSS feed from the ILS

**The user must pull the RSS feed from the ILS (LS2 PAC) themselves.**
Claude cannot log into the catalog — only the user can.

Instructions to give the user before proceeding:

> "To use this skill, I need the RSS feed URL for your list from the ILS.
> Here's how to get it:
>
> 1. Log into the LS2 PAC staff interface at https://tlc.sunflower.lib.ms.us
> 2. Open or create the list you want to turn into a bibliography
> 3. Look for the **RSS** link or icon associated with the list
> 4. Copy that URL — it will look something like:
>    `https://tlc.sunflower.lib.ms.us/list/static/[ID]/rss`
> 5. Paste it here
>
> Once I have that URL, I can parse the titles, authors, and cover images
> automatically."

Do not proceed to document generation until the user has provided a working RSS URL.

---

## Conversational workflow

### Step 1 — Request and parse the RSS feed

Ask the user for the RSS feed URL if they haven't provided one yet (see instructions above).

Once provided, use `web_fetch` to retrieve the RSS XML. Parse each `<item>` to extract:
- `<title>` — book title (clean trailing ` :` and ` :.` artifacts)
- `<dc:creator>` — author (may be empty)
- The Syndetics `<img src="...">` URL from the `<description>` HTML
- ISBN from the description (for fallback cover lookup if needed)

The Syndetics URL format is:
```
https://secure.syndetics.com/api/image?size=mc&isbn=...&noimage_caption=...&noimage=unbound&client=sunflowerco
```

The `noimage=unbound` parameter means Syndetics returns a placeholder image when
no cover exists. Detect placeholder images by checking the returned content-type
or byte size — placeholder images from Syndetics are typically under 2KB.
Skip placeholder images silently; those entries will render without a cover.

**Note:** Collection and call number are NOT in the RSS feed. After parsing,
present the title/author list to the user and ask them to supply collection
and call number for each entry, or paste them from an ILS export.

---

### Step 2 — Collect missing metadata

After parsing the RSS, present a numbered list of titles and authors.
Ask the user to provide collection and call number for each, or paste
a matching ILS export to cross-reference.

Example prompt:
> "Got your list — here are the titles I found. I need collection and call
> number for each. You can paste them from your ILS export, or provide them
> one at a time:
>
> 1. Velociraptor — Lennie, Charles
> 2. Flying Guy Presents: Dinosaurs — Arnold, Tedd
> ..."

---

### Step 3 — Collaborate on a title

Same as other bibliography skills. Suggest 2–3 patron-friendly options based
on the list content. Wait for the user to choose before proceeding.

---

### Step 4 — Age group

Same as other bibliography skills.

---

### Step 5 — Prepared by

Always ask. Never default. Accept full name + credentials.

---

### Step 6 — Digital resources

Always prompt before generating. SCL currently offers **Hoopla only**.

---

### Step 7 — Fetch cover images

For each entry with a valid Syndetics URL, use `web_fetch` to retrieve the
image and save it to a temp path under `/home/claude/covers/`.

```python
# Example fetch pattern
import urllib.request, os, hashlib
os.makedirs("/home/claude/covers", exist_ok=True)
for book in books:
    if book.get("coverUrl"):
        slug = hashlib.md5(book["coverUrl"].encode()).hexdigest()
        dest = f"/home/claude/covers/{slug}.jpg"
        try:
            urllib.request.urlretrieve(book["coverUrl"], dest)
            size = os.path.getsize(dest)
            book["coverImagePath"] = dest if size > 2000 else None
        except:
            book["coverImagePath"] = None
```

Report how many covers were found vs. skipped before generating.

---

### Step 8 — Sort and generate

Sort entries alphabetically by title, ignoring leading articles (A, An, The).
Call the generation script:

```bash
node scripts/generate_cover_list.js '<json>'
```

JSON shape:
```json
{
  "title": "The Dinosaur Shelf",
  "ageGroup": "for All Ages",
  "preparedBy": "Kelly Waddell, MLIS",
  "dateStr": "03/18/2026",
  "books": [
    {
      "title": "Velociraptor",
      "author": "Lennie, Charles",
      "collection": "Easy Non-Fiction",
      "callNumber": "E 567.912 L",
      "coverImagePath": "/home/claude/covers/abc123.jpg"
    }
  ],
  "digitalResources": [],
  "outputPath": "/mnt/user-data/outputs/The_Dinosaur_Shelf_for_All_Ages_20260318.docx"
}
```

`coverImagePath` is optional per entry — omit or set to `null` for no-cover entries.

---

### Step 9 — Deliver

Use `present_files` to share the .docx.
Mention they can print from Word or export to PDF via File → Save As.
Note which entries are missing covers if any, in case the user wants to
add them manually in Word.

---

## Design spec

| Element | Value |
|---|---|
| Cover column width | 0.85" |
| Cover image display | 61×92px (~0.64"×0.96") |
| Gutter between cover and text | 0.15" |
| Title | 10pt bold, `#1A1A1A` |
| Call number | 9pt bold right-aligned, same row as title via nested table |
| Author · Collection | 9pt italic `#6B6B6B` |
| Entry page breaking | `cantSplit: true` — entries never split across pages |
| All other design values | Inherited from standard Bibliography Builder spec |

## Assets

- `assets/scl-logo.png` — canonical logo, do not replace

## Error notes

- Missing covers render silently as blank left cells — do not crash
- Syndetics placeholder threshold: skip images ≤ 2KB
- Script requires `coverImagePath` to be a local file path, not a URL
