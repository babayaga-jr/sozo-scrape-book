# sozo-scrape-book

Sozo Read provider repo for book sources. Each `.js` file is a self-contained scraper that the [Sozo Read](https://github.com/Spyou/Sozo-Read) app installs at runtime — no app update required.

## Installing in Sozo Read

1. Open the app
2. **Settings → Sources → Repos tab → +**
3. Paste the manifest URL:
   ```
   https://raw.githubusercontent.com/babayaga-jr/sozo-scrape-book/main/index.json
   ```
4. Tap **Install** next to the sources you want

## Available sources

| File | Site | Type |
|------|------|------|
| `zlibrary.js` | Z-Library (`z-library.sk`) | novel (book library) |

## Adding a new source

1. Copy `_template.js` from the [upstream repo](https://github.com/Spyou/sozoread-providers) or an existing scraper
2. Fill in the five functions (`getInfo`, `search`, `getDetail`, `getChapters`, `getPages` / `getChapterContent`)
3. Register it in `index.json` — add a new entry to the `sources` array
4. Push

## Notes

- Z-Library rotates domains frequently. Update the `SITE` variable in `zlibrary.js` if the current mirror stops working
- All scrapers use regex parsing only (no DOM) — the Sozo Read host environment provides `fetch`, `htmlText`, `console.log`, and standard ES5-ish JS via QuickJS
- Bump the `version` field in **both** `getInfo()` and the `index.json` entry when making changes

## License

MIT
