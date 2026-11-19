/**
 * DhakaFlix h5ai Server Interface & HTML Table Parser
 * Optimized for QuickJS / Hermes on Android TV:
 * - Dead-host circuit breaker
 * - LRU in-memory caching
 * - Fast linear regex parsing without DOM
 * - Relevance ranking to avoid over-crawling
 * - Partitioned search for TV Server 12
 */

import {
  nameFromUrl,
  isVideoFile,
  normalizeStreamUrl,
  fetchWithTimeout
} from "./utils.js";
import { parseSizeToBytes, formatBytes } from "./parser.js";
import { USER_AGENT, REQUEST_TIMEOUT_MS, DEBUG } from "./constants.js";
import { memoryCache } from "./cache.js";
import { isHostDead, markHostDead, markHostAlive } from "./circuitBreaker.js";

/**
 * Returns the optimal search href root.
 * On Server 12, partitions by first letter for a 4x search speedup.
 *
 * @param {object} server
 * @param {string} title
 * @returns {string}
 */
export function getServerSearchHref(server, title) {
  if (server.id === "12" && title) {
    let clean = title.trim();
    if (/^the\s+/i.test(clean)) clean = clean.substring(4).trim();
    else if (/^a\s+/i.test(clean)) clean = clean.substring(2).trim();
    else if (/^an\s+/i.test(clean)) clean = clean.substring(3).trim();

    const firstChar = clean.charAt(0).toUpperCase();
    if (/[0-9]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series ★  0  —  9/`;
    }
    if (/[A-L]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♥  A  —  L/`;
    }
    if (/[M-R]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♦  M  —  R/`;
    }
    if (/[S-Z]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♦  S  —  Z/`;
    }
    return `/DHAKA-FLIX-12/TV-WEB-Series/`;
  }
  return `/${server.serverName}/`;
}

/**
 * Executes raw h5ai POST search request
 */
async function executeSearchRequest(server, href, query) {
  const searchUrl = `${server.mainUrl}/${server.serverName}/`;
  const bodyPayload = JSON.stringify({
    action: "get",
    search: {
      href: href,
      pattern: query,
      ignorecase: true
    }
  });

  try {
    const res = await fetchWithTimeout(
      searchUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Referer": searchUrl,
          "User-Agent": USER_AGENT
        },
        body: bodyPayload
      },
      REQUEST_TIMEOUT_MS
    );

    if (!res.ok) return [];

    const data = await res.json();
    if (!data || !Array.isArray(data.search)) return [];

    markHostAlive(server.mainUrl);
    return data.search;
  } catch (error) {
    markHostDead(server.mainUrl);
    return [];
  }
}

/**
 * Searches a DhakaFlix server using the native h5ai search POST endpoint.
 * Includes circuit-breaker check, partitioned routing, and in-memory caching.
 *
 * @param {object} server - Server configuration object
 * @param {string} query - Search query string
 * @param {string} [targetTitle=""] - Canonical media title
 * @returns {Promise<Array<{ href: string, size: number|null, managed?: boolean }>>}
 */
export async function searchServer(server, query, targetTitle = "") {
  if (!server || !query) return [];

  // Check Circuit Breaker
  if (isHostDead(server.mainUrl)) {
    if (DEBUG) console.log(`[DhakaFlix] Skipping dead server: ${server.name}`);
    return [];
  }

  const searchHref = getServerSearchHref(server, targetTitle || query);
  const cacheKey = `search_${server.id}_${searchHref}_${query.toLowerCase().trim()}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    if (DEBUG) console.log(`[DhakaFlix] Cache hit for search: ${cacheKey}`);
    return cached;
  }

  // 1. Primary search
  let results = await executeSearchRequest(server, searchHref, query);

  // 2. Server 12 fallback if partitioned search found 0 results
  if (
    (!results || results.length === 0) &&
    server.id === "12" &&
    searchHref !== `/DHAKA-FLIX-12/TV-WEB-Series/`
  ) {
    results = await executeSearchRequest(
      server,
      `/DHAKA-FLIX-12/TV-WEB-Series/`,
      query
    );
  }

  if (results && results.length > 0) {
    memoryCache.set(cacheKey, results);
    return results;
  }

  return [];
}

/**
 * Fetches and parses an h5ai directory listing HTML page.
 * Uses in-memory caching and pure regex parser.
 *
 * @param {object} server
 * @param {string} folderHref
 * @returns {Promise<{ folders: Array<{ name: string, href: string }>, files: Array<{ name: string, href: string }> }>}
 */
export async function fetchDirectoryEntries(server, folderHref) {
  if (!server || !folderHref) return { folders: [], files: [] };

  if (isHostDead(server.mainUrl)) {
    return { folders: [], files: [] };
  }

  const cacheKey = `dir_${server.id}_${folderHref}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const targetUrl = normalizeStreamUrl(server.mainUrl, folderHref);

  try {
    const res = await fetchWithTimeout(
      targetUrl,
      {
        method: "GET",
        headers: {
          "Referer": `${server.mainUrl}/`,
          "User-Agent": USER_AGENT
        }
      },
      REQUEST_TIMEOUT_MS
    );

    if (!res.ok) {
      return { folders: [], files: [] };
    }

    const html = await res.text();
    const result = parseDirectoryHtml(html, folderHref);

    markHostAlive(server.mainUrl);
    memoryCache.set(cacheKey, result);
    return result;
  } catch (error) {
    markHostDead(server.mainUrl);
    return { folders: [], files: [] };
  }
}

/**
 * Parses h5ai HTML table entries via fast linear regex without DOM / Cheerio.
 *
 * @param {string} html
 * @param {string} baseHref
 * @returns {{ folders: Array<{ name: string, href: string }>, files: Array<{ name: string, href: string }> }}
 */
export function parseDirectoryHtml(html, baseHref) {
  const folders = [];
  const files = [];

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  let foundAnyTr = false;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    foundAnyTr = true;

    const isFolder =
      /alt=["']folder["']/i.test(trContent) ||
      /class=["'][^"']*folder[^"']*["']/i.test(trContent);

    const aMatch = trContent.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    const rawHref = aMatch[1];
    const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();

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
      // Extract size from table cell (<td class="fb-s">2818704 KB</td>)
      const sizeMatch = trContent.match(/<td[^>]*class=["'][^"']*fb-s[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
      const rawSize = sizeMatch ? sizeMatch[1].replace(/<[^>]+>/g, "").trim() : null;
      const sizeBytes = parseSizeToBytes(rawSize);
      const formattedSize = sizeBytes ? formatBytes(sizeBytes) : (rawSize || null);

      files.push({
        name: rawText || nameFromUrl(resolvedHref),
        href: resolvedHref,
        size: formattedSize,
        sizeBytes: sizeBytes
      });
    }
  }

  // Fallback for minimal non-table listings
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
  "tv", "series", "show", "shows", "movie", "movies",
  "1080p", "720p", "2160p", "4k", "uhd", "fhd", "hd", "sd", "480p",
  "bluray", "bdrip", "brrip", "webrip", "web", "webdl", "dl", "hdtv", "dvdrip",
  "cam", "hdcam", "telesync", "tc", "hevc", "x264", "x265", "h264", "h265",
  "10bit", "hdr", "hdr10", "dts", "aac", "ac3", "ddp5", "atmos", "sub",
  "esub", "dub", "dubbed", "dual", "audio", "multi", "hindi", "eng", "english",
  "bengali", "bangla", "tamil", "telugu", "pack", "complete", "repack", "proper",
  "extended", "remastered", "unrated", "directors", "cut", "season", "ep", "episode",
  "imax", "remux", "criterion", "mkv", "mp4", "avi", "m4v", "webm", "ts"
]);

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "in", "to", "for", "with", "by", "part", "vol"]);

/**
 * Validates if candidate name matches target media title.
 * Prevents false positives while accurately matching TV shows and movies.
 *
 * @param {string} candidateName
 * @param {string} targetTitle
 * @param {string} [targetYear]
 * @param {string} [mediaType="movie"]
 * @returns {boolean}
 */
export function isTitleMatch(candidateName, targetTitle, targetYear, mediaType = "movie") {
  if (!candidateName || !targetTitle) return false;

  // Clean trailing release group at end (e.g. -MsMod, -mkvC)
  let cleanCand = candidateName.replace(/-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)?$/, "");

  const candTokens = cleanCand
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

  // All significant target tokens must appear in candidate
  for (const token of reqTarget) {
    if (!candTokens.includes(token)) {
      return false;
    }
  }

  // For movies: Check year if both candidate and target specify a 4-digit year
  if (mediaType === "movie" && targetYear) {
    const yearMatches = candidateName.match(/\b(19\d{2}|20\d{2})\b/g);
    if (yearMatches && yearMatches.length > 0) {
      const tgtYear = parseInt(targetYear, 10);
      const hasCloseYear = yearMatches.some((y) => Math.abs(parseInt(y, 10) - tgtYear) <= 1);
      if (!hasCloseYear) return false;
    }
  }

  // Remove target tokens from candidate
  let remaining = candTokens.slice();
  for (const t of targetTokens) {
    const idx = remaining.indexOf(t);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  const foreignTokens = remaining.filter((t) => {
    if (STOP_WORDS.has(t)) return false;
    if (KNOWN_MEDIA_TAGS.has(t)) return false;
    if (/^(19\d{2}|20\d{2})$/.test(t)) return false;
    if (/^s\d+(e\d+)?$/i.test(t)) return false;
    if (/^e\d+$/i.test(t)) return false;
    if (/^\d+x\d+$/i.test(t)) return false;
    if (/^\d{1,2}$/.test(t)) return false;
    return true;
  });

  return foreignTokens.length === 0;
}

/**
 * Calculates a match score to rank candidate folders (higher is better).
 *
 * @param {string} candidateName
 * @param {string} targetTitle
 * @param {string} targetYear
 * @returns {number}
 */
export function scoreMatch(candidateName, targetTitle, targetYear) {
  let score = 0;
  const lowerName = candidateName.toLowerCase();
  const lowerTitle = targetTitle.toLowerCase();

  // Match title words
  if (lowerName.includes(lowerTitle)) score += 50;

  // Match year
  if (targetYear && lowerName.includes(targetYear)) score += 30;

  // Prefer 1080p / 4K / BluRay
  if (lowerName.includes("1080p")) score += 10;
  if (lowerName.includes("bluray")) score += 5;
  if (lowerName.includes("hevc") || lowerName.includes("x265")) score += 5;

  return score;
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
 * @param {boolean} isInSeasonFolder
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
    const epMatch = fileName.match(/(?:ep|episode|e)[.\s_-]*0*(\d+)\b/i);
    if (epMatch) {
      return parseInt(epMatch[1], 10) === targetEpisode;
    }

    const numMatch = fileName.match(/(?:^|[\s._\-\[])0*(\d{1,3})(?:[\s._\-\]]|$)/);
    if (numMatch) {
      return parseInt(numMatch[1], 10) === targetEpisode;
    }
  }

  return false;
}
