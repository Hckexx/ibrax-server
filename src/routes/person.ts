import { FastifyInstance } from 'fastify';
import { tmdbClient } from '../providers/tmdb/client.js';
import { cache, CACHE_TTL } from '../cache/cache.service.js';

export async function personRoutes(app: FastifyInstance) {
  app.get('/api/v1/person/:id', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `person-${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getPerson(parseInt(id));
      cache.set(cacheKey, data, CACHE_TTL.DETAILS);
      return reply.send({ success: true, data });
    } catch (e: any) { throw e; }
  });

  app.get('/api/v1/person/:id/movie-credits', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `person-movie-${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getPersonCredits(parseInt(id), 'movie');
      cache.set(cacheKey, data.cast || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.cast || [] });
    } catch (e: any) { throw e; }
  });

  app.get('/api/v1/person/:id/tv-credits', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `person-tv-${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getPersonCredits(parseInt(id), 'tv');
      cache.set(cacheKey, data.cast || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.cast || [] });
    } catch (e: any) { throw e; }
  });
}