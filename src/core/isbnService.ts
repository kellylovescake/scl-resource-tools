/**
 * src/core/isbnService.ts
 *
 * ISBN metadata and cover image fetching service.
 * V1 implementation: direct HTTP calls from the Next.js server.
 *
 * WHY THIS FILE EXISTS:
 * The engine needs to look up book metadata and cover images by ISBN.
 * This module is the single place where that happens, hiding the
 * specific API details from the rest of the engine.
 *
 * MARKER: ISBN SERVICE PROVIDER
 * This is the seam between the web app's direct HTTP implementation
 * and the future MCP connector implementation.
 *
 * V1 (this file): Next.js API routes call Syndetics, Open Library,
 * and Google Books directly over HTTP. No API key required for any of them
 * at library-scale volume.
 *
 * FUTURE AI WRAPPER:
 * When the AI-enhanced wrapper is built, Claude runs in a sandbox without
 * outbound network access. The MCP connector on Supabase (already designed
 * in _reference/ISBN_Connector_Context.md) handles this by running on its
 * own server with full network access.
 * To switch: implement an McpIsbnService class that calls the connector's
 * get_cover / get_metadata / get_full tools instead of direct HTTP.
 * The rest of the engine would not change.
 *
 * DATA SOURCES:
 * - Covers (primary):  Syndetics — embedded in RSS feed, fetched by URL
 * - Covers (fallback): Google Books API — no key required for basic use
 * - Metadata:          Open Library — no key required
 * - Metadata fallback: Google Books API
 *
 * Source: ISBN_Connector_Context.md
 *
 * SAFE TO EDIT:
 * - Tune placeholder detection threshold if Syndetics changes
 * - Add caching layer here if performance becomes an issue
 * - Add Google Books API key support via env var (see .env.local.example)
 */

import { normalizeIsbn, validateIsbn, isbn10ToIsbn13 } from "./normalize";
import type { IsbnBlooperResult } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SYNDETICS_CLIENT  = "sunflowerco";
const SYNDETICS_BASE    = "https://secure.syndetics.com/api/image";

// Cover images ≤ this size (bytes) are Syndetics "no cover" placeholders
// Source: ISBN_Connector_Context.md
const PLACEHOLDER_THRESHOLD = 2000;

// Open Library API endpoint
const OPEN_LIBRARY_BASE = "https://openlibrary.org/api/books";

// Google Books API endpoint
const GOOGLE_BOOKS_BASE = "https://www.googleapis.com/books/v1/volumes";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * lookupIsbn(rawIsbn, fetchCover)
 *
 * MARKER: ENGINE ENTRY (ISBN Blooper)
 *
 * Main entry point for the ISBN Blooper feature.
 * Accepts a raw ISBN string (may have hyphens/spaces), normalizes it,
 * validates it, fetches metadata and optionally cover, returns a result.
 *
 * Returns IsbnBlooperResult — all fields populated, success or failure
 * information included in the result shape rather than thrown.
 */
export async function lookupIsbn(
  rawIsbn: string,
  fetchCover: boolean = true,
): Promise<IsbnBlooperResult> {
  // ── Normalize and validate ──────────────────────────────────────────────
  const normalized = normalizeIsbn(rawIsbn);

  if (!normalized || !validateIsbn(normalized)) {
    throw new Error(
      `"${rawIsbn}" is not a valid ISBN. ` +
      "Check the number and try again. ISBNs are 10 or 13 digits."
    );
  }

  // Ensure we have an ISBN-13
  const isbn13 = normalized.length === 10
    ? isbn10ToIsbn13(normalized) ?? normalized
    : normalized;

  const isbn10 = normalized.length === 10 ? normalized : undefined;

  // ── Fetch metadata ──────────────────────────────────────────────────────
  const { metadata, source: metaSource } = await fetchMetadata(isbn13);

  // ── Fetch cover ──────────────────────────────────────────────────────────
  let coverUrl: string | undefined;
  let coverImageData: string | undefined;
  let hasCover = false;
  let coverSource: "syndetics" | "google_books" | undefined;
  let coverWarning: string | undefined;

  if (fetchCover) {
    const coverResult = await fetchCoverImage(isbn13);
    coverUrl       = coverResult.url;
    coverImageData = coverResult.base64Data;
    hasCover       = coverResult.found;
    coverSource    = coverResult.source;
    if (!hasCover) {
      coverWarning =
        "No cover image was found for this ISBN. " +
        "Syndetics and Google Books were checked. " +
        "The entry will render without a cover in bibliography mode.";
    }
  }

  // ── Assemble result ──────────────────────────────────────────────────────
  const rawJson = {
    isbn13,
    isbn10,
    ...metadata,
    hasCover,
    coverUrl,
    coverSource,
    metadataSource: metaSource,
  };

  return {
    isbn13,
    isbn10,
    title:          metadata.title        ?? "(title not found)",
    author:         metadata.author       ?? "",
    publisher:      metadata.publisher,
    publishDate:    metadata.publishDate,
    subjects:       metadata.subjects,
    description:    metadata.description,
    coverUrl,
    coverImageData,
    hasCover,
    coverWarning,
    coverSource,
    metadataSource: metaSource,
    rawJson,
  };
}

/**
 * fetchCoverBytes(syndeticsUrl)
 *
 * Fetches a cover image from a Syndetics URL (extracted from RSS feed).
 * Returns the image buffer if it is a real cover (not a placeholder).
 * Returns null if the image is a placeholder or the fetch fails.
 *
 * Used by the cover bibliography engine, not just the Blooper.
 */
export async function fetchCoverBytes(
  syndeticsUrl: string,
): Promise<Buffer | null> {
  try {
    const response = await fetch(syndeticsUrl, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Placeholder detection: ≤ 2KB means Syndetics returned a "no image" graphic
    if (buffer.length <= PLACEHOLDER_THRESHOLD) return null;

    return buffer;
  } catch {
    return null;
  }
}

// ── Internal: metadata fetch ──────────────────────────────────────────────────

interface MetadataResult {
  title?:       string;
  author?:      string;
  publisher?:   string;
  publishDate?: string;
  subjects?:    string[];
  description?: string;
}

async function fetchMetadata(isbn13: string): Promise<{
  metadata: MetadataResult;
  source: "open_library" | "google_books" | "none";
}> {
  // Try Open Library first
  const olResult = await fetchOpenLibraryMetadata(isbn13);
  if (olResult) {
    return { metadata: olResult, source: "open_library" };
  }

  // Fall back to Google Books
  const gbResult = await fetchGoogleBooksMetadata(isbn13);
  if (gbResult) {
    return { metadata: gbResult, source: "google_books" };
  }

  return { metadata: {}, source: "none" };
}

async function fetchOpenLibraryMetadata(
  isbn13: string,
): Promise<MetadataResult | null> {
  try {
    const url = `${OPEN_LIBRARY_BASE}?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const json = await res.json();
    const book = json[`ISBN:${isbn13}`];
    if (!book) return null;

    const author = Array.isArray(book.authors)
      ? book.authors.map((a: any) => a.name).join(", ")
      : "";

    const publisher = Array.isArray(book.publishers)
      ? book.publishers[0]?.name
      : undefined;

    const subjects = Array.isArray(book.subjects)
      ? book.subjects.slice(0, 5).map((s: any) => s.name ?? s)
      : undefined;

    return {
      title:       book.title,
      author,
      publisher,
      publishDate: book.publish_date,
      subjects,
    };
  } catch {
    return null;
  }
}

async function fetchGoogleBooksMetadata(
  isbn13: string,
): Promise<MetadataResult | null> {
  try {
    const url = `${GOOGLE_BOOKS_BASE}?q=isbn:${isbn13}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const json = await res.json();
    const item = json?.items?.[0]?.volumeInfo;
    if (!item) return null;

    return {
      title:       item.title,
      author:      Array.isArray(item.authors) ? item.authors.join(", ") : "",
      publisher:   item.publisher,
      publishDate: item.publishedDate,
      description: item.description,
      subjects:    item.categories?.slice(0, 5),
    };
  } catch {
    return null;
  }
}

// ── Internal: cover fetch ─────────────────────────────────────────────────────

async function fetchCoverImage(isbn13: string): Promise<{
  url?:       string;
  base64Data?: string;
  found:      boolean;
  source?:    "syndetics" | "google_books";
}> {
  // Try Syndetics first
  const syndeticsUrl =
    `${SYNDETICS_BASE}?size=mc&isbn=${isbn13}&noimage=unbound&client=${SYNDETICS_CLIENT}`;

  const syndeticsBytes = await fetchCoverBytes(syndeticsUrl);
  if (syndeticsBytes) {
    return {
      url:       syndeticsUrl,
      base64Data: syndeticsBytes.toString("base64"),
      found:     true,
      source:    "syndetics",
    };
  }

  // Fall back to Google Books thumbnail
  const gbCover = await fetchGoogleBooksCover(isbn13);
  if (gbCover) {
    return {
      url:       gbCover.url,
      base64Data: gbCover.base64Data,
      found:     true,
      source:    "google_books",
    };
  }

  return { found: false };
}

async function fetchGoogleBooksCover(isbn13: string): Promise<{
  url: string;
  base64Data: string;
} | null> {
  try {
    const metaUrl = `${GOOGLE_BOOKS_BASE}?q=isbn:${isbn13}`;
    const res = await fetch(metaUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const json = await res.json();
    const thumbnailUrl: string | undefined =
      json?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;

    if (!thumbnailUrl) return null;

    // Fetch the actual image
    const imgRes = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(8_000) });
    if (!imgRes.ok) return null;

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    if (buffer.length <= PLACEHOLDER_THRESHOLD) return null;

    return {
      url:       thumbnailUrl,
      base64Data: buffer.toString("base64"),
    };
  } catch {
    return null;
  }
}
