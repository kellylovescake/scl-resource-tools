#!/usr/bin/env node
/**
 * Sunflower County Library System
 * ILL Resource List — DOCX Generator v4
 *
 * Usage: node generate_list.js '<json>'
 * JSON shape: { title, ageGroup, preparedBy, books, digitalResources, outputPath }
 */

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  Footer, AlignmentType, TabStopType, WidthType, ShadingType,
  BorderStyle, VerticalAlign, PageNumber, NumberFormat,
  convertInchesToTwip, convertMillimetersToTwip,
} = require("docx");

// ── Constants ──────────────────────────────────────────────────────────────────
const LIBRARY_NAME = "Sunflower County Library System";
const PHONE        = "662-887-1672";
const WEBSITE      = "https://sunflower.lib.ms.us/";
const LOGO_PATH    = path.join(__dirname, "..", "assets", "scl-logo.png");

const SCL_ORANGE = "C97C2E";
const SCL_DARK   = "1A1A1A";
const SCL_GRAY   = "6B6B6B";
const SCL_LIGHT  = "FDF6EC";
const SCL_RULE   = "E8C99A";

// US Letter, 1" margins all sides
const PAGE_W_DXA = 12240;
const PAGE_H_DXA = 15840;
const MARGIN     = 1440;
const CONTENT_W  = PAGE_W_DXA - MARGIN * 2;  // 9360
const CALL_W     = convertInchesToTwip(1.5);  // 2160
const TITLE_W    = CONTENT_W - CALL_W;        // 7200

// Logo: exact dimensions from AI Tips document (EMU → px at 96dpi)
const LOGO_W_EMU = 1976438;
const LOGO_H_EMU = 699355;
const LOGO_PX_W  = Math.round((LOGO_W_EMU / 914400) * 96);  // ~207px ≈ 2.16"
const LOGO_PX_H  = Math.round((LOGO_H_EMU / 914400) * 96);  // ~73px  ≈ 0.76"

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
  // Three-column invisible table: logo left | page num center | prepared by + date right
  // This is the only reliable way to get an inline image and text truly side-by-side.
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const COL_LOGO   = convertInchesToTwip(2.3);   // logo column
  const COL_MID    = convertInchesToTwip(3.2);   // page number column
  const COL_RIGHT  = CONTENT_W - COL_LOGO - COL_MID;  // prepared by column

  // Cell 1: logo
  const cellLogo = new TableCell({
    borders,
    width: { size: COL_LOGO, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({
        data: logoBytes,
        type: "png",
        transformation: { width: LOGO_PX_W, height: LOGO_PX_H },
      })],
    })],
  });

  // Cell 2: page number centered
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

  // Cell 3: "Prepared by:" + date stacked, right-aligned
  const cellPrepared = new TableCell({
    borders,
    width: { size: COL_RIGHT, type: WidthType.DXA },
    margins: { top: 40, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({
          text: `Prepared by: ${preparedBy}`,
          bold: true, size: 18, color: SCL_DARK, font: "Calibri",
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({
          text: dateStr, size: 16, color: SCL_GRAY, font: "Calibri",
        })],
      }),
    ],
  });

  // Orange rule paragraph above the table
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

// ── ILL parser ─────────────────────────────────────────────────────────────────
function parseIllList(rawText) {
  const books = [];
  for (let line of rawText.trim().split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(/^\*\s*/, "");

    let callNumber = "";
    const callMatch = line.match(/Call #:\s*(.+)$/);
    if (callMatch) {
      callNumber = callMatch[1].trim();
      line = line.slice(0, callMatch.index).trim().replace(/,\s*$/, "");
    }

    let collection = "";
    const collMatch = line.match(/Collection:\s*([^,]+)/);
    if (collMatch) {
      collection = collMatch[1].trim();
      line = line.slice(0, collMatch.index).trim().replace(/[,\.]\s*$/, "");
    }

    let title = "", author = "";
    const titleMatch = line.match(/^__(.+?)__\.?\s*(.*)/);
    if (titleMatch) {
      title  = titleMatch[1].trim().replace(/[\s:\.]+$/, "");
      author = titleMatch[2].trim().replace(/\.$/, "");
    } else {
      for (const delim of [" / ", " — ", " - "]) {
        if (line.includes(delim)) {
          [title, author] = line.split(delim, 2).map(s => s.trim());
          break;
        }
      }
      if (!title) title = line.replace(/^\d+[\.\)]\s*/, "").trim();
    }

    if (title) books.push({ title, author, collection, callNumber });
  }
  return books;
}

// ── Book row ───────────────────────────────────────────────────────────────────
function bookRow(index, book) {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  return new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: TITLE_W, type: WidthType.DXA },
        margins: { top: 40, bottom: 60, left: 0, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({
              text: `${index}.  ${book.title}`,
              bold: true, size: 20, color: SCL_DARK, font: "Calibri",
            })],
          }),
          ...([book.author, book.collection].filter(Boolean).length ? [new Paragraph({
            spacing: { before: 20 },
            children: [new TextRun({
              text: [book.author, book.collection].filter(Boolean).join("  ·  "),
              italics: true, size: 18, color: SCL_GRAY, font: "Calibri",
            })],
          })] : []),
        ],
      }),
      new TableCell({
        borders,
        width: { size: CALL_W, type: WidthType.DXA },
        margins: { top: 40, bottom: 60, left: 120, right: 0 },
        verticalAlign: VerticalAlign.TOP,
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: book.callNumber || "",
            bold: true, size: 18, color: SCL_DARK, font: "Calibri",
          })],
        })],
      }),
    ],
  });
}

// ── Document builder ───────────────────────────────────────────────────────────
function buildDocument(params) {
  const { title, ageGroup, preparedBy, books, digitalResources, dateStr } = params;
  const logoBytes = fs.readFileSync(LOGO_PATH);

  // Title band
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: SCL_LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 160, after: ageGroup ? 60 : 160 },
    children: [new TextRun({
      text: title, bold: true, size: 44, color: SCL_DARK, font: "Calibri",
    })],
  });

  const agePara = ageGroup ? new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: SCL_LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 0, after: 160 },
    children: [new TextRun({
      text: ageGroup, size: 24, color: SCL_GRAY, italics: true, font: "Calibri",
    })],
  }) : null;

  const bookTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [TITLE_W, CALL_W],
    rows: books.map((b, i) => bookRow(i + 1, b)),
  });

  const digitalParas = digitalResources.map(r => new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({
      text: `▸  ${r.trim()}`, size: 20, color: SCL_DARK, font: "Calibri",
    })],
  }));

  const children = [
    titlePara,
    ...(agePara ? [agePara] : []),
    orangeRule(),
    sectionHeader("Print Resources"),
    lightRule(),
    bookTable,
    ...(digitalResources.length ? [
      sectionHeader("Digital Resources"),
      lightRule(),
      ...digitalParas,
    ] : []),
  ];

  const footer = buildFooter(preparedBy, dateStr, logoBytes);

  // Page border: double rule, thicker outer band — applied to all four sides
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
