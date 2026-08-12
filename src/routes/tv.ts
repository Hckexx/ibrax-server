import { FastifyInstance } from 'fastify';
import { tmdbClient } from '../providers/tmdb/client.js';
import { cache, CACHE_TTL } from '../cache/cache.service.js';

export async function tvRoutes(app: FastifyInstance) {
  app.get('/api/v1/trending/tv', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `trending-tv-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getTrending('tv', page);
      cache.set(cacheKey, data.results, CACHE_TTL.TRENDING);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });

  app.get('/api/v1/tv/popular', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `popular-tv-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getPopular('tv', page);
      cache.set(cacheKey, data.results, CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });

  app.get('/api/v1/tv/top-rated', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `top-rated-tv-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getTopRated('tv', page);
      cache.set(cacheKey, data.results, CACHE_TTL.TOP_RATED);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });

  app.get('/api/v1/tv/:id', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getDetails('tv', parseInt(id));
      cache.set(cacheKey, data, CACHE_TTL.DETAILS);
      return reply.send({ success: true, data });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });

  app.get('/api/v1/tv/:id/credits', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-credits-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getCredits('tv', parseInt(id));
      cache.set(cacheKey, data, CACHE_TTL.DETAILS);
      return reply.send({ success: true, data });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });

  app.get('/api/v1/tv/:id/season/:season', async (request, reply) => {
    const { id, season } = request.params as any;
    const cacheKey = `season-${id}-${season}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getSeasonDetails(parseInt(id), parseInt(season));
      cache.set(cacheKey, data, CACHE_TTL.SEASONS);
      return reply.send({ success: true, data });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });

      // Similar TV
  app.get('/api/v1/tv/:id/similar', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-similar-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getSimilar('tv', parseInt(id));
      cache.set(cacheKey, data.results?.slice(0, 10) || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.results?.slice(0, 10) || [] });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });
      app.get('/api/v1/tv/:id/videos', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-videos-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getVideos('tv', parseInt(id));
      cache.set(cacheKey, data.results || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.results || [] });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });
    app.get('/api/v1/tv/airing-today', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `airing-today-tv-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getAiringToday(page);
      cache.set(cacheKey, data.results, CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });
}