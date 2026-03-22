/**
 * src/core/mergeItems.ts
 *
 * Strict merge logic for the cover bibliography mode.
 *
 * WHY THIS FILE EXISTS:
 * The cover bibliography requires two inputs from the same ILS list:
 * the staff export (has call numbers, collections) and the RSS feed
 * (has ISBNs, cover URLs). This module merges them into one set of
 * complete BibliographyItems.
 *
 * MARKER: STRICT MERGE RULES
 * Merge rules are intentionally unforgiving. Any of the following block generation:
 * - Title count mismatch between staff export and RSS
 * - A title present in one input but not the other
 * - Duplicate titles that cannot be safely matched
 * - Either input being empty
 *
 * WHY STRICT:
 * A partial merge produces a document with missing covers and no indication
 * of why. Staff would not notice until printing. Better to fail loudly with
 * a clear explanation than to silently produce a broken output.
 *
 * MERGE KEY:
 * Titles are matched using normalizeTitle() from normalize.ts.
 * Author is used ONLY as a tiebreaker for duplicate normalized titles.
 * Do NOT use fuzzy matching — that is explicitly out of scope for V1.
 *
 * WHAT USERS GET ON FAILURE:
 * A MergeResult with success: false and a populated errors array.
 * Each error is product-shaped: what happened, what it affects, what to do.
 * See src/types/index.ts for the MergeError shape.
 *
 * SAFE TO EDIT:
 * - Error message text (keep them clear and actionable)
 * - The normalizeTitle() call (update normalize.ts if behavior needs to change)
 *
 * DO NOT CHANGE:
 * - The "any mismatch blocks generation" rule
 * - The "no fuzzy matching" rule
 * - The merge key algorithm without running regression tests
 */

import type { BibliographyItem, MergeResult, MergeError } from "@/types";
import { normalizeTitle } from "./normalize";

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * mergeItems(staffItems, rssItems)
 *
 * MARKER: STRICT MERGE RULES
 *
 * Attempts to merge staff export items with RSS items.
 * Returns MergeResult with success: false if ANY merge rule is violated.
 *
 * On success:
 * - Returns merged items with all fields populated from both sources
 * - Items are sorted alphabetically by normalized title (ignoring articles)
 *
 * On failure:
 * - Returns errors with product-shaped explanations
 * - The caller (API route) must not generate a document if success is false
 */
export function mergeItems(
  staffItems: BibliographyItem[],
  rssItems:   BibliographyItem[],
): MergeResult {

  const errors: MergeError[] = [];

  // ── Rule: Neither input may be empty ──────────────────────────────────────
  if (staffItems.length === 0) {
    errors.push({
      type:    "empty_input",
      message: "The staff export contained no items.",
      affects: "All items",
      action:  "Check your staff export text and try pasting it again.",
    });
  }
  if (rssItems.length === 0) {
    errors.push({
      type:    "empty_input",
      message: "The RSS feed contained no items.",
      affects: "All items",
      action:  "Check the RSS URL and make sure the list is not empty.",
    });
  }
  if (errors.length > 0) {
    return { success: false, errors, staffCount: staffItems.length, rssCount: rssItems.length };
  }

  // ── Rule: Title counts must match exactly ─────────────────────────────────
  if (staffItems.length !== rssItems.length) {
    errors.push({
      type:    "count_mismatch",
      message: `Staff export has ${staffItems.length} item${staffItems.length !== 1 ? "s" : ""}, ` +
               `but the RSS feed has ${rssItems.length}.`,
      affects: "The entire bibliography",
      action:
        "Make sure you exported from the same list without adding or removing titles in between. " +
        "Then paste both inputs again.",
    });
    return { success: false, errors, staffCount: staffItems.length, rssCount: rssItems.length };
  }

  // ── Build lookup maps (normalized title → items) ──────────────────────────
  const staffMap = buildMap(staffItems);
  const rssMap   = buildMap(rssItems);

  // ── Rule: Check for unmatched titles ──────────────────────────────────────
  const unmatchedStaff = findUnmatched(staffMap, rssMap);
  const unmatchedRss   = findUnmatched(rssMap, staffMap);

  if (unmatchedStaff.length > 0 || unmatchedRss.length > 0) {
    if (unmatchedStaff.length > 0) {
      errors.push({
        type:    "unmatched_item",
        message: `${unmatchedStaff.length} title${unmatchedStaff.length !== 1 ? "s" : ""} in the staff export could not be matched in the RSS feed.`,
        affects: `Unmatched titles: ${unmatchedStaff.join("; ")}`,
        action:
          "The staff export and RSS feed must come from the same list. " +
          "Check for typos or titles that exist in one but not the other.",
        items: unmatchedStaff,
      });
    }
    if (unmatchedRss.length > 0) {
      errors.push({
        type:    "unmatched_item",
        message: `${unmatchedRss.length} title${unmatchedRss.length !== 1 ? "s" : ""} in the RSS feed could not be matched in the staff export.`,
        affects: `Unmatched titles: ${unmatchedRss.join("; ")}`,
        action:
          "The staff export and RSS feed must come from the same list. " +
          "Check for typos or titles that exist in one but not the other.",
        items: unmatchedRss,
      });
    }
    return { success: false, errors, staffCount: staffItems.length, rssCount: rssItems.length };
  }

  // ── All checks passed — perform the merge ────────────────────────────────
  const mergedItems: BibliographyItem[] = [];

  for (const [key, staffGroup] of staffMap.entries()) {
    const rssGroup = rssMap.get(key)!;

    if (staffGroup.length === 1 && rssGroup.length === 1) {
      // Simple 1-to-1 match
      mergedItems.push(mergeOne(staffGroup[0], rssGroup[0]));
    } else {
      // Duplicate normalized titles — use author as tiebreaker
      const result = matchByAuthor(staffGroup, rssGroup, key);
      if (!result.success) {
        errors.push(...result.errors);
      } else {
        mergedItems.push(...result.items);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, staffCount: staffItems.length, rssCount: rssItems.length };
  }

  // Sort alphabetically by normalized title (ignoring articles)
  mergedItems.sort((a, b) =>
    normalizeTitle(a.title).localeCompare(normalizeTitle(b.title))
  );

  return {
    success:     true,
    mergedItems,
    staffCount:  staffItems.length,
    rssCount:    rssItems.length,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * buildMap(items)
 * Builds a Map<normalizedTitle, BibliographyItem[]>.
 * Multiple items with the same normalized title are grouped (for author-based disambiguation).
 */
function buildMap(items: BibliographyItem[]): Map<string, BibliographyItem[]> {
  const map = new Map<string, BibliographyItem[]>();
  for (const item of items) {
    const key = normalizeTitle(item.title);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

/**
 * findUnmatched(sourceMap, targetMap)
 * Returns display titles present in sourceMap but missing from targetMap.
 */
function findUnmatched(
  sourceMap: Map<string, BibliographyItem[]>,
  targetMap: Map<string, BibliographyItem[]>,
): string[] {
  const unmatched: string[] = [];
  for (const [key, items] of sourceMap.entries()) {
    if (!targetMap.has(key)) {
      // Use the original (un-normalized) title for display
      unmatched.push(items[0].title);
    }
  }
  return unmatched;
}

/**
 * mergeOne(staffItem, rssItem)
 * Combines fields from both sources into one complete BibliographyItem.
 * Staff export fields win for call number and collection.
 * RSS fields win for isbn and coverUrl.
 */
function mergeOne(
  staffItem: BibliographyItem,
  rssItem:   BibliographyItem,
): BibliographyItem {
  return {
    // Title: prefer staff export (typically cleaner for display)
    title:      staffItem.title || rssItem.title,
    // Author: prefer staff export; fall back to RSS
    author:     staffItem.author || rssItem.author,
    // Catalog fields from staff export
    callNumber: staffItem.callNumber,
    collection: staffItem.collection,
    // Cover/ISBN fields from RSS
    isbn:       rssItem.isbn,
    coverUrl:   rssItem.coverUrl,
    // Status
    source:     "merged",
    matchStatus: "matched",
  };
}

/**
 * matchByAuthor(staffGroup, rssGroup, normalizedTitle)
 *
 * When multiple items share a normalized title, uses author as a tiebreaker.
 * If author matching resolves all pairs, returns the matched items.
 * If author matching fails, returns a duplicate_title error.
 */
function matchByAuthor(
  staffGroup: BibliographyItem[],
  rssGroup:   BibliographyItem[],
  normalizedTitle: string,
): { success: true; items: BibliographyItem[] } | { success: false; errors: MergeError[] } {

  // Build author-keyed maps within the group
  const staffByAuthor = new Map(staffGroup.map(i => [i.author.toLowerCase(), i]));
  const rssByAuthor   = new Map(rssGroup.map(i => [i.author.toLowerCase(), i]));

  const matched: BibliographyItem[] = [];
  const unresolved: string[] = [];

  for (const [authorKey, staffItem] of staffByAuthor.entries()) {
    const rssItem = rssByAuthor.get(authorKey);
    if (rssItem) {
      matched.push(mergeOne(staffItem, rssItem));
    } else {
      unresolved.push(staffItem.title);
    }
  }

  if (unresolved.length > 0) {
    return {
      success: false,
      errors: [{
        type:    "duplicate_title",
        message: `Multiple items share a similar title ("${normalizedTitle}") and could not be matched by author.`,
        affects: `${unresolved.length} item${unresolved.length !== 1 ? "s" : ""}`,
        action:
          "Check that author names are consistent between the staff export and RSS feed. " +
          "If these are genuinely different books with the same title, contact the developer " +
          "to discuss a manual override path.",
        items: unresolved,
      }],
    };
  }

  return { success: true, items: matched };
}
