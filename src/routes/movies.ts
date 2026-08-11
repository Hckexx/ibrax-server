import { FastifyInstance } from 'fastify';
import { tmdbClient } from '../providers/tmdb/client.js';
import { cache, CACHE_TTL } from '../cache/cache.service.js';

export async function movieRoutes(app: FastifyInstance) {
  app.get('/api/v1/trending/movies', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `trending-movies-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getTrending('movie', page);
      cache.set(cacheKey, data.results, CACHE_TTL.TRENDING);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });

  app.get('/api/v1/movies/popular', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `popular-movies-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getPopular('movie', page);
      cache.set(cacheKey, data.results, CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });

  app.get('/api/v1/movies/top-rated', async (request, reply) => {
    const page = parseInt((request.query as any).page || '1');
    const cacheKey = `top-rated-movies-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const data = await tmdbClient.getTopRated('movie', page);
      cache.set(cacheKey, data.results, CACHE_TTL.TOP_RATED);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });

  app.get('/api/v1/movies/:id', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `movie-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getDetails('movie', parseInt(id));
      cache.set(cacheKey, data, CACHE_TTL.DETAILS);
      return reply.send({ success: true, data });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });

  app.get('/api/v1/movies/:id/credits', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `movie-credits-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getCredits('movie', parseInt(id));
      cache.set(cacheKey, data, CACHE_TTL.DETAILS);
      return reply.send({ success: true, data });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });

    // Similar movies
  app.get('/api/v1/movies/:id/similar', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `movie-similar-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getSimilar('movie', parseInt(id));
      cache.set(cacheKey, data.results?.slice(0, 10) || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.results?.slice(0, 10) || [] });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });
    app.get('/api/v1/movies/:id/videos', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `movie-videos-${id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getVideos('movie', parseInt(id));
      cache.set(cacheKey, data.results || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.results || [] });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });
    app.get('/api/v1/discover/movies', async (request, reply) => {
    const { genre, page: pageStr } = request.query as any;
    const page = parseInt(pageStr || '1');
    const cacheKey = `discover-movies-${genre || 'all'}-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const params: Record<string, string> = { page: page.toString(), sort_by: 'popularity.desc' };
      if (genre) params.with_genres = genre;
      
      const data = await tmdbClient.request<any>('/discover/movie', params);
      cache.set(cacheKey, data.results, CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, meta: { page, cached: true } });
      throw error;
    }
  });
}