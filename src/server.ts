import Fastify from 'fastify';
import cors from '@fastify/cors';
import { movieRoutes } from './routes/movies.js';
import { tvRoutes } from './routes/tv.js';
import { searchRoutes } from './routes/search.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';

const app = Fastify({ logger: true });

app.addHook('onRequest', requestLogger);
app.setErrorHandler(errorHandler);

app.register(cors, { origin: '*' });

app.get('/health', async () => {
  return { status: 'ok', service: 'ibrax-media-api', version: '1.0.0' };
});

app.register(movieRoutes);
app.register(tvRoutes);
app.register(searchRoutes);

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on port ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();