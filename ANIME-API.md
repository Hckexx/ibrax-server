# Anime API (Jikan / MyAnimeList)

All routes are under `/api/v1/anime` and return `{ success, data, meta? }`.
Responses are normalised (`malId`, `title`, `posterUrl`, `genres[]`, ...), cached in memory, and served
stale if Jikan is down. Every Jikan call goes through one queue (about 2.4 req/s) so the server never trips
Jikan's rate limit, no matter how many phones are connected.

| Route | Notes |
|---|---|
| `GET /anime/home` | airing, season, top, popular, upcoming in one call |
| `GET /anime/airing` | `?page=` |
| `GET /anime/season/now` | current season |
| `GET /anime/season/:year/:season` | season = winter / spring / summer / fall |
| `GET /anime/top` | `?filter=airing\|upcoming\|bypopularity\|favorite&type=tv\|movie\|ova\|ona&page=` |
| `GET /anime/popular`, `/anime/upcoming` | `?page=` |
| `GET /anime/schedule` | `?day=monday` (defaults to today) |
| `GET /anime/search` | `?query=naruto&page=` |
| `GET /anime/genres`, `/anime/genre/:id` | adult genres removed |
| `GET /anime/random` | not cached |
| `GET /anime/:malId` | full details |
| `GET /anime/:malId/episodes` | all episodes; `?page=1` for one page of 100 |
| `GET /anime/:malId/recommendations` | |

## Adding another source later
1. Create `src/providers/<name>/client.ts` that returns the same normalised shapes.
2. Wrap calls in `cached(key, ttl, fetcher)` from `src/cache/cached.ts` (gives you request coalescing + stale-on-error).
3. Register a route file in `src/server.ts`.

## Operations
- `GET /health` shows uptime, cache size and whether `TMDB_API_TOKEN` is set.
- `npx tsx scripts/smoke.ts https://your-service.onrender.com` checks every important endpoint.
- Render's free plan sleeps after ~15 min without traffic. Ping `/health` every 5-10 minutes with a free
  uptime monitor (UptimeRobot, cron-job.org) to avoid slow first loads.
