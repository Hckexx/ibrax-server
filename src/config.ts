export const config = {
  port: parseInt(process.env.PORT || '3000'),
  tmdb: {
    apiToken: process.env.TMDB_API_TOKEN || '',
    baseUrl: 'https://api.themoviedb.org/3',
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '3600'),
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || '*').split(','),
  },
};