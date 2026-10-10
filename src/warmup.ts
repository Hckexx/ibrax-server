import { FastifyBaseLogger } from 'fastify';
import { cached } from './cache/cached.js';
import { CACHE_TTL } from './cache/cache.service.js';
import { tmdbClient } from './providers/tmdb/client.js';
import { animeClient } from './providers/anime/index.js';

/**
 * Runs once after boot. Failures are only logged - warming is a nice-to-have.
 * Cache keys match the route handlers so the first real request is a cache hit.
 */
export async function warmCache(log: FastifyBaseLogger) {
  const tmdbJobs: Array<[string, () => Promise<any>]> = [
    ['trending-movies-1', () => tmdbClient.getTrending('movie', 1).then((d) => d.results)],
    ['trending-tv-1', () => tmdbClient.getTrending('tv', 1).then((d) => d.results)],
    ['popular-movies-1', () => tmdbClient.getPopular('movie', 1).then((d) => d.results)],
    ['popular-tv-1', () => tmdbClient.getPopular('tv', 1).then((d) => d.results)],
  ];
  const ttl: Record<string, number> = { 'trending-movies-1': CACHE_TTL.TRENDING, 'trending-tv-1': CACHE_TTL.TRENDING };

  for (const [key, load] of tmdbJobs) {
    try {
      await cached(key, ttl[key] ?? CACHE_TTL.POPULAR, load);
    } catch (error: any) {
      log.warn({ key, message: error?.message }, 'warmup (tmdb) skipped');
    }
  }

  const animeJobs: Array<[string, number, () => Promise<any>]> = [
    ['anime-airing-1', CACHE_TTL.ANIME_AIRING, () => animeClient.top({ filter: 'airing', page: 1 })],
    ['anime-top-all-all-1', CACHE_TTL.ANIME_LISTS, () => animeClient.top({ page: 1 })],
    ['anime-popular-1', CACHE_TTL.ANIME_LISTS, () => animeClient.top({ filter: 'bypopularity', page: 1 })],
    ['anime-upcoming-1', CACHE_TTL.ANIME_LISTS, () => animeClient.upcoming(1)],
  ];
  for (const [key, ttlMs, load] of animeJobs) {
    try {
      await cached(key, ttlMs, load);
    } catch (error: any) {
      log.warn({ key, message: error?.message }, 'warmup (anime) skipped');
    }
  }
  log.info('cache warm-up finished');
}
