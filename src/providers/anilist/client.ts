import { UpstreamError } from '../jikan/client.js';
import type { AnimeEpisode, AnimeGenre, AnimeItem, JikanPage } from '../jikan/types.js';

/**
 * AniList (https://anilist.co) as a backup source for the anime routes.
 * It returns the same normalised shapes as the Jikan client, so the app cannot tell the difference.
 * Only titles that have a MyAnimeList id are returned, because the player (Helios) looks anime up by MAL id.
 */
const ENDPOINT = 'https://graphql.anilist.co';
const MIN_GAP_MS = 750; // AniList allows 90 req/min; stay well below
const TIMEOUT_MS = 9_000;
const MAX_RETRY_WAIT_MS = 4_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MEDIA_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  averageScore
  seasonYear
  startDate { year }
  format status episodes duration season genres isAdult
  description(asHtml: false)
`;

const PAGE_INFO = 'pageInfo { hasNextPage lastPage currentPage }';

// MAL genre ids (what the app/Jikan use) <-> AniList genre names.
const GENRES: Array<{ id: number; name: string; anilist: string }> = [
  { id: 1, name: 'Action', anilist: 'Action' },
  { id: 2, name: 'Adventure', anilist: 'Adventure' },
  { id: 4, name: 'Comedy', anilist: 'Comedy' },
  { id: 7, name: 'Mystery', anilist: 'Mystery' },
  { id: 8, name: 'Drama', anilist: 'Drama' },
  { id: 10, name: 'Fantasy', anilist: 'Fantasy' },
  { id: 14, name: 'Horror', anilist: 'Horror' },
  { id: 18, name: 'Mecha', anilist: 'Mecha' },
  { id: 19, name: 'Music', anilist: 'Music' },
  { id: 22, name: 'Romance', anilist: 'Romance' },
  { id: 24, name: 'Sci-Fi', anilist: 'Sci-Fi' },
  { id: 30, name: 'Sports', anilist: 'Sports' },
  { id: 36, name: 'Slice of Life', anilist: 'Slice of Life' },
  { id: 37, name: 'Supernatural', anilist: 'Supernatural' },
  { id: 40, name: 'Psychological', anilist: 'Psychological' },
  { id: 41, name: 'Suspense', anilist: 'Thriller' },
];

const FORMAT_LABEL: Record<string, string> = {
  TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
};
const STATUS_LABEL: Record<string, string> = {
  RELEASING: 'Currently Airing', FINISHED: 'Finished Airing', NOT_YET_RELEASED: 'Not yet aired', CANCELLED: 'Cancelled', HIATUS: 'On Hiatus',
};
const TYPE_TO_FORMAT: Record<string, string> = {
  tv: 'TV', movie: 'MOVIE', ova: 'OVA', special: 'SPECIAL', ona: 'ONA', music: 'MUSIC',
};
const VAR_TYPES: Record<string, string> = {
  page: 'Int', perPage: 'Int', sort: '[MediaSort]', status: 'MediaStatus', season: 'MediaSeason',
  seasonYear: 'Int', format: 'MediaFormat', search: 'String', genre: 'String',
  popularity_greater: 'Int',
};

type Vars = Record<string, string | number | string[] | undefined>;

const stripHtml = (value: string) =>
  value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();

const currentAniListSeason = (date = new Date()) => {
  const month = date.getUTCMonth();
  const season = month <= 2 ? 'WINTER' : month <= 5 ? 'SPRING' : month <= 8 ? 'SUMMER' : 'FALL';
  return { season, year: date.getUTCFullYear() };
};

class AniListClient {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async attempt(query: string, variables: Record<string, unknown>, attempt: number): Promise<any> {
    const wait = Math.max(0, this.lastStart + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    this.lastStart = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'LauraTV-API/1.0' },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after')) * 1000;
        if (attempt < 2 && retryAfter > 0 && retryAfter <= MAX_RETRY_WAIT_MS) {
          await sleep(retryAfter);
          return this.attempt(query, variables, attempt + 1);
        }
        throw new UpstreamError('Anime backup service is busy, try again shortly', 503);
      }

      const json: any = await response.json().catch(() => null);
      if (response.status === 404 || json?.errors?.some((e: any) => e?.status === 404)) {
        throw new UpstreamError('Anime not found', 404);
      }
      if (!response.ok || json?.errors?.length) {
        if (response.status >= 500 && attempt < 2) {
          await sleep(700);
          return this.attempt(query, variables, attempt + 1);
        }
        throw new UpstreamError(`Anime backup service error (${response.status})`, 502);
      }
      return json?.data;
    } catch (error: any) {
      if (error instanceof UpstreamError) throw error;
      if (attempt < 2) {
        await sleep(600);
        return this.attempt(query, variables, attempt + 1);
      }
      throw new UpstreamError(
        error?.name === 'AbortError' ? 'Anime backup service timed out' : 'Anime backup service unreachable',
        504,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  request(query: string, variables: Record<string, unknown> = {}): Promise<any> {
    return this.enqueue(() => this.attempt(query, variables, 1));
  }

  // ---------- normalisation ----------

  mapMedia(raw: any): AnimeItem | null {
    if (!raw?.idMal || raw.isAdult) return null;
    const genres: string[] = Array.isArray(raw.genres) ? raw.genres.filter(Boolean) : [];
    if (genres.includes('Hentai') || genres.includes('Ecchi')) return null;

    const poster = raw.coverImage?.extraLarge || raw.coverImage?.large || null;
    const title = raw.title?.english || raw.title?.romaji || raw.title?.native || 'Untitled';
    return {
      malId: raw.idMal,
      title,
      titleJapanese: raw.title?.native || undefined,
      posterUrl: poster,
      bannerUrl: raw.bannerImage || poster,
      score: typeof raw.averageScore === 'number' && raw.averageScore > 0 ? Math.round(raw.averageScore) / 10 : undefined,
      year: raw.seasonYear || raw.startDate?.year || undefined,
      type: FORMAT_LABEL[raw.format] || undefined,
      status: STATUS_LABEL[raw.status] || undefined,
      episodes: raw.episodes ?? null,
      synopsis: raw.description ? stripHtml(String(raw.description)) : undefined,
      genres,
      season: raw.season ? String(raw.season).toLowerCase() : undefined,
      rating: undefined,
      duration: raw.duration ? `${raw.duration} min per ep` : undefined,
    };
  }

  mapList(rows: any[]): AnimeItem[] {
    const seen = new Set<number>();
    const items: AnimeItem[] = [];
    for (const raw of rows ?? []) {
      const item = this.mapMedia(raw);
      if (!item || !item.posterUrl || seen.has(item.malId)) continue;
      seen.add(item.malId);
      items.push(item);
    }
    return items;
  }

  private toPage(pageData: any, page: number, rows: any[]): JikanPage {
    return {
      items: this.mapList(rows),
      page,
      hasNextPage: !!pageData?.pageInfo?.hasNextPage,
      lastPage: pageData?.pageInfo?.lastPage ?? undefined,
    };
  }

  // ---------- lists ----------

  private async mediaPage(vars: Vars, page: number, perPage: number): Promise<JikanPage> {
    const all: Vars = { ...vars, page, perPage };
    const keys = Object.keys(all).filter((k) => all[k] !== undefined);
    const declarations = keys.map((k) => `$${k}: ${VAR_TYPES[k]}`).join(', ');
    const mediaArgs = keys.filter((k) => k !== 'page' && k !== 'perPage').map((k) => `${k}: $${k}`).join(', ');
    const query = `query (${declarations}) {
      Page(page: $page, perPage: $perPage) {
        ${PAGE_INFO}
        media(type: ANIME, isAdult: false${mediaArgs ? ', ' + mediaArgs : ''}) { ${MEDIA_FIELDS} }
      }
    }`;
    const variables: Record<string, unknown> = {};
    for (const k of keys) variables[k] = all[k];
    const data = await this.request(query, variables);
    return this.toPage(data?.Page, page, data?.Page?.media ?? []);
  }

  async top(opts: { filter?: string; type?: string; page?: number; limit?: number } = {}): Promise<JikanPage> {
    const page = opts.page ?? 1;
    const vars: Vars = {};
    if (opts.type && TYPE_TO_FORMAT[opts.type]) vars.format = TYPE_TO_FORMAT[opts.type];
    switch (opts.filter) {
      case 'airing':
        vars.status = 'RELEASING';
        vars.sort = ['SCORE_DESC'];
        vars.popularity_greater = 10_000;
        break;
      case 'upcoming':
        vars.status = 'NOT_YET_RELEASED';
        vars.sort = ['POPULARITY_DESC'];
        break;
      case 'bypopularity':
        vars.sort = ['POPULARITY_DESC'];
        break;
      case 'favorite':
        vars.sort = ['FAVOURITES_DESC'];
        break;
      default:
        vars.sort = ['SCORE_DESC'];
        vars.popularity_greater = 20_000;
    }
    return this.mediaPage(vars, page, opts.limit ?? 25);
  }

  async seasonNow(page = 1, limit = 25): Promise<JikanPage> {
    const { season, year } = currentAniListSeason();
    return this.mediaPage({ season, seasonYear: year, sort: ['POPULARITY_DESC'] }, page, limit);
  }

  async season(year: number, season: string, page = 1, limit = 25): Promise<JikanPage> {
    return this.mediaPage({ season: season.toUpperCase(), seasonYear: year, sort: ['POPULARITY_DESC'] }, page, limit);
  }

  async upcoming(page = 1, limit = 25): Promise<JikanPage> {
    return this.mediaPage({ status: 'NOT_YET_RELEASED', sort: ['POPULARITY_DESC'] }, page, limit);
  }

  async schedule(day: string, page = 1, limit = 25): Promise<JikanPage> {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const target = days.indexOf(day);
    if (target < 0) return { items: [], page, hasNextPage: false };

    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const offset = (target - now.getUTCDay() + 7) % 7;
    const from = Math.floor((start + offset * 86_400_000) / 1000);
    const to = from + 86_400;

    const query = `query ($page: Int, $perPage: Int, $from: Int, $to: Int) {
      Page(page: $page, perPage: $perPage) {
        ${PAGE_INFO}
        airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) { media { ${MEDIA_FIELDS} } }
      }
    }`;
    const data = await this.request(query, { page, perPage: limit, from, to });
    const rows = (data?.Page?.airingSchedules ?? []).map((row: any) => row?.media);
    return this.toPage(data?.Page, page, rows);
  }

  async search(query: string, page = 1, limit = 24): Promise<JikanPage> {
    return this.mediaPage({ search: query, sort: ['SEARCH_MATCH'] }, page, limit);
  }

  async byGenre(genreId: number, page = 1, limit = 24): Promise<JikanPage> {
    const genre = GENRES.find((g) => g.id === genreId);
    if (!genre) return { items: [], page, hasNextPage: false };
    return this.mediaPage({ genre: genre.anilist, sort: ['SCORE_DESC'], popularity_greater: 5_000 }, page, limit);
  }

  async genres(): Promise<AnimeGenre[]> {
    return GENRES.map((g) => ({ id: g.id, name: g.name, count: 0 }));
  }

  // ---------- single title ----------

  async details(malId: number): Promise<AnimeItem> {
    const data = await this.request(
      `query ($id: Int) { Media(idMal: $id, type: ANIME) { ${MEDIA_FIELDS} } }`,
      { id: malId },
    );
    const item = this.mapMedia(data?.Media);
    if (!item) throw new UpstreamError('Anime not found', 404);
    return item;
  }

  async random(): Promise<AnimeItem> {
    for (let tries = 0; tries < 3; tries += 1) {
      const page = 1 + Math.floor(Math.random() * 150);
      const result = await this.mediaPage({ sort: ['POPULARITY_DESC'] }, page, 10);
      if (result.items.length) return result.items[Math.floor(Math.random() * result.items.length)];
    }
    throw new UpstreamError('No anime found', 404);
  }

  async recommendations(malId: number): Promise<AnimeItem[]> {
    const data = await this.request(
      `query ($id: Int) { Media(idMal: $id, type: ANIME) {
        recommendations(perPage: 20, sort: RATING_DESC) { nodes { mediaRecommendation { ${MEDIA_FIELDS} } } }
      } }`,
      { id: malId },
    );
    const rows = (data?.Media?.recommendations?.nodes ?? []).map((node: any) => node?.mediaRecommendation);
    return this.mapList(rows);
  }

  /**
   * AniList has no per-episode listing, so the list is built from the episode count
   * (titles are used when AniList provides them, otherwise "Episode N").
   */
  async allEpisodes(malId: number): Promise<AnimeEpisode[]> {
    const data = await this.request(
      `query ($id: Int) { Media(idMal: $id, type: ANIME) {
        episodes status nextAiringEpisode { episode } streamingEpisodes { title }
      } }`,
      { id: malId },
    );
    const media = data?.Media;
    if (!media) throw new UpstreamError('Anime not found', 404);

    const titles = new Map<number, string>();
    for (const row of media.streamingEpisodes ?? []) {
      const match = /^Episode\s+(\d+)\s*[-–:]\s*(.+)$/i.exec(String(row?.title ?? ''));
      if (match) titles.set(Number(match[1]), match[2].trim());
    }

    let total: number = media.episodes ?? 0;
    if (!total && media.nextAiringEpisode?.episode) total = media.nextAiringEpisode.episode - 1;
    if (!total && titles.size) total = Math.max(...titles.keys());
    total = Math.min(Math.max(total, 0), 2000);

    return Array.from({ length: total }, (_, i) => ({
      number: i + 1,
      title: titles.get(i + 1) || `Episode ${i + 1}`,
      filler: false,
      recap: false,
    }));
  }

  async episodesPage(malId: number, page: number): Promise<{ items: AnimeEpisode[]; hasNextPage: boolean }> {
    const all = await this.allEpisodes(malId);
    const start = (page - 1) * 100;
    return { items: all.slice(start, start + 100), hasNextPage: start + 100 < all.length };
  }
}

export const aniListClient = new AniListClient();
