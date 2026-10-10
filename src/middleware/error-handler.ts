import { FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);
  
  const statusCode = (error as any).statusCode || 500;
  
  reply.status(statusCode).send({
    success: false,
    error: {
      code:
        statusCode === 404 ? 'NOT_FOUND'
        : statusCode === 400 ? 'BAD_REQUEST'
        : statusCode >= 502 && statusCode <= 504 ? 'UPSTREAM_ERROR'
        : 'INTERNAL_ERROR',
      message: statusCode === 500 ? 'Internal server error' : error.message,
    },
  });
}