import { jikanClient, UpstreamError } from '../jikan/client.js';
import { aniListClient } from '../anilist/client.js';

/**
 * One anime client for the routes. Jikan (MyAnimeList) is the main source; when it is down or
 * unreachable, the same call is answered by AniList instead. Not-found / bad-request errors are
 * NOT retried elsewhere, they are real answers.
 *
 * A small circuit breaker avoids paying Jikan's retry delays on every request while it is down:
 * after a failure Jikan is skipped (AniList goes first) for BREAKER_MS, then tried again.
 */
const BREAKER_MS = 2 * 60 * 1000;
let jikanDownUntil = 0;

const isUpstreamDown = (error: unknown) =>
  !(error instanceof UpstreamError) || error.statusCode >= 500;

async function withFallback<T>(primary: () => Promise<T>, backup: () => Promise<T>): Promise<T> {
  const jikanFirst = Date.now() >= jikanDownUntil;
  const [first, second] = jikanFirst ? [primary, backup] : [backup, primary];

  try {
    const result = await first();
    if (jikanFirst) jikanDownUntil = 0;
    return result;
  } catch (firstError) {
    if (!isUpstreamDown(firstError)) throw firstError;
    if (jikanFirst) jikanDownUntil = Date.now() + BREAKER_MS;
    try {
      return await second();
    } catch (secondError) {
      if (!jikanFirst) jikanDownUntil = 0; // both failed: go back to trying Jikan first
      throw isUpstreamDown(secondError) ? firstError : secondError;
    }
  }
}

type Top = Parameters<typeof jikanClient.top>[0];

export const animeClient = {
  top: (opts?: Top) => withFallback(() => jikanClient.top(opts), () => aniListClient.top(opts)),
  seasonNow: (page = 1) => withFallback(() => jikanClient.seasonNow(page), () => aniListClient.seasonNow(page)),
  season: (year: number, season: string, page = 1) =>
    withFallback(() => jikanClient.season(year, season, page), () => aniListClient.season(year, season, page)),
  upcoming: (page = 1) => withFallback(() => jikanClient.upcoming(page), () => aniListClient.upcoming(page)),
  schedule: (day: string, page = 1) =>
    withFallback(() => jikanClient.schedule(day, page), () => aniListClient.schedule(day, page)),
  search: (query: string, page = 1) =>
    withFallback(() => jikanClient.search(query, page), () => aniListClient.search(query, page)),
  byGenre: (genreId: number, page = 1) =>
    withFallback(() => jikanClient.byGenre(genreId, page), () => aniListClient.byGenre(genreId, page)),
  genres: () => withFallback(() => jikanClient.genres(), () => aniListClient.genres()),
  details: (malId: number) => withFallback(() => jikanClient.details(malId), () => aniListClient.details(malId)),
  random: () => withFallback(() => jikanClient.random(), () => aniListClient.random()),
  recommendations: (malId: number) =>
    withFallback(() => jikanClient.recommendations(malId), () => aniListClient.recommendations(malId)),
  episodesPage: (malId: number, page: number) =>
    withFallback(() => jikanClient.episodesPage(malId, page), () => aniListClient.episodesPage(malId, page)),
  allEpisodes: (malId: number) =>
    withFallback(() => jikanClient.allEpisodes(malId), () => aniListClient.allEpisodes(malId)),
};
