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

// ── ILS format without __bold__ markers ──────────────────────────────────────
// When staff copy the skill output from a rendered markdown interface, the
// __Title.__ markers are stripped. The parser must handle both variants.

describe("parseStaffExport — rendered format without __bold__ markers", () => {
  test("parses title and author when :. separator is present", () => {
    const input =
      "* Coding for kids in easy steps :. McGrath, Mike. Collection: Adult Non-Fiction, Call #: 005 M";
    const { items } = parseStaffExport(input);
    expect(items[0].title).toBe("Coding for kids in easy steps");
    expect(items[0].author).toBe("McGrath, Mike");
    expect(items[0].callNumber).toBe("005 M");
    expect(items[0].collection).toBe("Adult Non-Fiction");
  });

  test("parses title and author for plain . separator (no subtitle)", () => {
    const input =
      "* Coding projects in Scratch. Woodcock, Jon. Collection: Adult Non-Fiction, Call #: 005 W";
    const { items } = parseStaffExport(input);
    expect(items[0].title).toBe("Coding projects in Scratch");
    expect(items[0].author).toBe("Woodcock, Jon");
  });

  test("parses title and author when subtitle is spelled out", () => {
    const input =
      "* Coding for children and young adults in libraries : a practical guide for librarians. Harrop, Wendy. Collection: Adult Non-Fiction, Call #: 005.1071 H";
    const { items } = parseStaffExport(input);
    expect(items[0].title).toBe(
      "Coding for children and young adults in libraries : a practical guide for librarians"
    );
    expect(items[0].author).toBe("Harrop, Wendy");
  });

  test("handles a multi-item rendered list with mixed formats", () => {
    const input = [
      "* Coding for kids in easy steps :. McGrath, Mike. Collection: Adult Non-Fiction, Call #: 005 M",
      "* Coding projects in Scratch. Woodcock, Jon. Collection: Adult Non-Fiction, Call #: 005 W",
      "* Girls who code : learn to code and change the world. Saujani, Reshma. Collection: Juvenile Non-Fiction, Call #: J 005.1023 S",
    ].join("\n");
    const { items } = parseStaffExport(input);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Coding for kids in easy steps");
    expect(items[1].title).toBe("Coding projects in Scratch");
    expect(items[2].title).toBe(
      "Girls who code : learn to code and change the world"
    );
  });
});

// ── ILS line-break joining ────────────────────────────────────────────────────
// The ILS has a column-width limit that inserts hard line breaks mid-word.
// joinBrokenLines() must reassemble the item before the title regex runs.

describe("parseStaffExport — ILS line-break joining", () => {
  test("joins a mid-word line break (e.g. 'w\\norld') into one item", () => {
    // Simulates the exact raw copy-paste from the ILS that broke the merge:
    // "Girls who code : learn to code and change the w\norld. Saujani, Reshma..."
    const input =
      "* Girls who code : learn to code and change the w\norld. Saujani, Reshma. Collection: Juvenile Non-Fiction, Call #: J 005.1023 S";
    const { items, warnings } = parseStaffExport(input);
    expect(warnings).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe(
      "Girls who code : learn to code and change the world"
    );
    expect(items[0].author).toBe("Saujani, Reshma");
    expect(items[0].callNumber).toBe("J 005.1023 S");
  });

  test("does not merge two separate items that happen to lack Call #: on one line", () => {
    // Each item has its own Call #: so they should remain separate
    const input = [
      "* __Book One.__ Author One. Collection: Easy, Call #: E ONE",
      "* __Book Two.__ Author Two. Collection: Easy, Call #: E TWO",
    ].join("\n");
    const { items } = parseStaffExport(input);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Book One");
    expect(items[1].title).toBe("Book Two");
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
