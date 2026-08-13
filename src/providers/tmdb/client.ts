import { config } from '../../config.js';

const BASE_URL = config.tmdb.baseUrl;
const API_TOKEN = config.tmdb.apiToken;

class TMDBClient {
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (response.status === 401) throw new Error('Invalid TMDB credentials');
      if (response.status === 404) throw new Error('Resource not found');
      if (response.status === 429) throw new Error('TMDB rate limit exceeded');
      if (!response.ok) throw new Error(`TMDB error: ${response.status}`);

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async getTrending(mediaType: 'movie' | 'tv', page = 1) {
    return this.request<any>(`/trending/${mediaType}/week`, { page: page.toString() });
  }

  async getPopular(mediaType: 'movie' | 'tv', page = 1) {
    return this.request<any>(`/${mediaType}/popular`, { page: page.toString() });
  }

  async getTopRated(mediaType: 'movie' | 'tv', page = 1) {
    return this.request<any>(`/${mediaType}/top_rated`, { page: page.toString() });
  }

  async getDetails(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}`);
  }

  async getCredits(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/credits`);
  }

  async getSeasonDetails(tvId: number, seasonNumber: number) {
    return this.request<any>(`/tv/${tvId}/season/${seasonNumber}`);
  }

  async searchMulti(query: string, page = 1) {
    return this.request<any>('/search/multi', { query, page: page.toString() });
 
  }

    async getSimilar(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/similar`);
  }

    async getVideos(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/videos`);
  }
    async discover(mediaType: 'movie' | 'tv', params?: Record<string, string>) {
    return this.request<any>(`/discover/${mediaType}`, params);
  }
    async getUpcoming(page: number = 1) {
    return this.request<any>(`/movie/upcoming`, { page: page.toString() });
  }

  async getNowPlaying(page: number = 1) {
    return this.request<any>(`/movie/now_playing`, { page: page.toString() });
  }

  async getAiringToday(page: number = 1) {
    return this.request<any>(`/tv/airing_today`, { page: page.toString() });
  }
    async getGenres(mediaType: 'movie' | 'tv') {
    return this.request<any>(`/genre/${mediaType}/list`);
  }

  async discoverTV(params?: Record<string, string>) {
    return this.request<any>(`/discover/tv`, params);
  }

    async search(mediaType: 'movie' | 'tv', query: string, page: number = 1) {
    return this.request<any>(`/search/${mediaType}`, { query, page: page.toString() });
  }
    async getRecommendations(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/recommendations`);
  }

  async getReviews(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/reviews`);
  }

  async getImages(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/images`);
  }

  async getKeywords(id: number) {
    return this.request<any>(`/movie/${id}/keywords`);
  }

  async getExternalIds(mediaType: 'movie' | 'tv', id: number) {
    return this.request<any>(`/${mediaType}/${id}/external_ids`);
  }

  async getPerson(personId: number) {
    return this.request<any>(`/person/${personId}`);
  }

  async getPersonCredits(personId: number, mediaType: 'movie' | 'tv') {
    return this.request<any>(`/person/${personId}/${mediaType}_credits`);
  }

  async getEpisodeDetails(tvId: number, season: number, episode: number) {
    return this.request<any>(`/tv/${tvId}/season/${season}/episode/${episode}`);
  }

  async getTrendingDay(mediaType: 'movie' | 'tv') {
    return this.request<any>(`/trending/${mediaType}/day`);
  }

  async discoverWithFilters(mediaType: 'movie' | 'tv', params: Record<string, string>) {
    return this.request<any>(`/discover/${mediaType}`, params);
  }
}

export const tmdbClient = new TMDBClient();