import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { movieRoutes } from './routes/movies.js';
import { tvRoutes } from './routes/tv.js';
import { searchRoutes } from './routes/search.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

const app = Fastify({ logger: true });

app.addHook('onRequest', requestLogger);
app.setErrorHandler(errorHandler);

app.register(cors, { origin: config.cors.origins });
app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

app.get('/health', async () => {
  return { status: 'ok', service: 'ibrax-media-api', version: '1.0.0' };
});

app.register(movieRoutes);
app.register(tvRoutes);
app.register(searchRoutes);

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`IBRAX Media API running on http://0.0.0.0:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();