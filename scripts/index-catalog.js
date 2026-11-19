#!/usr/bin/env node

/**
 * DhakaFlix Catalog Indexer CLI
 *
 * Crawls DhakaFlix BDIX servers (14, 12, 7, 9), matches titles to TMDB IDs,
 * caches progress in .cache/indexer-cache.json, and generates compact,
 * hash-sharded static JSON databases in index/ (m/ for movies, t/ for TV).
 *
 * Usage:
 *   node scripts/index-catalog.js --sample          # Fast sample run (e.g. 50 movies, 5 TV shows)
 *   node scripts/index-catalog.js --resume          # Full crawl, resuming from cache
 *   node scripts/index-catalog.js --force           # Full crawl, ignoring cache
 *   node scripts/index-catalog.js --movies-only     # Crawl only movies
 *   node scripts/index-catalog.js --tv-only         # Crawl only TV series
 */

const fs = require("fs");
const path = require("path");

// =============================================================================
// CONFIGURATION & CONSTANTS
// =============================================================================

const ROOT_DIR = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "indexer-cache.json");
const INDEX_DIR = path.join(ROOT_DIR, "index");
const MOVIES_INDEX_DIR = path.join(INDEX_DIR, "m");
const TV_INDEX_DIR = path.join(INDEX_DIR, "t");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "e80ea2a38c45dc7aaccf08b1babcd3a7";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HOSTS = [
  "http://172.16.50.14", // 0
  "http://172.16.50.12", // 1
  "http://172.16.50.7",  // 2
  "http://172.16.50.9"   // 3
];

const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".m4v", ".avi", ".webm", ".ts"];

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

const args = process.argv.slice(2);
const IS_SAMPLE = args.includes("--sample");
const MOVIES_ONLY = args.includes("--movies-only");
const TV_ONLY = args.includes("--tv-only");
const FORCE = args.includes("--force");
const RESUME = args.includes("--resume") || !FORCE;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeEncodeUriSegment(segment) {
  if (!segment) return "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch (e) {}
  return encodeURIComponent(decoded).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function normalizeStreamUrl(baseUrl, rawPath) {
  if (!rawPath) return "";
  let fullUrl =
    rawPath.startsWith("http://") || rawPath.startsWith("https://")
      ? rawPath
      : `${baseUrl.replace(/\/+$/, "")}/${rawPath.replace(/^\/+/, "")}`;
  const sanitizedUrl = fullUrl.replace(/#/g, "%23");
  const match = sanitizedUrl.match(/^(https?:\/\/[^\/]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return sanitizedUrl;
  const origin = match[1];
  const pathname = match[2] || "/";
  const search = match[3] || "";
  const encodedPath = pathname.split("/").map(safeEncodeUriSegment).join("/");
  return `${origin}${encodedPath}${search}`;
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const formatted = gb >= 10 ? gb.toFixed(1) : gb.toFixed(2);
    return `${parseFloat(formatted)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Math.round(mb)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

function parseQuality(name) {
  if (!name) return "HD";
  const upper = name.toUpperCase();
  if (upper.includes("2160P") || upper.includes("4K") || upper.includes("UHD")) return "4K";
  if (upper.includes("1080P") || upper.includes("FHD")) return "1080p";
  if (upper.includes("720P")) return "720p";
  if (upper.includes("480P") || upper.includes("SD")) return "480p";
  if (upper.includes("CAM") || upper.includes("HDCAM") || upper.includes("TELESYNC")) return "CAM";
  return "HD";
}

function isVideoFile(filePath) {
  if (!filePath) return false;
  const clean = filePath.split("?")[0].split("#")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

function nameFromUrl(href) {
  if (!href) return "";
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch (e) {}
  const match = decoded.match(/.*\/([^\/]+)(?:\/[^\/]*)*$/);
  return match && match[1] ? match[1] : decoded;
}

/**
 * Extracts clean title and year from folder or file name
 */
function extractTitleAndYear(rawName) {
  let name = decodeURIComponent(rawName).replace(/\/+$/, "").trim();

  // 1. Extract year
  let year = null;
  const yearMatch =
    name.match(/\((?:TV\s+Series\s+)?([12]\d{3})(?:[–-]\d{4}|[–-]\s*)?\)/i) ||
    name.match(/\b([12]\d{3})\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // 2. Clean title
  let title = name.replace(/^\d{1,3}\.\s*/, "");
  title = title.replace(/\s*\((?:TV\s+Series\s+)?[12]\d{3}[^)]*?\).*$/i, "");
  if (year && title.includes(year)) {
    title = title.split(year)[0];
  }

  title = title
    .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|web-dl|webrip|hdrip|amzn|nf|dsnp|hmax|hdtv)\b/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, year };
}

/**
 * Extracts season and episode numbers from video file name
 */
function extractSeasonEpisode(fileName) {
  const name = decodeURIComponent(fileName);

  // S01E02 / s1e2
  const seMatch = name.match(/s(\d{1,2})\s*e(\d{1,3})/i);
  if (seMatch) {
    return {
      season: parseInt(seMatch[1], 10),
      episode: parseInt(seMatch[2], 10)
    };
  }

  // 1x02
  const xMatch = name.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (xMatch) {
    return {
      season: parseInt(xMatch[1], 10),
      episode: parseInt(xMatch[2], 10)
    };
  }

  // Episode 02 / Ep 02
  const epMatch = name.match(/(?:episode|ep)[._\s-]*(\d{1,3})\b/i);
  if (epMatch) {
    return {
      season: null,
      episode: parseInt(epMatch[1], 10)
    };
  }

  return null;
}

/**
 * Extracts season number from folder name (e.g. "Season 1", "Season 02", "S01")
 */
function extractSeasonFromFolder(folderName) {
  const name = decodeURIComponent(folderName);
  const match = name.match(/(?:season|series|s)[._\s-]*(\d{1,2})/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// =============================================================================
// CONCURRENCY & NETWORK HELPERS
// =============================================================================

async function fetchWithRetry(url, options = {}, timeoutMs = 4000, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          ...options.headers
        }
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === maxRetries) throw err;
      await sleep(200);
    }
  }
}

/**
 * Post h5ai action=get request to fetch directory contents
 */
async function fetchH5aiDirectory(host, folderHref) {
  const cleanHref = folderHref.endsWith("/") ? folderHref : `${folderHref}/`;
  const postUrl = `${host}${cleanHref.split("/").slice(0, 2).join("/")}/`;

  try {
    const res = await fetchWithRetry(
      postUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get",
          items: { href: cleanHref, what: 1 }
        })
      },
      4500
    );

    if (!res.ok) return { folders: [], files: [] };

    const data = await res.json();
    if (!data || !Array.isArray(data.items)) return { folders: [], files: [] };

    // The h5ai API returns breadcrumb parent folders and current folder as well.
    // Filter to immediate children of cleanHref.
    const normalizedTarget = decodeURIComponent(cleanHref).replace(/\/+$/, "");

    const folders = [];
    const files = [];

    for (const item of data.items) {
      if (!item || !item.href) continue;
      const decodedHref = decodeURIComponent(item.href).replace(/\/+$/, "");

      // Must be child of target
      if (decodedHref === normalizedTarget) continue;
      if (!decodedHref.startsWith(normalizedTarget + "/")) continue;

      // Must be immediate child (no extra slashes)
      const relative = decodedHref.substring(normalizedTarget.length + 1);
      if (relative.includes("/")) continue;

      const isFolder = item.size == null || item.href.endsWith("/");
      if (isFolder) {
        folders.push({
          name: nameFromUrl(item.href),
          href: item.href
        });
      } else if (isVideoFile(item.href)) {
        files.push({
          name: nameFromUrl(item.href),
          href: item.href,
          size: item.size
        });
      }
    }

    return { folders, files };
  } catch (err) {
    return { folders: [], files: [] };
  }
}

/**
 * Concurrency runner for parallel tasks
 */
async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// =============================================================================
// TMDB MATCHER WITH RATE LIMITING & PERSISTENT CHECKPOINTS
// =============================================================================

class TmdbMatcher {
  constructor(apiKey, cache) {
    this.apiKey = apiKey;
    this.cache = cache; // Persistent in-memory map of folder/title -> tmdb match
    this.minIntervalMs = 45; // ~22 req/s safe limit
    this.lastCallTime = 0;
  }

  async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastCallTime = Date.now();
  }

  normalizeTokens(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0 && !["the", "a", "an", "and", "of", "in"].includes(t));
  }

  computeSimilarity(str1, str2) {
    const t1 = this.normalizeTokens(str1);
    const t2 = this.normalizeTokens(str2);
    if (t1.length === 0 || t2.length === 0) return 0;

    const set1 = new Set(t1);
    const set2 = new Set(t2);
    let intersection = 0;
    for (const t of set1) {
      if (set2.has(t)) intersection++;
    }
    return (2 * intersection) / (set1.size + set2.size);
  }

  async match(title, year, type = "movie") {
    if (!title) return null;

    const cacheKey = `${type}:${title.toLowerCase().trim()}:${year || ""}`;
    if (this.cache[cacheKey] !== undefined) {
      return this.cache[cacheKey];
    }

    await this.rateLimit();

    const encodedTitle = encodeURIComponent(title);
    let searchUrl = "";
    if (type === "movie") {
      searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${this.apiKey}&query=${encodedTitle}`;
      if (year) searchUrl += `&year=${year}`;
    } else {
      searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${this.apiKey}&query=${encodedTitle}`;
      if (year) searchUrl += `&first_air_date_year=${year}`;
    }

    try {
      let res = await fetchWithRetry(searchUrl, {}, 5000, 2);

      // Handle 429 rate limit if encountered
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
        await sleep((retryAfter + 1) * 1000);
        res = await fetchWithRetry(searchUrl, {}, 5000, 1);
      }

      if (!res.ok) {
        this.cache[cacheKey] = null;
        return null;
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.results) || data.results.length === 0) {
        // If year was specified, try searching without year restriction
        if (year) {
          await this.rateLimit();
          const fallbackUrl =
            type === "movie"
              ? `https://api.themoviedb.org/3/search/movie?api_key=${this.apiKey}&query=${encodedTitle}`
              : `https://api.themoviedb.org/3/search/tv?api_key=${this.apiKey}&query=${encodedTitle}`;

          const fallbackRes = await fetchWithRetry(fallbackUrl, {}, 5000, 1);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (fallbackData && fallbackData.results && fallbackData.results.length > 0) {
              const best = this.findBestCandidate(fallbackData.results, title, year, type);
              this.cache[cacheKey] = best;
              return best;
            }
          }
        }

        this.cache[cacheKey] = null;
        return null;
      }

      const best = this.findBestCandidate(data.results, title, year, type);
      this.cache[cacheKey] = best;
      return best;
    } catch (err) {
      console.warn(`[TMDB] Search failed for "${title}": ${err.message}`);
      return null;
    }
  }

  findBestCandidate(results, targetTitle, targetYear, type) {
    let bestMatch = null;
    let highestScore = -1;

    for (const item of results) {
      const resultTitle = type === "movie" ? item.title : item.name;
      const releaseDate = type === "movie" ? item.release_date : item.first_air_date;
      const resultYear = releaseDate ? releaseDate.split("-")[0] : null;

      const titleSim = this.computeSimilarity(targetTitle, resultTitle);

      let yearBonus = 0;
      if (targetYear && resultYear) {
        const diff = Math.abs(parseInt(targetYear, 10) - parseInt(resultYear, 10));
        if (diff === 0) yearBonus = 0.3;
        else if (diff === 1) yearBonus = 0.1;
        else yearBonus = -0.4;
      }

      const totalScore = titleSim + yearBonus;

      // Require at least 0.5 title similarity
      if (titleSim >= 0.5 && totalScore > highestScore) {
        highestScore = totalScore;
        bestMatch = {
          id: item.id,
          title: resultTitle,
          year: resultYear
        };
      }
    }

    return bestMatch;
  }
}

// =============================================================================
// MAIN CRAWLER LOGIC
// =============================================================================

async function runIndexer() {
  console.log("=================================================");
  console.log("⚡ DhakaFlix Static Catalog Indexer");
  console.log("=================================================");
  console.log(`Mode: ${IS_SAMPLE ? "SAMPLE (Quick Verification)" : "FULL CRAWL"}`);
  console.log(`Scope: ${MOVIES_ONLY ? "Movies Only" : TV_ONLY ? "TV Only" : "Movies + TV"}`);
  console.log(`Resume from cache: ${RESUME}`);
  console.log(`TMDB Key: ${TMDB_API_KEY ? "Configured (" + TMDB_API_KEY.slice(0, 6) + "...)" : "MISSING"}`);
  console.log("-------------------------------------------------\n");

  if (!TMDB_API_KEY) {
    console.error("❌ Error: TMDB_API_KEY is required.");
    process.exit(1);
  }

  // Ensure directories exist
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(MOVIES_INDEX_DIR, { recursive: true });
  fs.mkdirSync(TV_INDEX_DIR, { recursive: true });

  // Load persistent cache
  let cacheData = { tmdbMatches: {}, processedFolders: {}, fileSizes: {} };
  if (RESUME && fs.existsSync(CACHE_FILE)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      cacheData.fileSizes = cacheData.fileSizes || {};
      console.log(`📦 Loaded checkpoint cache: ${Object.keys(cacheData.tmdbMatches || {}).length} TMDB items, ${Object.keys(cacheData.fileSizes || {}).length} cached file sizes.`);
    } catch (e) {
      console.warn("⚠️ Failed to parse cache file, starting fresh.");
      cacheData = { tmdbMatches: {}, processedFolders: {}, fileSizes: {} };
    }
  }

  const tmdb = new TmdbMatcher(TMDB_API_KEY, cacheData.tmdbMatches);

  // In-memory catalog accumulation:
  // movies: Map<tmdbId, Array<[hostIndex, relativePath, quality, size]>>
  // tv: Map<tmdbId, Map<seasonEpisodeKey, Array<[hostIndex, relativePath, quality, size]>>>
  const catalogMovies = new Map();
  const catalogTv = new Map();

  function saveCheckpoint() {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    } catch (e) {
      console.warn("Failed to write checkpoint:", e.message);
    }
  }

  /**
   * Indexer-only HEAD fallback: fetches Content-Length if directory listing omits size
   */
  async function getOrFetchFileSize(hostIndex, fileHref) {
    if (!fileHref) return null;
    if (cacheData.fileSizes[fileHref] !== undefined) {
      return cacheData.fileSizes[fileHref];
    }

    const host = HOSTS[hostIndex];
    if (!host) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const url = normalizeStreamUrl(host, fileHref);
      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT }
      });
      clearTimeout(timer);

      const cl = res.headers.get("Content-Length");
      if (cl) {
        const bytes = parseInt(cl, 10);
        if (!isNaN(bytes) && bytes > 0) {
          cacheData.fileSizes[fileHref] = bytes;
          return bytes;
        }
      }
    } catch (err) {
      // ignore network errors for HEAD
    }

    cacheData.fileSizes[fileHref] = null;
    return null;
  }

  let totalItemsProcessed = 0;

  // ---------------------------------------------------------------------------
  // 1. CRAWL MOVIES (Server 14 & Server 7)
  // ---------------------------------------------------------------------------
  if (!TV_ONLY) {
    console.log("\n🎬 [Stage 1/2] Crawling Movies from Server 14 & 7...");

    // Server 14 Movies
    const s14Host = HOSTS[0];
    const s14Categories = [
      "/DHAKA-FLIX-14/English Movies (1080p)/",
      "/DHAKA-FLIX-14/Hindi Movies/",
      "/DHAKA-FLIX-14/SOUTH INDIAN MOVIES/",
      "/DHAKA-FLIX-14/Animation Movies (1080p)/",
      "/DHAKA-FLIX-14/IMDb Top-250 Movies/"
    ];

    for (const catHref of s14Categories) {
      console.log(`\n📂 Scanning Server 14 Category: ${catHref}`);
      const catListing = await fetchH5aiDirectory(s14Host, catHref);

      // Category might contain subfolders (e.g. year folders "(2024) 1080p/")
      let movieFoldersToProcess = [];

      if (catListing.folders.length > 0) {
        // Sample mode: only take the 2024/latest year folder
        const foldersToInspect = IS_SAMPLE
          ? catListing.folders.filter((f) => f.name.includes("2024") || f.name.includes("2023")).slice(0, 1)
          : catListing.folders;

        for (const subFolder of foldersToInspect) {
          const subListing = await fetchH5aiDirectory(s14Host, subFolder.href);

          if (subListing.folders.length > 0) {
            movieFoldersToProcess.push(...subListing.folders);
          }
          // Direct video files in year folder
          if (subListing.files.length > 0) {
            for (const f of subListing.files) {
              await processSingleMovieFile(0, f.name, f.href, f.size);
            }
          }
        }
      }

      if (catListing.files.length > 0) {
        for (const f of catListing.files) {
          await processSingleMovieFile(0, f.name, f.href, f.size);
        }
      }

      if (IS_SAMPLE) {
        const popular = movieFoldersToProcess.filter((f) =>
          /oppenheimer|dune|matrix|deadpool|avengers|gladiator/i.test(f.name)
        );
        const rest = movieFoldersToProcess.filter((f) => !popular.includes(f));
        movieFoldersToProcess = [...popular, ...rest].slice(0, 60);
      }

      console.log(`  Found ${movieFoldersToProcess.length} movie folders to process in ${catHref}`);

      // Process movie folders in parallel batches
      await mapConcurrent(movieFoldersToProcess, 8, async (folder) => {
        const dirListing = await fetchH5aiDirectory(s14Host, folder.href);
        for (const file of dirListing.files) {
          await processSingleMovieFile(0, folder.name, file.href, file.size);
        }
      });

      if (IS_SAMPLE) break; // In sample mode, 1 category is sufficient
    }

    // Server 7 Movies (English, 3D, Foreign Language)
    if (!IS_SAMPLE) {
      const s7Host = HOSTS[2];
      const s7Categories = [
        "/DHAKA-FLIX-7/English Movies/",
        "/DHAKA-FLIX-7/Foreign Language Movies/",
        "/DHAKA-FLIX-7/Kolkata Bangla Movies/"
      ];

      for (const catHref of s7Categories) {
        console.log(`\n📂 Scanning Server 7 Category: ${catHref}`);
        const catListing = await fetchH5aiDirectory(s7Host, catHref);
        const folders = catListing.folders.slice(0, 50);

        await mapConcurrent(folders, 8, async (folder) => {
          const dirListing = await fetchH5aiDirectory(s7Host, folder.href);
          for (const file of dirListing.files) {
            await processSingleMovieFile(2, folder.name, file.href, file.size);
          }
        });
      }
    }
  }

  async function processSingleMovieFile(hostIndex, folderOrFileName, fileHref, size) {
    const { title, year } = extractTitleAndYear(folderOrFileName);
    if (!title || title.length < 2) return;

    const match = await tmdb.match(title, year, "movie");
    if (!match) return;

    const tmdbId = String(match.id);
    const quality = parseQuality(fileHref);

    let sizeBytes = size;
    if (sizeBytes == null) {
      sizeBytes = await getOrFetchFileSize(hostIndex, fileHref);
    }
    const humanSize = formatBytes(sizeBytes);

    if (!catalogMovies.has(tmdbId)) {
      catalogMovies.set(tmdbId, []);
    }

    // Avoid duplicate streams
    const existing = catalogMovies.get(tmdbId);
    if (!existing.some((e) => e[1] === fileHref)) {
      existing.push([hostIndex, fileHref, quality, humanSize]);
    }

    totalItemsProcessed++;
    if (totalItemsProcessed % 20 === 0) {
      console.log(`  [Progress] Indexed ${catalogMovies.size} unique movies so far...`);
      saveCheckpoint();
    }
  }

  // ---------------------------------------------------------------------------
  // 2. CRAWL TV SERIES (Server 12 & Server 14 Korean)
  // ---------------------------------------------------------------------------
  if (!MOVIES_ONLY) {
    console.log("\n📺 [Stage 2/2] Crawling TV Series from Server 12...");

    const s12Host = HOSTS[1];
    const s12Partitions = [
      "/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♥  A  —  L/",
      "/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♦  M  —  R/",
      "/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♦  S  —  Z/",
      "/DHAKA-FLIX-12/TV-WEB-Series/TV Series ★  0  —  9/"
    ];

    for (const partHref of s12Partitions) {
      console.log(`\n📂 Scanning Server 12 Partition: ${partHref}`);
      const partListing = await fetchH5aiDirectory(s12Host, partHref);
      let showFolders = partListing.folders;

      if (IS_SAMPLE) {
        const popular = showFolders.filter((f) =>
          /breaking\s*bad|game\s*of\s*thrones|house\s*of\s*the\s*dragon|dark|witcher/i.test(f.name)
        );
        const rest = showFolders.filter((f) => !popular.includes(f));
        showFolders = [...popular, ...rest].slice(0, 8); // 8 TV shows in sample mode including Breaking Bad
      }

      console.log(`  Processing ${showFolders.length} show folders...`);

      for (const showFolder of showFolders) {
        await processSingleTvShow(1, showFolder);
      }

      if (IS_SAMPLE) break;
    }
  }

  async function processSingleTvShow(hostIndex, showFolder) {
    const sHost = HOSTS[hostIndex];
    const { title, year } = extractTitleAndYear(showFolder.name);
    if (!title || title.length < 2) return;

    const match = await tmdb.match(title, year, "tv");
    if (!match) return;

    const tmdbId = String(match.id);
    if (!catalogTv.has(tmdbId)) {
      catalogTv.set(tmdbId, new Map());
    }
    const showMap = catalogTv.get(tmdbId);

    // Fetch show folder contents (may contain season folders or direct video files)
    const showListing = await fetchH5aiDirectory(sHost, showFolder.href);

    // If season subfolders exist
    if (showListing.folders.length > 0) {
      for (const sFolder of showListing.folders) {
        const seasonNum = extractSeasonFromFolder(sFolder.name) || 1;
        const seasonListing = await fetchH5aiDirectory(sHost, sFolder.href);

        for (let i = 0; i < seasonListing.files.length; i++) {
          const file = seasonListing.files[i];
          const se = extractSeasonEpisode(file.name);
          const s = (se && se.season) || seasonNum;
          const e = (se && se.episode) || i + 1;
          const key = `${s}-${e}`;

          let sizeBytes = file.size;
          if (sizeBytes == null) {
            sizeBytes = await getOrFetchFileSize(hostIndex, file.href);
          }
          const humanSize = formatBytes(sizeBytes);

          if (!showMap.has(key)) showMap.set(key, []);
          const existing = showMap.get(key);
          if (!existing.some((item) => item[1] === file.href)) {
            existing.push([
              hostIndex,
              file.href,
              parseQuality(file.name),
              humanSize
            ]);
          }
        }
      }
    }

    // If flat video files exist in root show folder
    if (showListing.files.length > 0) {
      for (let i = 0; i < showListing.files.length; i++) {
        const file = showListing.files[i];
        const se = extractSeasonEpisode(file.name);
        const s = (se && se.season) || 1;
        const e = (se && se.episode) || i + 1;
        const key = `${s}-${e}`;

        let sizeBytes = file.size;
        if (sizeBytes == null) {
          sizeBytes = await getOrFetchFileSize(hostIndex, file.href);
        }
        const humanSize = formatBytes(sizeBytes);

        if (!showMap.has(key)) showMap.set(key, []);
        const existing = showMap.get(key);
        if (!existing.some((item) => item[1] === file.href)) {
          existing.push([
            hostIndex,
            file.href,
            parseQuality(file.name),
            humanSize
          ]);
        }
      }
    }

    console.log(`  ✅ TV Show Indexed: "${match.title}" (TMDB: ${tmdbId}, ${showMap.size} episodes)`);
    saveCheckpoint();
  }

  // ---------------------------------------------------------------------------
  // 3. GENERATE HASH-SHARDED DATABASE IN index/
  // ---------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("💾 Writing Hash-Sharded Database into index/...");
  console.log("=================================================");

  // Group movies by shard: tmdbId % 100 -> "00" .. "99"
  const movieShards = new Map();
  for (const [tmdbId, streams] of catalogMovies.entries()) {
    const shardKey = String(Number(tmdbId) % 100).padStart(2, "0");
    if (!movieShards.has(shardKey)) movieShards.set(shardKey, {});
    movieShards.get(shardKey)[tmdbId] = streams;
  }

  // Group TV shows by shard
  const tvShards = new Map();
  let totalTvEpisodes = 0;
  for (const [tmdbId, showMap] of catalogTv.entries()) {
    const shardKey = String(Number(tmdbId) % 100).padStart(2, "0");
    if (!tvShards.has(shardKey)) tvShards.set(shardKey, {});
    const showObj = {};
    for (const [key, streams] of showMap.entries()) {
      showObj[key] = streams;
      totalTvEpisodes += streams.length;
    }
    tvShards.get(shardKey)[tmdbId] = showObj;
  }

  // Write movie shards
  for (const [shardKey, data] of movieShards.entries()) {
    const filePath = path.join(MOVIES_INDEX_DIR, `${shardKey}.json`);
    // Merge with existing shard if exists
    let merged = data;
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        merged = Object.assign(existing, data);
      } catch (e) {}
    }
    fs.writeFileSync(filePath, JSON.stringify(merged));
  }

  // Write TV shards
  for (const [shardKey, data] of tvShards.entries()) {
    const filePath = path.join(TV_INDEX_DIR, `${shardKey}.json`);
    let merged = data;
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        merged = Object.assign(existing, data);
      } catch (e) {}
    }
    fs.writeFileSync(filePath, JSON.stringify(merged));
  }

  // Write meta.json
  const meta = {
    version: 1,
    generatedAt: new Date().toISOString(),
    hosts: HOSTS,
    totalMovies: catalogMovies.size,
    totalTvShows: catalogTv.size,
    totalTvEpisodes: totalTvEpisodes,
    shards: {
      movies: Array.from(movieShards.keys()).sort(),
      tv: Array.from(tvShards.keys()).sort()
    }
  };
  fs.writeFileSync(path.join(INDEX_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  // Save final cache
  saveCheckpoint();

  console.log(`\n🎉 Indexing Complete!`);
  console.log(`   - Unique Movies Indexed: ${catalogMovies.size} (across ${movieShards.size} shards)`);
  console.log(`   - Unique TV Shows Indexed: ${catalogTv.size} (${totalTvEpisodes} episodes across ${tvShards.size} shards)`);
  console.log(`   - Output directory: index/`);
  console.log(`   - Checkpoint saved: .cache/indexer-cache.json`);
}

runIndexer().catch((err) => {
  console.error("\n❌ Fatal indexer error:", err);
  process.exit(1);
});
