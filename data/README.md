# data/

- `anime-overrides.json` - hand-made fixes for titles the automatic MAL->TMDB mapping gets wrong.
- `anime-list-mini.json` (optional) - a copy of https://github.com/Fribb/anime-lists/blob/master/anime-list-mini.json.
  If present, the server loads it instantly at startup, then refreshes from the network in the background.
  Refresh your copy now and then:

      curl -L -o data/anime-list-mini.json https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json
