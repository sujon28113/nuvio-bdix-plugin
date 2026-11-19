/**
 * TMDB v3 API Resolution Helper
 * Resolves numeric TMDB ID and mediaType ('movie' | 'tv') to canonical title, original_title, and year.
 */

import { fetchWithTimeout } from "./utils.js";

/**
 * Resolves TMDB ID to title metadata.
 *
 * @param {string|number} tmdbId
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {string} apiKey - TMDB v3 API key
 * @returns {Promise<{ title: string, original_title: string, year: string } | null>}
 */
export async function getTmdbMetadata(tmdbId, mediaType, apiKey) {
  if (!tmdbId || !apiKey) {
    return null;
  }

  const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`;

  try {
    const res = await fetchWithTimeout(url, { method: "GET" }, 8000);
    if (!res.ok) {
      console.error(`[DhakaFlix] TMDB API returned HTTP ${res.status} for ${type}/${tmdbId}`);
      return null;
    }

    const data = await res.json();
    if (!data) return null;

    if (type === "tv") {
      const year = data.first_air_date ? data.first_air_date.split("-")[0] : "";
      return {
        title: data.name || data.original_name || "",
        original_title: data.original_name || "",
        year: year
      };
    } else {
      const year = data.release_date ? data.release_date.split("-")[0] : "";
      return {
        title: data.title || data.original_title || "",
        original_title: data.original_title || "",
        year: year
      };
    }
  } catch (error) {
    console.error(`[DhakaFlix] Failed to resolve TMDB metadata: ${error.message}`);
    return null;
  }
}
