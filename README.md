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

## Z-Library Setup (required)

Z-Library requires authentication cookies to search and view books. Without them, search will return no results.

1. Open **z-library.sk** in your phone's browser and **log in** (create a free account if needed)
2. Copy your browser cookies from Z-Library. On Android, you can use a "Copy Cookies" browser extension, or open `chrome://inspect` on desktop to grab cookies from a connected phone
3. In Sozo Read: **Settings → Sources → tap Z-Library → Session Cookies** — paste all cookies there
4. The pasted cookies must include `remix_userkey` and `remix_userid`

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
