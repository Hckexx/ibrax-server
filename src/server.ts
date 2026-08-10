import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

app.register(cors, { origin: '*' });

app.get('/health', async () => {
  return { status: 'ok', service: 'ibrax-media-api' };
});

app.get('/api/v1/test', async () => {
  return { success: true, message: 'API is working!' };
});

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