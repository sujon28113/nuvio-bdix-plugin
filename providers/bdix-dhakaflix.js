/**
 * bdix-dhakaflix - Built for Nuvio
 * Generated: 2026-11-19T11:40:24.722Z
 */
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/bdix-dhakaflix/constants.js
var DEBUG = false;
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var REQUEST_TIMEOUT_MS = 3e3;
var TMDB_TIMEOUT_MS = 4e3;
var SERVERS = [
  {
    id: "14",
    name: "DhakaFlix 14",
    mainUrl: "http://172.16.50.14",
    serverName: "DHAKA-FLIX-14",
    mediaTypes: ["movie", "tv"],
    categories: ["english_movie", "hindi_movie", "south_movie", "animation_movie", "korean_tv"],
    tvKeywords: [
      "KOREAN TV & WEB Series",
      "KOREAN%20TV%20%26%20WEB%20Series",
      "TV-WEB-Series"
    ],
    description: "Main Movies & Korean / Web Series"
  },
  {
    id: "12",
    name: "DhakaFlix 12",
    mainUrl: "http://172.16.50.12",
    serverName: "DHAKA-FLIX-12",
    mediaTypes: ["tv"],
    categories: ["western_tv", "all_tv"],
    tvKeywords: ["TV-WEB-Series"],
    description: "Dedicated TV & Web Series Server (0-9, A-L, M-R, S-Z)"
  },
  {
    id: "7",
    name: "DhakaFlix 7",
    mainUrl: "http://172.16.50.7",
    serverName: "DHAKA-FLIX-7",
    mediaTypes: ["movie"],
    categories: ["english_movie", "foreign_movie", "bangla_movie", "3d_movie"],
    tvKeywords: [],
    description: "English & Foreign Language Movies (3D, Japanese, Korean, Bangla, etc.)"
  },
  {
    id: "9",
    name: "DhakaFlix 9",
    mainUrl: "http://172.16.50.9",
    serverName: "DHAKA-FLIX-9",
    mediaTypes: ["movie", "tv"],
    categories: ["anime_tv", "korean_tv", "doc", "wwe"],
    tvKeywords: ["Awards", "WWE", "KOREAN", "Documentary", "Anime"],
    description: "Anime, Cartoons, Documentaries, WWE & Awards"
  }
];
var VIDEO_EXTENSIONS = [".mkv", ".mp4", ".m4v", ".avi", ".webm", ".ts"];

// src/bdix-dhakaflix/utils.js
function cleanTitle(title) {
  if (!title) return "";
  return title.replace(/^\d{1,3}\.\s*/, "").replace(/\s*\([^)]*?\d{4}.*?\).*$/, "").replace(/\s+/g, " ").trim();
}
function nameFromUrl(href) {
  if (!href) return "";
  let hrefDecoded = href;
  try {
    hrefDecoded = decodeURIComponent(href);
  } catch (e) {
  }
  const match = hrefDecoded.match(/.*\/([^\/]+)(?:\/[^\/]*)*$/);
  return match && match[1] ? match[1] : hrefDecoded;
}
function safeEncodeUriSegment(segment) {
  if (!segment) return "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch (e) {
  }
  return encodeURIComponent(decoded).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
function normalizeStreamUrl(baseUrl, rawPath) {
  if (!rawPath) return "";
  let fullUrl = rawPath.startsWith("http://") || rawPath.startsWith("https://") ? rawPath : `${baseUrl.replace(/\/+$/, "")}/${rawPath.replace(/^\/+/, "")}`;
  const sanitizedUrl = fullUrl.replace(/#/g, "%23");
  const match = sanitizedUrl.match(/^(https?:\/\/[^\/]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return sanitizedUrl;
  const origin = match[1];
  const pathname = match[2] || "/";
  const search = match[3] || "";
  const encodedPath = pathname.split("/").map(safeEncodeUriSegment).join("/");
  return `${origin}${encodedPath}${search}`;
}
function isVideoFile(pathOrName) {
  if (!pathOrName) return false;
  const clean = pathOrName.split("?")[0].split("#")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}
function parseQuality(name) {
  if (!name) return "HD";
  const upper = name.toUpperCase();
  if (upper.includes("2160P") || upper.includes("4K") || upper.includes("UHD")) {
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
  if (upper.includes("CAM") || upper.includes("HDCAM") || upper.includes("TELESYNC") || upper.includes("TC")) {
    return "CAM";
  }
  return "HD";
}
function extractMediaTags(name) {
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
function cleanFileName(fileName) {
  if (!fileName) return "Direct Video Stream";
  let name = fileName;
  try {
    name = decodeURIComponent(fileName);
  } catch (e) {
  }
  name = name.replace(/\.(mkv|mp4|m4v|avi|webm|ts)$/i, "");
  name = name.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  return name;
}
function generateSearchQueries(title, originalTitle) {
  const queries = /* @__PURE__ */ new Set();
  if (!title) return [];
  const cleaned = cleanTitle(title);
  if (cleaned) queries.add(cleaned);
  if (title.includes(":")) {
    const parts = title.split(":");
    if (parts[0].trim()) queries.add(cleanTitle(parts[0].trim()));
    queries.add(title.replace(/:/g, " ").replace(/\s+/g, " ").trim());
  }
  if (title.includes("&")) {
    queries.add(title.replace(/&/g, "and").replace(/\s+/g, " ").trim());
  } else if (/\band\b/i.test(title)) {
    queries.add(title.replace(/\band\b/gi, "&").replace(/\s+/g, " ").trim());
  }
  if (originalTitle && originalTitle !== title) {
    const cleanOrig = cleanTitle(originalTitle);
    if (cleanOrig && /^[\x00-\x7F]*$/.test(cleanOrig)) {
      queries.add(cleanOrig);
    }
  }
  return Array.from(queries);
}
function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
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
        }
      }
      reject(new Error(`Fetch timed out after ${timeoutMs}ms for ${url}`));
    }, timeoutMs);
    const headers = Object.assign(
      {
        "User-Agent": USER_AGENT,
        "Accept": "*/*"
      },
      options.headers || {}
    );
    options.headers = headers;
    fetch(url, options).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// src/bdix-dhakaflix/cache.js
var BoundedCache = class {
  constructor(maxEntries = 50, ttlMs = 20 * 60 * 1e3) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = /* @__PURE__ */ new Map();
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== void 0) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, {
      value,
      expiry: Date.now() + this.ttlMs
    });
  }
  clear() {
    this.map.clear();
  }
  size() {
    return this.map.size;
  }
};
var memoryCache = new BoundedCache(50, 20 * 60 * 1e3);

// src/bdix-dhakaflix/tmdb.js
function getTmdbMetadata(tmdbId, mediaType, apiKey) {
  return __async(this, null, function* () {
    if (!tmdbId || !apiKey) {
      return null;
    }
    const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    const cacheKey = `tmdb_${type}_${tmdbId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`;
    try {
      const res = yield fetchWithTimeout(url, { method: "GET" }, TMDB_TIMEOUT_MS);
      if (!res.ok) {
        console.error(`[DhakaFlix] TMDB API returned HTTP ${res.status} for ${type}/${tmdbId}`);
        return null;
      }
      const data = yield res.json();
      if (!data) return null;
      const genreIds = Array.isArray(data.genres) ? data.genres.map((g) => g.id).filter(Boolean) : Array.isArray(data.genre_ids) ? data.genre_ids : [];
      let result = null;
      if (type === "tv") {
        const year = data.first_air_date ? data.first_air_date.split("-")[0] : "";
        result = {
          title: data.name || data.original_name || "",
          original_title: data.original_name || "",
          year,
          original_language: (data.original_language || "en").toLowerCase(),
          genre_ids: genreIds
        };
      } else {
        const year = data.release_date ? data.release_date.split("-")[0] : "";
        result = {
          title: data.title || data.original_title || "",
          original_title: data.original_title || "",
          year,
          original_language: (data.original_language || "en").toLowerCase(),
          genre_ids: genreIds
        };
      }
      if (result && result.title) {
        memoryCache.set(cacheKey, result);
      }
      return result;
    } catch (error) {
      console.error(`[DhakaFlix] Failed to resolve TMDB metadata: ${error.message}`);
      return null;
    }
  });
}

// src/bdix-dhakaflix/routing.js
function routeServers(mediaType, meta) {
  const lang = (meta.original_language || "").toLowerCase();
  const genres = Array.isArray(meta.genre_ids) ? meta.genre_ids : [];
  const isAnimation = genres.includes(16);
  const allMatchingType = SERVERS.filter((s) => s.mediaTypes.includes(mediaType));
  let primaryIds = [];
  let fallbackIds = [];
  if (mediaType === "movie") {
    if (isAnimation) {
      primaryIds = ["14", "9"];
      fallbackIds = ["7"];
    } else if (lang === "en") {
      primaryIds = ["14", "7"];
      fallbackIds = [];
    } else if (["hi", "bn", "ta", "te", "ml", "kn"].includes(lang)) {
      primaryIds = ["14", "7"];
      fallbackIds = [];
    } else if (["ja", "ko", "zh"].includes(lang)) {
      primaryIds = ["7", "14"];
      fallbackIds = ["9"];
    } else {
      primaryIds = ["14", "7"];
      fallbackIds = ["9"];
    }
  } else {
    if (lang === "ko" || /korean/i.test(meta.title || "")) {
      primaryIds = ["14", "9"];
      fallbackIds = ["12"];
    } else if (isAnimation || lang === "ja") {
      primaryIds = ["9", "12"];
      fallbackIds = ["14"];
    } else {
      primaryIds = ["12"];
      fallbackIds = ["14", "9"];
    }
  }
  const primary = primaryIds.map((id) => allMatchingType.find((s) => s.id === id)).filter(Boolean);
  const fallback = fallbackIds.map((id) => allMatchingType.find((s) => s.id === id)).filter(Boolean);
  return { primary, fallback };
}

// src/bdix-dhakaflix/circuitBreaker.js
var deadHosts = /* @__PURE__ */ new Map();
var DEAD_HOST_TTL_MS = 10 * 60 * 1e3;
function isHostDead(hostUrl) {
  if (!hostUrl) return false;
  const deadUntil = deadHosts.get(hostUrl);
  if (!deadUntil) return false;
  if (Date.now() > deadUntil) {
    deadHosts.delete(hostUrl);
    return false;
  }
  return true;
}
function markHostDead(hostUrl) {
  if (!hostUrl) return;
  deadHosts.set(hostUrl, Date.now() + DEAD_HOST_TTL_MS);
}
function markHostAlive(hostUrl) {
  if (!hostUrl) return;
  deadHosts.delete(hostUrl);
}

// src/bdix-dhakaflix/h5ai.js
function getServerSearchHref(server, title) {
  if (server.id === "12" && title) {
    let clean = title.trim();
    if (/^the\s+/i.test(clean)) clean = clean.substring(4).trim();
    else if (/^a\s+/i.test(clean)) clean = clean.substring(2).trim();
    else if (/^an\s+/i.test(clean)) clean = clean.substring(3).trim();
    const firstChar = clean.charAt(0).toUpperCase();
    if (/[0-9]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series \u2605  0  \u2014  9/`;
    }
    if (/[A-L]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series \u2665  A  \u2014  L/`;
    }
    if (/[M-R]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series \u2666  M  \u2014  R/`;
    }
    if (/[S-Z]/.test(firstChar)) {
      return `/DHAKA-FLIX-12/TV-WEB-Series/TV Series \u2666  S  \u2014  Z/`;
    }
    return `/DHAKA-FLIX-12/TV-WEB-Series/`;
  }
  return `/${server.serverName}/`;
}
function executeSearchRequest(server, href, query) {
  return __async(this, null, function* () {
    const searchUrl = `${server.mainUrl}/${server.serverName}/`;
    const bodyPayload = JSON.stringify({
      action: "get",
      search: {
        href,
        pattern: query,
        ignorecase: true
      }
    });
    try {
      const res = yield fetchWithTimeout(
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
      const data = yield res.json();
      if (!data || !Array.isArray(data.search)) return [];
      markHostAlive(server.mainUrl);
      return data.search;
    } catch (error) {
      markHostDead(server.mainUrl);
      return [];
    }
  });
}
function searchServer(server, query, targetTitle = "") {
  return __async(this, null, function* () {
    if (!server || !query) return [];
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
    let results = yield executeSearchRequest(server, searchHref, query);
    if ((!results || results.length === 0) && server.id === "12" && searchHref !== `/DHAKA-FLIX-12/TV-WEB-Series/`) {
      results = yield executeSearchRequest(
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
  });
}
function fetchDirectoryEntries(server, folderHref) {
  return __async(this, null, function* () {
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
      const res = yield fetchWithTimeout(
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
      const html = yield res.text();
      const result = parseDirectoryHtml(html, folderHref);
      markHostAlive(server.mainUrl);
      memoryCache.set(cacheKey, result);
      return result;
    } catch (error) {
      markHostDead(server.mainUrl);
      return { folders: [], files: [] };
    }
  });
}
function parseDirectoryHtml(html, baseHref) {
  const folders = [];
  const files = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  let foundAnyTr = false;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    foundAnyTr = true;
    const isFolder = /alt=["']folder["']/i.test(trContent) || /class=["'][^"']*folder[^"']*["']/i.test(trContent);
    const aMatch = trContent.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;
    const rawHref = aMatch[1];
    const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();
    if (rawText === ".." || rawText === "../" || rawText.toLowerCase() === "parent directory" || rawHref === "../" || rawHref.endsWith("/../") || rawHref === baseHref) {
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
  if (!foundAnyTr || folders.length === 0 && files.length === 0) {
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch;
    while ((aMatch = aRegex.exec(html)) !== null) {
      const rawHref = aMatch[1];
      const rawText = aMatch[2].replace(/<[^>]+>/g, "").trim();
      if (rawText === ".." || rawText === "../" || rawText.toLowerCase() === "parent directory" || rawHref === "../" || rawHref.endsWith("/../")) {
        continue;
      }
      const resolvedHref = resolveRelativeHref(baseHref, rawHref);
      if (isVideoFile(resolvedHref)) {
        files.push({
          name: rawText || nameFromUrl(resolvedHref),
          href: resolvedHref
        });
      } else if (resolvedHref.endsWith("/") && !resolvedHref.includes("?C=") && !resolvedHref.includes("?N=")) {
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
var KNOWN_MEDIA_TAGS = /* @__PURE__ */ new Set([
  "tv",
  "series",
  "show",
  "shows",
  "movie",
  "movies",
  "1080p",
  "720p",
  "2160p",
  "4k",
  "uhd",
  "fhd",
  "hd",
  "sd",
  "480p",
  "bluray",
  "bdrip",
  "brrip",
  "webrip",
  "web",
  "webdl",
  "dl",
  "hdtv",
  "dvdrip",
  "cam",
  "hdcam",
  "telesync",
  "tc",
  "hevc",
  "x264",
  "x265",
  "h264",
  "h265",
  "10bit",
  "hdr",
  "hdr10",
  "dts",
  "aac",
  "ac3",
  "ddp5",
  "atmos",
  "sub",
  "esub",
  "dub",
  "dubbed",
  "dual",
  "audio",
  "multi",
  "hindi",
  "eng",
  "english",
  "bengali",
  "bangla",
  "tamil",
  "telugu",
  "pack",
  "complete",
  "repack",
  "proper",
  "extended",
  "remastered",
  "unrated",
  "directors",
  "cut",
  "season",
  "ep",
  "episode",
  "imax",
  "remux",
  "criterion",
  "mkv",
  "mp4",
  "avi",
  "m4v",
  "webm",
  "ts"
]);
var STOP_WORDS = /* @__PURE__ */ new Set(["the", "a", "an", "of", "and", "in", "to", "for", "with", "by", "part", "vol"]);
function isTitleMatch(candidateName, targetTitle, targetYear, mediaType = "movie") {
  if (!candidateName || !targetTitle) return false;
  let cleanCand = candidateName.replace(/-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)?$/, "");
  const candTokens = cleanCand.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
  const targetTokens = targetTitle.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
  const sigTarget = targetTokens.filter((t) => !STOP_WORDS.has(t));
  const reqTarget = sigTarget.length > 0 ? sigTarget : targetTokens;
  for (const token of reqTarget) {
    if (!candTokens.includes(token)) {
      return false;
    }
  }
  if (mediaType === "movie" && targetYear) {
    const yearMatches = candidateName.match(/\b(19\d{2}|20\d{2})\b/g);
    if (yearMatches && yearMatches.length > 0) {
      const tgtYear = parseInt(targetYear, 10);
      const hasCloseYear = yearMatches.some((y) => Math.abs(parseInt(y, 10) - tgtYear) <= 1);
      if (!hasCloseYear) return false;
    }
  }
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
function scoreMatch(candidateName, targetTitle, targetYear) {
  let score = 0;
  const lowerName = candidateName.toLowerCase();
  const lowerTitle = targetTitle.toLowerCase();
  if (lowerName.includes(lowerTitle)) score += 50;
  if (targetYear && lowerName.includes(targetYear)) score += 30;
  if (lowerName.includes("1080p")) score += 10;
  if (lowerName.includes("bluray")) score += 5;
  if (lowerName.includes("hevc") || lowerName.includes("x265")) score += 5;
  return score;
}
function matchesSeasonFolder(folderName, targetSeason) {
  if (!folderName) return false;
  const match = folderName.match(/(?:season|series|s)\s*0*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) === targetSeason;
  }
  return false;
}
function matchesEpisodeFile(fileName, targetSeason, targetEpisode, isInSeasonFolder = false) {
  if (!fileName) return false;
  const sxxExxMatch = fileName.match(/[sS]0*(\d+)[.\s_-]*[eE]0*(\d+)/i);
  if (sxxExxMatch) {
    const s = parseInt(sxxExxMatch[1], 10);
    const e = parseInt(sxxExxMatch[2], 10);
    return s === targetSeason && e === targetEpisode;
  }
  const xMatch = fileName.match(/\b0*(\d+)[xX]0*(\d+)\b/);
  if (xMatch) {
    const s = parseInt(xMatch[1], 10);
    const e = parseInt(xMatch[2], 10);
    return s === targetSeason && e === targetEpisode;
  }
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

// src/bdix-dhakaflix/index.js
var TMDB_API_KEY = "e80ea2a38c45dc7aaccf08b1babcd3a7";
var FALLBACK_TMDB_KEY = "e6333b32409e02a4a6eba6fb7ff866bb";
function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    try {
      if (DEBUG) {
        console.log(
          `[DhakaFlix] Request: ${mediaType} TMDB:${tmdbId}${mediaType === "tv" ? ` S:${season} E:${episode}` : ""}`
        );
      }
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
      if (!tmdbId) {
        console.error("[DhakaFlix] Error: Missing tmdbId parameter");
        return [];
      }
      const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
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
      const meta = yield getTmdbMetadata(tmdbId, type, apiKey);
      if (!meta || !meta.title) {
        console.error(`[DhakaFlix] Failed to resolve TMDB metadata for ${type} ${tmdbId}`);
        return [];
      }
      const searchQueries = generateSearchQueries(meta.title, meta.original_title);
      const { primary, fallback } = routeServers(type, meta);
      const allStreams = [];
      const seenUrls = /* @__PURE__ */ new Set();
      if (primary.length > 0) {
        const primaryPromises = primary.map(
          (server) => processServer(server, type, meta, targetSeason, targetEpisode, searchQueries)
        );
        const primaryResults = yield Promise.allSettled(primaryPromises);
        collectStreams(primaryResults, allStreams, seenUrls);
      }
      if (allStreams.length === 0 && fallback.length > 0) {
        if (DEBUG) {
          console.log(`[DhakaFlix] Primary servers returned 0 streams. Querying ${fallback.length} fallback server(s)...`);
        }
        const fallbackPromises = fallback.map(
          (server) => processServer(server, type, meta, targetSeason, targetEpisode, searchQueries)
        );
        const fallbackResults = yield Promise.allSettled(fallbackPromises);
        collectStreams(fallbackResults, allStreams, seenUrls);
      }
      if (DEBUG) console.log(`[DhakaFlix] Discovered ${allStreams.length} stream(s)`);
      return allStreams;
    } catch (error) {
      console.error(`[DhakaFlix] Unexpected error in getStreams: ${error.message}`);
      return [];
    }
  });
}
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
function processServer(server, mediaType, meta, targetSeason, targetEpisode, searchQueries) {
  return __async(this, null, function* () {
    const streams = [];
    try {
      const searchPromises = searchQueries.map((q) => searchServer(server, q, meta.title));
      const searchResults = yield Promise.allSettled(searchPromises);
      let searchItems = [];
      for (const res of searchResults) {
        if (res.status === "fulfilled" && Array.isArray(res.value)) {
          searchItems = searchItems.concat(res.value);
        }
      }
      if (searchItems.length === 0) {
        return [];
      }
      const uniqueItems = [];
      const seenHrefs = /* @__PURE__ */ new Set();
      for (const item of searchItems) {
        if (item && item.href && !seenHrefs.has(item.href)) {
          seenHrefs.add(item.href);
          uniqueItems.push(item);
        }
      }
      if (mediaType === "movie") {
        yield processMovieItems(server, uniqueItems, meta, streams);
      } else {
        yield processTvItems(
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
  });
}
function processMovieItems(server, items, meta, streams) {
  return __async(this, null, function* () {
    const candidateFolders = [];
    for (const item of items) {
      const rawName = nameFromUrl(item.href);
      if (isVideoFile(item.href)) {
        if (isTitleMatch(rawName, meta.title, meta.year, "movie")) {
          addStreamResult(server, streams, rawName, item.href);
        }
        continue;
      }
      const isFolder = item.size == null || item.href.endsWith("/");
      if (isFolder && isTitleMatch(rawName, meta.title, meta.year, "movie")) {
        candidateFolders.push({
          href: item.href,
          name: rawName,
          score: scoreMatch(rawName, meta.title, meta.year)
        });
      }
    }
    const topFolders = candidateFolders.sort((a, b) => b.score - a.score).slice(0, 3);
    if (topFolders.length > 0) {
      const dirPromises = topFolders.map((f) => fetchDirectoryEntries(server, f.href));
      const dirResults = yield Promise.allSettled(dirPromises);
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
  });
}
function processTvItems(server, items, meta, targetSeason, targetEpisode, streams) {
  return __async(this, null, function* () {
    for (const item of items) {
      if (isVideoFile(item.href)) {
        const rawName = nameFromUrl(item.href);
        if (matchesEpisodeFile(rawName, targetSeason, targetEpisode, false) && isTitleMatch(rawName, meta.title, null, "tv")) {
          addStreamResult(server, streams, rawName, item.href);
        }
      }
    }
    if (streams.length > 0) {
      return;
    }
    const matchingSeasonFolders = [];
    const candidateShowFolders = [];
    for (const item of items) {
      const isFolder = item.size == null || item.href.endsWith("/");
      if (!isFolder) continue;
      const rawName = nameFromUrl(item.href);
      if (matchesSeasonFolder(rawName, targetSeason) && isTitleMatch(item.href, meta.title, null, "tv")) {
        matchingSeasonFolders.push({ href: item.href, name: rawName });
        continue;
      }
      if (isTitleMatch(rawName, meta.title, null, "tv")) {
        candidateShowFolders.push({
          href: item.href,
          name: rawName,
          score: scoreMatch(rawName, meta.title, meta.year)
        });
      }
    }
    if (matchingSeasonFolders.length > 0) {
      const seasonPromises = matchingSeasonFolders.slice(0, 2).map(
        (sf) => fetchDirectoryEntries(server, sf.href)
      );
      const seasonResults = yield Promise.allSettled(seasonPromises);
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
    const topShowFolders = candidateShowFolders.sort((a, b) => b.score - a.score).slice(0, 2);
    if (topShowFolders.length > 0) {
      const showPromises = topShowFolders.map(
        (sf) => fetchDirectoryEntries(server, sf.href)
      );
      const showResults = yield Promise.allSettled(showPromises);
      const seasonFolderFetchPromises = [];
      for (const res of showResults) {
        if (res.status !== "fulfilled" || !res.value) continue;
        const showEntries = res.value;
        const matchingSeason = (showEntries.folders || []).find(
          (f) => matchesSeasonFolder(f.name, targetSeason)
        );
        if (matchingSeason) {
          seasonFolderFetchPromises.push(
            fetchDirectoryEntries(server, matchingSeason.href).then((sEntries) => ({
              files: sEntries.files,
              isInSeasonFolder: true
            }))
          );
        } else if ((!showEntries.folders || showEntries.folders.length === 0) && showEntries.files && showEntries.files.length > 0) {
          matchAndAddEpisode(
            server,
            streams,
            showEntries.files,
            targetSeason,
            targetEpisode,
            false
          );
        } else if (showEntries.folders && showEntries.folders.length >= targetSeason) {
          const sortedFolders = showEntries.folders.slice().sort(
            (a, b) => a.name.localeCompare(b.name, void 0, { numeric: true })
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
        const seasonResults = yield Promise.allSettled(seasonFolderFetchPromises);
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
  });
}
function matchAndAddEpisode(server, streams, files, targetSeason, targetEpisode, isInSeasonFolder) {
  for (const file of files) {
    if (matchesEpisodeFile(file.name, targetSeason, targetEpisode, isInSeasonFolder)) {
      addStreamResult(server, streams, file.name, file.href);
    }
  }
  if (streams.length === 0 && isInSeasonFolder && files.length >= targetEpisode) {
    const sortedFiles = files.slice().sort(
      (a, b) => a.name.localeCompare(b.name, void 0, { numeric: true })
    );
    const file = sortedFiles[targetEpisode - 1];
    if (file) {
      addStreamResult(server, streams, file.name, file.href);
    }
  }
}
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
    quality,
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `${server.mainUrl}/`
    }
  });
}
module.exports = { getStreams };
