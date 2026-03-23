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

// ── Line-break joining ────────────────────────────────────────────────────────

/**
 * joinBrokenLines(rawText)
 *
 * Some ILS exports (and copy-pastes from rendered interfaces) insert hard
 * line breaks when a line exceeds the ILS's column-width limit. For example:
 *   "Girls who code : learn to code and change the w\norld. Saujani, Reshma..."
 * The word "world" is broken across two lines.
 *
 * Strategy: every complete ILS item ends with "Call #: XXX". A line that does
 * NOT contain "Call #:" is either a blank line (left alone) or a continuation
 * of the previous item (joined to it). Continuation lines that start with a
 * lowercase letter are mid-word breaks — joined with no separator. All others
 * are joined with a single space.
 *
 * Lines that start with "#" (comments) or "*" (bullet prefix) are always
 * treated as new items, not continuations.
 */
function joinBrokenLines(rawText: string): string {
  const lines = rawText.split("\n");
  const out: string[] = [];
  // Start as "complete" so the very first non-blank line is always a new item.
  let prevComplete = true;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank lines always act as item separators.
    if (!trimmed) {
      out.push(line);
      prevComplete = true;
      continue;
    }

    // Comment lines pass through without affecting the completion state.
    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

    if (prevComplete || out.length === 0) {
      // Previous item was complete (ended with "Call #:") or this is the
      // very first line — always start a new item.
      out.push(line);
    } else {
      // Previous item is incomplete — this line is a continuation.
      // No space for mid-word breaks (starts with lowercase); space otherwise.
      const sep = /^[a-z]/.test(trimmed) ? "" : " ";
      out[out.length - 1] = out[out.length - 1] + sep + trimmed;
    }

    // An item is complete when its line contains "Call #:".
    prevComplete = trimmed.includes("Call #:");
  }

  return out.join("\n");
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

  // Pre-process: join lines that were broken mid-item by the ILS's line-length limit.
  //
  // WHY: Some ILS exports (and copy-pastes from rendered interfaces) insert hard
  // line breaks when a line exceeds a certain column width. For example:
  //   "Girls who code : learn to code and change the w\norld. Saujani, Reshma..."
  // The word "world" is broken across two lines. This causes the parser to see
  // 9 lines instead of 8, failing the count check before any title matching happens.
  //
  // HOW: Every complete ILS item ends with "Call #: XXX". A line that does NOT
  // contain "Call #:" is either a continuation of the previous item or a blank line.
  // We join it to the previous line, using no separator when the continuation
  // starts with a lowercase letter (mid-word break) or a space otherwise.
  const joined = joinBrokenLines(rawText.trim());
  const lines = joined.split("\n");

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

      // ── ILS format without __bold__ markers ──────────────────────────────
      // When staff copy the skill output from a rendered markdown interface
      // (e.g. Claude's chat UI), the __Title.__ markers are stripped and the
      // line arrives as plain text:
      //   "Coding for kids in easy steps :. McGrath, Mike"     ← :. variant
      //   "Coding projects in Scratch. Woodcock, Jon"          ← plain variant
      //
      // Two passes:
      //   1. Look for " :. " (ILS truncated-subtitle separator)
      //   2. Split on the LAST ". " (period–space), which separates the
      //      title (or subtitle) from the author in this format.
      //      lastIndexOf is used so that "Dr. Seuss. Smith, John"
      //      correctly splits as title="Dr. Seuss", author="Smith, John"
      //      rather than splitting at the first period.

      // Pass 1: Look for " :. " (ILS truncated-subtitle separator)
      if (!matched) {
        const colonDotSplit = line.match(/^(.+?)\s*:\.\s+(.+)/);
        if (colonDotSplit) {
          title  = colonDotSplit[1].trim();
          author = colonDotSplit[2].trim();
          matched = true;
        }
      }

      // Pass 2: Use the call number's author-initial letter to locate ". Author"
      // ILS call numbers always end with the first letter of the author's last
      // name (e.g. "005 M" → McGrath, "J 005 H" → Highland). Using that letter
      // as an anchor makes the split more precise than a bare ". " search.
      //   "Coding for kids in easy steps :. McGrath, Mike"  callLetter=M
      //     lastIndexOf(". M") → ". McGrath" → title / author split ✓
      //   "Coding projects in Scratch. Woodcock, Jon"       callLetter=W
      //     lastIndexOf(". W") → ". Woodcock" → title / author split ✓
      if (!matched && callNumber) {
        const callLetter = callNumber.slice(-1).toUpperCase();
        if (/[A-Z]/.test(callLetter)) {
          const searchStr = `. ${callLetter}`;
          const idx = line.lastIndexOf(searchStr);
          if (idx > 0) {
            const potentialTitle  = line.slice(0, idx).trim();
            const potentialAuthor = line.slice(idx + 2).trim();
            if (potentialTitle && potentialAuthor) {
              title  = potentialTitle;
              author = potentialAuthor;
              matched = true;
            }
          }
        }
      }

      // Pass 3: Split on LAST ". " (period–space) as a final fallback.
      if (!matched) {
        const lastPeriodSpace = line.lastIndexOf(". ");
        if (lastPeriodSpace > 0) {
          const potentialTitle  = line.slice(0, lastPeriodSpace).trim();
          const potentialAuthor = line.slice(lastPeriodSpace + 2).trim();
          // Guard: if the part before ". " is just a number, it's a numbered
          // list item ("1. Title") not a "Title. Author" split — skip.
          const looksLikeNumber = /^\d+$/.test(potentialTitle);
          if (potentialTitle && potentialAuthor && !looksLikeNumber) {
            title  = potentialTitle;
            author = potentialAuthor;
            matched = true;
          }
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
