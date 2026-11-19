/**
 * Smart Server Routing Engine
 * Maps TMDB mediaType, language, and genre metadata to specific DhakaFlix servers,
 * avoiding wasted HTTP requests and dead-server delays.
 */

import { SERVERS } from "./constants.js";

/**
 * Returns an ordered array of server objects to query based on mediaType,
 * TMDB original_language, and genre_ids.
 *
 * @param {string} mediaType - "movie" | "tv"
 * @param {object} meta - { original_language, genre_ids, title }
 * @returns {{ primary: Array<object>, fallback: Array<object> }}
 */
export function routeServers(mediaType, meta) {
  const lang = (meta.original_language || "").toLowerCase();
  const genres = Array.isArray(meta.genre_ids) ? meta.genre_ids : [];
  const isAnimation = genres.includes(16);

  const allMatchingType = SERVERS.filter((s) => s.mediaTypes.includes(mediaType));

  let primaryIds = [];
  let fallbackIds = [];

  if (mediaType === "movie") {
    // DhakaFlix Movie Servers:
    // Server 14: English (1080p), Hindi, South Indian, Animation
    // Server 7: English (1080p), 3D, Foreign Language (Japanese, Korean, Bangla, Pakistani, Chinese)
    // Server 9: Anime Movies & Documentaries

    if (isAnimation) {
      // Animation / Anime movie
      primaryIds = ["14", "9"];
      fallbackIds = ["7"];
    } else if (lang === "en") {
      // Hollywood / English movie
      primaryIds = ["14", "7"];
      fallbackIds = []; // No need to query Server 9 for English blockbuster movies
    } else if (["hi", "bn", "ta", "te", "ml", "kn"].includes(lang)) {
      // Subcontinent / Hindi / South Indian / Bangla
      primaryIds = ["14", "7"];
      fallbackIds = [];
    } else if (["ja", "ko", "zh"].includes(lang)) {
      // Foreign language
      primaryIds = ["7", "14"];
      fallbackIds = ["9"];
    } else {
      primaryIds = ["14", "7"];
      fallbackIds = ["9"];
    }
  } else {
    // DhakaFlix TV Series Servers:
    // Server 12: Dedicated Western & Global TV/WEB-Series (0-9, A-L, M-R, S-Z)
    // Server 14: Korean TV & WEB Series
    // Server 9: Anime & Cartoon TV Series, Korean TV, WWE & TV Specials

    if (lang === "ko" || /korean/i.test(meta.title || "")) {
      // Korean Drama / Web Series
      primaryIds = ["14", "9"];
      fallbackIds = ["12"];
    } else if (isAnimation || lang === "ja") {
      // Anime & Cartoon series
      primaryIds = ["9", "12"];
      fallbackIds = ["14"];
    } else {
      // General TV-WEB-Series (English, HBO, Netflix, AMC, BBC, etc.)
      // Server 12 holds the complete catalog
      primaryIds = ["12"];
      fallbackIds = ["14", "9"];
    }
  }

  const primary = primaryIds
    .map((id) => allMatchingType.find((s) => s.id === id))
    .filter(Boolean);

  const fallback = fallbackIds
    .map((id) => allMatchingType.find((s) => s.id === id))
    .filter(Boolean);

  return { primary, fallback };
}
