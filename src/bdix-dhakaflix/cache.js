/**
 * Bounded In-Memory Cache with TTL & LRU eviction
 * Lightweight, zero dependencies, QuickJS / Hermes safe.
 */

export class BoundedCache {
  constructor(maxEntries = 50, ttlMs = 20 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.map.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest entry (first item in Map keys iterator)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
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
}

// Global shared cache instance for the provider lifecycle
export const memoryCache = new BoundedCache(50, 20 * 60 * 1000);
