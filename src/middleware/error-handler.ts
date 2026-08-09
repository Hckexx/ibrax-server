import { FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);
  
  const statusCode = (error as any).statusCode || 500;
  
  reply.status(statusCode).send({
    success: false,
    error: {
      code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'Internal server error' : error.message,
    },
  });
}