import { FastifyInstance, FastifyReply } from 'fastify';
import { cached } from '../cache/cached.js';
import { CACHE_TTL } from '../cache/cache.service.js';
import { jikanClient, UpstreamError } from '../providers/jikan/client.js';
import type { JikanPage } from '../providers/jikan/types.js';

const SEASONS = new Set(['winter', 'spring', 'summer', 'fall']);
const DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'other', 'unknown']);
const TOP_FILTERS = new Set(['airing', 'upcoming', 'bypopularity', 'favorite']);
const TOP_TYPES = new Set(['tv', 'movie', 'ova', 'special', 'ona', 'music']);

const intParam = (value: unknown, fallback: number, min: number, max: number) => {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const bad = (reply: FastifyReply, code: string, message: string) =>
  reply.status(400).send({ success: false, error: { code, message } });

export async function animeRoutes(app: FastifyInstance) {
  /** Sends a paged list: { data: AnimeItem[], meta: { page, hasNextPage } }. */
  const sendPage = (reply: FastifyReply, result: { data: JikanPage; stale: boolean }) =>
    reply.send({
      success: true,
      data: result.data.items,
      meta: {
        page: result.data.page,
        hasNextPage: result.data.hasNextPage,
        totalPages: result.data.lastPage,
        ...(result.stale ? { stale: true } : {}),
      },
    });

  // ---------- home rows ----------
  app.get('/api/v1/anime/airing', async (request, reply) => {
    const page = intParam((request.query as any).page, 1, 1, 50);
    return sendPage(reply, await cached(`anime-airing-${page}`, CACHE_TTL.ANIME_AIRING, () => jikanClient.top({ filter: 'airing', page })));
  });

  app.get('/api/v1/anime/top', async (request, reply) => {
    const q = request.query as any;
    const page = intParam(q.page, 1, 1, 50);
    const filter = TOP_FILTERS.has(q.filter) ? q.filter : undefined;
    const type = TOP_TYPES.has(q.type) ? q.type : undefined;
    return sendPage(reply, await cached(`anime-top-${filter || 'all'}-${type || 'all'}-${page}`, CACHE_TTL.ANIME_LISTS, () => jikanClient.top({ filter, type, page })));
  });

  app.get('/api/v1/anime/popular', async (request, reply) => {
    const page = intParam((request.query as any).page, 1, 1, 50);
    return sendPage(reply, await cached(`anime-popular-${page}`, CACHE_TTL.ANIME_LISTS, () => jikanClient.top({ filter: 'bypopularity', page })));
  });

  app.get('/api/v1/anime/upcoming', async (request, reply) => {
    const page = intParam((request.query as any).page, 1, 1, 50);
    return sendPage(reply, await cached(`anime-upcoming-${page}`, CACHE_TTL.ANIME_LISTS, () => jikanClient.upcoming(page)));
  });

  app.get('/api/v1/anime/season/now', async (request, reply) => {
    const page = intParam((request.query as any).page, 1, 1, 50);
    return sendPage(reply, await cached(`anime-season-now-${page}`, CACHE_TTL.ANIME_AIRING, () => jikanClient.seasonNow(page)));
  });

  app.get('/api/v1/anime/season/:year/:season', async (request, reply) => {
    const { year, season } = request.params as any;
    const y = parseInt(year, 10);
    if (!Number.isInteger(y) || y < 1960 || y > 2100) return bad(reply, 'INVALID_YEAR', 'Year must be between 1960 and 2100');
    if (!SEASONS.has(season)) return bad(reply, 'INVALID_SEASON', 'Season must be winter, spring, summer or fall');
    const page = intParam((request.query as any).page, 1, 1, 50);
    return sendPage(reply, await cached(`anime-season-${y}-${season}-${page}`, CACHE_TTL.ANIME_LISTS, () => jikanClient.season(y, season, page)));
  });

  app.get('/api/v1/anime/schedule', async (request, reply) => {
    const q = request.query as any;
    const day = String(q.day || '').toLowerCase() || ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getUTCDay()];
    if (!DAYS.has(day)) return bad(reply, 'INVALID_DAY', 'Day must be a weekday name');
    const page = intParam(q.page, 1, 1, 20);
    return sendPage(reply, await cached(`anime-schedule-${day}-${page}`, CACHE_TTL.ANIME_AIRING, () => jikanClient.schedule(day, page)));
  });

  /**
   * One request for the whole Anime tab. Handy on a cold Render instance: the app makes a
   * single call instead of five, and the server warms every row in one go.
   */
  app.get('/api/v1/anime/home', async (request, reply) => {
    const year = new Date().getUTCFullYear();
    const m = new Date().getUTCMonth();
    const season = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'fall';

    const rows = {
      airing: () => cached('anime-airing-1', CACHE_TTL.ANIME_AIRING, () => jikanClient.top({ filter: 'airing', page: 1 })),
      season: () => cached(`anime-season-${year}-${season}-1`, CACHE_TTL.ANIME_LISTS, () => jikanClient.season(year, season, 1)),
      top: () => cached('anime-top-all-all-1', CACHE_TTL.ANIME_LISTS, () => jikanClient.top({ page: 1 })),
      popular: () => cached('anime-popular-1', CACHE_TTL.ANIME_LISTS, () => jikanClient.top({ filter: 'bypopularity', page: 1 })),
      upcoming: () => cached('anime-upcoming-1', CACHE_TTL.ANIME_LISTS, () => jikanClient.upcoming(1)),
    };

    const data: Record<string, unknown> = {};
    const errors: string[] = [];
    // The Jikan client queues internally, so these run one after another within the rate limit.
    await Promise.all(
      Object.entries(rows).map(async ([name, load]) => {
        try {
          data[name] = (await load()).data.items;
        } catch {
          data[name] = [];
          errors.push(name);
        }
      }),
    );
    if (errors.length === Object.keys(rows).length) throw new UpstreamError('Anime service unavailable', 503);
    return reply.send({ success: true, data, meta: { season, year, ...(errors.length ? { errors } : {}) } });
  });

  // ---------- discovery ----------
  app.get('/api/v1/anime/search', async (request, reply) => {
    const q = request.query as any;
    const query = String(q.query || q.q || '').trim();
    if (!query) return bad(reply, 'INVALID_QUERY', 'Query parameter is required');
    const page = intParam(q.page, 1, 1, 20);
    return sendPage(reply, await cached(`anime-search-${query.toLowerCase()}-${page}`, CACHE_TTL.ANIME_SEARCH, () => jikanClient.search(query, page)));
  });

  app.get('/api/v1/anime/genres', async (_request, reply) => {
    const { data } = await cached('anime-genres', CACHE_TTL.ANIME_DETAILS, () => jikanClient.genres());
    return reply.send({ success: true, data });
  });

  app.get('/api/v1/anime/genre/:id', async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    if (!Number.isInteger(id) || id <= 0) return bad(reply, 'INVALID_GENRE', 'Genre id must be a number');
    const page = intParam((request.query as any).page, 1, 1, 50);
    return sendPage(reply, await cached(`anime-genre-${id}-${page}`, CACHE_TTL.ANIME_LISTS, () => jikanClient.byGenre(id, page)));
  });

  app.get('/api/v1/anime/random', async (_request, reply) => {
    // Not cached on purpose - every call should be a different title.
    return reply.send({ success: true, data: await jikanClient.random() });
  });

  // ---------- single title ----------
  const MAL_ID = '(\\d+)';

  app.get(`/api/v1/anime/:malId${MAL_ID}`, async (request, reply) => {
    const id = parseInt((request.params as any).malId, 10);
    const { data, stale } = await cached(`anime-${id}`, CACHE_TTL.ANIME_DETAILS, () => jikanClient.details(id));
    return reply.send({ success: true, data, ...(stale ? { meta: { stale: true } } : {}) });
  });

  app.get(`/api/v1/anime/:malId${MAL_ID}/episodes`, async (request, reply) => {
    const id = parseInt((request.params as any).malId, 10);
    const q = request.query as any;

    // ?page=N returns just that page (100 episodes). Without it, the full list is returned.
    if (q.page !== undefined) {
      const page = intParam(q.page, 1, 1, 50);
      const { data, stale } = await cached(`anime-eps-${id}-p${page}`, CACHE_TTL.ANIME_EPISODES, () => jikanClient.episodesPage(id, page));
      return reply.send({ success: true, data: data.items, meta: { page, hasNextPage: data.hasNextPage, ...(stale ? { stale: true } : {}) } });
    }

    const { data, stale } = await cached(`anime-eps-${id}`, CACHE_TTL.ANIME_EPISODES, () => jikanClient.allEpisodes(id));
    return reply.send({ success: true, data, meta: { total: data.length, ...(stale ? { stale: true } : {}) } });
  });

  app.get(`/api/v1/anime/:malId${MAL_ID}/recommendations`, async (request, reply) => {
    const id = parseInt((request.params as any).malId, 10);
    const { data } = await cached(`anime-rec-${id}`, CACHE_TTL.ANIME_DETAILS, () => jikanClient.recommendations(id));
    return reply.send({ success: true, data });
  });
}
