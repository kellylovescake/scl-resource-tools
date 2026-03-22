/**
 * src/core/normalize.ts
 *
 * Text and ISBN normalization utilities.
 *
 * WHY THIS FILE EXISTS:
 * Normalization logic is used in multiple places:
 * - parseStaffExport.ts (normalizing titles before returning items)
 * - parseRssFeed.ts (cleaning RSS title artifacts)
 * - mergeItems.ts (creating merge keys from titles)
 * - isbnService.ts (validating and formatting ISBNs)
 *
 * Keeping it here prevents duplication and ensures consistent behavior.
 *
 * SAFE TO EDIT:
 * - Tune normalizeTitle() if edge cases appear in real staff exports
 * - Add new normalization helpers as needed
 * - Do NOT change normalizeTitle() in ways that would break existing merge keys
 *   without updating mergeItems.ts and re-testing with real data
 */

// ── Title normalization ───────────────────────────────────────────────────────

/**
 * normalizeTitle(raw)
 *
 * Produces a stable merge key from a book title string.
 * Used by mergeItems.ts to match staff export titles against RSS titles.
 *
 * Rules applied (in order):
 * 1. Lowercase
 * 2. Strip leading articles: "the ", "a ", "an "
 * 3. Collapse internal whitespace
 * 4. Strip trailing punctuation artifacts ( .: )
 * 5. Trim
 *
 * IMPORTANT:
 * The merge in mergeItems.ts depends on this function producing the same
 * output for the same title regardless of which side it came from.
 * If a real mismatch is discovered in production, fix it HERE — not in
 * mergeItems.ts — so both sides stay in sync.
 *
 * MARKER: STAFF EXPORT PARSER SELECTION
 * Title cleaning here works for the current staff export format.
 * If a new format introduces different title artifacts, update this function
 * and document the change in the decision log.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // Strip leading articles (word boundary-aware)
    .replace(/^(the|a|an)\s+/i, "")
    // Strip trailing punctuation artifacts from RSS titles and ILS exports
    // e.g. "Title :" → "title", "Title." → "title"
    .replace(/[\s:./]+$/, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();
}

// ── ISBN normalization ────────────────────────────────────────────────────────

/**
 * normalizeIsbn(raw)
 *
 * Strips hyphens and spaces from an ISBN string.
 * Returns the cleaned string (ISBN-10 or ISBN-13) or null if clearly invalid.
 *
 * Does NOT validate check digits — that is validateIsbn()'s job.
 */
export function normalizeIsbn(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-]/g, "");
  // Must be 10 or 13 digits (possibly ending in X for ISBN-10)
  if (!/^\d{9}[\dX]$/.test(cleaned) && !/^\d{13}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * validateIsbn(isbn)
 *
 * Returns true if the ISBN passes its check digit algorithm.
 * Accepts both ISBN-10 and ISBN-13 (after normalizeIsbn() has been applied).
 */
export function validateIsbn(isbn: string): boolean {
  if (isbn.length === 10) return validateIsbn10(isbn);
  if (isbn.length === 13) return validateIsbn13(isbn);
  return false;
}

/**
 * isbn10ToIsbn13(isbn10)
 *
 * Converts a valid ISBN-10 to its ISBN-13 equivalent.
 * Prepends "978" and recalculates the check digit.
 * Returns null if the input is not a valid ISBN-10.
 */
export function isbn10ToIsbn13(isbn10: string): string | null {
  if (isbn10.length !== 10) return null;
  const base = "978" + isbn10.slice(0, 9);
  const check = calculateIsbn13Check(base);
  return base + check;
}

/**
 * isbn13ToIsbn10(isbn13)
 *
 * Converts a 978-prefixed ISBN-13 to its ISBN-10 equivalent.
 * Only works for 978-prefix ISBNs (979-prefix books have no ISBN-10).
 * Returns null if conversion is not possible.
 */
export function isbn13ToIsbn10(isbn13: string): string | null {
  if (!isbn13.startsWith("978")) return null;
  const base = isbn13.slice(3, 12);
  const check = calculateIsbn10Check(base);
  return base + check;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function validateIsbn10(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(isbn[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (10 - i);
  }
  const last = isbn[9].toUpperCase();
  const check = last === "X" ? 10 : parseInt(last, 10);
  if (isNaN(check)) return false;
  return (sum + check) % 11 === 0;
}

function validateIsbn13(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(isbn[12], 10);
}

function calculateIsbn13Check(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(first12[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function calculateIsbn10Check(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(first9[i], 10) * (10 - i);
  }
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

// ── String utilities ──────────────────────────────────────────────────────────

/**
 * cleanTrailingPunctuation(str)
 *
 * Removes trailing punctuation artifacts that commonly appear in ILS exports
 * and RSS titles. Used in both parsers.
 * Examples: "Title :" → "Title", "Author." → "Author"
 */
export function cleanTrailingPunctuation(str: string): string {
  return str.replace(/[\s:.,]+$/, "").trim();
}

/**
 * formatDateStr()
 *
 * Returns today's date in MM/DD/YYYY format.
 * This is the format used in DOCX footers.
 * Date is not user-editable — always today per project decision.
 */
export function formatDateStr(date: Date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
