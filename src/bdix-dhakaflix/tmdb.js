/**
 * TMDB v3 API Resolution Helper
 * Resolves numeric TMDB ID and mediaType ('movie' | 'tv') to canonical title,
 * original_title, year, original_language, and genre_ids.
 * Includes in-memory caching to make subsequent lookups instantaneous.
 */

import { fetchWithTimeout } from "./utils.js";
import { TMDB_TIMEOUT_MS } from "./constants.js";
import { memoryCache } from "./cache.js";

/**
 * Resolves TMDB ID to title metadata with in-memory caching.
 *
 * @param {string|number} tmdbId
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {string} apiKey - TMDB v3 API key
 * @returns {Promise<{ title: string, original_title: string, year: string, original_language: string, genre_ids: number[] } | null>}
 */
export async function getTmdbMetadata(tmdbId, mediaType, apiKey) {
  if (!tmdbId || !apiKey) {
    return null;
  }

  const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  const cacheKey = `tmdb_${type}_${tmdbId}`;

  // Check in-memory cache
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`;

  try {
    const res = await fetchWithTimeout(url, { method: "GET" }, TMDB_TIMEOUT_MS);
    if (!res.ok) {
      console.error(`[DhakaFlix] TMDB API returned HTTP ${res.status} for ${type}/${tmdbId}`);
      return null;
    }

    const data = await res.json();
    if (!data) return null;

    // Extract genre IDs from genre objects if present
    const genreIds = Array.isArray(data.genres)
      ? data.genres.map((g) => g.id).filter(Boolean)
      : Array.isArray(data.genre_ids)
      ? data.genre_ids
      : [];

    let result = null;
    if (type === "tv") {
      const year = data.first_air_date ? data.first_air_date.split("-")[0] : "";
      result = {
        title: data.name || data.original_name || "",
        original_title: data.original_name || "",
        year: year,
        original_language: (data.original_language || "en").toLowerCase(),
        genre_ids: genreIds
      };
    } else {
      const year = data.release_date ? data.release_date.split("-")[0] : "";
      result = {
        title: data.title || data.original_title || "",
        original_title: data.original_title || "",
        year: year,
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
}
