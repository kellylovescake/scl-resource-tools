// MARKER: DOCX GENERATION
/**
 * src/core/buildDocx.ts
 *
 * Unified DOCX document builder for SCL Resource Tools.
 * Ports all three original reference scripts into a single TypeScript engine:
 *   - generate_list.js          → text-only mode (no annotations)
 *   - generate_annotated_list.js → text-only mode (with annotations)
 *   - generate_cover_list.js     → cover image mode
 *
 * WHY THIS FILE EXISTS:
 * The three reference scripts had duplicated footer/header/layout logic.
 * This unified engine eliminates the duplication and adds the type safety,
 * conditional page numbers, and approved behavior fixes described in the spec.
 *
 * WHAT IT DOES:
 * - Reads a BibliographyJob (mode + metadata + items)
 * - Builds a Word document (DOCX) matching the original visual output
 * - Returns the document as a Buffer for the Next.js API route to serve
 *
 * WHAT IT ASSUMES:
 * - process.cwd() is the project root (i.e., Next.js server)
 * - public/scl-logo.png exists and is a valid PNG
 * - Items are already parsed, merged, and validated before arriving here
 *
 * APPROVED CHANGES FROM BASELINE (see project spec):
 * 1. Cover mode: item numbers removed (originals showed them; spec removes them)
 * 2. Footer: COL_MID is 1.8" (not 3.2" from generate_list.js) to prevent "Prepared by: name" wrapping
 * 3. Footer: page numbers hidden on single-page documents (via Word IF field)
 * 4. Annotations apply to BOTH text mode AND cover mode (original only had annotated text mode)
 *
 * SAFE TO CHANGE LATER:
 * - Page margins, border style (outerBorder)
 * - Logo pixel dimensions (update LOGO_PX_W / LOGO_PX_H in colorways.ts)
 * - Section header font size, spacing
 * - Colorways (add colorway presets per MARKER: FUTURE AI STYLE SELECTION below)
 *
 * REFERENCES:
 * - generate_list.js (text-only baseline)
 * - generate_annotated_list.js (annotated baseline)
 * - generate_cover_list.js (cover baseline)
 */

import fs from "fs";
import path from "path";

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  Footer,
  AlignmentType,
  WidthType,
  ShadingType,
  BorderStyle,
  VerticalAlign,
  NumberFormat,
  PageBorderDisplay,
  PageBorderOffsetFrom,
  convertInchesToTwip,
  XmlComponent,
  type IContext,
  type IXmlableObject,
} from "docx";

// MARKER: COLORWAY POLICY
// MARKER: FUTURE AI STYLE SELECTION
// All colors and layout dimensions are imported from colorways.ts.
// V1 uses the single SCL brand palette. Future: pass a ColorwayConfig into
// buildDocx() to support multiple colorways (see colorways.ts for full notes).
import {
  SCL_ORANGE,
  SCL_DARK,
  SCL_GRAY,
  SCL_LIGHT,
  SCL_RULE,
  SCL_ANNOTATION,
  PAGE_W_DXA,
  PAGE_H_DXA,
  MARGIN,
  CONTENT_W,
  CALL_W,
  TITLE_W,
  COVER_COL_W,
  COVER_GUTTER,
  TEXT_COL_W,
  COVER_PX_W,
  COVER_PX_H,
  LOGO_PX_W,
  LOGO_PX_H,
  FOOTER_COL_LOGO,
  ANNOTATION_INDENT_TWIP,
  ANNOTATION_SIZE,
} from "./colorways";

import type { BibliographyJob, BibliographyItem, DocumentMeta } from "../types";

// ── Footer column overrides (approved fix) ─────────────────────────────────────
// The original generate_list.js used COL_MID = 3.2", which left only ~1.0" for
// the "Prepared by: name" text — causing wrapping on longer staff names.
// Per spec, COL_MID is reduced to 1.8" so COL_RIGHT is ~2.4", preventing wrap.
// NOTE: colorways.ts FOOTER_COL_MID is 2.0" (the annotated/cover scripts value).
// This file overrides to the spec-mandated 1.8" for all modes.
const FOOTER_COL_MID: number = convertInchesToTwip(1.8);
const FOOTER_COL_RIGHT: number = CONTENT_W - FOOTER_COL_LOGO - FOOTER_COL_MID;

// ── Page number run font properties ───────────────────────────────────────────
// 8pt (16 half-points), SCL_GRAY, Calibri — matches original scripts.
const PAGE_NUM_SIZE = 16;

// ── ConditionalPageNumberParagraph ─────────────────────────────────────────────
/**
 * A complete `w:p` element that renders a page number only when the document
 * has more than one page. Uses a Word IF field:
 *   { IF { NUMPAGES } > 1 "{ PAGE } / { NUMPAGES }" "" }
 *
 * WHY THIS EXISTS:
 * The original scripts always showed "1 / 1" on single-page documents — which
 * looks amateurish. Word supports IF fields in footers, but docx.js has no
 * built-in wrapper for this construct. We override prepForXml() to return the
 * raw xml-js structure directly.
 *
 * WHY EXTEND XmlComponent:
 * XmlComponent subclasses are accepted as FileChild equivalents by the
 * docx library internals when placed in Footer.children. This is the
 * pattern used throughout the library for custom XML structures.
 *
 * WHAT IT ASSUMES:
 * - Run properties (font/size/color) are set on every run for consistency.
 * - The w:p uses center alignment (matching the page number column layout).
 *
 * SAFE TO CHANGE LATER:
 * - Separator string (" / ") — update the w:t instrText run
 * - Font/size/color — update rPr objects below
 *
 * REFERENCE: Project spec — "Conditional page numbers" section
 */
class ConditionalPageNumberParagraph extends XmlComponent {
  constructor() {
    // rootKey "w:p" means this serializes as a <w:p> element
    super("w:p");
  }

  /**
   * Override prepForXml to emit the complete xml-js structure for:
   *   <w:p>
   *     <w:pPr><w:jc w:val="center"/></w:pPr>
   *     [runs encoding the IF { NUMPAGES } > 1 "{ PAGE } / { NUMPAGES }" "" field]
   *   </w:p>
   *
   * The xml-js format used by docx v9:
   *   { "tagName": [children] }           — element with child array
   *   { "tagName": { _attr: {...} } }      — element with only attributes
   *   { "tagName": { _attr: {...}, ... } } — element with attrs and content
   */
  prepForXml(_context: IContext): IXmlableObject {
    // Run properties shared by every run in this paragraph
    const rPr = [
      { "w:rFonts": { _attr: { "w:ascii": "Calibri", "w:hAnsi": "Calibri" } } },
      { "w:sz": { _attr: { "w:val": String(PAGE_NUM_SIZE) } } },
      { "w:szCs": { _attr: { "w:val": String(PAGE_NUM_SIZE) } } },
      { "w:color": { _attr: { "w:val": SCL_GRAY } } },
    ];

    // Helper: build a w:r run with the shared rPr plus one content child
    const run = (content: IXmlableObject): IXmlableObject => ({
      "w:r": [{ "w:rPr": rPr }, content],
    });

    // Helper: build a w:fldChar run
    const fldChar = (type: string, dirty?: boolean): IXmlableObject => {
      const attr: Record<string, string> = { "w:fldCharType": type };
      if (dirty) attr["w:dirty"] = "true";
      return run({ "w:fldChar": { _attr: attr } });
    };

    // Helper: build a w:instrText run
    const instr = (text: string): IXmlableObject =>
      run({ "w:instrText": { _attr: { "xml:space": "preserve" }, _text: text } });

    // The full IF field sequence (15 runs per spec):
    // 1.  fldChar begin (dirty) — start outer IF
    // 2.  instrText " IF "
    // 3.  fldChar begin — start nested NUMPAGES
    // 4.  instrText " NUMPAGES "
    // 5.  fldChar end — end nested NUMPAGES
    // 6.  instrText ' > 1 "' — condition and open true-branch string
    // 7.  fldChar begin — start PAGE field
    // 8.  instrText " PAGE "
    // 9.  fldChar end — end PAGE field
    // 10. w:t " / " with xml:space=preserve — literal separator
    // 11. fldChar begin — start second NUMPAGES
    // 12. instrText " NUMPAGES "
    // 13. fldChar end — end second NUMPAGES
    // 14. instrText '" ""' — close true-branch string, empty false-branch
    // 15. fldChar end (dirty) — end outer IF
    const runs: IXmlableObject[] = [
      fldChar("begin", true),
      instr(" IF "),
      fldChar("begin"),
      instr(" NUMPAGES "),
      fldChar("end"),
      instr(' > 1 "'),
      fldChar("begin"),
      instr(" PAGE "),
      fldChar("end"),
      // Literal " / " separator between PAGE and NUMPAGES
      {
        "w:r": [
          { "w:rPr": rPr },
          { "w:t": { _attr: { "xml:space": "preserve" }, _text: " / " } },
        ],
      },
      fldChar("begin"),
      instr(" NUMPAGES "),
      fldChar("end"),
      instr('" ""'),
      fldChar("end", true),
    ];

    return {
      "w:p": [
        {
          "w:pPr": [
            { "w:jc": { _attr: { "w:val": "center" } } },
          ],
        },
        ...runs,
      ],
    };
  }
}

// ── Shared helper paragraphs ───────────────────────────────────────────────────
/**
 * Orange bottom-border rule paragraph. Used after the title band.
 * Source: all three reference scripts — orangeRule()
 */
const orangeRule = (): Paragraph =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: SCL_ORANGE, space: 1 } },
    spacing: { after: 120 },
  });

/**
 * Light tan bottom-border rule paragraph. Used after section headers.
 * Source: all three reference scripts — lightRule()
 */
const lightRule = (): Paragraph =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: SCL_RULE, space: 1 } },
    spacing: { after: 100 },
  });

/**
 * Orange bold section header paragraph (e.g. "Print Resources").
 * Source: all three reference scripts — sectionHeader()
 */
const sectionHeader = (text: string): Paragraph =>
  new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 26, color: SCL_ORANGE, font: "Calibri" })],
  });

// ── Invisible table border helper ─────────────────────────────────────────────
/**
 * Returns a set of invisible cell borders (used in all table cells throughout
 * the document). Defined once here to avoid repetition.
 * Source: all three reference scripts — noBorder/borders pattern
 */
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const CELL_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
} as const;

// ── getLogoBytes ───────────────────────────────────────────────────────────────
/**
 * Loads the SCL logo PNG from the project's public directory.
 *
 * WHY THIS EXISTS:
 * Logo path resolution must be consistent whether called from an API route
 * or a CLI context. process.cwd() in Next.js server context is always the
 * project root, so this works in both environments.
 *
 * WHAT IT ASSUMES:
 * - process.cwd() is the project root
 * - public/scl-logo.png exists and is a valid PNG file
 *
 * SAFE TO CHANGE LATER:
 * - Path could be made configurable if a second logo is needed
 */
export function getLogoBytes(): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", "scl-logo.png"));
}

// ── buildFooter ────────────────────────────────────────────────────────────────
/**
 * Builds the shared three-column footer table used in all three document modes.
 *
 * Layout: [logo (2.3") | page number (1.8") | prepared by + date (right)]
 *
 * WHY THIS EXISTS:
 * All three reference scripts had identical footer logic. Unified here.
 * The only behavioral difference from the originals:
 *   1. COL_MID is 1.8" (not 3.2" or 2.0") to prevent "Prepared by:" wrapping.
 *   2. Page numbers use the ConditionalPageNumberParagraph (no "1/1" on single pages).
 *
 * WHAT IT ASSUMES:
 * - logoBytes is a valid PNG buffer from getLogoBytes()
 * - meta.preparedBy is non-empty (validation happens upstream)
 * - meta.dateStr is in a display-ready format (e.g. "03/21/2026")
 *
 * SAFE TO CHANGE LATER:
 * - Font sizes and colors (update colorways.ts)
 * - Footer orange rule spacing
 *
 * REFERENCES:
 * - generate_list.js buildFooter() (note: had COL_MID = 3.2" — wrapping bug)
 * - generate_annotated_list.js buildFooter() (COL_MID = 2.0")
 * - generate_cover_list.js buildFooter() (COL_MID = 2.0")
 *
 * @param meta - Document metadata (preparedBy, dateStr used in footer)
 * @param logoBytes - Raw PNG bytes for the SCL logo
 */
function buildFooter(meta: DocumentMeta, logoBytes: Buffer): Footer {
  // Cell 1: SCL logo, left-aligned, vertically centered
  const cellLogo = new TableCell({
    borders: CELL_BORDERS,
    width: { size: FOOTER_COL_LOGO, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: logoBytes,
            type: "png",
            transformation: { width: LOGO_PX_W, height: LOGO_PX_H },
          }),
        ],
      }),
    ],
  });

  // Cell 2: conditional page number, centered
  // Uses ConditionalPageNumberParagraph so single-page docs show nothing.
  const cellPage = new TableCell({
    borders: CELL_BORDERS,
    width: { size: FOOTER_COL_MID, type: WidthType.DXA },
    margins: { top: 60, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    // Cast required: ConditionalPageNumberParagraph extends XmlComponent (not Paragraph),
    // but docx accepts any XmlComponent as a table cell child at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children: [new ConditionalPageNumberParagraph() as unknown as Paragraph],
  });

  // Cell 3: "Prepared by: name" (bold) + date — right-aligned, stacked
  // COL_RIGHT is wide enough (~2.4") to avoid wrapping on typical staff names.
  const cellPrepared = new TableCell({
    borders: CELL_BORDERS,
    width: { size: FOOTER_COL_RIGHT, type: WidthType.DXA },
    margins: { top: 40, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: `Prepared by: ${meta.preparedBy}`,
            bold: true,
            size: 18,
            color: SCL_DARK,
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: meta.dateStr,
            size: 16,
            color: SCL_GRAY,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });

  // Orange rule paragraph rendered above the footer table
  // (space: 4 matches the annotated/cover originals)
  const rulePara = new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: SCL_ORANGE, space: 4 } },
    spacing: { before: 0, after: 60 },
    children: [],
  });

  const footerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [FOOTER_COL_LOGO, FOOTER_COL_MID, FOOTER_COL_RIGHT],
    rows: [new TableRow({ children: [cellLogo, cellPage, cellPrepared] })],
  });

  return new Footer({ children: [rulePara, footerTable] });
}

// ── buildHeaderSection ─────────────────────────────────────────────────────────
/**
 * Builds the title band at the top of the document:
 *   - Large centered title with warm off-white background (SCL_LIGHT)
 *   - Optional italic age group line (e.g. "for Children")
 *   - Orange bottom-border rule
 *
 * WHY THIS EXISTS:
 * All three reference scripts had identical title band logic. Unified here.
 *
 * WHAT IT ASSUMES:
 * - meta.title is non-empty
 * - meta.ageGroup may be empty string (omits the age line when empty)
 *
 * SAFE TO CHANGE LATER:
 * - Title font size (currently 44 half-points = 22pt)
 * - Age group font size (currently 24 half-points = 12pt)
 * - Spacing values
 *
 * REFERENCES:
 * - All three reference scripts — buildDocument() title band section
 *
 * @param meta - Document metadata (title, ageGroup)
 * @returns Array of Paragraph elements to prepend to document children
 */
function buildHeaderSection(meta: DocumentMeta): Paragraph[] {
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: SCL_LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 160, after: meta.ageGroup ? 60 : 160 },
    children: [
      new TextRun({
        text: meta.title,
        bold: true,
        size: 44,
        color: SCL_DARK,
        font: "Calibri",
      }),
    ],
  });

  const result: Paragraph[] = [titlePara];

  if (meta.ageGroup) {
    result.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        shading: { fill: SCL_LIGHT, type: ShadingType.CLEAR },
        spacing: { before: 0, after: 160 },
        children: [
          new TextRun({
            text: meta.ageGroup,
            size: 24,
            color: SCL_GRAY,
            italics: true,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  result.push(orangeRule());

  return result;
}

// ── buildDigitalSection ────────────────────────────────────────────────────────
/**
 * Builds the "Digital Resources" section: a header, light rule, and one
 * paragraph per digital resource with a ▸ bullet.
 *
 * WHY THIS EXISTS:
 * All three reference scripts had identical digital resources logic.
 *
 * WHAT IT ASSUMES:
 * - digitalResources is an array of display strings (e.g. "Hoopla Digital")
 * - Called only when digitalResources.length > 0 (caller is responsible for gating)
 *
 * SAFE TO CHANGE LATER:
 * - Bullet character (currently ▸)
 * - Paragraph spacing
 *
 * REFERENCES:
 * - All three reference scripts — digitalParas + children array
 *
 * @param resources - Array of digital resource label strings
 */
function buildDigitalSection(resources: string[]): Paragraph[] {
  if (resources.length === 0) return [];

  const paras: Paragraph[] = [sectionHeader("Digital Resources"), lightRule()];

  for (const r of resources) {
    paras.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text: `▸  ${r.trim()}`,
            size: 20,
            color: SCL_DARK,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  return paras;
}

// ── textRow ────────────────────────────────────────────────────────────────────
/**
 * Builds one row in a text-only or annotated bibliography table.
 *
 * Row layout: [title + meta lines (left) | call number (right, 1.5")]
 *
 * MARKER: ANNOTATION MODE
 * When item.annotation is non-empty AND the job has annotationMode !== "none",
 * an italic annotation paragraph is appended below the author/collection line.
 * cantSplit is set to true when annotations are present (prevents a row from
 * splitting across pages mid-annotation).
 *
 * cantSplit behavior (per spec):
 *   - No annotation → cantSplit: false (matches generate_list.js)
 *   - With annotation → cantSplit: true (matches generate_annotated_list.js)
 *
 * WHY THIS EXISTS:
 * Merges generate_list.js bookRow() and generate_annotated_list.js bookRow()
 * into a single function. The annotated version differed only in:
 *   1. cantSplit: true
 *   2. An optional annotation paragraph
 *   3. Slightly different bottom margin (80 vs 60)
 *
 * WHAT IT ASSUMES:
 * - index is 1-based (first item is "1. Title")
 * - item.title is non-empty
 * - item.annotation may be undefined or empty string
 *
 * SAFE TO CHANGE LATER:
 * - Annotation indent (ANNOTATION_INDENT_TWIP from colorways.ts)
 * - Annotation font size (ANNOTATION_SIZE from colorways.ts)
 * - Bottom margin values
 *
 * REFERENCES:
 * - generate_list.js bookRow() — text-only baseline
 * - generate_annotated_list.js bookRow() — annotated baseline
 *
 * @param index - 1-based row number
 * @param item - The bibliography item to render
 */
function textRow(index: number, item: BibliographyItem): TableRow {
  const hasAnnotation = Boolean(item.annotation && item.annotation.trim().length > 0);

  // Bottom margin: annotated rows use 80 (matches generate_annotated_list.js)
  // text-only rows use 60 (matches generate_list.js)
  const bottomMargin = hasAnnotation ? 80 : 60;

  const metaLine = [item.author, item.collection].filter(Boolean).join("  ·  ");

  const titleCellChildren: Paragraph[] = [
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: `${index}.  ${item.title}`,
          bold: true,
          size: 20,
          color: SCL_DARK,
          font: "Calibri",
        }),
      ],
    }),
  ];

  if (metaLine) {
    titleCellChildren.push(
      new Paragraph({
        spacing: { before: 20, after: 0 },
        children: [
          new TextRun({
            text: metaLine,
            italics: true,
            size: 18,
            color: SCL_GRAY,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  // MARKER: ANNOTATION MODE
  // Annotation paragraph: 8.5pt italic, color #888888, indented 0.2"
  // Only rendered when annotation is non-empty.
  // Source: generate_annotated_list.js bookRow() annotation block
  if (hasAnnotation) {
    titleCellChildren.push(
      new Paragraph({
        spacing: { before: 40, after: 0 },
        indent: { left: ANNOTATION_INDENT_TWIP },
        children: [
          new TextRun({
            text: item.annotation!,
            italics: true,
            size: ANNOTATION_SIZE,
            color: SCL_ANNOTATION,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  return new TableRow({
    // cantSplit true when annotations present (matches generate_annotated_list.js)
    // cantSplit false when no annotations (matches generate_list.js)
    cantSplit: hasAnnotation,
    children: [
      new TableCell({
        borders: CELL_BORDERS,
        width: { size: TITLE_W, type: WidthType.DXA },
        margins: { top: 40, bottom: bottomMargin, left: 0, right: 120 },
        children: titleCellChildren,
      }),
      new TableCell({
        borders: CELL_BORDERS,
        width: { size: CALL_W, type: WidthType.DXA },
        margins: { top: 40, bottom: bottomMargin, left: 120, right: 0 },
        verticalAlign: VerticalAlign.TOP,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: item.callNumber || "",
                bold: true,
                size: 18,
                color: SCL_DARK,
                font: "Calibri",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ── coverRow ───────────────────────────────────────────────────────────────────
/**
 * Builds one row in a cover bibliography table.
 *
 * Row layout: [cover image (0.85") | title + meta + optional annotation (rest)]
 * The right text cell uses a nested 2-column table to position the call number.
 *
 * APPROVED CHANGE: Item numbers are NOT shown in cover mode.
 * The original generate_cover_list.js showed "${index}. Title" — the spec
 * removes item numbers from cover mode entirely.
 *
 * MARKER: ANNOTATION MODE
 * Annotation applies to cover mode as well as text mode (spec extension).
 * The original cover script had no annotation support; this is new behavior.
 * Annotation renders below the author/collection line, same typography as text mode.
 *
 * cantSplit: always true for cover rows (matches generate_cover_list.js).
 *
 * WHY THIS EXISTS:
 * generate_cover_list.js bookRow() ported to TypeScript with:
 *   1. item numbers removed
 *   2. annotation support added
 *   3. coverImageData from BibliographyItem.coverImageData (Buffer, not file path)
 *
 * WHAT IT ASSUMES:
 * - item.coverImageData is a Buffer (jpg or png) or undefined/null for placeholder
 * - item.hasCover indicates whether a real cover was found
 * - The caller does NOT pass an index (cover mode has no item numbers)
 *
 * SAFE TO CHANGE LATER:
 * - Cover placeholder appearance (currently blank paragraph)
 * - Cover image display size (COVER_PX_W / COVER_PX_H in colorways.ts)
 * - Annotation indent and size
 *
 * REFERENCES:
 * - generate_cover_list.js bookRow() — cover baseline
 *
 * @param item - The bibliography item to render (must have coverImageData or hasCover=false)
 */
function coverRow(item: BibliographyItem): TableRow {
  const hasAnnotation = Boolean(item.annotation && item.annotation.trim().length > 0);

  // Left cell: cover image or blank placeholder
  let coverCellChildren: Paragraph[];
  if (item.coverImageData && item.hasCover) {
    // Detect image type from hasCover flag; default to jpeg (Syndetics returns jpeg)
    // The coverUrl can hint at type, but we default to jpeg for safety
    const imgType = item.coverUrl?.toLowerCase().endsWith(".png") ? "png" : "jpg";
    coverCellChildren = [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: item.coverImageData,
            type: imgType,
            transformation: { width: COVER_PX_W, height: COVER_PX_H },
          }),
        ],
      }),
    ];
  } else {
    // Placeholder: empty paragraph (same height as image, visually blank)
    // Source: generate_cover_list.js bookRow() else branch
    coverCellChildren = [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: "", size: 20 })],
      }),
    ];
  }

  const cellCover = new TableCell({
    borders: CELL_BORDERS,
    width: { size: COVER_COL_W, type: WidthType.DXA },
    margins: { top: 40, bottom: 60, left: 0, right: COVER_GUTTER },
    verticalAlign: VerticalAlign.TOP,
    children: coverCellChildren,
  });

  // Right cell: nested 2-column table [title | call number] + meta + annotation
  const metaLine = [item.author, item.collection].filter(Boolean).join("  ·  ");

  // APPROVED CHANGE: No item number in cover mode (spec removes "${index}. " prefix)
  const titleText = item.title;

  const innerTitleCell = new TableCell({
    borders: CELL_BORDERS,
    margins: { top: 0, bottom: 0, left: 0, right: 60 },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: titleText,
            bold: true,
            size: 20,
            color: SCL_DARK,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });

  const innerCallCell = new TableCell({
    borders: CELL_BORDERS,
    margins: { top: 0, bottom: 0, left: 60, right: 0 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: item.callNumber || "",
            bold: true,
            size: 18,
            color: SCL_DARK,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });

  const titleCallTable = new Table({
    width: { size: TEXT_COL_W, type: WidthType.DXA },
    columnWidths: [TEXT_COL_W - convertInchesToTwip(1.5), convertInchesToTwip(1.5)],
    rows: [new TableRow({ children: [innerTitleCell, innerCallCell] })],
  });

  // Build text cell children: nested table + optional meta line + optional annotation
  // Using any[] here because titleCallTable is a Table (not Paragraph) — docx accepts
  // both Table and Paragraph as TableCell children (FileChild).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textCellChildren: any[] = [titleCallTable];

  if (metaLine) {
    textCellChildren.push(
      new Paragraph({
        spacing: { before: 20, after: 0 },
        children: [
          new TextRun({
            text: metaLine,
            italics: true,
            size: 18,
            color: SCL_GRAY,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  // MARKER: ANNOTATION MODE
  // Cover mode annotation: same typography as text mode.
  // New behavior (not in original cover script).
  if (hasAnnotation) {
    textCellChildren.push(
      new Paragraph({
        spacing: { before: 40, after: 0 },
        indent: { left: ANNOTATION_INDENT_TWIP },
        children: [
          new TextRun({
            text: item.annotation!,
            italics: true,
            size: ANNOTATION_SIZE,
            color: SCL_ANNOTATION,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  const cellText = new TableCell({
    borders: CELL_BORDERS,
    width: { size: TEXT_COL_W, type: WidthType.DXA },
    margins: { top: 40, bottom: 60, left: 0, right: 0 },
    verticalAlign: VerticalAlign.TOP,
    children: textCellChildren,
  });

  return new TableRow({
    cantSplit: true, // Always true for cover rows — matches generate_cover_list.js
    children: [cellCover, cellText],
  });
}

// ── buildTextDocument ──────────────────────────────────────────────────────────
/**
 * Builds the complete Document object for text-only and annotated modes.
 *
 * WHY THIS EXISTS:
 * Merges generate_list.js and generate_annotated_list.js buildDocument().
 * The only difference between the two originals was annotation support in rows
 * (handled by textRow()) — the document structure was identical.
 *
 * REFERENCES:
 * - generate_list.js buildDocument()
 * - generate_annotated_list.js buildDocument()
 */
function buildTextDocument(job: BibliographyJob, logoBytes: Buffer): Document {
  const { meta, items } = job;

  const bookTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [TITLE_W, CALL_W],
    rows: items.map((item, i) => textRow(i + 1, item)),
  });

  const children = [
    ...buildHeaderSection(meta),
    sectionHeader("Print Resources"),
    lightRule(),
    bookTable,
    ...buildDigitalSection(meta.digitalResources),
  ];

  const footer = buildFooter(meta, logoBytes);
  const outerBorder = {
    style: BorderStyle.THICK_THIN_SMALL_GAP,
    size: 18,
    color: "000000",
    space: 24,
  };

  return new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20, color: SCL_DARK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W_DXA, height: PAGE_H_DXA },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
            pageNumbers: {
              start: 1,
              formatType: NumberFormat.DECIMAL,
            },
            borders: {
              pageBorders: {
                display: PageBorderDisplay.ALL_PAGES,
                offsetFrom: PageBorderOffsetFrom.PAGE,
              },
              pageBorderTop: outerBorder,
              pageBorderBottom: outerBorder,
              pageBorderLeft: outerBorder,
              pageBorderRight: outerBorder,
            },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });
}

// ── buildCoverDocument ─────────────────────────────────────────────────────────
/**
 * Builds the complete Document object for cover bibliography mode.
 *
 * WHY THIS EXISTS:
 * Ports generate_cover_list.js buildDocument() to TypeScript.
 * Approved change: item numbers removed from cover rows.
 *
 * REFERENCES:
 * - generate_cover_list.js buildDocument()
 */
function buildCoverDocument(job: BibliographyJob, logoBytes: Buffer): Document {
  const { meta, items } = job;

  const bookTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COVER_COL_W, TEXT_COL_W],
    rows: items.map((item) => coverRow(item)),
  });

  const children = [
    ...buildHeaderSection(meta),
    sectionHeader("Print Resources"),
    lightRule(),
    bookTable,
    ...buildDigitalSection(meta.digitalResources),
  ];

  const footer = buildFooter(meta, logoBytes);
  const outerBorder = {
    style: BorderStyle.THICK_THIN_SMALL_GAP,
    size: 18,
    color: "000000",
    space: 24,
  };

  return new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20, color: SCL_DARK } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W_DXA, height: PAGE_H_DXA },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
            pageNumbers: {
              start: 1,
              formatType: NumberFormat.DECIMAL,
            },
            borders: {
              pageBorders: {
                display: PageBorderDisplay.ALL_PAGES,
                offsetFrom: PageBorderOffsetFrom.PAGE,
              },
              pageBorderTop: outerBorder,
              pageBorderBottom: outerBorder,
              pageBorderLeft: outerBorder,
              pageBorderRight: outerBorder,
            },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });
}

// ── buildDocx ──────────────────────────────────────────────────────────────────
// MARKER: DOCX GENERATION
/**
 * Main entry point for bibliography document generation.
 *
 * Routes the job to the appropriate builder based on job.mode:
 *   - "text_only_bibliography" → buildTextDocument (with or without annotations)
 *   - "cover_bibliography"     → buildCoverDocument
 *
 * WHY THIS EXISTS:
 * Single public API for the web API route. The caller does not need to know
 * which builder to invoke — it passes a BibliographyJob and gets a Buffer back.
 *
 * WHAT IT ASSUMES:
 * - job.items is non-empty and already validated
 * - job.meta.preparedBy is non-empty
 * - For cover mode: item.coverImageData is a Buffer if item.hasCover is true
 * - public/scl-logo.png exists (throws if not found)
 *
 * SAFE TO CHANGE LATER:
 * - Add new modes by adding a case to the switch
 * - Add colorway selection by threading a ColorwayConfig through the builders
 *
 * @param job - The complete bibliography generation job
 * @returns Promise<Buffer> — the DOCX file as a Node.js Buffer
 * @throws Error if mode is unknown or logo file cannot be read
 */
export async function buildDocx(job: BibliographyJob): Promise<Buffer> {
  const logoBytes = getLogoBytes();

  let doc: Document;

  switch (job.mode) {
    case "text_only_bibliography":
      doc = buildTextDocument(job, logoBytes);
      break;

    case "cover_bibliography":
      doc = buildCoverDocument(job, logoBytes);
      break;

    default: {
      // TypeScript exhaustiveness guard — this branch is unreachable if types are correct
      const exhaustive: never = job.mode;
      throw new Error(`buildDocx: unknown mode "${String(exhaustive)}"`);
    }
  }

  return Packer.toBuffer(doc) as Promise<Buffer>;
}
