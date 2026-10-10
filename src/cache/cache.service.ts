interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const MAX_ENTRIES = 3000;

class MemoryCache {
  private store: Map<string, CacheEntry<any>> = new Map();

  /** Fresh value only. Expired entries return null (but are kept for `peek`). */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) return null;
    return entry.data;
  }

  /** Value even if expired - used to keep serving data while an upstream API is down. */
  peek<T>(key: string): T | null {
    const entry = this.store.get(key);
    return entry ? entry.data : null;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.delete(key); // re-insert so the oldest keys stay first
    this.store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
    this.evict();
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /** Keeps memory bounded on small hosts: drop the oldest entries first. */
  private evict(): void {
    if (this.store.size <= MAX_ENTRIES) return;
    const excess = this.store.size - MAX_ENTRIES + 200;
    let removed = 0;
    for (const key of this.store.keys()) {
      this.store.delete(key);
      if (++removed >= excess) break;
    }
  }
}

export const cache = new MemoryCache();

export const CACHE_TTL = {
  TRENDING: 15 * 60 * 1000,
  POPULAR: 60 * 60 * 1000,
  TOP_RATED: 6 * 60 * 60 * 1000,
  DETAILS: 6 * 60 * 60 * 1000,
  SEARCH: 10 * 60 * 1000,
  SEASONS: 12 * 60 * 60 * 1000,
  // Anime (Jikan is slow and strictly rate limited, so cache harder)
  ANIME_AIRING: 30 * 60 * 1000,
  ANIME_LISTS: 6 * 60 * 60 * 1000,
  ANIME_DETAILS: 12 * 60 * 60 * 1000,
  ANIME_EPISODES: 3 * 60 * 60 * 1000,
  ANIME_SEARCH: 15 * 60 * 1000,
};
