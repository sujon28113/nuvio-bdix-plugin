/**
 * Utility functions for DhakaFlix Nuvio Provider
 * Includes title cleaners ported from Kotlin, safe URL normalizers,
 * quality extractors, and fuzzy title matching.
 */

import { VIDEO_EXTENSIONS, REQUEST_TIMEOUT_MS, USER_AGENT } from "./constants.js";

/**
 * Replicated from Kotlin cleanTitle in BdixDhakaFlix14Provider.kt:
 * Removes leading numbering (e.g. "01. "), trailing year brackets "(2024)...",
 * and normalizes whitespace.
 *
 * @param {string} title
 * @returns {string}
 */
export function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/^\d{1,3}\.\s*/, "")
    .replace(/\s*\([^)]*?\d{4}.*?\).*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Replicated from Kotlin nameFromUrl in BdixDhakaFlix14Provider.kt:
 * Extracts the last folder/file name from a decoded URL path.
 *
 * @param {string} href
 * @returns {string}
 */
export function nameFromUrl(href) {
  if (!href) return "";
  let hrefDecoded = href;
  try {
    hrefDecoded = decodeURIComponent(href);
  } catch (e) {
    // Keep raw string if URI malformed
  }
  const match = hrefDecoded.match(/.*\/([^\/]+)(?:\/[^\/]*)*$/);
  return match && match[1] ? match[1] : hrefDecoded;
}

/**
 * Safe URI component encoding that:
 * 1. Safely decodes first to prevent double-encoding (%20 -> %2520)
 * 2. Properly escapes spaces (%20), brackets (%5B, %5D), hash (%23), etc.
 *
 * @param {string} segment
 * @returns {string}
 */
export function safeEncodeUriSegment(segment) {
  if (!segment) return "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch (e) {
    // If decoding fails, continue with original
  }

  // Encode component and strictly escape special characters RFC 3986
  return encodeURIComponent(decoded)
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Combines base URL and relative/absolute path into a 100% valid,
 * properly encoded stream URL that plays directly on native Android and iOS players.
 *
 * @param {string} baseUrl
 * @param {string} rawPath
 * @returns {string}
 */
export function normalizeStreamUrl(baseUrl, rawPath) {
  if (!rawPath) return "";

  let fullUrl =
    rawPath.startsWith("http://") || rawPath.startsWith("https://")
      ? rawPath
      : `${baseUrl.replace(/\/+$/, "")}/${rawPath.replace(/^\/+/, "")}`;

  // In BDIX servers, '#' is part of the directory or file name (e.g., "# TV SPECIAL"), not a client hash fragment
  const sanitizedUrl = fullUrl.replace(/#/g, "%23");
  const match = sanitizedUrl.match(/^(https?:\/\/[^\/]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return sanitizedUrl;

  const origin = match[1];
  const pathname = match[2] || "/";
  const search = match[3] || "";

  // Encode each path segment safely
  const encodedPath = pathname
    .split("/")
    .map(safeEncodeUriSegment)
    .join("/");

  return `${origin}${encodedPath}${search}`;
}

/**
 * Determines whether a file path or name has a recognized video extension.
 *
 * @param {string} pathOrName
 * @returns {boolean}
 */
export function isVideoFile(pathOrName) {
  if (!pathOrName) return false;
  const clean = pathOrName.split("?")[0].split("#")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

/**
 * Parses video resolution / quality from file or folder name.
 * Compatible with Nuvio's expected quality values (4K/2160p, 1080p, 720p, 480p, HD).
 *
 * @param {string} name
 * @returns {string}
 */
export function parseQuality(name) {
  if (!name) return "HD";
  const upper = name.toUpperCase();

  if (
    upper.includes("2160P") ||
    upper.includes("4K") ||
    upper.includes("UHD")
  ) {
    return "4K";
  }
  if (upper.includes("1080P") || upper.includes("FHD")) {
    return "1080p";
  }
  if (upper.includes("720P")) {
    return "720p";
  }
  if (upper.includes("480P") || upper.includes("SD")) {
    return "480p";
  }
  if (
    upper.includes("CAM") ||
    upper.includes("HDCAM") ||
    upper.includes("TELESYNC") ||
    upper.includes("TC")
  ) {
    return "CAM";
  }
  return "HD";
}

/**
 * Extracts extra tags (Dual Audio, Hindi Dub, ESub, x265, etc.)
 *
 * @param {string} name
 * @returns {string[]}
 */
export function extractMediaTags(name) {
  if (!name) return [];
  const tags = [];
  const lower = name.toLowerCase();

  if (lower.includes("dual") || lower.includes("multi")) {
    tags.push("Dual Audio");
  } else if (lower.includes("dubbed") || lower.includes("hindi dub")) {
    tags.push("Dubbed");
  }

  if (lower.includes("esub") || lower.includes("subbed")) {
    tags.push("ESub");
  }

  if (lower.includes("hevc") || lower.includes("x265")) {
    tags.push("HEVC");
  }

  if (lower.includes("10bit")) {
    tags.push("10bit");
  }

  if (lower.includes("hdr")) {
    tags.push("HDR");
  }

  return tags;
}

/**
 * Clean up raw filename for readable title display in Nuvio stream picker.
 *
 * @param {string} fileName
 * @returns {string}
 */
export function cleanFileName(fileName) {
  if (!fileName) return "Direct Video Stream";
  let name = fileName;
  try {
    name = decodeURIComponent(fileName);
  } catch (e) {
    // Keep original
  }
  // Strip trailing extension
  name = name.replace(/\.(mkv|mp4|m4v|avi|webm|ts)$/i, "");
  // Replace underscores and dots with spaces for clean display title
  name = name.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  return name;
}

/**
 * Builds candidate search queries for DhakaFlix h5ai API
 *
 * @param {string} title
 * @param {string} [originalTitle]
 * @returns {string[]}
 */
export function generateSearchQueries(title, originalTitle) {
  const queries = new Set();
  if (!title) return [];

  const cleaned = cleanTitle(title);
  if (cleaned) queries.add(cleaned);

  // If title has colon (e.g., "Dune: Part Two" or "Spider-Man: Across the Spider-Verse")
  if (title.includes(":")) {
    const parts = title.split(":");
    if (parts[0].trim()) queries.add(cleanTitle(parts[0].trim()));
    queries.add(title.replace(/:/g, " ").replace(/\s+/g, " ").trim());
  }

  // Handle '&' vs 'and'
  if (title.includes("&")) {
    queries.add(title.replace(/&/g, "and").replace(/\s+/g, " ").trim());
  } else if (/\band\b/i.test(title)) {
    queries.add(title.replace(/\band\b/gi, "&").replace(/\s+/g, " ").trim());
  }

  // Add original title if different
  if (originalTitle && originalTitle !== title) {
    const cleanOrig = cleanTitle(originalTitle);
    if (cleanOrig && /^[\x00-\x7F]*$/.test(cleanOrig)) {
      queries.add(cleanOrig);
    }
  }

  return Array.from(queries);
}

/**
 * Safe fetch with configurable timeout (works across Node, Hermes, and QuickJS)
 *
 * @param {string} url
 * @param {RequestInit} [options={}]
 * @param {number} [timeoutMs=REQUEST_TIMEOUT_MS]
 * @returns {Promise<Response>}
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let controller = null;
    let timer = null;

    if (typeof AbortController !== "undefined") {
      controller = new AbortController();
      options.signal = controller.signal;
    }

    timer = setTimeout(() => {
      if (controller) {
        try {
          controller.abort();
        } catch (e) {
          // ignore
        }
      }
      reject(new Error(`Fetch timed out after ${timeoutMs}ms for ${url}`));
    }, timeoutMs);

    // Merge default headers
    const headers = Object.assign(
      {
        "User-Agent": USER_AGENT,
        "Accept": "*/*"
      },
      options.headers || {}
    );
    options.headers = headers;

    fetch(url, options)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
