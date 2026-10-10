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

const app = Fastify({ logger: true });

app.addHook('onRequest', requestLogger);
app.setErrorHandler(errorHandler);

app.register(cors, { origin: '*' });

app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'ibrax-media-api',
    version: '1.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    cacheEntries: cache.size,
    // Tells you at a glance if the Render env var is missing (never prints the token itself).
    tmdbTokenConfigured: Boolean(process.env.TMDB_API_TOKEN),
    features: ['movies', 'tv', 'search', 'person', 'anime'],
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
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();