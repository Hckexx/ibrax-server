# data/

- `anime-overrides.json` - hand-made fixes for titles the automatic MAL->TMDB mapping gets wrong.
- `anime-list-full.json` (optional) - a copy of https://github.com/Fribb/anime-lists/blob/master/anime-list-full.json.
  If present, the server loads it instantly at startup, then refreshes from the network in the background.
  Refresh your copy now and then:

      curl -L -o data/anime-list-full.json https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json
