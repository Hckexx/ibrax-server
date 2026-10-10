/** Normalised shapes returned by /api/v1/anime/*. The mobile app consumes these directly. */
export interface AnimeItem {
  malId: number;
  title: string;
  titleJapanese?: string;
  posterUrl: string | null;
  bannerUrl: string | null;
  score?: number;
  year?: number;
  type?: string;
  status?: string;
  episodes: number | null;
  synopsis?: string;
  genres: string[];
  season?: string;
  rating?: string;
  duration?: string;
}

export interface AnimeEpisode {
  number: number;
  title: string;
  aired?: string;
  filler: boolean;
  recap: boolean;
}

export interface AnimeGenre {
  id: number;
  name: string;
  count: number;
}

export interface JikanPage {
  items: AnimeItem[];
  page: number;
  hasNextPage: boolean;
  lastPage?: number;
}
