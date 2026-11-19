/**
 * In-Memory Dead-Host Circuit Breaker
 * Skips unreachable or timed-out BDIX servers immediately for 10 minutes.
 */

const deadHosts = new Map();
const DEAD_HOST_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Checks if a host is currently marked as dead / unreachable.
 *
 * @param {string} hostUrl
 * @returns {boolean}
 */
export function isHostDead(hostUrl) {
  if (!hostUrl) return false;
  const deadUntil = deadHosts.get(hostUrl);
  if (!deadUntil) return false;

  if (Date.now() > deadUntil) {
    deadHosts.delete(hostUrl);
    return false;
  }
  return true;
}

/**
 * Marks a host as dead for 10 minutes after a timeout or connection failure.
 *
 * @param {string} hostUrl
 */
export function markHostDead(hostUrl) {
  if (!hostUrl) return;
  deadHosts.set(hostUrl, Date.now() + DEAD_HOST_TTL_MS);
}

/**
 * Resets host state when a request succeeds.
 *
 * @param {string} hostUrl
 */
export function markHostAlive(hostUrl) {
  if (!hostUrl) return;
  deadHosts.delete(hostUrl);
}
