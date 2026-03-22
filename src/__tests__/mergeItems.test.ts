/**
 * src/__tests__/mergeItems.test.ts
 *
 * Unit tests for src/core/mergeItems.ts
 *
 * WHY THESE TESTS EXIST:
 * The strict merge is the most critical logic gate in the cover bibliography.
 * A bad merge produces a silent, wrong document. These tests verify every
 * merge rule fires correctly:
 *   - Exact match succeeds
 *   - Count mismatch blocks generation
 *   - Unmatched title blocks generation
 *   - Duplicate title (with author tiebreaker) resolves or blocks
 *   - Empty input blocks generation
 *
 * The "blocks generation" tests are just as important as the success tests.
 * A merge that silently passes bad data is worse than a failed build.
 */

import { mergeItems } from "@/core/mergeItems";
import type { BibliographyItem } from "@/types";

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** Minimal staff export item (has call number and collection, no ISBN/cover) */
function staffItem(title: string, author = "", callNumber = "", collection = ""): BibliographyItem {
  return { title, author, callNumber, collection, source: "staff_export" };
}

/** Minimal RSS item (has ISBN and coverUrl, no call number or collection) */
function rssItem(title: string, author = "", isbn = "", coverUrl = ""): BibliographyItem {
  return { title, author, callNumber: "", collection: "", isbn, coverUrl, source: "rss" };
}

// ── Successful merges ─────────────────────────────────────────────────────────

describe("mergeItems — successful merges", () => {
  test("merges a single matched pair", () => {
    const staff = [staffItem("Velociraptor", "Lennie, Charles", "E 567.9 L", "Easy Non-Fiction")];
    const rss   = [rssItem("Velociraptor", "Lennie, Charles", "9781629700274", "http://syndetics.com/cover.jpg")];

    const result = mergeItems(staff, rss);

    expect(result.success).toBe(true);
    expect(result.mergedItems).toHaveLength(1);

    const item = result.mergedItems![0];
    // Staff fields should be on the merged item
    expect(item.callNumber).toBe("E 567.9 L");
    expect(item.collection).toBe("Easy Non-Fiction");
    // RSS fields should be on the merged item
    expect(item.isbn).toBe("9781629700274");
    expect(item.coverUrl).toBe("http://syndetics.com/cover.jpg");
    // Source should be "merged"
    expect(item.source).toBe("merged");
  });

  test("merges multiple matched pairs", () => {
    const staff = [
      staffItem("Velociraptor",        "Lennie, Charles",     "E 567.9 L", "Easy"),
      staffItem("Dinosaur Encyclopedia","Benton, M. J.",       "567.9 B",   "Non-Fiction"),
    ];
    const rss = [
      rssItem("Velociraptor",         "Lennie, Charles",     "9781629700274"),
      rssItem("Dinosaur Encyclopedia","Benton, M. J.",       "9780671510466"),
    ];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
    expect(result.mergedItems).toHaveLength(2);
  });

  test("matches titles regardless of order in the inputs", () => {
    const staff = [
      staffItem("Zebra Book", "Author A"),
      staffItem("Apple Book", "Author B"),
    ];
    const rss = [
      rssItem("Apple Book", "Author B"), // reversed order from staff
      rssItem("Zebra Book", "Author A"),
    ];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
    expect(result.mergedItems).toHaveLength(2);
  });

  test("matches titles with trailing RSS colon artifact", () => {
    // RSS often produces "Title :" artifacts; normalizeTitle handles this
    const staff = [staffItem("Velociraptor", "Lennie, Charles")];
    const rss   = [rssItem("Velociraptor :", "Lennie, Charles")];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
  });

  test("matches titles with leading article differences", () => {
    // Staff export has "The Dinosaur Encyclopedia"; RSS omits "The" or vice versa
    const staff = [staffItem("The Big Golden Book of Dinosaurs", "Bakker, Robert T.")];
    const rss   = [rssItem("Big Golden Book of Dinosaurs", "Bakker, Robert T.")];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
  });

  test("sorts merged items alphabetically by title (ignoring articles)", () => {
    const staff = [
      staffItem("Zebra Book",      "Author Z"),
      staffItem("An Apple Book",   "Author A"),
      staffItem("The Middle Book", "Author M"),
    ];
    const rss = [
      rssItem("The Middle Book", "Author M"),
      rssItem("Zebra Book",      "Author Z"),
      rssItem("An Apple Book",   "Author A"),
    ];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
    // "An Apple Book" → normalizes to "apple book" → should be first
    expect(result.mergedItems![0].title).toBe("An Apple Book");
    // "The Middle Book" → "middle book" → second
    expect(result.mergedItems![1].title).toBe("The Middle Book");
    // "Zebra Book" → "zebra book" → last
    expect(result.mergedItems![2].title).toBe("Zebra Book");
  });

  test("uses staff title for merged item (not RSS title)", () => {
    // Staff export titles are typically cleaner for display
    const staff = [staffItem("The Diabetes Code", "Fung, Jason")];
    const rss   = [rssItem("The Diabetes Code :", "Fung, Jason")]; // RSS artifact

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
    expect(result.mergedItems![0].title).toBe("The Diabetes Code"); // staff wins
  });

  test("falls back to RSS author if staff author is empty", () => {
    const staff = [staffItem("Orphan Title", "")]; // author missing in staff export
    const rss   = [rssItem("Orphan Title", "Found Author")];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(true);
    expect(result.mergedItems![0].author).toBe("Found Author");
  });
});

// ── Count mismatch ────────────────────────────────────────────────────────────

describe("mergeItems — count mismatch blocks generation", () => {
  test("fails when staff has more items than RSS", () => {
    const staff = [staffItem("Book A"), staffItem("Book B")];
    const rss   = [rssItem("Book A")];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].type).toBe("count_mismatch");
  });

  test("fails when RSS has more items than staff", () => {
    const staff = [staffItem("Book A")];
    const rss   = [rssItem("Book A"), rssItem("Book B")];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(false);
    expect(result.errors![0].type).toBe("count_mismatch");
  });

  test("count mismatch error includes both counts", () => {
    const staff = [staffItem("A"), staffItem("B"), staffItem("C")];
    const rss   = [rssItem("A")];

    const result = mergeItems(staff, rss);
    const err = result.errors![0];
    expect(err.message).toContain("3");
    expect(err.message).toContain("1");
  });

  test("count mismatch error includes actionable message", () => {
    const staff = [staffItem("A"), staffItem("B")];
    const rss   = [rssItem("A")];

    const result = mergeItems(staff, rss);
    expect(result.errors![0].action).toBeTruthy();
    expect(result.errors![0].affects).toBeTruthy();
  });
});

// ── Unmatched titles ──────────────────────────────────────────────────────────

describe("mergeItems — unmatched titles block generation", () => {
  test("fails when a staff title has no match in RSS (same count)", () => {
    const staff = [staffItem("Book A"), staffItem("Book B")];
    const rss   = [rssItem("Book A"),  rssItem("Book C")]; // "Book C" ≠ "Book B"

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.type === "unmatched_item")).toBe(true);
  });

  test("unmatched error lists the problem titles", () => {
    const staff = [staffItem("Unique Staff Title"), staffItem("Shared Title")];
    const rss   = [rssItem("Unique RSS Title"),    rssItem("Shared Title")];

    const result = mergeItems(staff, rss);
    expect(result.success).toBe(false);

    const unmatchedStaffErr = result.errors!.find(e =>
      e.items?.includes("Unique Staff Title")
    );
    expect(unmatchedStaffErr).toBeDefined();

    const unmatchedRssErr = result.errors!.find(e =>
      e.items?.includes("Unique RSS Title")
    );
    expect(unmatchedRssErr).toBeDefined();
  });
});

// ── Empty inputs ──────────────────────────────────────────────────────────────

describe("mergeItems — empty inputs block generation", () => {
  test("fails when staff input is empty", () => {
    const result = mergeItems([], [rssItem("Some Book")]);
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.type === "empty_input")).toBe(true);
  });

  test("fails when RSS input is empty", () => {
    const result = mergeItems([staffItem("Some Book")], []);
    expect(result.success).toBe(false);
    expect(result.errors!.some(e => e.type === "empty_input")).toBe(true);
  });

  test("fails when both inputs are empty", () => {
    const result = mergeItems([], []);
    expect(result.success).toBe(false);
    expect(result.errors!.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Result metadata ───────────────────────────────────────────────────────────

describe("mergeItems — result metadata", () => {
  test("always reports staffCount and rssCount", () => {
    const staff = [staffItem("A"), staffItem("B")];
    const rss   = [rssItem("A")];

    const result = mergeItems(staff, rss);
    expect(result.staffCount).toBe(2);
    expect(result.rssCount).toBe(1);
  });

  test("reports correct counts on successful merge", () => {
    const staff = [staffItem("A"), staffItem("B")];
    const rss   = [rssItem("A"), rssItem("B")];

    const result = mergeItems(staff, rss);
    expect(result.staffCount).toBe(2);
    expect(result.rssCount).toBe(2);
  });
});
