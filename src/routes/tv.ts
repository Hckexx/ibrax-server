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
    app.get('/api/v1/tv/genres', async (request, reply) => {
    const cacheKey = 'tv-genres';
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });

    try {
      const data = await tmdbClient.getGenres('tv');
      cache.set(cacheKey, data.genres || [], CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.genres || [] });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });

  app.get('/api/v1/discover/tv', async (request, reply) => {
    const { with_genres, page: pageStr } = request.query as any;
    const page = parseInt(pageStr || '1');
    const cacheKey = `discover-tv-${with_genres || 'all'}-${page}`;
    
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached, meta: { page } });

    try {
      const params: Record<string, string> = { page: page.toString(), sort_by: 'popularity.desc' };
      if (with_genres) params.with_genres = with_genres;
      
      const data = await tmdbClient.discoverTV(params);
      cache.set(cacheKey, data.results, CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.results, meta: { page, totalPages: data.total_pages } });
    } catch (error: any) {
      const stale = cache.get(cacheKey);
      if (stale) return reply.send({ success: true, data: stale, cached: true });
      throw error;
    }
  });
    // Trending Day
  app.get('/api/v1/trending/tv/day', async (request, reply) => {
    const cacheKey = 'trending-tv-day';
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getTrendingDay('tv');
      cache.set(cacheKey, data.results, CACHE_TTL.TRENDING);
      return reply.send({ success: true, data: data.results });
    } catch (e: any) { throw e; }
  });

  // Recommendations
  app.get('/api/v1/tv/:id/recommendations', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-rec-${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getRecommendations('tv', parseInt(id));
      cache.set(cacheKey, data.results?.slice(0, 10) || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.results?.slice(0, 10) || [] });
    } catch (e: any) { throw e; }
  });

  // Reviews
  app.get('/api/v1/tv/:id/reviews', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-reviews-${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getReviews('tv', parseInt(id));
      cache.set(cacheKey, data.results || [], CACHE_TTL.DETAILS);
      return reply.send({ success: true, data: data.results || [] });
    } catch (e: any) { throw e; }
  });

  // Images
  app.get('/api/v1/tv/:id/images', async (request, reply) => {
    const { id } = request.params as any;
    const cacheKey = `tv-images-${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getImages('tv', parseInt(id));
      cache.set(cacheKey, data, CACHE_TTL.DETAILS);
      return reply.send({ success: true, data });
    } catch (e: any) { throw e; }
  });

  // Episode details
  app.get('/api/v1/tv/:id/season/:season/episode/:episode', async (request, reply) => {
    const { id, season, episode } = request.params as any;
    const cacheKey = `episode-${id}-${season}-${episode}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.getEpisodeDetails(parseInt(id), parseInt(season), parseInt(episode));
      cache.set(cacheKey, data, CACHE_TTL.SEASONS);
      return reply.send({ success: true, data });
    } catch (e: any) { throw e; }
  });

  // Discover with filters
  app.get('/api/v1/discover/tv/filter', async (request, reply) => {
    const params = request.query as Record<string, string>;
    const cacheKey = `disc-tv-filter-${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return reply.send({ success: true, data: cached });
    try {
      const data = await tmdbClient.discoverWithFilters('tv', params);
      cache.set(cacheKey, data.results, CACHE_TTL.POPULAR);
      return reply.send({ success: true, data: data.results, meta: { totalPages: data.total_pages } });
    } catch (e: any) { throw e; }
  });
}