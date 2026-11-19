/**
 * Static Catalog Index Fast-Path Client for NuvioTV
 *
 * Fetches pre-indexed, TMDB-linked video streams from hash-sharded static JSON
 * databases hosted on raw GitHub with automatic jsDelivr CDN fallback.
 *
 * Strict Hermes / QuickJS constraints:
 * - Zero Node.js built-in modules
 * - Pure global fetch with timeout
 * - Bounded LRU in-memory shard caching
 * - Sub-second (~150-300ms) stream retrieval
 */

import { USER_AGENT, DEBUG } from "./constants.js";
import { normalizeStreamUrl, nameFromUrl, cleanFileName } from "./utils.js";
import { parseMediaMetadata, formatStreamTitle, sortStreams } from "./parser.js";
import { BoundedCache } from "./cache.js";

// =============================================================================
// REPO CONFIGURATION & ENDPOINTS
// Auto-derived from sujon28113/nuvio-bdix-plugin (main branch)
// =============================================================================

const GITHUB_OWNER = "sujon28113";
const GITHUB_REPO = "nuvio-bdix-plugin";
const GITHUB_BRANCH = "main";

export const PRIMARY_INDEX_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/index`;
export const CDN_INDEX_BASE = `https://cdn.jsdelivr.net/gh/${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_BRANCH}/index`;

// Known DhakaFlix server hosts mapping to hostIndex [0, 1, 2, 3]
export const DEFAULT_HOSTS = [
  "http://172.16.50.14", // 0: Server 14
  "http://172.16.50.12", // 1: Server 12
  "http://172.16.50.7",  // 2: Server 7
  "http://172.16.50.9"   // 3: Server 9
];

const SERVER_NAMES = {
  "http://172.16.50.14": "DhakaFlix 14",
  "http://172.16.50.12": "DhakaFlix 12",
  "http://172.16.50.7": "DhakaFlix 7",
  "http://172.16.50.9": "DhakaFlix 9"
};

// =============================================================================
// IN-MEMORY LRU CACHING (Hermes-safe, bounded)
// =============================================================================

// Shard cache: holds up to 15 shards with 30-minute TTL
const shardCache = new BoundedCache(15, 30 * 60 * 1000);

// Meta cache: single item, 30-minute TTL
let cachedMeta = null;
let metaExpiry = 0;

/**
 * Calculates two-digit shard key from numeric TMDB ID:
 * e.g. "872585" -> "85", "1396" -> "96", "77236" -> "36"
 *
 * @param {string|number} tmdbId
 * @returns {string}
 */
export function getShardKey(tmdbId) {
  const num = parseInt(tmdbId, 10);
  if (isNaN(num)) return "00";
  return String(Math.abs(num) % 100).padStart(2, "0");
}

/**
 * Lightweight fetch helper with timeout
 */
async function fetchIndexJson(url, timeoutMs = 3500) {
  let controller = null;
  let timer = null;

  if (typeof AbortController !== "undefined") {
    controller = new AbortController();
  }

  const fetchPromise = fetch(url, {
    method: "GET",
    signal: controller ? controller.signal : undefined,
    headers: {
      "Accept": "application/json",
      "User-Agent": USER_AGENT
    }
  });

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) {
        try {
          controller.abort();
        } catch (e) {}
      }
      reject(new Error(`Fetch timed out for ${url}`));
    }, timeoutMs);
  });

  try {
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Fetches index/meta.json with CDN fallback and in-memory caching
 */
export async function getIndexMeta() {
  const now = Date.now();
  if (cachedMeta && now < metaExpiry) {
    return cachedMeta;
  }

  // 1. Try primary GitHub raw URL
  let meta = await fetchIndexJson(`${PRIMARY_INDEX_BASE}/meta.json`, 3000);

  // 2. Try CDN fallback
  if (!meta) {
    meta = await fetchIndexJson(`${CDN_INDEX_BASE}/meta.json`, 3500);
  }

  if (meta && Array.isArray(meta.hosts)) {
    cachedMeta = meta;
    metaExpiry = now + 30 * 60 * 1000;
    return meta;
  }

  // Return fallback default meta if offline/unreachable
  return {
    version: 1,
    hosts: DEFAULT_HOSTS
  };
}

/**
 * Fetches a single shard file (e.g. index/m/85.json or index/t/96.json)
 *
 * @param {"m"|"t"} subDir - "m" for movies, "t" for TV
 * @param {string} shardKey - "00" through "99"
 * @returns {Promise<object|null>}
 */
export async function fetchShard(subDir, shardKey) {
  const cacheKey = `shard_${subDir}_${shardKey}`;
  const cached = shardCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const shardPath = `${subDir}/${shardKey}.json`;

  // 1. Primary raw GitHub fetch
  let data = await fetchIndexJson(`${PRIMARY_INDEX_BASE}/${shardPath}`, 3500);

  // 2. Secondary jsDelivr CDN fetch
  if (!data) {
    data = await fetchIndexJson(`${CDN_INDEX_BASE}/${shardPath}`, 3500);
  }

  if (data && typeof data === "object") {
    shardCache.set(cacheKey, data);
    return data;
  }

  return null;
}

/**
 * Fast-path static index lookup.
 *
 * @param {string} tmdbId - TMDB ID string (e.g. "872585")
 * @param {"movie"|"tv"} mediaType - "movie" or "tv"
 * @param {number|null} [season=null]
 * @param {number|null} [episode=null]
 * @returns {Promise<Array<object>>} Nuvio stream objects or empty array on miss
 */
export async function lookupStaticIndex(tmdbId, mediaType = "movie", season = null, episode = null) {
  if (!tmdbId) return [];

  const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  const shardKey = getShardKey(tmdbId);
  const subDir = type === "movie" ? "m" : "t";

  try {
    const shard = await fetchShard(subDir, shardKey);
    if (!shard) {
      if (DEBUG) console.log(`[DhakaFlix Index] Shard ${subDir}/${shardKey}.json not found or unreachable.`);
      return [];
    }

    const idStr = String(tmdbId);
    let entries = null;

    if (type === "movie") {
      entries = shard[idStr];
    } else {
      const showData = shard[idStr];
      if (showData && season != null && episode != null) {
        const epKey = `${season}-${episode}`;
        entries = showData[epKey];
      }
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      if (DEBUG) console.log(`[DhakaFlix Index] Miss: ${type} ${tmdbId} not found in shard ${shardKey}.`);
      return [];
    }

    // Get hosts mapping
    const meta = await getIndexMeta();
    const hosts = (meta && meta.hosts) || DEFAULT_HOSTS;

    const streams = [];

    for (const entry of entries) {
      // Entry format: [hostIndex, relativePath, quality, size]
      const hostIndex = entry[0];
      const relativePath = entry[1];
      const quality = entry[2] || "HD";
      const size = entry[3] || null;

      const host = hosts[hostIndex] || DEFAULT_HOSTS[hostIndex] || "http://172.16.50.14";
      const serverName = SERVER_NAMES[host] || `DhakaFlix`;
      const directUrl = normalizeStreamUrl(host, relativePath);

      // Parse rich release metadata dynamically from relativePath and shard size
      const meta = parseMediaMetadata(relativePath, size);
      if (quality && meta.resolution === "HD" && quality !== "HD") {
        meta.resolution = quality;
      }

      const streamObj = {
        name: "DhakaFlix ⚡",
        title: formatStreamTitle(meta, serverName),
        url: directUrl,
        quality: meta.resolution,
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": `${host}/`
        },
        behaviorHints: {
          filename: meta.filename
        },
        _meta: meta
      };

      if (meta.formattedSize) {
        streamObj.size = meta.formattedSize;
      }
      if (meta.sizeBytes) {
        streamObj.behaviorHints.videoSize = meta.sizeBytes;
      }

      streams.push(streamObj);
    }

    if (DEBUG) {
      console.log(`[DhakaFlix Index] ⚡ HIT! Discovered ${streams.length} stream(s) for ${type} ${tmdbId} in ~150ms.`);
    }

    return sortStreams(streams);
  } catch (err) {
    if (DEBUG) console.log(`[DhakaFlix Index] Lookup error: ${err.message}`);
    return [];
  }
}
