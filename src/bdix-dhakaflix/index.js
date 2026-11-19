/**
 * DhakaFlix Nuvio Native Provider
 * Ported from CloudStream Kotlin BdixDhakaFlix extension
 *
 * Fully compatible with NuvioTV & NuvioMobile running on Hermes / QuickJS.
 */

// =============================================================================
// TMDB API KEY CONFIGURATION
// Configured with personal TMDB v3 API key.
// =============================================================================
const TMDB_API_KEY = "e80ea2a38c45dc7aaccf08b1babcd3a7";

// Optional community fallback key (from reference CloudStream extension)
// Set to null or false if you wish to strictly require your own key above.
const FALLBACK_TMDB_KEY = "e6333b32409e02a4a6eba6fb7ff866bb";

import { SERVERS, USER_AGENT } from "./constants.js";
import { getTmdbMetadata } from "./tmdb.js";
import {
  generateSearchQueries,
  nameFromUrl,
  cleanFileName,
  parseQuality,
  extractMediaTags,
  normalizeStreamUrl,
  isVideoFile
} from "./utils.js";
import {
  searchServer,
  fetchDirectoryEntries,
  isTitleMatch,
  matchesSeasonFolder,
  matchesEpisodeFile
} from "./h5ai.js";

/**
 * Main Nuvio Entry Point
 *
 * @param {string} tmdbId - Numeric TMDB ID string (e.g. "872585")
 * @param {string} [mediaType="movie"] - "movie" or "tv"
 * @param {number|string|null} [season=null] - Season number (for TV shows)
 * @param {number|string|null} [episode=null] - Episode number (for TV shows)
 * @returns {Promise<Array<object>>} Array of Nuvio stream objects
 */
async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  try {
    console.log(
      `[DhakaFlix] Request: ${mediaType} TMDB:${tmdbId}${
        mediaType === "tv" ? ` S:${season} E:${episode}` : ""
      }`
    );

    // 1. Validate TMDB API Key
    let apiKey = TMDB_API_KEY;
    if (!apiKey || apiKey === "YOUR_TMDB_API_KEY_HERE") {
      if (FALLBACK_TMDB_KEY) {
        console.warn(
          "[DhakaFlix] Warning: TMDB_API_KEY is unconfigured ('YOUR_TMDB_API_KEY_HERE'). Using reference fallback key. Please configure your personal key at the top of the provider."
        );
        apiKey = FALLBACK_TMDB_KEY;
      } else {
        console.error(
          "[DhakaFlix] ERROR: TMDB_API_KEY is not configured! Please replace 'YOUR_TMDB_API_KEY_HERE' at the top of the file with your valid TMDB v3 API key."
        );
        return [];
      }
    }

    if (!tmdbId) {
      console.error("[DhakaFlix] Error: Missing tmdbId parameter");
      return [];
    }

    const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";

    // 2. Validate TV parameters
    let targetSeason = null;
    let targetEpisode = null;
    if (type === "tv") {
      targetSeason = parseInt(season, 10);
      targetEpisode = parseInt(episode, 10);
      if (isNaN(targetSeason) || isNaN(targetEpisode)) {
        console.error(
          `[DhakaFlix] Invalid or missing season/episode for TV show (season=${season}, episode=${episode})`
        );
        return [];
      }
    }

    // 3. Resolve TMDB ID to Title & Year
    const meta = await getTmdbMetadata(tmdbId, type, apiKey);
    if (!meta || !meta.title) {
      console.error(`[DhakaFlix] Failed to resolve TMDB metadata for ${type} ${tmdbId}`);
      return [];
    }

    console.log(
      `[DhakaFlix] Resolved TMDB: "${meta.title}" (${meta.year || "Unknown Year"})`
    );

    // 4. Select candidate servers based on media type
    const candidateServers = SERVERS.filter((s) => s.mediaTypes.includes(type));
    const searchQueries = generateSearchQueries(meta.title, meta.original_title);

    console.log(
      `[DhakaFlix] Searching ${candidateServers.length} server(s) with queries: ${JSON.stringify(
        searchQueries
      )}`
    );

    // 5. Query all candidate servers in parallel
    const serverPromises = candidateServers.map((server) =>
      processServer(server, type, meta, targetSeason, targetEpisode, searchQueries)
    );

    const settledResults = await Promise.allSettled(serverPromises);
    const allStreams = [];
    const seenUrls = new Set();

    for (const result of settledResults) {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        for (const stream of result.value) {
          if (!seenUrls.has(stream.url)) {
            seenUrls.add(stream.url);
            allStreams.push(stream);
          }
        }
      }
    }

    console.log(`[DhakaFlix] Discovered ${allStreams.length} stream(s)`);
    return allStreams;
  } catch (error) {
    console.error(`[DhakaFlix] Unexpected error in getStreams: ${error.message}`);
    return [];
  }
}

/**
 * Searches a single DhakaFlix server and extracts playable video streams.
 *
 * @param {object} server
 * @param {string} mediaType - "movie" | "tv"
 * @param {object} meta - { title, original_title, year }
 * @param {number|null} targetSeason
 * @param {number|null} targetEpisode
 * @param {string[]} searchQueries
 * @returns {Promise<Array<object>>}
 */
async function processServer(
  server,
  mediaType,
  meta,
  targetSeason,
  targetEpisode,
  searchQueries
) {
  const streams = [];

  try {
    // Execute searches across candidate query variants
    let searchItems = [];
    for (const q of searchQueries) {
      const items = await searchServer(server, q);
      if (items.length > 0) {
        searchItems = searchItems.concat(items);
      }
    }

    if (searchItems.length === 0) {
      return [];
    }

    // Deduplicate search items by href
    const uniqueItems = [];
    const seenHrefs = new Set();
    for (const item of searchItems) {
      if (item && item.href && !seenHrefs.has(item.href)) {
        seenHrefs.add(item.href);
        uniqueItems.push(item);
      }
    }

    if (mediaType === "movie") {
      await processMovieItems(server, uniqueItems, meta, streams);
    } else {
      await processTvItems(
        server,
        uniqueItems,
        meta,
        targetSeason,
        targetEpisode,
        streams
      );
    }
  } catch (err) {
    console.log(`[DhakaFlix] Server ${server.name} error: ${err.message}`);
  }

  return streams;
}

/**
 * Processes search results for Movies
 *
 * @param {object} server
 * @param {Array} items
 * @param {object} meta
 * @param {Array} streams
 */
async function processMovieItems(server, items, meta, streams) {
  for (const item of items) {
    const rawName = nameFromUrl(item.href);

    // Case A: Direct video file returned by h5ai search
    if (isVideoFile(item.href)) {
      if (isTitleMatch(rawName, meta.title, meta.year, "movie")) {
        addStreamResult(server, streams, rawName, item.href);
      }
      continue;
    }

    // Case B: Directory returned by search (movie folder)
    const isFolder = item.size == null || item.href.endsWith("/");
    if (isFolder) {
      if (isTitleMatch(rawName, meta.title, meta.year, "movie")) {
        // Fetch contents of movie directory
        const dir = await fetchDirectoryEntries(server, item.href);
        for (const file of dir.files) {
          if (isVideoFile(file.href)) {
            addStreamResult(server, streams, file.name, file.href);
          }
        }
      }
    }
  }
}

/**
 * Processes search results for TV Series
 *
 * @param {object} server
 * @param {Array} items
 * @param {object} meta
 * @param {number} targetSeason
 * @param {number} targetEpisode
 * @param {Array} streams
 */
async function processTvItems(
  server,
  items,
  meta,
  targetSeason,
  targetEpisode,
  streams
) {
  for (const item of items) {
    const rawName = nameFromUrl(item.href);

    // Case A: Direct file in search matching season & episode
    if (isVideoFile(item.href)) {
      if (
        matchesEpisodeFile(rawName, targetSeason, targetEpisode, false) &&
        isTitleMatch(rawName, meta.title, null, "tv")
      ) {
        addStreamResult(server, streams, rawName, item.href);
      }
      continue;
    }

    // Case B: Directory
    const isFolder = item.size == null || item.href.endsWith("/");
    if (!isFolder) continue;

    // Check if this directory is already a Season folder matching targetSeason
    // e.g. "/DHAKA-FLIX-12/TV-WEB-Series/.../Breaking Bad/Season 01/"
    if (
      matchesSeasonFolder(rawName, targetSeason) &&
      isTitleMatch(item.href, meta.title, null, "tv")
    ) {
      const seasonEntries = await fetchDirectoryEntries(server, item.href);
      matchAndAddEpisode(
        server,
        streams,
        seasonEntries.files,
        targetSeason,
        targetEpisode,
        true
      );
      continue;
    }

    // Check if this directory is the TV show root folder
    // e.g. "/DHAKA-FLIX-12/TV-WEB-Series/.../Breaking Bad/"
    if (isTitleMatch(rawName, meta.title, null, "tv")) {
      const showEntries = await fetchDirectoryEntries(server, item.href);

      // Look for matching season subfolder
      const matchingSeasonFolder = showEntries.folders.find((f) =>
        matchesSeasonFolder(f.name, targetSeason)
      );

      if (matchingSeasonFolder) {
        const seasonEntries = await fetchDirectoryEntries(
          server,
          matchingSeasonFolder.href
        );
        matchAndAddEpisode(
          server,
          streams,
          seasonEntries.files,
          targetSeason,
          targetEpisode,
          true
        );
      } else if (showEntries.folders.length === 0 && showEntries.files.length > 0) {
        // Flat folder without season subdirectories (e.g. miniseries or single season)
        matchAndAddEpisode(
          server,
          streams,
          showEntries.files,
          targetSeason,
          targetEpisode,
          false
        );
      } else if (
        showEntries.folders.length > 0 &&
        targetSeason <= showEntries.folders.length
      ) {
        // Fallback: Season folders without explicit "Season" keyword (indexed)
        const sortedFolders = showEntries.folders.slice().sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true })
        );
        const indexedFolder = sortedFolders[targetSeason - 1];
        if (indexedFolder) {
          const seasonEntries = await fetchDirectoryEntries(
            server,
            indexedFolder.href
          );
          matchAndAddEpisode(
            server,
            streams,
            seasonEntries.files,
            targetSeason,
            targetEpisode,
            true
          );
        }
      }
    }
  }
}

/**
 * Searches list of video files for the episode and adds stream
 *
 * @param {object} server
 * @param {Array} streams
 * @param {Array<{ name: string, href: string }>} files
 * @param {number} targetSeason
 * @param {number} targetEpisode
 * @param {boolean} isInSeasonFolder
 */
function matchAndAddEpisode(
  server,
  streams,
  files,
  targetSeason,
  targetEpisode,
  isInSeasonFolder
) {
  // 1. First attempt: Explicit regex matching
  for (const file of files) {
    if (
      matchesEpisodeFile(file.name, targetSeason, targetEpisode, isInSeasonFolder)
    ) {
      addStreamResult(server, streams, file.name, file.href);
    }
  }

  // 2. Second attempt: If in verified season folder and no regex matched, use file index order
  if (streams.length === 0 && isInSeasonFolder && files.length >= targetEpisode) {
    const sortedFiles = files.slice().sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    const file = sortedFiles[targetEpisode - 1];
    if (file) {
      addStreamResult(server, streams, file.name, file.href);
    }
  }
}

/**
 * Formats and pushes a stream object into results array.
 *
 * @param {object} server
 * @param {Array} streams
 * @param {string} fileName
 * @param {string} fileHref
 */
function addStreamResult(server, streams, fileName, fileHref) {
  const quality = parseQuality(fileName);
  const mediaTags = extractMediaTags(fileName);
  const tagInfo = mediaTags.length > 0 ? ` [${mediaTags.join(" | ")}]` : "";
  const cleaned = cleanFileName(fileName);

  const directUrl = normalizeStreamUrl(server.mainUrl, fileHref);

  streams.push({
    name: "DhakaFlix",
    title: `[${server.name}] ${cleaned} [${quality}]${tagInfo}`,
    url: directUrl,
    quality: quality,
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `${server.mainUrl}/`
    }
  });
}

module.exports = { getStreams };
