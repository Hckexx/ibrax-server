interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private store: Map<string, CacheEntry<any>> = new Map();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
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
}

export const cache = new MemoryCache();

export const CACHE_TTL = {
  TRENDING: 15 * 60 * 1000,
  POPULAR: 60 * 60 * 1000,
  TOP_RATED: 6 * 60 * 60 * 1000,
  DETAILS: 6 * 60 * 60 * 1000,
  SEARCH: 10 * 60 * 1000,
  SEASONS: 12 * 60 * 60 * 1000,
};