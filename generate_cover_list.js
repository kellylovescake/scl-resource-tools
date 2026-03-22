#!/usr/bin/env node
/**
 * Sunflower County Library System
 * Cover Image Bibliography — DOCX Generator v1
 *
 * Usage: node generate_cover_list.js '<json>'
 * JSON shape: { title, ageGroup, preparedBy, dateStr, books, digitalResources, outputPath }
 * Each book: { title, author, collection, callNumber, coverImagePath }
 * coverImagePath: absolute path to a locally-fetched cover image (jpg or png),
 *   or null/omitted for a no-cover fallback.
 */

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  Footer, AlignmentType, WidthType, ShadingType,
  BorderStyle, VerticalAlign, PageNumber, NumberFormat,
  convertInchesToTwip,
} = require("docx");

// ── Constants ──────────────────────────────────────────────────────────────────
const LOGO_PATH  = path.join(__dirname, "..", "assets", "scl-logo.png");

const SCL_ORANGE = "C97C2E";
const SCL_DARK   = "1A1A1A";
const SCL_GRAY   = "6B6B6B";
const SCL_LIGHT  = "FDF6EC";
const SCL_RULE   = "E8C99A";

const PAGE_W_DXA  = 12240;
const PAGE_H_DXA  = 15840;
const MARGIN      = 1440;
const CONTENT_W   = PAGE_W_DXA - MARGIN * 2;   // 9360 twip = 6.5"

// Cover column: 0.85" wide; text column fills the rest
const COVER_COL_W = convertInchesToTwip(0.85);
const TEXT_COL_W  = CONTENT_W - COVER_COL_W - convertInchesToTwip(0.15); // 0.15" gutter

// Cover image display size (portrait ratio ~2:3)
const COVER_PX_W  = 61;   // ~0.64"
const COVER_PX_H  = 92;   // ~0.96"

// Footer logo
const LOGO_W_EMU  = 1976438;
const LOGO_H_EMU  = 699355;
const LOGO_PX_W   = Math.round((LOGO_W_EMU / 914400) * 96);
const LOGO_PX_H   = Math.round((LOGO_H_EMU / 914400) * 96);

// ── Helpers ────────────────────────────────────────────────────────────────────
const orangeRule = () => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: SCL_ORANGE, space: 1 } },
  spacing: { after: 120 },
});

const lightRule = () => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: SCL_RULE, space: 1 } },
  spacing: { after: 100 },
});

const sectionHeader = (text) => new Paragraph({
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, bold: true, size: 26, color: SCL_ORANGE, font: "Calibri" })],
});

// ── Footer ─────────────────────────────────────────────────────────────────────
function buildFooter(preparedBy, dateStr, logoBytes) {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const COL_LOGO  = convertInchesToTwip(2.3);
  const COL_MID   = convertInchesToTwip(2.0);
  const COL_RIGHT = CONTENT_W - COL_LOGO - COL_MID;

  const cellLogo = new TableCell({
    borders,
    width: { size: COL_LOGO, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({ data: logoBytes, type: "png", transformation: { width: LOGO_PX_W, height: LOGO_PX_H } })],
    })],
  });

  const cellPage = new TableCell({
    borders,
    width: { size: COL_MID, type: WidthType.DXA },
    margins: { top: 60, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: SCL_GRAY, font: "Calibri" }),
        new TextRun({ text: " / ", size: 16, color: SCL_GRAY, font: "Calibri" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: SCL_GRAY, font: "Calibri" }),
      ],
    })],
  });

  const cellPrepared = new TableCell({
    borders,
    width: { size: COL_RIGHT, type: WidthType.DXA },
    margins: { top: 40, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: `Prepared by: ${preparedBy}`, bold: true, size: 18, color: SCL_DARK, font: "Calibri" })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: dateStr, size: 16, color: SCL_GRAY, font: "Calibri" })],
      }),
    ],
  });

  const rulePara = new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: SCL_ORANGE, space: 4 } },
    spacing: { before: 0, after: 60 },
    children: [],
  });

  const footerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COL_LOGO, COL_MID, COL_RIGHT],
    rows: [new TableRow({ children: [cellLogo, cellPage, cellPrepared] })],
  });

  return new Footer({ children: [rulePara, footerTable] });
}

// ── Book row with cover image ──────────────────────────────────────────────────
function bookRow(index, book) {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  // Left cell: cover image or blank placeholder
  let coverCellChildren;
  if (book.coverImagePath && fs.existsSync(book.coverImagePath)) {
    const ext = path.extname(book.coverImagePath).toLowerCase().replace(".", "");
    const imgType = ext === "jpg" || ext === "jpeg" ? "jpg" : "png";
    coverCellChildren = [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({
        data: fs.readFileSync(book.coverImagePath),
        type: imgType,
        transformation: { width: COVER_PX_W, height: COVER_PX_H },
      })],
    })];
  } else {
    // Placeholder: blank paragraph with a light border box
    coverCellChildren = [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: "", size: 20 })],
    })];
  }

  const cellCover = new TableCell({
    borders,
    width: { size: COVER_COL_W, type: WidthType.DXA },
    margins: { top: 40, bottom: 60, left: 0, right: convertInchesToTwip(0.15) },
    verticalAlign: VerticalAlign.TOP,
    children: coverCellChildren,
  });

  // Right cell: number + title, author · collection, call number
  const metaLine = [book.author, book.collection].filter(Boolean).join("  ·  ");

  const cellText = new TableCell({
    borders,
    width: { size: TEXT_COL_W, type: WidthType.DXA },
    margins: { top: 40, bottom: 60, left: 0, right: 0 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      // Title + call number on same row via nested 2-col table
      new Table({
        width: { size: TEXT_COL_W, type: WidthType.DXA },
        columnWidths: [TEXT_COL_W - convertInchesToTwip(1.5), convertInchesToTwip(1.5)],
        rows: [new TableRow({
          children: [
            new TableCell({
              borders,
              margins: { top: 0, bottom: 0, left: 0, right: 60 },
              children: [new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: `${index}.  ${book.title}`, bold: true, size: 20, color: SCL_DARK, font: "Calibri" })],
              })],
            }),
            new TableCell({
              borders,
              margins: { top: 0, bottom: 0, left: 60, right: 0 },
              verticalAlign: VerticalAlign.TOP,
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: book.callNumber || "", bold: true, size: 18, color: SCL_DARK, font: "Calibri" })],
              })],
            }),
          ],
        })],
      }),
      // Author · Collection
      ...(metaLine ? [new Paragraph({
        spacing: { before: 20, after: 0 },
        children: [new TextRun({ text: metaLine, italics: true, size: 18, color: SCL_GRAY, font: "Calibri" })],
      })] : []),
    ],
  });

  return new TableRow({
    cantSplit: true,
    children: [cellCover, cellText],
  });
}

// ── Document builder ───────────────────────────────────────────────────────────
function buildDocument(params) {
  const { title, ageGroup, preparedBy, dateStr, books, digitalResources } = params;
  const logoBytes = fs.readFileSync(LOGO_PATH);

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: SCL_LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 160, after: ageGroup ? 60 : 160 },
    children: [new TextRun({ text: title, bold: true, size: 44, color: SCL_DARK, font: "Calibri" })],
  });

  const agePara = ageGroup ? new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: SCL_LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 0, after: 160 },
    children: [new TextRun({ text: ageGroup, size: 24, color: SCL_GRAY, italics: true, font: "Calibri" })],
  }) : null;

  const bookTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COVER_COL_W, TEXT_COL_W],
    rows: books.map((b, i) => bookRow(i + 1, b)),
  });

  const digitalParas = (digitalResources || []).map(r => new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text: `▸  ${r.trim()}`, size: 20, color: SCL_DARK, font: "Calibri" })],
  }));

  const children = [
    titlePara,
    ...(agePara ? [agePara] : []),
    orangeRule(),
    sectionHeader("Print Resources"),
    lightRule(),
    bookTable,
    ...((digitalResources || []).length ? [
      sectionHeader("Digital Resources"),
      lightRule(),
      ...digitalParas,
    ] : []),
  ];

  const footer = buildFooter(preparedBy, dateStr, logoBytes);
  const outerBorder = { style: BorderStyle.THICK_THIN_SMALL_GAP, size: 18, color: "000000", space: 24 };

  return new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20, color: SCL_DARK } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W_DXA, height: PAGE_H_DXA },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          borders: {
            pageBorderTop:    outerBorder,
            pageBorderBottom: outerBorder,
            pageBorderLeft:   outerBorder,
            pageBorderRight:  outerBorder,
            display: "allPages",
            offsetFrom: "page",
          },
        },
        pageNumberStart: 1,
        pageNumberFormatType: NumberFormat.DECIMAL,
      },
      footers: { default: footer },
      children,
    }],
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────
async function main() {
  const params = JSON.parse(process.argv[2]);
  const doc    = buildDocument(params);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(params.outputPath, buffer);
  console.log(`✅  Saved: ${params.outputPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
