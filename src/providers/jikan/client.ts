import type { AnimeEpisode, AnimeGenre, AnimeItem, JikanPage } from './types.js';

const BASE_URL = 'https://api.jikan.moe/v4';

// Jikan allows ~3 requests/second and 60/minute. Keep every call at least this far apart.
const MIN_GAP_MS = 420;
const REQUEST_TIMEOUT_MS = 9_000;
const MAX_ATTEMPTS = 3;

// MAL genres that should never reach a general-audience app.
const BLOCKED_GENRE_IDS = new Set([9, 12, 49]); // Ecchi, Hentai, Erotica

export class UpstreamError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class JikanClient {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  /** Every request goes through one queue so the whole server stays under Jikan's limits. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async attempt(path: string, attempt: number): Promise<any> {
    const wait = Math.max(0, this.lastStart + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    this.lastStart = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'LauraTV-API/1.0' },
        signal: controller.signal,
      });

      if (response.status === 404) throw new UpstreamError('Anime not found', 404);

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        await sleep(response.status === 429 ? 1500 * attempt : 900 * attempt);
        return this.attempt(path, attempt + 1);
      }
      if (response.status === 429) throw new UpstreamError('Anime service is busy, try again shortly', 503);
      if (!response.ok) throw new UpstreamError(`Anime service error (${response.status})`, 502);

      return await response.json();
    } catch (error: any) {
      if (error instanceof UpstreamError) throw error;
      // Timeouts / network blips: one retry, then surface a clean 504.
      if (attempt < 2) {
        await sleep(700 * attempt);
        return this.attempt(path, attempt + 1);
      }
      throw new UpstreamError(
        error?.name === 'AbortError' ? 'Anime service timed out' : 'Anime service unreachable',
        504,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  request(path: string): Promise<any> {
    return this.enqueue(() => this.attempt(path, 1));
  }

  // ---------- normalisation ----------

  private mapAnime(raw: any): AnimeItem | null {
    if (!raw?.mal_id) return null;
    const images = raw.images ?? {};
    const poster =
      images.webp?.large_image_url || images.jpg?.large_image_url || images.jpg?.image_url || null;
    return {
      malId: raw.mal_id,
      title: raw.title_english || raw.title || 'Untitled',
      titleJapanese: raw.title_japanese || undefined,
      posterUrl: poster,
      bannerUrl: raw.trailer?.images?.maximum_image_url || poster,
      score: typeof raw.score === 'number' ? raw.score : undefined,
      year: raw.year || raw.aired?.prop?.from?.year || undefined,
      type: raw.type || undefined,
      status: raw.status || undefined,
      episodes: raw.episodes ?? null,
      synopsis: raw.synopsis || undefined,
      genres: Array.isArray(raw.genres) ? raw.genres.map((g: any) => g.name).filter(Boolean) : [],
      season: raw.season || undefined,
      rating: raw.rating || undefined,
      duration: raw.duration || undefined,
    };
  }

  private mapList(json: any): AnimeItem[] {
    const seen = new Set<number>();
    const items: AnimeItem[] = [];
    for (const raw of json?.data ?? []) {
      const item = this.mapAnime(raw);
      if (!item || !item.posterUrl || seen.has(item.malId)) continue;
      seen.add(item.malId);
      items.push(item);
    }
    return items;
  }

  private toPage(json: any, page: number): JikanPage {
    return {
      items: this.mapList(json),
      page,
      hasNextPage: !!json?.pagination?.has_next_page,
      lastPage: json?.pagination?.last_visible_page,
    };
  }

  // ---------- lists ----------

  async top(opts: { filter?: string; type?: string; page?: number; limit?: number } = {}): Promise<JikanPage> {
    const page = opts.page ?? 1;
    const params = new URLSearchParams({ page: String(page), limit: String(opts.limit ?? 25), sfw: 'true' });
    if (opts.filter) params.set('filter', opts.filter);
    if (opts.type) params.set('type', opts.type);
    return this.toPage(await this.request(`/top/anime?${params}`), page);
  }

  async seasonNow(page = 1, limit = 25): Promise<JikanPage> {
    return this.toPage(await this.request(`/seasons/now?page=${page}&limit=${limit}&sfw=true`), page);
  }

  async season(year: number, season: string, page = 1, limit = 25): Promise<JikanPage> {
    return this.toPage(await this.request(`/seasons/${year}/${season}?page=${page}&limit=${limit}&sfw=true`), page);
  }

  async upcoming(page = 1, limit = 25): Promise<JikanPage> {
    return this.toPage(await this.request(`/seasons/upcoming?page=${page}&limit=${limit}&sfw=true`), page);
  }

  async schedule(day: string, page = 1, limit = 25): Promise<JikanPage> {
    return this.toPage(await this.request(`/schedules?filter=${day}&page=${page}&limit=${limit}&sfw=true`), page);
  }

  async search(query: string, page = 1, limit = 24): Promise<JikanPage> {
    const params = new URLSearchParams({ q: query, page: String(page), limit: String(limit), sfw: 'true', order_by: 'members', sort: 'desc' });
    return this.toPage(await this.request(`/anime?${params}`), page);
  }

  async byGenre(genreId: number, page = 1, limit = 24): Promise<JikanPage> {
    const params = new URLSearchParams({ genres: String(genreId), page: String(page), limit: String(limit), sfw: 'true', order_by: 'score', sort: 'desc', min_score: '6' });
    return this.toPage(await this.request(`/anime?${params}`), page);
  }

  async genres(): Promise<AnimeGenre[]> {
    const json = await this.request('/genres/anime');
    return (json?.data ?? [])
      .filter((g: any) => g?.mal_id && !BLOCKED_GENRE_IDS.has(g.mal_id))
      .map((g: any) => ({ id: g.mal_id, name: g.name, count: g.count ?? 0 }));
  }

  // ---------- single title ----------

  async details(malId: number): Promise<AnimeItem> {
    const item = this.mapAnime((await this.request(`/anime/${malId}/full`))?.data);
    if (!item) throw new UpstreamError('Anime not found', 404);
    return item;
  }

  async random(): Promise<AnimeItem> {
    const item = this.mapAnime((await this.request('/random/anime?sfw=true'))?.data);
    if (!item) throw new UpstreamError('No anime found', 404);
    return item;
  }

  async recommendations(malId: number): Promise<AnimeItem[]> {
    const json = await this.request(`/anime/${malId}/recommendations`);
    const entries = (json?.data ?? []).slice(0, 20).map((row: any) => row.entry);
    return this.mapList({ data: entries });
  }

  private mapEpisodes(json: any): AnimeEpisode[] {
    const episodes: AnimeEpisode[] = [];
    for (const ep of json?.data ?? []) {
      if (typeof ep?.mal_id !== 'number') continue;
      episodes.push({
        number: ep.mal_id,
        title: ep.title || `Episode ${ep.mal_id}`,
        aired: ep.aired ? String(ep.aired).slice(0, 10) : undefined,
        filler: !!ep.filler,
        recap: !!ep.recap,
      });
    }
    return episodes;
  }

  /** One page of episodes (Jikan returns 100 per page). */
  async episodesPage(malId: number, page: number): Promise<{ items: AnimeEpisode[]; hasNextPage: boolean }> {
    const json = await this.request(`/anime/${malId}/episodes?page=${page}`);
    return { items: this.mapEpisodes(json), hasNextPage: !!json?.pagination?.has_next_page };
  }

  /** Every episode, capped so a 1,100-episode series cannot hog the queue forever. */
  async allEpisodes(malId: number, maxPages = 12): Promise<AnimeEpisode[]> {
    const all: AnimeEpisode[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const { items, hasNextPage } = await this.episodesPage(malId, page);
      all.push(...items);
      if (!hasNextPage) break;
    }
    return all;
  }
}

export const jikanClient = new JikanClient();
