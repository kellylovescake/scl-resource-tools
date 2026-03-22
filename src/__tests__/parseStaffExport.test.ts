/**
 * src/__tests__/parseStaffExport.test.ts
 *
 * Unit tests for src/core/parseStaffExport.ts
 *
 * WHY THESE TESTS EXIST:
 * The staff export parser is the entry point for every bibliography workflow.
 * If it misparses titles, authors, call numbers, or collections, every
 * downstream step (merge, generation) is wrong. These tests pin down exact
 * parsing behavior against the formats staff actually produce.
 *
 * BEHAVIORAL BASELINE:
 * These tests describe what parseIllList() in generate_list.js does.
 * If a test here fails after a code change, it means baseline behavior changed.
 * That requires explicit approval before accepting.
 */

import { parseStaffExport } from "@/core/parseStaffExport";

// ── Primary ILS export format ─────────────────────────────────────────────────
// Format: * __Title.__ Author. Collection: X, Call #: Y

describe("parseStaffExport — primary ILS format", () => {
  const input = `* __The Diabetes Code.__ Fung, Jason. Collection: Adult Non-Fiction, Call #: 616.4 F`;

  test("parses title correctly", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].title).toBe("The Diabetes Code");
  });

  test("parses author correctly", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].author).toBe("Fung, Jason");
  });

  test("parses collection correctly", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].collection).toBe("Adult Non-Fiction");
  });

  test("parses call number correctly", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].callNumber).toBe("616.4 F");
  });

  test("sets source to staff_export", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].source).toBe("staff_export");
  });
});

// ── Multiline ILS export ──────────────────────────────────────────────────────

describe("parseStaffExport — multiline input", () => {
  const input = `
* __The Diabetes Code.__ Fung, Jason. Collection: Adult Non-Fiction, Call #: 616.4 F
* __Think Like a Pancreas.__ Scheiner, Gary. Collection: Adult Non-Fiction, Call #: 616.4 S
`.trim();

  test("returns correct item count", () => {
    const { items } = parseStaffExport(input);
    expect(items).toHaveLength(2);
  });

  test("parses both titles", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].title).toBe("The Diabetes Code");
    expect(items[1].title).toBe("Think Like a Pancreas");
  });
});

// ── Blank and comment lines ───────────────────────────────────────────────────

describe("parseStaffExport — blank and comment lines", () => {
  const input = `
# This is a comment

* __Title One.__ Author One. Collection: Easy, Call #: E ONE

# Another comment
* __Title Two.__ Author Two. Collection: Easy, Call #: E TWO
`.trim();

  test("skips comment lines", () => {
    const { items } = parseStaffExport(input);
    expect(items).toHaveLength(2);
  });

  test("skips blank lines", () => {
    const { items } = parseStaffExport(input);
    expect(items[0].title).toBe("Title One");
  });
});

// ── Slash-delimited fallback ──────────────────────────────────────────────────

describe("parseStaffExport — slash-delimited format", () => {
  test("parses 'Title / Author' format", () => {
    const { items } = parseStaffExport("Coding for Kids / McGrath, Mike");
    expect(items[0].title).toBe("Coding for Kids");
    expect(items[0].author).toBe("McGrath, Mike");
  });
});

// ── Em-dash delimited fallback ────────────────────────────────────────────────

describe("parseStaffExport — em-dash delimited format", () => {
  test("parses 'Title — Author' format", () => {
    const { items } = parseStaffExport("Coding for Kids \u2014 McGrath, Mike");
    expect(items[0].title).toBe("Coding for Kids");
    expect(items[0].author).toBe("McGrath, Mike");
  });
});

// ── Bare title fallback ───────────────────────────────────────────────────────

describe("parseStaffExport — bare title", () => {
  test("parses a numbered bare title", () => {
    const { items } = parseStaffExport("1. Velociraptor");
    expect(items[0].title).toBe("Velociraptor");
    expect(items[0].author).toBe("");
  });

  test("parses an un-numbered bare title", () => {
    const { items } = parseStaffExport("Velociraptor");
    expect(items[0].title).toBe("Velociraptor");
  });
});

// ── Title cleanup ─────────────────────────────────────────────────────────────

describe("parseStaffExport — title cleanup", () => {
  test("removes trailing colon artifact from title", () => {
    const { items } = parseStaffExport("* __Velociraptor :.__ Lennie, Charles.");
    expect(items[0].title).toBe("Velociraptor");
  });

  test("removes trailing period from author", () => {
    const { items } = parseStaffExport("* __Some Book.__ Doe, Jane.");
    expect(items[0].author).toBe("Doe, Jane");
  });
});

// ── Empty input ───────────────────────────────────────────────────────────────

describe("parseStaffExport — empty input", () => {
  test("returns empty items array for empty string", () => {
    const { items } = parseStaffExport("");
    expect(items).toHaveLength(0);
  });

  test("returns empty items array for only whitespace", () => {
    const { items } = parseStaffExport("   \n   \n   ");
    expect(items).toHaveLength(0);
  });
});

// ── Missing optional fields ───────────────────────────────────────────────────

describe("parseStaffExport — items with missing optional fields", () => {
  test("callNumber is empty string when not present", () => {
    const { items } = parseStaffExport("* __Book Title.__ Author Name.");
    expect(items[0].callNumber).toBe("");
  });

  test("collection is empty string when not present", () => {
    const { items } = parseStaffExport("* __Book Title.__ Author Name.");
    expect(items[0].collection).toBe("");
  });
});

// ── Warnings ─────────────────────────────────────────────────────────────────

describe("parseStaffExport — no warnings for valid input", () => {
  test("produces no warnings for clean ILS format", () => {
    const { warnings } = parseStaffExport(
      "* __Good Title.__ Good Author. Collection: Easy, Call #: E G"
    );
    expect(warnings).toHaveLength(0);
  });
});
