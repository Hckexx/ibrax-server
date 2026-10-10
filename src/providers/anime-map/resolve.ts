import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmdbClient } from '../tmdb/client.js';
import { animeClient } from '../anime/index.js';
import { lookupMapping, mappingStatus } from './list.js';

export type AnimePlayback = {
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  season?: number;
  episode?: number;
  title: string;
  source: 'override' | 'mapping';
};

export class MappingError extends Error {
  constructor(public code: string, message: string, public status = 404) {
    super(message);
  }
}

type Override = { tmdbId: number; mediaType?: 'tv' | 'movie'; season?: number; episodeOffset?: number; absolute?: boolean };

let overrides: Record<string, Override> | null = null;
const loadOverrides = (): Record<string, Override> => {
  if (overrides) return overrides;
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'data', 'anime-overrides.json'), 'utf8'));
    overrides = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^\d+$/.test(k) && v && typeof v === 'object')) as Record<string, Override>;
  } catch {
    overrides = {};
  }
  return overrides;
};
export const resetOverridesForTests = (value: Record<string, Override>) => { overrides = value; };

// ---------- title verification ----------
const NOISE = /\b(season|part|cour|the animation|tv|2nd|3rd|4th|5th|6th|ii|iii|iv|final|\d+(st|nd|rd|th))\b|\b\d+\b/g;
const normalise = (title: string) =>
  title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();

const dice = (a: string, b: string) => {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => { if (tb.has(t)) shared += 1; });
  return (2 * shared) / (ta.size + tb.size);
};

export function titleScore(animeTitles: string[], tmdbTitles: string[]): number {
  let best = 0;
  for (const a of animeTitles.map(normalise).filter(Boolean)) {
    for (const b of tmdbTitles.map(normalise).filter(Boolean)) {
      if (a === b) return 1;
      if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) best = Math.max(best, 0.9);
      best = Math.max(best, dice(a, b));
    }
  }
  return best;
}

const MIN_TITLE_SCORE = 0.5;
const yearOf = (date?: string) => (date && /^\d{4}/.test(date) ? parseInt(date.slice(0, 4), 10) : undefined);

// ---------- episode placement ----------
async function placeInSeason(tmdbId: number, season: number, episode: number): Promise<{ season: number; episode: number } | null> {
  try {
    const data = await tmdbClient.getSeasonDetails(tmdbId, season);
    const count = Array.isArray(data?.episodes) ? data.episodes.length : 0;
    return count >= episode ? { season, episode } : null;
  } catch {
    return null;
  }
}

/** Treat `absolute` as the nth regular episode across all seasons (specials, season 0, are skipped). */
function placeAbsolute(show: any, absolute: number): { season: number; episode: number } | null {
  const seasons = (Array.isArray(show?.seasons) ? show.seasons : [])
    .filter((s: any) => s.season_number >= 1 && s.episode_count > 0)
    .sort((a: any, b: any) => a.season_number - b.season_number);
  let remaining = absolute;
  for (const s of seasons) {
    if (remaining <= s.episode_count) return { season: s.season_number, episode: remaining };
    remaining -= s.episode_count;
  }
  return null;
}

export async function resolveAnimePlayback(malId: number, episode: number): Promise<AnimePlayback> {
  const override = loadOverrides()[String(malId)];
  const mapped = override ? undefined : lookupMapping(malId);

  if (!override && !mapped) {
    if (mappingStatus().entries === 0) throw new MappingError('MAPPING_UNAVAILABLE', 'The anime mapping list is still loading. Try again in a minute.', 503);
    throw new MappingError('NO_MAPPING', 'No stream source for this anime yet.');
  }

  const tmdbId = override ? override.tmdbId : mapped!.tmdbId;
  const kind = override ? override.mediaType ?? 'tv' : mapped!.kind;

  let show: any;
  try {
    show = await tmdbClient.getDetails(kind, tmdbId);
  } catch (error) {
    if ((error as Error).message === 'Resource not found') throw new MappingError('NO_MAPPING', 'The mapped TMDB title no longer exists.');
    throw new MappingError('TMDB_UNAVAILABLE', 'Could not reach TMDB.', 502);
  }
  const title: string = show.title ?? show.name ?? '';

  // ---- verify the mapping really is this anime (overrides are trusted) ----
  if (!override) {
    const anime = await animeClient.details(malId).catch(() => null);
    if (anime) {
      const score = titleScore(
        [anime.title, anime.titleJapanese ?? ''],
        [show.name ?? '', show.original_name ?? '', show.title ?? '', show.original_title ?? ''],
      );
      const tmdbYear = yearOf(show.first_air_date ?? show.release_date);
      const yearConflict = anime.year !== undefined && tmdbYear !== undefined && anime.year < tmdbYear - 1;
      if (score < MIN_TITLE_SCORE || yearConflict) {
        console.warn(JSON.stringify({ level: 'warn', msg: 'anime mapping rejected', malId, tmdbId, anime: anime.title, tmdb: title, score: Number(score.toFixed(2)), yearConflict }));
        throw new MappingError('LOW_CONFIDENCE', 'Could not confirm this anime on the stream catalogue, so it was not played.');
      }
    }
    // If MAL/AniList details are unreachable we cannot verify; trust the mapping list rather than block playback.
  }

  if (kind === 'movie') return { tmdbId, mediaType: 'movie', title, source: override ? 'override' : 'mapping' };

  // ---- place the episode ----
  const offset = override?.episodeOffset ?? 0;
  const wanted = episode + offset;
  if (wanted < 1) throw new MappingError('EPISODE_OUT_OF_RANGE', 'That episode is not available.');
  const season = override?.season ?? mapped?.season;

  // A known season is trusted: an episode past its end is "not available", never guessed into another
  // season. Absolute numbering is only used when the season is unknown or an override asks for it.
  let placed: { season: number; episode: number } | null;
  if (!override?.absolute && season !== undefined) placed = await placeInSeason(tmdbId, season, wanted);
  else placed = placeAbsolute(show, wanted);
  if (!placed) throw new MappingError('EPISODE_OUT_OF_RANGE', 'That episode is not available on the stream catalogue.');

  return { tmdbId, mediaType: 'tv', season: placed.season, episode: placed.episode, title, source: override ? 'override' : 'mapping' };
}
