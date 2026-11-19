/**
 * DhakaFlix Nuvio Provider Constants
 * Reverse-engineered from CloudStream BdixDhakaFlix extension
 */

// TMDB API Key: Configured with user's TMDB v3 API Key
export const TMDB_API_KEY = "e80ea2a38c45dc7aaccf08b1babcd3a7";

// Community reference fallback key used only if unconfigured and user enables fallback
export const FALLBACK_TMDB_KEY = "e6333b32409e02a4a6eba6fb7ff866bb";

// Standard HTTP Headers for DhakaFlix BDIX Servers
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "*/*"
};

// Network timeout for BDIX servers (fails fast if device is off-BDIX network)
export const REQUEST_TIMEOUT_MS = 6000;

// All known DhakaFlix BDIX Cluster Servers
export const SERVERS = [
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

// Video file extensions supported by Nuvio / BDIX servers
export const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".m4v", ".avi", ".webm", ".ts"];
