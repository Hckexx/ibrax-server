import { cache } from './cache.service.js';

const inflight = new Map<string, Promise<{ data: any; stale: boolean }>>();

/**
 * Cache-aside helper with two protections the plain cache does not give you:
 *  1. Request coalescing - ten phones asking for the same row at once cause ONE upstream call.
 *  2. Stale-on-error - if the upstream API fails, the last known value is served instead of an error.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; stale: boolean }> {
  const fresh = cache.get<T>(key);
  if (fresh !== null) return { data: fresh, stale: false };

  const pending = inflight.get(key);
  if (pending) return pending as Promise<{ data: T; stale: boolean }>;

  const job = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, data, ttlMs);
      return { data, stale: false };
    } catch (error) {
      const old = cache.peek<T>(key);
      if (old !== null) return { data: old, stale: true };
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}
