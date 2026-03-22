/**
 * src/__tests__/normalize.test.ts
 *
 * Unit tests for src/core/normalize.ts
 *
 * WHY THESE TESTS EXIST:
 * normalizeTitle() is the merge key function for the cover bibliography.
 * If it produces different output for the same title (depending on which
 * side of the merge it comes from), the merge will silently fail.
 * These tests pin down exact behavior so regressions are caught immediately.
 *
 * validateIsbn() and normalizeIsbn() are safety gates for the Blooper.
 * Bad ISBN handling should surface as clear errors, not silent API failures.
 *
 * HOW TO RUN:
 *   npm test
 */

import {
  normalizeTitle,
  normalizeIsbn,
  validateIsbn,
  isbn10ToIsbn13,
  isbn13ToIsbn10,
  cleanTrailingPunctuation,
  formatDateStr,
} from "@/core/normalize";

// ── normalizeTitle ────────────────────────────────────────────────────────────

describe("normalizeTitle", () => {
  test("lowercases the title", () => {
    expect(normalizeTitle("Dinosaurs")).toBe("dinosaurs");
  });

  test("strips leading 'the '", () => {
    expect(normalizeTitle("The Big Book")).toBe("big book");
  });

  test("strips leading 'a '", () => {
    expect(normalizeTitle("A Brief History")).toBe("brief history");
  });

  test("strips leading 'an '", () => {
    expect(normalizeTitle("An Introduction")).toBe("introduction");
  });

  test("is case-insensitive for leading article", () => {
    expect(normalizeTitle("THE Dinosaur Shelf")).toBe("dinosaur shelf");
  });

  test("does not strip 'the' in the middle of a title", () => {
    expect(normalizeTitle("Beyond the Wall")).toBe("beyond the wall");
  });

  test("strips trailing colon artifact from RSS titles", () => {
    expect(normalizeTitle("Velociraptor :")).toBe("velociraptor");
    expect(normalizeTitle("Velociraptor : ")).toBe("velociraptor");
  });

  test("strips trailing period", () => {
    expect(normalizeTitle("Flying Guy Presents: Dinosaurs.")).toBe("flying guy presents: dinosaurs");
  });

  test("collapses multiple spaces", () => {
    expect(normalizeTitle("Too   Many   Spaces")).toBe("too   many   spaces".replace(/\s+/g, " "));
  });

  test("trims whitespace", () => {
    expect(normalizeTitle("  Spaces Around  ")).toBe("spaces around");
  });

  test("produces identical keys for both sides of a common merge pair", () => {
    // Staff export title vs RSS title — these are the most common artifact patterns
    const staffTitle = "The Big Golden Book of Dinosaurs";
    const rssTitle = "The Big Golden Book of Dinosaurs :";
    expect(normalizeTitle(staffTitle)).toBe(normalizeTitle(rssTitle));
  });

  test("handles empty string without throwing", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

// ── normalizeIsbn ─────────────────────────────────────────────────────────────

describe("normalizeIsbn", () => {
  test("strips hyphens from ISBN-13", () => {
    expect(normalizeIsbn("978-0-375-85958-8")).toBe("9780375859588");
  });

  test("strips spaces from ISBN-13", () => {
    expect(normalizeIsbn("978 0 375 85958 8")).toBe("9780375859588");
  });

  test("accepts clean ISBN-13", () => {
    expect(normalizeIsbn("9780375859588")).toBe("9780375859588");
  });

  test("accepts clean ISBN-10", () => {
    expect(normalizeIsbn("0375859586")).toBe("0375859586");
  });

  test("accepts ISBN-10 ending in X", () => {
    expect(normalizeIsbn("080442957X")).toBe("080442957X");
  });

  test("returns null for obviously wrong input", () => {
    expect(normalizeIsbn("not-an-isbn")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
  });

  test("returns null for wrong length after stripping", () => {
    expect(normalizeIsbn("12345678")).toBeNull(); // 8 digits
  });
});

// ── validateIsbn ──────────────────────────────────────────────────────────────

describe("validateIsbn", () => {
  // ISBN-13 check digit validation
  test("validates a correct ISBN-13", () => {
    expect(validateIsbn("9780375859588")).toBe(true);
  });

  test("rejects an incorrect ISBN-13", () => {
    expect(validateIsbn("9780375859589")).toBe(false); // wrong check digit
  });

  test("validates the dinosaurs.json ISBN-13s", () => {
    // Spot-check three from the fixture file
    expect(validateIsbn("9781629700274")).toBe(true); // Velociraptor
    expect(validateIsbn("9780691180311")).toBe(true); // Dinosaur: Facts and Figures
    expect(validateIsbn("9780590130851")).toBe(true); // Did Dinosaurs Live in Your Backyard?
  });

  // ISBN-10 check digit validation
  test("validates a correct ISBN-10", () => {
    expect(validateIsbn("0375859586")).toBe(true);
  });

  test("rejects an incorrect ISBN-10", () => {
    expect(validateIsbn("0375859587")).toBe(false); // wrong check digit
  });

  test("validates ISBN-10 ending in X", () => {
    // 080442957X: verified valid ISBN-10 (sum = 209, 209 mod 11 = 0)
    expect(validateIsbn("080442957X")).toBe(true);
  });

  test("returns false for wrong length", () => {
    expect(validateIsbn("123456789")).toBe(false);  // 9 digits
    expect(validateIsbn("12345678901234")).toBe(false); // 14 digits
  });
});

// ── isbn10ToIsbn13 / isbn13ToIsbn10 ──────────────────────────────────────────

describe("isbn10ToIsbn13", () => {
  test("converts a valid ISBN-10 to ISBN-13", () => {
    expect(isbn10ToIsbn13("0375859586")).toBe("9780375859588");
  });

  test("returns null for wrong length input", () => {
    expect(isbn10ToIsbn13("123")).toBeNull();
  });
});

describe("isbn13ToIsbn10", () => {
  test("converts a 978-prefix ISBN-13 to ISBN-10", () => {
    expect(isbn13ToIsbn10("9780375859588")).toBe("0375859586");
  });

  test("returns null for 979-prefix ISBN-13 (no ISBN-10 equivalent)", () => {
    expect(isbn13ToIsbn10("9791032317952")).toBeNull();
  });
});

// ── cleanTrailingPunctuation ──────────────────────────────────────────────────

describe("cleanTrailingPunctuation", () => {
  test("removes trailing colon", () => {
    expect(cleanTrailingPunctuation("Title :")).toBe("Title");
  });

  test("removes trailing period", () => {
    expect(cleanTrailingPunctuation("Author.")).toBe("Author");
  });

  test("removes trailing comma", () => {
    expect(cleanTrailingPunctuation("Smith, John,")).toBe("Smith, John");
  });

  test("leaves internal punctuation alone", () => {
    expect(cleanTrailingPunctuation("Fung, Jason")).toBe("Fung, Jason");
  });

  test("handles empty string", () => {
    expect(cleanTrailingPunctuation("")).toBe("");
  });
});

// ── formatDateStr ─────────────────────────────────────────────────────────────

describe("formatDateStr", () => {
  test("formats a known date as MM/DD/YYYY", () => {
    const d = new Date(2026, 2, 21); // March 21 2026 (month is 0-indexed)
    expect(formatDateStr(d)).toBe("03/21/2026");
  });

  test("pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // January 5 2026
    expect(formatDateStr(d)).toBe("01/05/2026");
  });
});
