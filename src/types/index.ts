/**
 * src/types/index.ts
 *
 * Shared TypeScript type definitions for SCL Resource Tools.
 *
 * WHY THIS FILE EXISTS:
 * Central place for all shared data shapes. Keeping types here means
 * both the core engine and the web UI use the same definitions —
 * no duplication, no drift.
 *
 * WHAT LIVES HERE:
 * - BibliographyItem — the canonical shape for one book/resource entry
 * - BibliographyJob — the full input to a bibliography generation run
 * - IsbnBlooperResult — the result of a single-ISBN lookup
 * - Annotation types
 * - Error/warning types
 *
 * SAFE TO EDIT:
 * - Add optional fields to BibliographyItem as needs grow
 * - Adding a field here is low-risk; removing one requires checking all callers
 *
 * MARKER: ANNOTATION MODE
 * The `annotationMode` and `annotation` fields below are where annotation
 * behavior is controlled. V1 supports "none" and "manual".
 * Future: add "ai" and "ai_with_override" when the AI provider is ready.
 * See also: src/core/annotationProvider.ts
 *
 * MARKER: FUTURE ISBN STAFF EXPORT SUPPORT
 * BibliographyItem has an optional `isbn` field. In the current text-only
 * workflow, ISBNs are not extracted from the staff export.
 * Future: a staff export format that includes ISBNs would populate this field,
 * enabling cover fetching in a text-only context.
 * See also: src/core/parseStaffExport.ts
 */

// ── Annotation modes ──────────────────────────────────────────────────────────
/**
 * V1 supports "none" (no annotations) and "manual" (staff types each one).
 * "ai" and "ai_with_override" are reserved for future use.
 *
 * MARKER: ANNOTATION MODE
 */
export type AnnotationMode = "none" | "manual"; // | "ai" | "ai_with_override" — future

// ── Single bibliography item ──────────────────────────────────────────────────
/**
 * One entry in a bibliography. Shared across all three output modes.
 *
 * Fields marked (cover) are only populated in cover bibliography mode.
 * Fields marked (optional) may be absent in any mode.
 */
export interface BibliographyItem {
  // Core fields — always present
  title:      string;
  author:     string;   // Empty string if unknown

  // Catalog fields — present when staff export provides them
  callNumber: string;   // Empty string if not available
  collection: string;   // e.g. "Adult Non-Fiction", "Easy", etc.

  // MARKER: FUTURE ISBN STAFF EXPORT SUPPORT
  // isbn is populated from RSS feed items in cover mode,
  // or from a future ISBN-bearing staff export format.
  isbn?:      string;   // ISBN-13 preferred, ISBN-10 accepted

  // Cover fields — only populated in cover bibliography mode
  coverUrl?:      string;   // Syndetics or Google Books URL (before fetch)
  coverImageData?: Buffer;  // Fetched image bytes (set during generation)
  hasCover?:      boolean;  // True if a real (non-placeholder) cover was found

  // Match/merge status — populated during cover mode merge
  matchStatus?: "matched" | "unmatched" | "duplicate";

  // MARKER: ANNOTATION MODE
  // annotation is only populated when annotationMode is "manual" (or future "ai")
  annotation?: string;  // One plain-text sentence; 25 words max recommended

  // Provenance and display
  source?:    "staff_export" | "rss" | "merged"; // Where this item came from
  warnings?:  string[];  // Non-fatal issues to show in review step
}

// ── Document metadata ─────────────────────────────────────────────────────────
/**
 * The "header" fields that appear at the top of the document and in the footer.
 * Shared across all bibliography modes.
 */
export interface DocumentMeta {
  title:       string;   // Document title (e.g. "Dinosaur Reference")
  ageGroup:    string;   // e.g. "for Children" — empty string to omit
  preparedBy:  string;   // Name for footer — must not be empty
  dateStr:     string;   // MM/DD/YYYY — defaults to today, not user-editable
  digitalResources: string[]; // List of digital resource labels (Hoopla, etc.)
}

// ── Bibliography job ──────────────────────────────────────────────────────────
/**
 * The complete input to a bibliography generation run.
 * The core engine accepts one of these and returns a BibliographyResult.
 *
 * MARKER: ENGINE ENTRY
 * This type is the contract between the web UI and the core engine.
 * The UI builds a BibliographyJob; the engine consumes it.
 */
export interface BibliographyJob {
  mode:           "text_only_bibliography" | "cover_bibliography";
  meta:           DocumentMeta;
  items:          BibliographyItem[];
  annotationMode: AnnotationMode;
}

// ── ISBN Blooper job ──────────────────────────────────────────────────────────
/**
 * Input to a single-ISBN lookup.
 *
 * MARKER: ENGINE ENTRY (ISBN Blooper)
 */
export interface IsbnBlooperJob {
  isbn:         string;   // Raw input; normalization happens in the engine
  fetchCover:   boolean;  // Whether to attempt cover image retrieval
}

// ── ISBN Blooper result ───────────────────────────────────────────────────────
/**
 * What comes back from a single-ISBN lookup.
 * This is what the Blooper UI renders.
 *
 * MARKER: ISBN BLOOPER DISPLAY
 * The UI card in src/app/blooper/page.tsx renders these fields.
 */
export interface IsbnBlooperResult {
  // Normalized ISBN
  isbn10?:     string;
  isbn13:      string;

  // Metadata
  title:       string;
  author:      string;
  publisher?:  string;
  publishDate?: string;
  subjects?:   string[];
  description?: string;

  // Cover
  coverUrl?:       string;   // URL of the found cover image (for display)
  coverImageData?: string;   // base64-encoded image bytes (for Blooper card)
  hasCover:        boolean;
  coverWarning?:   string;   // Human-readable message if no cover found

  // Source
  metadataSource:  "open_library" | "google_books" | "none";
  coverSource?:    "syndetics" | "google_books";

  // Raw payload (for "Copy JSON" button)
  rawJson:     object;
}

// ── Generation result ─────────────────────────────────────────────────────────
/**
 * What the engine returns after building a bibliography.
 * The web UI uses this to offer downloads and show the result summary.
 *
 * MARKER: REVIEW SUMMARY
 * The `summary` field here powers the review screen shown before generation,
 * and the result summary shown after generation.
 */
export interface BibliographyResult {
  success:     boolean;
  docxBuffer?: Buffer;        // The generated DOCX file bytes
  jsonData?:   object;        // The final merged JSON (for download)
  summary:     ResultSummary;
  errors?:     AppError[];
}

// ── Result summary ────────────────────────────────────────────────────────────
/**
 * Human-readable summary of a generation run.
 * Shown both in the review step (before generation) and results screen (after).
 */
export interface ResultSummary {
  totalItems:      number;
  itemsWithCovers?:  number; // Cover mode only
  itemsWithoutCovers?: number; // Cover mode only
  annotated:       boolean;
  mode:            string;
  documentTitle:   string;
  warnings?:       string[];
}

// ── Merge result ──────────────────────────────────────────────────────────────
/**
 * What comes back from the strict merge operation in cover mode.
 *
 * MARKER: STRICT MERGE RULES
 * If success is false, generation must not proceed.
 * The errors array contains product-shaped explanations for the staff member.
 * See src/core/mergeItems.ts for the merge logic.
 */
export interface MergeResult {
  success:       boolean;
  mergedItems?:  BibliographyItem[];
  errors?:       MergeError[];
  staffCount:    number;
  rssCount:      number;
}

// ── Merge error ───────────────────────────────────────────────────────────────
/**
 * A product-shaped explanation of why a merge failed.
 * Shown to staff in the cover bibliography error screen.
 */
export interface MergeError {
  type:     "count_mismatch" | "unmatched_item" | "duplicate_title" | "empty_input";
  message:  string;   // What happened
  affects:  string;   // What it affects (e.g. "3 items from the staff export")
  action:   string;   // What to do next
  items?:   string[]; // The specific titles involved, if applicable
}

// ── Application error ─────────────────────────────────────────────────────────
/**
 * Product-shaped error shown to staff.
 * Never expose stack traces or raw API errors in the UI.
 *
 * Categories match the error-handling requirements:
 * - input_format: something wrong with what was pasted
 * - workflow_rule: a business rule was violated (e.g. annotations incomplete)
 * - external_service: Syndetics/Open Library/etc. failed
 */
export interface AppError {
  category:   "input_format" | "workflow_rule" | "external_service";
  message:    string;   // What happened
  affects?:   string;   // What it affects
  action?:    string;   // What to do next
}
