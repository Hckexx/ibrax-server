import { FastifyInstance } from 'fastify';
import { tmdbClient } from '../providers/tmdb/client.js';
import { cache, CACHE_TTL } from '../cache/cache.service.js';

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/v1/search', async (request, reply) => {
    const { query, page: pageStr } = request.query as any;
    const page = parseInt(pageStr || '1');

    if (!query || query.trim().length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query parameter is required' },
      });
    }

    const cacheKey = `search-${query}-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.searchMulti(query, page);
      cache.set(cacheKey, data.results, CACHE_TTL.SEARCH);
      return reply.send({
        success: true,
        data: data.results,
        meta: { page, totalPages: data.total_pages, totalResults: data.total_results },
      });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });
}