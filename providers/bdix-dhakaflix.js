/**
 * bdix-dhakaflix - Built for Nuvio
 * Generated: 2026-11-19T11:14:16.368Z
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
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var REQUEST_TIMEOUT_MS = 6e3;
var SERVERS = [
  {
    id: "14",
    name: "DhakaFlix 14",
    mainUrl: "http://172.16.50.14",
    serverName: "DHAKA-FLIX-14",
    mediaTypes: ["movie", "tv"],
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
    tvKeywords: ["TV-WEB-Series"],
    description: "Dedicated TV & Web Series Server (0-9, A-L, M-R, S-Z)"
  },
  {
    id: "7",
    name: "DhakaFlix 7",
    mainUrl: "http://172.16.50.7",
    serverName: "DHAKA-FLIX-7",
    mediaTypes: ["movie"],
    tvKeywords: [],
    description: "English & Foreign Language Movies (3D, Japanese, Korean, Bangla, etc.)"
  },
  {
    id: "9",
    name: "DhakaFlix 9",
    mainUrl: "http://172.16.50.9",
    serverName: "DHAKA-FLIX-9",
    mediaTypes: ["movie", "tv"],
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

// src/bdix-dhakaflix/tmdb.js
function getTmdbMetadata(tmdbId, mediaType, apiKey) {
  return __async(this, null, function* () {
    if (!tmdbId || !apiKey) {
      return null;
    }
    const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`;
    try {
      const res = yield fetchWithTimeout(url, { method: "GET" }, 8e3);
      if (!res.ok) {
        console.error(`[DhakaFlix] TMDB API returned HTTP ${res.status} for ${type}/${tmdbId}`);
        return null;
      }
      const data = yield res.json();
      if (!data) return null;
      if (type === "tv") {
        const year = data.first_air_date ? data.first_air_date.split("-")[0] : "";
        return {
          title: data.name || data.original_name || "",
          original_title: data.original_name || "",
          year
        };
      } else {
        const year = data.release_date ? data.release_date.split("-")[0] : "";
        return {
          title: data.title || data.original_title || "",
          original_title: data.original_title || "",
          year
        };
      }
    } catch (error) {
      console.error(`[DhakaFlix] Failed to resolve TMDB metadata: ${error.message}`);
      return null;
    }
  });
}

// src/bdix-dhakaflix/h5ai.js
function searchServer(server, query) {
  return __async(this, null, function* () {
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
      const res = yield fetchWithTimeout(searchUrl, {
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
      const data = yield res.json();
      if (!data || !Array.isArray(data.search)) {
        return [];
      }
      return data.search;
    } catch (error) {
      return [];
    }
  });
}
function fetchDirectoryEntries(server, folderHref) {
  return __async(this, null, function* () {
    const targetUrl = normalizeStreamUrl(server.mainUrl, folderHref);
    try {
      const res = yield fetchWithTimeout(targetUrl, {
        method: "GET",
        headers: {
          "Referer": `${server.mainUrl}/`,
          "User-Agent": USER_AGENT
        }
      });
      if (!res.ok) {
        return { folders: [], files: [] };
      }
      const html = yield res.text();
      return parseDirectoryHtml(html, folderHref);
    } catch (error) {
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
  "series",
  "ep",
  "episode"
]);
var STOP_WORDS = /* @__PURE__ */ new Set(["the", "a", "an", "of", "and", "in", "to", "for", "with", "by", "part", "vol"]);
function isTitleMatch(candidateName, targetTitle, targetYear, mediaType = "movie") {
  if (!candidateName || !targetTitle) return false;
  const candTokens = candidateName.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
  const targetTokens = targetTitle.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
  const sigTarget = targetTokens.filter((t) => !STOP_WORDS.has(t));
  const reqTarget = sigTarget.length > 0 ? sigTarget : targetTokens;
  for (const token of reqTarget) {
    if (!candTokens.includes(token)) {
      return false;
    }
  }
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
  let remaining = candTokens.slice();
  for (const t of targetTokens) {
    const idx = remaining.indexOf(t);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  const foreignTokens = remaining.filter((t) => {
    if (STOP_WORDS.has(t)) return false;
    if (KNOWN_MEDIA_TAGS.has(t)) return false;
    if (/^(19\d{2}|20\d{2})$/.test(t)) return false;
    if (/^[se]\d+$/i.test(t)) return false;
    if (/^\d{1,2}$/.test(t)) return false;
    return true;
  });
  return foreignTokens.length === 0;
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
      console.log(
        `[DhakaFlix] Request: ${mediaType} TMDB:${tmdbId}${mediaType === "tv" ? ` S:${season} E:${episode}` : ""}`
      );
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
      console.log(
        `[DhakaFlix] Resolved TMDB: "${meta.title}" (${meta.year || "Unknown Year"})`
      );
      const candidateServers = SERVERS.filter((s) => s.mediaTypes.includes(type));
      const searchQueries = generateSearchQueries(meta.title, meta.original_title);
      console.log(
        `[DhakaFlix] Searching ${candidateServers.length} server(s) with queries: ${JSON.stringify(
          searchQueries
        )}`
      );
      const serverPromises = candidateServers.map(
        (server) => processServer(server, type, meta, targetSeason, targetEpisode, searchQueries)
      );
      const settledResults = yield Promise.allSettled(serverPromises);
      const allStreams = [];
      const seenUrls = /* @__PURE__ */ new Set();
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
  });
}
function processServer(server, mediaType, meta, targetSeason, targetEpisode, searchQueries) {
  return __async(this, null, function* () {
    const streams = [];
    try {
      let searchItems = [];
      for (const q of searchQueries) {
        const items = yield searchServer(server, q);
        if (items.length > 0) {
          searchItems = searchItems.concat(items);
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
      console.log(`[DhakaFlix] Server ${server.name} error: ${err.message}`);
    }
    return streams;
  });
}
function processMovieItems(server, items, meta, streams) {
  return __async(this, null, function* () {
    for (const item of items) {
      const rawName = nameFromUrl(item.href);
      if (isVideoFile(item.href)) {
        if (isTitleMatch(rawName, meta.title, meta.year, "movie")) {
          addStreamResult(server, streams, rawName, item.href);
        }
        continue;
      }
      const isFolder = item.size == null || item.href.endsWith("/");
      if (isFolder) {
        if (isTitleMatch(rawName, meta.title, meta.year, "movie")) {
          const dir = yield fetchDirectoryEntries(server, item.href);
          for (const file of dir.files) {
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
      const rawName = nameFromUrl(item.href);
      if (isVideoFile(item.href)) {
        if (matchesEpisodeFile(rawName, targetSeason, targetEpisode, false) && isTitleMatch(rawName, meta.title, null, "tv")) {
          addStreamResult(server, streams, rawName, item.href);
        }
        continue;
      }
      const isFolder = item.size == null || item.href.endsWith("/");
      if (!isFolder) continue;
      if (matchesSeasonFolder(rawName, targetSeason) && isTitleMatch(item.href, meta.title, null, "tv")) {
        const seasonEntries = yield fetchDirectoryEntries(server, item.href);
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
      if (isTitleMatch(rawName, meta.title, null, "tv")) {
        const showEntries = yield fetchDirectoryEntries(server, item.href);
        const matchingSeasonFolder = showEntries.folders.find(
          (f) => matchesSeasonFolder(f.name, targetSeason)
        );
        if (matchingSeasonFolder) {
          const seasonEntries = yield fetchDirectoryEntries(
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
          matchAndAddEpisode(
            server,
            streams,
            showEntries.files,
            targetSeason,
            targetEpisode,
            false
          );
        } else if (showEntries.folders.length > 0 && targetSeason <= showEntries.folders.length) {
          const sortedFolders = showEntries.folders.slice().sort(
            (a, b) => a.name.localeCompare(b.name, void 0, { numeric: true })
          );
          const indexedFolder = sortedFolders[targetSeason - 1];
          if (indexedFolder) {
            const seasonEntries = yield fetchDirectoryEntries(
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
