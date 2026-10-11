import Fastify from 'fastify';
import cors from '@fastify/cors';
import { movieRoutes } from './routes/movies.js';
import { tvRoutes } from './routes/tv.js';
import { searchRoutes } from './routes/search.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { personRoutes } from './routes/person.js';
import { animeRoutes } from './routes/anime.js';
import { cache } from './cache/cache.service.js';
import { warmCache } from './warmup.js';
import rateLimit from '@fastify/rate-limit';
import { loadAnimeMap, loadBundledMap, mappingStatus } from './providers/anime-map/list.js';

const app = Fastify({ logger: true });

app.addHook('onRequest', requestLogger);
app.setErrorHandler(errorHandler);

app.register(cors, { origin: '*' });
// Per-IP limit: generous for real use, stops one client from burning the TMDB/Jikan quota.
app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  allowList: (req) => req.url === '/health',
  errorResponseBuilder: () => ({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down for a moment.' },
  }),
});

app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'ibrax-media-api',
    version: '1.4.0',
    uptimeSeconds: Math.round(process.uptime()),
    cacheEntries: cache.size,
    // Tells you at a glance if the Render env var is missing (never prints the token itself).
    tmdbTokenConfigured: Boolean(process.env.TMDB_API_TOKEN),
    features: ['movies', 'tv', 'search', 'person', 'anime'],
    animeSources: ['jikan', 'anilist'],
    animeMap: mappingStatus(),
  };
});

app.register(movieRoutes);
app.register(tvRoutes);
app.register(searchRoutes);
app.register(personRoutes);
app.register(animeRoutes);

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on port ${port}`);
    // Fill the cache in the background so the first user after a cold start is not waiting on TMDB/Jikan.
    void warmCache(app.log);
    // Bundled copy first (instant), then refresh from the network in the background.
    loadBundledMap(app.log);
    void loadAnimeMap(app.log);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();