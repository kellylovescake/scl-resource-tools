/**
 * src/core/parseRssFeed.ts
 *
 * Parses an LS2 PAC RSS feed URL into BibliographyItems.
 *
 * WHY THIS FILE EXISTS:
 * The cover bibliography mode requires an RSS feed from the same ILS list
 * as the staff export. This module fetches and parses that feed.
 *
 * DATA SOURCE:
 * RSS feeds from LS2 PAC look like:
 *   https://tlc.sunflower.lib.ms.us/list/static/{LIST_ID}/rss
 *
 * Each <item> contains:
 * - <title>         — book title (may have trailing " :" or " :." artifacts)
 * - <dc:creator>    — author (may be empty)
 * - <description>   — HTML block containing:
 *                     • Syndetics <img src="..."> cover URL
 *                     • ISBN(s) in plain text
 *
 * What the RSS does NOT contain: collection, call number.
 * Those come from the staff export and are merged in mergeItems.ts.
 *
 * SOURCE OF TRUTH:
 * ISBN_Connector_Context.md describes the RSS structure.
 * COVER_SKILL.md describes the parsing workflow.
 *
 * SAFE TO EDIT:
 * - Tune the regex patterns if RSS format varies
 * - Add extraction of new fields if the RSS format gains them
 *
 * MARKER: STAFF EXPORT PARSER SELECTION
 * (RSS is a fixed format from one ILS system. If the ILS changes or a
 * different RSS format is introduced, this is where parsing would change.)
 */

import { parseStringPromise } from "xml2js";
import type { BibliographyItem } from "@/types";
import { cleanTrailingPunctuation } from "./normalize";

// ── Parse result ──────────────────────────────────────────────────────────────

export interface RssParseResult {
  items:    BibliographyItem[];
  warnings: RssWarning[];
  feedTitle?: string;  // The RSS channel title, if present
}

export interface RssWarning {
  itemIndex: number;
  title:     string;
  message:   string;
}

// ── Syndetics URL / ISBN constants ────────────────────────────────────────────

// Syndetics client ID for Sunflower County Library
const SYNDETICS_CLIENT = "sunflowerco";

// Cover image placeholder detection: images ≤ 2KB are Syndetics "no cover" placeholders
// Source: ISBN_Connector_Context.md
export const SYNDETICS_PLACEHOLDER_THRESHOLD_BYTES = 2000;

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * parseRssFeed(url)
 *
 * Fetches the RSS feed at `url` and parses each <item> into a BibliographyItem.
 * Returns items with: title, author, isbn (if found), coverUrl (Syndetics URL).
 *
 * Does NOT fetch cover images — that happens later in isbnService.ts.
 * Does NOT include collection or callNumber — those come from the staff export.
 *
 * Throws on network error or invalid XML.
 * Returns warnings for individual items that couldn't be parsed cleanly.
 */
export async function parseRssFeed(url: string): Promise<RssParseResult> {
  // ── Fetch the RSS XML ──────────────────────────────────────────────────────
  const response = await fetch(url, {
    headers: { "Accept": "application/rss+xml, application/xml, text/xml" },
    // 10-second timeout — if the ILS is slow, fail clearly rather than hanging
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `RSS feed returned HTTP ${response.status}. ` +
      `Check that the URL is correct and the list is public.`
    );
  }

  const xmlText = await response.text();

  // ── Parse the XML ──────────────────────────────────────────────────────────
  let parsed: any;
  try {
    parsed = await parseStringPromise(xmlText, {
      explicitArray: false,   // Don't wrap single values in arrays
      trim: true,
    });
  } catch {
    throw new Error(
      "Could not read the RSS feed — the content may not be valid XML. " +
      "Check the URL and try again."
    );
  }

  // Navigate the RSS structure: rss > channel > item[]
  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error("RSS feed did not contain a channel. Check the URL.");
  }

  const feedTitle: string | undefined = channel.title;

  // Items may be a single object (1-item feed) or an array — normalize to array
  const rawItems: any[] = Array.isArray(channel.item)
    ? channel.item
    : channel.item ? [channel.item] : [];

  if (rawItems.length === 0) {
    throw new Error(
      "RSS feed contained no items. " +
      "Make sure the list has books and the URL is correct."
    );
  }

  // ── Parse each item ────────────────────────────────────────────────────────
  const items: BibliographyItem[] = [];
  const warnings: RssWarning[] = [];

  rawItems.forEach((raw, index) => {
    const { item, warning } = parseRssItem(raw, index);
    if (item) {
      items.push(item);
    }
    if (warning) {
      warnings.push(warning);
    }
  });

  return { items, warnings, feedTitle };
}

// ── Item parser ───────────────────────────────────────────────────────────────

/**
 * parseRssItem(raw, index)
 *
 * Parses a single RSS <item> into a BibliographyItem.
 *
 * Extracts:
 * - title from <title> (cleaned of trailing artifacts)
 * - author from <dc:creator>
 * - isbn from <description> text content
 * - coverUrl from Syndetics <img src="..."> in <description>
 */
function parseRssItem(
  raw: any,
  index: number
): { item: BibliographyItem | null; warning: RssWarning | null } {

  // Title — required
  const rawTitle: string = raw.title ?? "";
  const title = cleanTrailingPunctuation(rawTitle.replace(/\s*:\s*$/, ""));

  if (!title) {
    return {
      item: null,
      warning: {
        itemIndex: index,
        title:     rawTitle || "(no title)",
        message:   "Item had no usable title and was skipped",
      },
    };
  }

  // Author — optional
  // dc:creator may be namespaced differently depending on xml2js config
  const author: string = cleanTrailingPunctuation(
    raw["dc:creator"] ?? raw.author ?? ""
  );

  // Description HTML — used to extract ISBN and Syndetics cover URL
  const descriptionHtml: string = raw.description ?? "";

  // ── Extract Syndetics cover URL ────────────────────────────────────────────
  // The description contains an <img src="https://secure.syndetics.com/..."> tag
  // Source: ISBN_Connector_Context.md and COVER_SKILL.md
  let coverUrl: string | undefined;
  const imgMatch = descriptionHtml.match(
    /src="(https:\/\/secure\.syndetics\.com\/[^"]+)"/i
  );
  if (imgMatch) {
    coverUrl = imgMatch[1];
    // Ensure our client ID is present (some feeds may use a different client)
    if (!coverUrl.includes(`client=${SYNDETICS_CLIENT}`)) {
      coverUrl = coverUrl + `&client=${SYNDETICS_CLIENT}`;
    }
  }

  // ── Extract ISBN ──────────────────────────────────────────────────────────
  // ISBNs appear in the description as 10 or 13 digit sequences
  let isbn: string | undefined;
  const isbnMatch = descriptionHtml.match(/\b(97[89]\d{10}|\d{9}[\dX])\b/i);
  if (isbnMatch) {
    isbn = isbnMatch[1];
  }

  // If we didn't find an ISBN in the description, try extracting it from
  // the Syndetics URL (it's in the isbn= query parameter)
  if (!isbn && coverUrl) {
    const syndeticsIsbnMatch = coverUrl.match(/isbn=([^&]+)/i);
    if (syndeticsIsbnMatch) {
      isbn = syndeticsIsbnMatch[1];
    }
  }

  return {
    item: {
      title,
      author,
      callNumber: "",    // Not in RSS — filled by merge with staff export
      collection: "",    // Not in RSS — filled by merge with staff export
      isbn,
      coverUrl,
      source: "rss",
    },
    warning: null,
  };
}
