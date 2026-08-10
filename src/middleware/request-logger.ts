import { FastifyReply, FastifyRequest } from 'fastify';

export async function requestLogger(request: FastifyRequest, reply: FastifyReply) {
  const start = Date.now();
  
  reply.header('X-Request-Id', request.id);
  
  reply.then(() => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: Date.now() - start,
      requestId: request.id,
    }, 'request completed');
  }, () => {});
}