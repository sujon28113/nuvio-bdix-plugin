/**
 * DhakaFlix Nuvio Native Provider
 * Ported from CloudStream Kotlin BdixDhakaFlix extension
 *
 * Highly optimized for QuickJS / Hermes on Android TV:
 * - Smart Server Routing by language & genre (cuts unnecessary server requests)
 * - Dead-host circuit breaker (skips offline servers in 0ms)
 * - LRU in-memory caching for TMDB, search, and directory listings
 * - Parallel execution across queries and directories
 * - Direct episode file extraction from search results
 */

// =============================================================================
// TMDB API KEY CONFIGURATION
// Configured with personal TMDB v3 API key.
// =============================================================================
const TMDB_API_KEY = "e80ea2a38c45dc7aaccf08b1babcd3a7";

// Optional community fallback key (from reference CloudStream extension)
const FALLBACK_TMDB_KEY = "e6333b32409e02a4a6eba6fb7ff866bb";

import { USER_AGENT, DEBUG } from "./constants.js";
import { lookupStaticIndex } from "./indexClient.js";
import { getTmdbMetadata } from "./tmdb.js";
import { routeServers } from "./routing.js";
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
  scoreMatch,
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
    if (DEBUG) {
      console.log(
        `[DhakaFlix] Request: ${mediaType} TMDB:${tmdbId}${
          mediaType === "tv" ? ` S:${season} E:${episode}` : ""
        }`
      );
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

    // =========================================================================
    // FAST PATH: Pre-indexed Static Catalog Lookup (Sub-second ~150-300ms)
    // =========================================================================
    try {
      const staticStreams = await lookupStaticIndex(
        tmdbId,
        type,
        targetSeason,
        targetEpisode
      );
      if (staticStreams && staticStreams.length > 0) {
        if (DEBUG) {
          console.log(
            `[DhakaFlix] ⚡ Fast-path hit! Returning ${staticStreams.length} stream(s) instantly`
          );
        }
        return staticStreams;
      }
    } catch (indexErr) {
      if (DEBUG) {
        console.log(`[DhakaFlix] Static index fast-path error: ${indexErr.message}`);
      }
    }

    // =========================================================================
    // FALLBACK: Live BDIX Scraper
    // =========================================================================
    if (DEBUG) {
      console.log(`[DhakaFlix] Fallback: Executing live BDIX scraper for ${type} ${tmdbId}...`);
    }

    // 3. Validate TMDB API Key for live search
    let apiKey = TMDB_API_KEY;
    if (!apiKey || apiKey === "YOUR_TMDB_API_KEY_HERE") {
      if (FALLBACK_TMDB_KEY) {
        apiKey = FALLBACK_TMDB_KEY;
      } else {
        console.error(
          "[DhakaFlix] ERROR: TMDB_API_KEY is not configured! Please set a valid TMDB v3 API key."
        );
        return [];
      }
    }

    // 4. Resolve TMDB ID to Title, Year, Language, and Genres (cached)
    const meta = await getTmdbMetadata(tmdbId, type, apiKey);
    if (!meta || !meta.title) {
      console.error(`[DhakaFlix] Failed to resolve TMDB metadata for ${type} ${tmdbId}`);
      return [];
    }

    // 4. Generate search queries
    const searchQueries = generateSearchQueries(meta.title, meta.original_title);

    // 5. Smart Server Routing: Prioritize servers matching language & genre
    const { primary, fallback } = routeServers(type, meta);

    const allStreams = [];
    const seenUrls = new Set();

    // Query primary servers in parallel
    if (primary.length > 0) {
      const primaryPromises = primary.map((server) =>
        processServer(server, type, meta, targetSeason, targetEpisode, searchQueries)
      );
      const primaryResults = await Promise.allSettled(primaryPromises);
      collectStreams(primaryResults, allStreams, seenUrls);
    }

    // If primary servers yielded 0 streams, query fallback servers
    if (allStreams.length === 0 && fallback.length > 0) {
      if (DEBUG) {
        console.log(`[DhakaFlix] Primary servers returned 0 streams. Querying ${fallback.length} fallback server(s)...`);
      }
      const fallbackPromises = fallback.map((server) =>
        processServer(server, type, meta, targetSeason, targetEpisode, searchQueries)
      );
      const fallbackResults = await Promise.allSettled(fallbackPromises);
      collectStreams(fallbackResults, allStreams, seenUrls);
    }

    if (DEBUG) console.log(`[DhakaFlix] Discovered ${allStreams.length} stream(s)`);
    return allStreams;
  } catch (error) {
    console.error(`[DhakaFlix] Unexpected error in getStreams: ${error.message}`);
    return [];
  }
}

/**
 * Collects streams from Promise.allSettled results, deduplicating by URL
 */
function collectStreams(settledResults, streamList, seenSet) {
  for (const res of settledResults) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      for (const s of res.value) {
        if (s && s.url && !seenSet.has(s.url)) {
          seenSet.add(s.url);
          streamList.push(s);
        }
      }
    }
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
    // Run search queries in parallel with partitioned title routing
    const searchPromises = searchQueries.map((q) => searchServer(server, q, meta.title));
    const searchResults = await Promise.allSettled(searchPromises);

    let searchItems = [];
    for (const res of searchResults) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        searchItems = searchItems.concat(res.value);
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
    if (DEBUG) console.log(`[DhakaFlix] Server ${server.name} error: ${err.message}`);
  }

  return streams;
}

/**
 * Processes search results for Movies (parallelized, top-ranked folders only)
 *
 * @param {object} server
 * @param {Array} items
 * @param {object} meta
 * @param {Array} streams
 */
async function processMovieItems(server, items, meta, streams) {
  const candidateFolders = [];

  for (const item of items) {
    const rawName = nameFromUrl(item.href);

    // Case A: Direct video file returned by h5ai search
    if (isVideoFile(item.href)) {
      if (isTitleMatch(rawName, meta.title, meta.year, "movie")) {
        addStreamResult(server, streams, rawName, item.href);
      }
      continue;
    }

    // Case B: Directory returned by search
    const isFolder = item.size == null || item.href.endsWith("/");
    if (isFolder && isTitleMatch(rawName, meta.title, meta.year, "movie")) {
      candidateFolders.push({
        href: item.href,
        name: rawName,
        score: scoreMatch(rawName, meta.title, meta.year)
      });
    }
  }

  // Rank candidate folders and only crawl top 3 to prevent over-fetching
  const topFolders = candidateFolders
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Fetch top folders in parallel
  if (topFolders.length > 0) {
    const dirPromises = topFolders.map((f) => fetchDirectoryEntries(server, f.href));
    const dirResults = await Promise.allSettled(dirPromises);

    for (const res of dirResults) {
      if (res.status === "fulfilled" && res.value && Array.isArray(res.value.files)) {
        for (const file of res.value.files) {
          if (isVideoFile(file.href)) {
            addStreamResult(server, streams, file.name, file.href);
          }
        }
      }
    }
  }
}

/**
 * Processes search results for TV Series (direct episode extraction & targeted crawling)
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
  // Step A: Check if search results already contain direct matching episode files
  for (const item of items) {
    if (isVideoFile(item.href)) {
      const rawName = nameFromUrl(item.href);
      if (
        matchesEpisodeFile(rawName, targetSeason, targetEpisode, false) &&
        isTitleMatch(rawName, meta.title, null, "tv")
      ) {
        addStreamResult(server, streams, rawName, item.href);
      }
    }
  }

  // If direct episode files were found in search, no folder crawling is required
  if (streams.length > 0) {
    return;
  }

  // Step B: Check directories
  const matchingSeasonFolders = [];
  const candidateShowFolders = [];

  for (const item of items) {
    const isFolder = item.size == null || item.href.endsWith("/");
    if (!isFolder) continue;

    const rawName = nameFromUrl(item.href);

    // Is this a direct Season folder matching targetSeason? (e.g. /Show/Season 01/)
    if (
      matchesSeasonFolder(rawName, targetSeason) &&
      isTitleMatch(item.href, meta.title, null, "tv")
    ) {
      matchingSeasonFolders.push({ href: item.href, name: rawName });
      continue;
    }

    // Is this the TV show root folder?
    if (isTitleMatch(rawName, meta.title, null, "tv")) {
      candidateShowFolders.push({
        href: item.href,
        name: rawName,
        score: scoreMatch(rawName, meta.title, meta.year)
      });
    }
  }

  // If direct season folders were identified, fetch them directly in parallel
  if (matchingSeasonFolders.length > 0) {
    const seasonPromises = matchingSeasonFolders.slice(0, 2).map((sf) =>
      fetchDirectoryEntries(server, sf.href)
    );
    const seasonResults = await Promise.allSettled(seasonPromises);

    for (const res of seasonResults) {
      if (res.status === "fulfilled" && res.value && Array.isArray(res.value.files)) {
        matchAndAddEpisode(
          server,
          streams,
          res.value.files,
          targetSeason,
          targetEpisode,
          true
        );
      }
    }
    return;
  }

  // Step C: If only root show folders found, crawl top 2 show folders in parallel
  const topShowFolders = candidateShowFolders
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (topShowFolders.length > 0) {
    const showPromises = topShowFolders.map((sf) =>
      fetchDirectoryEntries(server, sf.href)
    );
    const showResults = await Promise.allSettled(showPromises);

    const seasonFolderFetchPromises = [];

    for (const res of showResults) {
      if (res.status !== "fulfilled" || !res.value) continue;
      const showEntries = res.value;

      // Look for the specific Season subfolder matching targetSeason
      const matchingSeason = (showEntries.folders || []).find((f) =>
        matchesSeasonFolder(f.name, targetSeason)
      );

      if (matchingSeason) {
        seasonFolderFetchPromises.push(
          fetchDirectoryEntries(server, matchingSeason.href).then((sEntries) => ({
            files: sEntries.files,
            isInSeasonFolder: true
          }))
        );
      } else if (
        (!showEntries.folders || showEntries.folders.length === 0) &&
        showEntries.files &&
        showEntries.files.length > 0
      ) {
        // Flat folder without season subdirectories
        matchAndAddEpisode(
          server,
          streams,
          showEntries.files,
          targetSeason,
          targetEpisode,
          false
        );
      } else if (
        showEntries.folders &&
        showEntries.folders.length >= targetSeason
      ) {
        // Fallback: Ordinal season folder index
        const sortedFolders = showEntries.folders.slice().sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true })
        );
        const indexedFolder = sortedFolders[targetSeason - 1];
        if (indexedFolder) {
          seasonFolderFetchPromises.push(
            fetchDirectoryEntries(server, indexedFolder.href).then((sEntries) => ({
              files: sEntries.files,
              isInSeasonFolder: true
            }))
          );
        }
      }
    }

    if (seasonFolderFetchPromises.length > 0) {
      const seasonResults = await Promise.allSettled(seasonFolderFetchPromises);
      for (const res of seasonResults) {
        if (res.status === "fulfilled" && res.value && Array.isArray(res.value.files)) {
          matchAndAddEpisode(
            server,
            streams,
            res.value.files,
            targetSeason,
            targetEpisode,
            res.value.isInSeasonFolder
          );
        }
      }
    }
  }
}

/**
 * Searches list of video files for the episode and adds stream
 */
function matchAndAddEpisode(
  server,
  streams,
  files,
  targetSeason,
  targetEpisode,
  isInSeasonFolder
) {
  // 1. Explicit regex matching
  for (const file of files) {
    if (matchesEpisodeFile(file.name, targetSeason, targetEpisode, isInSeasonFolder)) {
      addStreamResult(server, streams, file.name, file.href);
    }
  }

  // 2. Sequential file index fallback if in verified season folder
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
