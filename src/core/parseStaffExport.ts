/**
 * src/core/parseStaffExport.ts
 *
 * Parses the staff export text (copy-pasted from the ILS) into BibliographyItems.
 *
 * WHY THIS FILE EXISTS:
 * The original scripts each contained a copy of parseIllList() inline.
 * This module is the single canonical home for that logic.
 * All three bibliography modes use this parser for the staff export input.
 *
 * BEHAVIOR SOURCE OF TRUTH:
 * The parseIllList() function in generate_list.js and generate_annotated_list.js
 * is the preserved baseline. This TypeScript port must produce identical output
 * for the same input. If you find a discrepancy, fix THIS file — the _reference/
 * scripts are ground truth.
 *
 * MARKER: STAFF EXPORT PARSER SELECTION
 * This is the one place where the staff export parser is chosen.
 * V1 uses parseIllExport() which handles the LS2 PAC export format:
 *   * __Title.__ Author. Collection: X, Call #: Y
 *
 * MARKER: FUTURE ISBN STAFF EXPORT SUPPORT
 * A future staff export format may include ISBNs directly in the export text.
 * When that happens:
 * 1. Add a new parser function (e.g., parseIsbnStaffExport()) below
 * 2. Update the exported parseStaffExport() function to detect format and route
 * 3. The switch point is in parseStaffExport() — look for the comment below
 * 4. Document the new format in the README and add a test fixture
 * Do NOT invent speculative parsing behavior without a real sample.
 *
 * SAFE TO EDIT:
 * - Add new format handlers below parseIllExport()
 * - Tune the regex patterns if real edge cases appear
 * - Add items to the ParseWarning type as new issues are discovered
 */

import type { BibliographyItem } from "@/types";
import { cleanTrailingPunctuation } from "./normalize";

// ── Parse result ──────────────────────────────────────────────────────────────

export interface ParseResult {
  items:    BibliographyItem[];
  warnings: ParseWarning[];
}

export interface ParseWarning {
  line:    number;   // 1-based line number in the input
  raw:     string;   // Original line text
  message: string;   // What was unclear or skipped
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * parseStaffExport(rawText)
 *
 * MARKER: STAFF EXPORT PARSER SELECTION
 *
 * Routes the raw text to the appropriate parser based on format detection.
 * V1 only has one format (ILL export). Future formats would be added here.
 *
 * Format detection logic:
 * - If the text contains "Call #:" or "__Title__" patterns → ILL export format
 * - FUTURE: If the text contains ISBN patterns → ISBN-bearing export format
 */
export function parseStaffExport(rawText: string): ParseResult {
  // ── MARKER: STAFF EXPORT PARSER SELECTION ──
  // To add a new format, add detection logic here and call the new parser.
  // Example (future):
  //   if (looksLikeIsbnExport(rawText)) return parseIsbnStaffExport(rawText);

  // V1: always use the ILL export parser
  return parseIllExport(rawText);
}

// ── ILL export parser ─────────────────────────────────────────────────────────

/**
 * parseIllExport(rawText)
 *
 * Parses the LS2 PAC staff export format.
 *
 * Handled input patterns:
 *   * __Title.__ Author. Collection: X, Call #: Y    ← primary ILS format
 *   Title / Author                                    ← slash-delimited
 *   Title — Author                                    ← em-dash delimited
 *   Title - Author                                    ← hyphen-delimited
 *   1. Title                                          ← numbered, no author
 *   Title                                             ← bare title
 *
 * Lines starting with # are treated as comments and skipped.
 * Blank lines are skipped.
 *
 * This is a direct TypeScript port of parseIllList() from the original scripts.
 * Do not alter the core regex logic without comparing against _reference/generate_list.js.
 */
function parseIllExport(rawText: string): ParseResult {
  const items: BibliographyItem[] = [];
  const warnings: ParseWarning[] = [];

  const lines = rawText.trim().split("\n");

  lines.forEach((rawLine, lineIndex) => {
    let line = rawLine.trim();

    // Skip blank lines and comment lines
    if (!line || line.startsWith("#")) return;

    // Strip leading bullet: "* " prefix from ILS export
    line = line.replace(/^\*\s*/, "");

    // ── Extract Call #: ──────────────────────────────────────────────────────
    let callNumber = "";
    const callMatch = line.match(/Call #:\s*(.+)$/);
    if (callMatch) {
      callNumber = callMatch[1].trim();
      line = line.slice(0, callMatch.index!).trim().replace(/,\s*$/, "");
    }

    // ── Extract Collection: ──────────────────────────────────────────────────
    let collection = "";
    const collMatch = line.match(/Collection:\s*([^,]+)/);
    if (collMatch) {
      collection = collMatch[1].trim();
      line = line.slice(0, collMatch.index!).trim().replace(/[,.]\s*$/, "");
    }

    // ── Extract Title and Author ─────────────────────────────────────────────
    let title = "";
    let author = "";

    // Primary ILS format: __Title__ Author
    const titleMatch = line.match(/^__(.+?)__\.?\s*(.*)/);
    if (titleMatch) {
      title  = cleanTrailingPunctuation(titleMatch[1].trim());
      author = titleMatch[2].trim().replace(/\.$/, "");
    } else {
      // Fallback delimiters: " / ", " — ", " - "
      const delimiters = [" / ", " \u2014 ", " - "];
      let matched = false;
      for (const delim of delimiters) {
        if (line.includes(delim)) {
          const parts = line.split(delim);
          title  = parts[0].trim();
          author = parts[1]?.trim() ?? "";
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Last resort: strip leading number and use entire line as title
        title = line.replace(/^\d+[.)]\s*/, "").trim();
        if (!title) {
          warnings.push({
            line:    lineIndex + 1,
            raw:     rawLine,
            message: "Could not parse a title from this line — skipped",
          });
          return;
        }
      }
    }

    // Final cleanup
    title  = cleanTrailingPunctuation(title);
    author = cleanTrailingPunctuation(author);

    if (!title) {
      warnings.push({
        line:    lineIndex + 1,
        raw:     rawLine,
        message: "Title was empty after parsing — skipped",
      });
      return;
    }

    items.push({
      title,
      author,
      collection,
      callNumber,
      source: "staff_export",
    });
  });

  return { items, warnings };
}

// ── MARKER: FUTURE ISBN STAFF EXPORT SUPPORT ──────────────────────────────────
// When a staff export format that includes ISBNs is available:
// 1. Add format detection in parseStaffExport() above
// 2. Implement the new parser function here
// 3. Return BibliographyItems with `isbn` field populated
// 4. Add a test fixture in src/__tests__/parseStaffExport.test.ts
//
// function parseIsbnStaffExport(rawText: string): ParseResult {
//   // TODO: implement when real sample format is available
//   throw new Error("Not implemented — no sample format available yet");
// }
