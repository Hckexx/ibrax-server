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

const DEFAULT_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 45_000;

let entries = new Map<number, MapEntry>();
let loadedAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const toInt = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Tolerant of the dataset's field names changing between versions. */
export function parseMapList(json: unknown): Map<number, MapEntry> {
  const out = new Map<number, MapEntry>();
  if (!Array.isArray(json)) return out;
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, any>;
    const malId = toInt(row.mal_id);
    if (!malId) continue;
    const movieId = toInt(row.tmdb_movie_id);
    const showId = toInt(row.tmdb_show_id) ?? toInt(row.themoviedb_id) ?? toInt(row.tmdb_id);
    const isMovie = String(row.type ?? '').toUpperCase() === 'MOVIE';
    const tmdbId = isMovie ? movieId ?? showId : showId ?? movieId;
    if (!tmdbId) continue;
    const kind: 'tv' | 'movie' = isMovie || (movieId !== undefined && showId === undefined) ? 'movie' : 'tv';
    const season = toInt(row.season?.tmdb);
    if (!out.has(malId)) out.set(malId, { malId, tmdbId, kind, ...(season !== undefined ? { season } : {}) });
  }
  return out;
}

export async function loadAnimeMap(log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void }) {
  const url = process.env.ANIME_MAP_URL || DEFAULT_URL;
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let delay = REFRESH_MS;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseMapList(await response.json());
    if (parsed.size < 1000) throw new Error(`mapping list looks wrong (${parsed.size} entries)`);
    entries = parsed;
    loadedAt = Date.now();
    log.info({ entries: parsed.size }, 'anime mapping loaded');
  } catch (error) {
    delay = RETRY_MS;
    log.warn({ message: (error as Error).message }, 'anime mapping load failed, will retry');
  } finally {
    clearTimeout(abort);
  }
  timer = setTimeout(() => void loadAnimeMap(log), delay);
  timer.unref?.();
}

export const lookupMapping = (malId: number): MapEntry | undefined => entries.get(malId);
export const mappingStatus = () => ({ entries: entries.size, loadedAt: loadedAt || null });
/** Test hook. */
export const setMappingForTests = (list: MapEntry[]) => {
  entries = new Map(list.map((e) => [e.malId, e]));
  loadedAt = Date.now();
};
