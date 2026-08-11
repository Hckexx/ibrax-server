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
}

export const tmdbClient = new TMDBClient();