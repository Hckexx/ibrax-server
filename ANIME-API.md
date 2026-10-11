# Anime API (Jikan / MyAnimeList, with AniList backup)

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

## AniList backup (v1.2)

Jikan is the primary source. If it is unreachable or returns a 5xx, the server answers from AniList instead
and stops trying Jikan for 2 minutes (circuit breaker), so requests stay fast. 404/400 from Jikan are real
answers and are never retried on AniList. `GET /health` lists `animeSources`.

Differences when AniList answers:
- Only titles that have a MAL id are returned, so every `malId` still works with the players.
- Adult titles (isAdult / Hentai / Ecchi) are dropped.
- Episode lists are generated (1..N); no per-episode titles, filler or recap flags.
- Scores come from AniList (`averageScore / 10`) and can differ slightly from MAL.

## Adding another source later
1. Create `src/providers/<name>/client.ts` that returns the same normalised shapes.
2. Wrap calls in `cached(key, ttl, fetcher)` from `src/cache/cached.ts` (gives you request coalescing + stale-on-error).
3. Register a route file in `src/server.ts`.

## MAL -> TMDB (v1.3)

`GET /api/v1/anime/:malId/tmdb?episode=N` tells the app which TMDB title, season and episode to stream.

```json
{ "success": true, "data": { "tmdbId": 1429, "mediaType": "tv", "season": 2, "episode": 1, "title": "Attack on Titan", "source": "mapping" } }
```
Errors (`success:false`): `NO_MAPPING` 404, `LOW_CONFIDENCE` 404, `EPISODE_OUT_OF_RANGE` 404, `MAPPING_UNAVAILABLE` 503 (list still loading), `TMDB_UNAVAILABLE` 502.

How it stays safe:
1. The MAL -> TMDB pairs come from the community `Fribb/anime-lists` dataset (loaded at boot, refreshed daily). No title searching.
2. Every pairing is checked: the TMDB name/original name must resemble the MAL title (or the Japanese title) and the years must not conflict. A failed check returns `LOW_CONFIDENCE` and is logged (`anime mapping rejected`) so you can fix it.
3. A known season is trusted; an episode past its end is "out of range", never guessed into another season. Absolute numbering is only used when the dataset has no season for that entry.
4. `data/anime-overrides.json` (project root) beats everything: add `"<malId>": { "tmdbId": 63926, "mediaType": "tv", "season": 1 }` and redeploy. Optional `episodeOffset` and `"absolute": true`.

Env: `ANIME_MAP_URL` overrides the dataset URL.

## Operations
- `GET /health` shows uptime, cache size and whether `TMDB_API_TOKEN` is set.
- `npx tsx scripts/smoke.ts https://your-service.onrender.com` checks every important endpoint.
- Render's free plan sleeps after ~15 min without traffic. Ping `/health` every 5-10 minutes with a free
  uptime monitor (UptimeRobot, cron-job.org) to avoid slow first loads.


## Mapping diagnostics (v1.4)
`GET /health` -> `animeMap` shows `entries`, `source` (`bundled` or the URL used), `lastError`, per-URL `attempts`, and `skipped` (rows ignored and why).
If `entries` is 0, read `lastError`/`attempts`. For a guaranteed start, put a copy of the list at `data/anime-list-full.json` (see `data/README.md`).
