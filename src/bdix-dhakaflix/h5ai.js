/**
 * DhakaFlix h5ai Server Interface & HTML Table Parser
 * Replicates exact HTTP POST and GET methods from CloudStream Kotlin BdixDhakaFlix
 */

import {
  cleanTitle,
  nameFromUrl,
  isVideoFile,
  parseQuality,
  extractMediaTags,
  cleanFileName,
  normalizeStreamUrl,
  fetchWithTimeout
} from "./utils.js";
import { USER_AGENT } from "./constants.js";

/**
 * Searches a DhakaFlix server using the native h5ai search POST endpoint.
 *
 * Kotlin BdixDhakaFlix14Provider.kt line 170:
 * POST "$mainUrl/$serverName/"
 * body: {"action":"get","search":{"href":"/$serverName/","pattern":"$query","ignorecase":true}}
 *
 * @param {object} server - Server configuration object
 * @param {string} query - Search query string
 * @returns {Promise<Array<{ href: string, size: number|null, managed?: boolean }>>}
 */
export async function searchServer(server, query) {
  const searchUrl = `${server.mainUrl}/${server.serverName}/`;
  const bodyPayload = JSON.stringify({
    action: "get",
    search: {
      href: `/${server.serverName}/`,
      pattern: query,
      ignorecase: true
    }
  });

  try {
    const res = await fetchWithTimeout(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": searchUrl,
        "User-Agent": USER_AGENT
      },
      body: bodyPayload
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.search)) {
      return [];
    }

    return data.search;
  } catch (error) {
    // Server unreachable or timed out (expected if user is not on BDIX ISP network)
    return [];
  }
}

/**
 * Fetches and parses an h5ai directory listing HTML page.
 * Uses lightweight regex parsing strictly safe for Hermes and QuickJS.
 *
 * @param {object} server
 * @param {string} folderHref
 * @returns {Promise<{ folders: Array<{ name: string, href: string }>, files: Array<{ name: string, href: string }> }>}
 */
export async function fetchDirectoryEntries(server, folderHref) {
  const targetUrl = normalizeStreamUrl(server.mainUrl, folderHref);

  try {
    const res = await fetchWithTimeout(targetUrl, {
      method: "GET",
      headers: {
        "Referer": `${server.mainUrl}/`,
        "User-Agent": USER_AGENT
      }
    });

    if (!res.ok) {
      return { folders: [], files: [] };
    }

    const html = await res.text();
    return parseDirectoryHtml(html, folderHref);
  } catch (error) {
    return { folders: [], files: [] };
  }
}

/**
 * Parses h5ai HTML table entries via pure regex without DOM / Cheerio.
 *
 * @param {string} html
 * @param {string} baseHref
 * @returns {{ folders: Array<{ name: string, href: string }>, files: Array<{ name: string, href: string }> }}
 */
export function parseDirectoryHtml(html, baseHref) {
  const folders = [];
  const files = [];

  // Match table rows <tr>...</tr> in h5ai
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  let foundAnyTr = false;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    foundAnyTr = true;

    // Check if it's marked as a folder icon or has folder class
    const isFolder =
      /alt=["']folder["']/i.test(trContent) ||
      /class=["'][^"']*folder[^"']*["']/i.test(trContent);

    // Extract link inside td.fb-n or any <a>
    const aMatch = trContent.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    const rawHref = aMatch[1];
    const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();

    // Skip parent directory links
    if (
      rawText === ".." ||
      rawText === "../" ||
      rawText.toLowerCase() === "parent directory" ||
      rawHref === "../" ||
      rawHref.endsWith("/../") ||
      rawHref === baseHref
    ) {
      continue;
    }

    const resolvedHref = resolveRelativeHref(baseHref, rawHref);

    if (isFolder || resolvedHref.endsWith("/")) {
      folders.push({
        name: rawText || nameFromUrl(resolvedHref),
        href: resolvedHref
      });
    } else if (isVideoFile(resolvedHref)) {
      files.push({
        name: rawText || nameFromUrl(resolvedHref),
        href: resolvedHref
      });
    }
  }

  // Fallback: If no <tr> found (e.g., non-table directory listing), parse all <a> tags
  if (!foundAnyTr || (folders.length === 0 && files.length === 0)) {
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch;
    while ((aMatch = aRegex.exec(html)) !== null) {
      const rawHref = aMatch[1];
      const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();

      if (
        rawText === ".." ||
        rawText === "../" ||
        rawText.toLowerCase() === "parent directory" ||
        rawHref === "../" ||
        rawHref.endsWith("/../")
      ) {
        continue;
      }

      const resolvedHref = resolveRelativeHref(baseHref, rawHref);

      if (isVideoFile(resolvedHref)) {
        files.push({
          name: rawText || nameFromUrl(resolvedHref),
          href: resolvedHref
        });
      } else if (
        resolvedHref.endsWith("/") &&
        !resolvedHref.includes("?C=") &&
        !resolvedHref.includes("?N=")
      ) {
        folders.push({
          name: rawText || nameFromUrl(resolvedHref),
          href: resolvedHref
        });
      }
    }
  }

  return { folders, files };
}

/**
 * Resolves relative or absolute path against current directory href.
 *
 * @param {string} baseHref
 * @param {string} relHref
 * @returns {string}
 */
function resolveRelativeHref(baseHref, relHref) {
  if (relHref.startsWith("/")) return relHref;
  if (relHref.startsWith("http://") || relHref.startsWith("https://")) {
    const match = relHref.match(/^https?:\/\/[^\/]+(\/.*)$/);
    return match ? match[1] : relHref;
  }
  const cleanBase = baseHref.endsWith("/") ? baseHref : baseHref + "/";
  return cleanBase + relHref;
}

const KNOWN_MEDIA_TAGS = new Set([
  "1080p", "720p", "2160p", "4k", "uhd", "fhd", "hd", "sd", "480p",
  "bluray", "bdrip", "brrip", "webrip", "web", "webdl", "dl", "hdtv", "dvdrip",
  "cam", "hdcam", "telesync", "tc", "hevc", "x264", "x265", "h264", "h265",
  "10bit", "hdr", "hdr10", "dts", "aac", "ac3", "ddp5", "atmos", "sub",
  "esub", "dub", "dubbed", "dual", "audio", "multi", "hindi", "eng", "english",
  "bengali", "bangla", "tamil", "telugu", "pack", "complete", "repack", "proper",
  "extended", "remastered", "unrated", "directors", "cut", "season", "series", "ep", "episode"
]);

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "in", "to", "for", "with", "by", "part", "vol"]);

/**
 * Validates if candidate name matches target media title.
 * Prevents false positives (e.g., matching "The Dark Knight" when looking for "Dark").
 *
 * @param {string} candidateName
 * @param {string} targetTitle
 * @param {string} [targetYear]
 * @param {string} [mediaType="movie"]
 * @returns {boolean}
 */
export function isTitleMatch(candidateName, targetTitle, targetYear, mediaType = "movie") {
  if (!candidateName || !targetTitle) return false;

  const candTokens = candidateName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const targetTokens = targetTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const sigTarget = targetTokens.filter((t) => !STOP_WORDS.has(t));
  const reqTarget = sigTarget.length > 0 ? sigTarget : targetTokens;

  // 1. All significant words of target title must appear in candidate
  for (const token of reqTarget) {
    if (!candTokens.includes(token)) {
      return false;
    }
  }

  // 2. Year check: If both candidate and target specify a 4-digit year, check mismatch
  if (targetYear) {
    const yearMatch = candidateName.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      const candYear = parseInt(yearMatch[1], 10);
      const tgtYear = parseInt(targetYear, 10);
      if (Math.abs(candYear - tgtYear) > 1) {
        return false;
      }
    }
  }

  // 3. Remove target tokens from candidate and inspect remaining words
  let remaining = candTokens.slice();
  for (const t of targetTokens) {
    const idx = remaining.indexOf(t);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  // Filter out known technical media tags, numbers, release years, etc.
  const foreignTokens = remaining.filter((t) => {
    if (STOP_WORDS.has(t)) return false;
    if (KNOWN_MEDIA_TAGS.has(t)) return false;
    if (/^(19\d{2}|20\d{2})$/.test(t)) return false;
    if (/^[se]\d+$/i.test(t)) return false;
    if (/^\d{1,2}$/.test(t)) return false;
    return true;
  });

  // If there are foreign non-tag words (e.g. "knight" when target is "dark"), reject
  return foreignTokens.length === 0;
}

/**
 * Checks if a season folder name matches targetSeason number.
 *
 * @param {string} folderName
 * @param {number} targetSeason
 * @returns {boolean}
 */
export function matchesSeasonFolder(folderName, targetSeason) {
  if (!folderName) return false;
  const match = folderName.match(/(?:season|series|s)\s*0*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) === targetSeason;
  }
  return false;
}

/**
 * Checks if a filename matches targetSeason and targetEpisode.
 *
 * @param {string} fileName
 * @param {number} targetSeason
 * @param {number} targetEpisode
 * @param {boolean} isInSeasonFolder - If true, file is already inside targetSeason folder
 * @returns {boolean}
 */
export function matchesEpisodeFile(fileName, targetSeason, targetEpisode, isInSeasonFolder = false) {
  if (!fileName) return false;

  // 1. Check standard S01E05 pattern
  const sxxExxMatch = fileName.match(/[sS]0*(\d+)[.\s_-]*[eE]0*(\d+)/i);
  if (sxxExxMatch) {
    const s = parseInt(sxxExxMatch[1], 10);
    const e = parseInt(sxxExxMatch[2], 10);
    return s === targetSeason && e === targetEpisode;
  }

  // 2. Check 1x05 pattern
  const xMatch = fileName.match(/\b0*(\d+)[xX]0*(\d+)\b/);
  if (xMatch) {
    const s = parseInt(xMatch[1], 10);
    const e = parseInt(xMatch[2], 10);
    return s === targetSeason && e === targetEpisode;
  }

  // 3. If already inside the correct season folder:
  if (isInSeasonFolder) {
    // Match "EP 05", "Episode 5", "E05"
    const epMatch = fileName.match(/(?:ep|episode|e)[.\s_-]*0*(\d+)\b/i);
    if (epMatch) {
      return parseInt(epMatch[1], 10) === targetEpisode;
    }

    // Match isolated number e.g. "Breaking Bad 05.mkv"
    const numMatch = fileName.match(/(?:^|[\s._\-\[])0*(\d{1,3})(?:[\s._\-\]]|$)/);
    if (numMatch) {
      return parseInt(numMatch[1], 10) === targetEpisode;
    }
  }

  return false;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
