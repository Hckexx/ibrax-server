/**
 * Quick health check for a running server.
 *   npx tsx scripts/smoke.ts                       -> http://localhost:3000
 *   npx tsx scripts/smoke.ts https://ibrax-server.onrender.com
 * Prints OK / FAIL per endpoint with timing. Exit code 1 if anything fails.
 */
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

const checks: Array<{ name: string; path: string; expect: (json: any) => boolean }> = [
  { name: 'health', path: '/health', expect: (j) => j.status === 'ok' },
  { name: 'movies trending', path: '/api/v1/trending/movies', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
  { name: 'tv popular', path: '/api/v1/tv/popular', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
  { name: 'movie genre discover', path: '/api/v1/discover/movie?with_genres=28', expect: (j) => Array.isArray(j.data) },
  { name: 'anime airing', path: '/api/v1/anime/airing', expect: (j) => Array.isArray(j.data) && j.data.length > 0 && !!j.data[0].malId },
  { name: 'anime season now', path: '/api/v1/anime/season/now', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
  { name: 'anime top', path: '/api/v1/anime/top', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
  { name: 'anime details (Frieren 52991)', path: '/api/v1/anime/52991', expect: (j) => j.data?.malId === 52991 },
  { name: 'anime episodes', path: '/api/v1/anime/52991/episodes', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
  { name: 'anime search', path: '/api/v1/anime/search?query=naruto', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
  { name: 'anime mapping loaded', path: '/health', expect: (j) => (j.animeMap?.entries ?? 0) > 1000 },
  { name: 'map One Piece -> TMDB 37854', path: '/api/v1/anime/21/tmdb?episode=1', expect: (j) => j.data?.tmdbId === 37854 },
  { name: 'map Naruto -> TMDB 46260', path: '/api/v1/anime/20/tmdb?episode=1', expect: (j) => j.data?.tmdbId === 46260 },
  { name: 'anime genres', path: '/api/v1/anime/genres', expect: (j) => Array.isArray(j.data) && j.data.length > 0 },
];

(async () => {
  let failed = 0;
  for (const check of checks) {
    const started = Date.now();
    try {
      const response = await fetch(`${base}${check.path}`, { signal: AbortSignal.timeout(60_000) });
      const json: any = await response.json().catch(() => ({}));
      const ok = response.ok && check.expect(json);
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${check.name.padEnd(30)} ${response.status} ${Date.now() - started}ms`);
      if (!ok) failed += 1;
    } catch (error: any) {
      console.log(`FAIL ${check.name.padEnd(30)} ${error?.message ?? error}`);
      failed += 1;
    }
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
