import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MAL id -> TMDB id mapping, loaded from the community "Fribb/anime-lists" dataset and refreshed daily.
 * Kept in memory (a few MB). Until the first load succeeds, lookups report "mapping unavailable".
 */
export type MapEntry = {
  malId: number;
  tmdbId: number;
  kind: 'tv' | 'movie';
  /** TMDB season this MAL entry corresponds to, when the list knows it. */
  season?: number;
};

/** Tried in order. The CDN mirrors cover GitHub raw being slow or blocked. Override with ANIME_MAP_URL. */
const DEFAULT_URLS = [
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json',
  'https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-full.json',
  'https://fastly.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-full.json',
];
// "full" carries the TMDB ids; the "mini" file does not.
const BUNDLED_FILES = ['data/anime-list-full.json', 'data/anime-list-mini.json'];
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 3 * 60 * 1000;
const TIMEOUT_MS = 60_000;
const MIN_ENTRIES = 1000;

let entries = new Map<number, MapEntry>();
let loadedAt = 0;
let source: string | null = null;
let skipped: Record<string, number> = {};
let lastError: string | null = null;
let lastAttemptAt = 0;
let attempts: Array<{ url: string; result: string }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const toInt = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Tolerant of the dataset's field names changing between versions. Counts why rows were skipped. */
export function parseMapList(json: unknown, skips: Record<string, number> = {}): Map<number, MapEntry> {
  const out = new Map<number, MapEntry>();
  const skip = (why: string) => {
    skips[why] = (skips[why] ?? 0) + 1;
  };
  // Accept a bare array, or an object wrapping one ({ data: [...] } / { anime: [...] }).
  let list: unknown = json;
  if (!Array.isArray(list) && list && typeof list === 'object') {
    const o = list as Record<string, unknown>;
    list = Object.values(o).find(Array.isArray) ?? [];
  }
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      skip('not an object');
      continue;
    }
    const row = raw as Record<string, any>;
    const malId = toInt(row.mal_id ?? row.malId ?? row.myanimelist_id);
    if (!malId) {
      skip('no mal id');
      continue;
    }
    const movieId = toInt(row.tmdb_movie_id ?? row.themoviedb_movie_id);
    const showId = toInt(row.tmdb_show_id ?? row.themoviedb_id ?? row.tmdb_id ?? row.themoviedb_tv_id ?? row.tmdb);
    const isMovie = String(row.type ?? '').toUpperCase() === 'MOVIE';
    const tmdbId = isMovie ? movieId ?? showId : showId ?? movieId;
    if (!tmdbId) {
      skip('no tmdb id');
      continue;
    }
    const kind: 'tv' | 'movie' = isMovie || (movieId !== undefined && showId === undefined) ? 'movie' : 'tv';
    const season = toInt(row.season?.tmdb ?? row.tmdb_season);
    if (out.has(malId)) {
      skip('duplicate mal id');
      continue;
    }
    out.set(malId, { malId, tmdbId, kind, ...(season !== undefined ? { season } : {}) });
  }
  return out;
}

type Logger = { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void };

function accept(parsed: Map<number, MapEntry>, skips: Record<string, number>, from: string, log: Logger) {
  if (parsed.size < MIN_ENTRIES) throw new Error(`list looks wrong (${parsed.size} usable entries; skipped ${JSON.stringify(skips)})`);
  entries = parsed;
  skipped = skips;
  loadedAt = Date.now();
  source = from;
  lastError = null;
  log.info({ entries: parsed.size, source: from, skipped: skips }, 'anime mapping loaded');
}

/** Instant start: use the copy shipped in the repo (if any) so the mapping works before any download. */
export function loadBundledMap(log: Logger): boolean {
  for (const file of BUNDLED_FILES) {
    try {
      const path = join(process.cwd(), file);
      if (!existsSync(path)) continue;
      const skips: Record<string, number> = {};
      const json = JSON.parse(readFileSync(path, 'utf8'));
      const parsed = parseMapList(json, skips);
      if (parsed.size < MIN_ENTRIES) throw new Error(describeEmpty(json, parsed.size, skips));
      accept(parsed, skips, 'bundled', log);
      return true;
    } catch (error) {
      log.warn({ file, message: (error as Error).message }, 'bundled anime mapping unusable');
      attempts.push({ url: file, result: (error as Error).message });
    }
  }
  return false;
}

/** When a list parses to nothing, say which fields its rows actually have, so the cause is obvious. */
function describeEmpty(json: unknown, size: number, skips: Record<string, number>): string {
  const list = Array.isArray(json) ? json : (json && typeof json === 'object' ? Object.values(json as object).find(Array.isArray) : undefined);
  const first = Array.isArray(list) ? list.find((r) => r && typeof r === 'object') : undefined;
  const keys = first ? Object.keys(first as object).join(',') : 'none';
  return `list has no usable TMDB ids (${size} usable; skipped ${JSON.stringify(skips)}; row fields: ${keys})`;
}

async function tryUrl(url: string, log: Logger): Promise<void> {
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'ibrax-media-api' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const skips: Record<string, number> = {};
    const json = await response.json();
    const parsed = parseMapList(json, skips);
    if (parsed.size < MIN_ENTRIES) throw new Error(describeEmpty(json, parsed.size, skips));
    accept(parsed, skips, url, log);
    attempts.push({ url, result: 'ok' });
  } catch (error) {
    const e = error as Error & { cause?: { code?: string; message?: string; errors?: Array<{ code?: string }> } };
    const detail = e.cause?.code ?? e.cause?.errors?.[0]?.code ?? e.cause?.message;
    const message = `${e.name === 'AbortError' ? 'timeout' : e.message}${detail ? ` (${detail})` : ''}`;
    attempts.push({ url, result: message });
    throw new Error(message);
  } finally {
    clearTimeout(abort);
  }
}

export async function loadAnimeMap(log: Logger) {
  lastAttemptAt = Date.now();
  attempts = [];
  const urls = process.env.ANIME_MAP_URL ? [process.env.ANIME_MAP_URL] : DEFAULT_URLS;
  let ok = false;
  for (const url of urls) {
    try {
      await tryUrl(url, log);
      ok = true;
      break;
    } catch (error) {
      lastError = `${url}: ${(error as Error).message}`;
      log.warn({ url, message: (error as Error).message }, 'anime mapping download failed');
    }
  }
  // A failed refresh keeps whatever we already have (bundled or previous download).
  const delay = ok ? REFRESH_MS : RETRY_MS;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void loadAnimeMap(log), delay);
  timer.unref?.();
}

export const lookupMapping = (malId: number): MapEntry | undefined => entries.get(malId);
export const mappingStatus = () => ({
  entries: entries.size,
  loadedAt: loadedAt || null,
  source,
  lastError,
  lastAttemptAt: lastAttemptAt || null,
  attempts,
  skipped,
});
/** Test hook. */
export const setMappingForTests = (list: MapEntry[]) => {
  entries = new Map(list.map((e) => [e.malId, e]));
  loadedAt = Date.now();
};
