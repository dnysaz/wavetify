# Wavetify

**Free online music.** A small Spotify-style web player built with Astro, streaming full tracks from Audius and Jamendo, podcast episodes, live radio and YouTube music videos — no accounts, no database, no backend.

![Wavetify](public/og.png)

![Astro](https://img.shields.io/badge/Astro-7.x-ff5d01?logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Home rows** — play again, trending, videos you watched, podcast series and live radio, each on a single swipeable row so the page stays short.
- **Trending** — a live selection of trending tracks from Audius when the page loads.
- **Search** — the magnifier opens a full search page. From Home it queries Audius and Jamendo (full tracks), Apple Podcasts, Radio Browser and YouTube in parallel, songs first; searching from the Videos page only searches YouTube, and from Podcasts or Radio only that source.
- **Videos** — a dedicated Videos page with its own YouTube picks: *Videos for you* is built from what you play and search for on this device, falling back to YouTube's most-popular music videos. It keeps video-only *Play again* and *Mostly played* rows, shows the latest watched videos on Home, lists *More from channel* in the detail panel, and remembers the last list for six hours so repeat visits skip the API.
- **Artist view** — clicking any card expands a full-width panel with the artwork, and lists everything else available from that artist.
- **Playback** — a persistent player bar with play/pause, previous/next, seek and volume, plus the queue built from the list you are looking at.
- **Video playback** — music videos play in an embedded YouTube player instead of the audio element, with a video-first full-screen view (video on top, title underneath, expand/PiP/fullscreen in the header). The now playing card previews the actual muted video with a fullscreen button, and the panel beside it shows the full description, view/like/comment counts and a **Watch on YouTube** link.
- **Full-screen now playing** — the expand button next to Like (or the player cover) opens the artwork on a blurred copy of itself, with the source details the API returns: genre, mood, tags, release date, play/favorite/repost counts, album, episode length, station language, codec, bitrate and more, plus a link back to the original source.
- **Share and embed** — every song, podcast episode and radio station has a share button in the detail panel, the player bar and the full-screen view. It produces a direct link (`/?t=…`) plus a Spotify-style `<iframe>` embed served from `/embed/`, with artwork, a blurred cover backdrop, play/pause, a seek bar and a backlink to Wavetify. The share sheet includes a **live, playable preview** of that embed plus the track title/description, and social previews use the `og.png` card.
- **Playlists** — group songs, podcasts, radio and videos into playlists that live in `localStorage`, shown as cards inside Library; a search field inside each playlist adds tracks, and playing from a playlist labels the player with the playlist name.
- **Library on this device** — play again, most played, recently played history and liked songs, all stored in `localStorage`.
- **Resume after reload** — the last played song, its queue and its position are restored, and playback continues automatically when the browser allows it.
- **Live radio and podcasts** — community radio stations (HTTPS streams only) and podcast series with full episodes; the radio page loads 20 stations at a time with a *Load more* button, and tapping the now-playing radio title lists the other stations from the same country.
- **Mobile first** — compact top bar with the Wavetify title and a magnifier that opens a full-width search field, bottom navigation, safe-area aware player above the nav, two-column grid and a scrollable detail panel on phones.
- **Cover fallback** — tracks without artwork (or with broken artwork URLs) get a branded Wavetify placeholder instead of a broken image.
- **Installable PWA** — web app manifest, maskable home-screen icons and a service worker that caches the app shell, so the player can be installed and opened without browser chrome.

## Tech stack

| Layer     | Choice                                                        |
| :-------- | :------------------------------------------------------------ |
| Framework | [Astro](https://astro.build) 7 (static output, zero adapter)   |
| Language  | TypeScript (strict)                                            |
| Styling   | Plain CSS with custom properties in `src/styles/global.css`    |
| Audio     | HTML5 `<audio>`, streamed directly from the source APIs        |
| Video     | [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) with the YouTube Data API v3 |
| Icons     | Inline SVG + a hand-made `public/favicon.svg` round orange W mark |

No UI framework, no CSS library, no client-side router — four TypeScript modules (API client, player logic, PWA glue and the embed player), one stylesheet and two shared Astro components. The only external service that needs a key is YouTube.

## Getting started

Requires Node **>= 22.23.4**.

```bash
npm install
npm run dev      # http://localhost:4321
```

To open it from a phone on the same network:

```bash
npm run dev -- --host
```

### Build

```bash
npm run build    # static site in ./dist
npm run preview  # serve ./dist locally
```

The build output is fully static, so it can be dropped on GitHub Pages, Netlify, Vercel, Cloudflare Pages or any static host. No backend or database is needed.

### Jamendo full tracks

Jamendo supplies the second catalogue of full-length songs beyond Audius. Add your public client id to `.env` (or the build environment):

```bash
PUBLIC_JAMENDO_CLIENT_ID=your-client-id
```

Create an app in the [Jamendo developer portal](https://devportal.jamendo.com) and copy its **Client ID**. Only read methods are used, so the id appears in request URLs; the **Client Secret** is not needed and must never be put in a `PUBLIC_` variable, because everything prefixed like that ships in the client bundle. Without a client id the Jamendo row is hidden and Audius still covers full tracks.

### YouTube videos

Everything except the Videos page works with no configuration. To enable videos, add a YouTube Data API v3 key to `.env` (or the build environment):

```bash
PUBLIC_YOUTUBE_API_KEY=your-key-here
```

Create the key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) after enabling **YouTube Data API v3**. The variable is prefixed with `PUBLIC_`, so the key ships in the client bundle — restrict it by HTTP referrer to your domain. Without a key the player still works and the Videos page simply explains that videos are not configured.

YouTube gives 10,000 quota units per day; a search costs 100 and a video lookup costs 1. The app spends at most two searches per Videos refresh, caches the resulting list for six hours and caches per-video descriptions/counters for 24 hours.

For share previews (`og:image`) to point at the absolute production URL, set `PUBLIC_SITE_URL` at build time, e.g. `PUBLIC_SITE_URL=https://wavetify.example npm run build`. Without it the relative `/og.png` is used.

### Install as an app

Chrome, Edge and Android offer **Install app** (or the in-app banner) and open Wavetify in a standalone window with the round orange W icon. On iOS use Safari's **Share → Add to Home Screen**; the install banner explains that step there.

The service worker caches the app shell, icons and hashed build assets, so the interface opens instantly and survives a reload without a connection. Audio is not cached: tracks, radio and podcasts are streamed from their sources and still need the network. Registration only happens in production builds (`npm run build` then `npm run preview`, or a deployed host), never in `astro dev`.

## Project structure

```text
/
├── public/
│   ├── favicon.svg          # Wavetify round icon
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── icon-192.png         # PWA icons
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   ├── manifest.webmanifest # app name, colours, icons
│   └── sw.js                # app-shell service worker
├── src/
│   ├── components/
│   │   ├── AboutArticle.astro # about copy shared by /about and the in-app view
│   │   └── TermsArticle.astro # terms copy shared by /terms and the in-app view
│   ├── layouts/
│   │   └── Layout.astro     # <head>, meta tags, install banner
│   ├── lib/
│   │   └── api.ts           # Audius, Jamendo, podcast, radio and YouTube clients
│   ├── pages/
│   │   ├── index.astro      # the player app and the Videos page
│   │   ├── about.astro      # standalone about page
│   │   ├── embed.astro      # minimal embeddable player for shared items
│   │   └── terms.astro      # standalone terms page
│   ├── scripts/
│   │   ├── app.ts           # all client logic: views, search, detail panel, player
│   │   ├── embed.ts         # embeddable player logic
│   │   └── pwa.ts           # install prompt, service worker, zoom lock
│   └── styles/
│       └── global.css       # theme, layout, detail panel, mobile rules
└── package.json
```

## How it works

Astro renders the shell and `src/scripts/app.ts` runs on the client. All network calls happen in the browser, which is possible because every API used here sends permissive CORS headers — that is why the site needs no server.

- **Audius** — `GET /v1/tracks/trending`, `/v1/tracks/search`, `/v1/users/handle/{handle}/tracks` and `/v1/tracks/{id}/stream`. The stream endpoint redirects to an MP3 and supports HTTP range requests, so seeking works and the whole song plays. The required `app_name=wavetify` query parameter identifies the app.
- **Jamendo** — `GET /v3.0/tracks/?client_id=…&search=…`, `/v3.0/tracks/?order=popularity_month` and `/v3.0/artists/tracks/?id={artistId}`. The API sends permissive CORS headers and returns a full-length `audio` URL (192 kbps MP3), artwork and Creative Commons licence info. Songs play in full, not as previews.
- **Apple Podcasts** — the iTunes Search endpoint with `media=podcast&entity=podcastEpisode`; `previewUrl` serves the episode audio and `/lookup?id={collectionId}&entity=podcastEpisode` lists more episodes from a show.
- **Radio Browser** — `GET https://de1.api.radio-browser.info/json/stations/search`, a free, keyless, community-run directory. Only HTTPS streams are offered, and audio plays straight from the broadcaster.
- **YouTube** — `GET /youtube/v3/search?part=snippet&type=video&videoEmbeddable=true` for picks based on your recent plays and searches, `GET /youtube/v3/videos?chart=mostPopular&videoCategoryId=10` as the one-unit fallback, and `GET /youtube/v3/videos?part=snippet,statistics&id=…` for the description and counters shown beside the video. Playback uses the IFrame Player API from `https://www.youtube.com/iframe_api`; only videos that allow embedding are offered.

Tracks are never downloaded or re-hosted; audio is played from the original source. A unified `Track` type normalizes every source (with a `live` flag for radio and a `videoId` for YouTube) so the UI does not care where a song came from.

### Shared links and embeds

Share links use `/?t=<source>:<id>` and embeds use `/embed/?t=<source>:<id>`. A single resolver, `getTrackById()`, turns that id back into a playable `Track` in a fresh tab: Audius and Jamendo are looked up by their own ids, radio stations through Radio Browser, and podcast episodes carry a compact base64 payload in the id (Apple cannot resolve an episode by its own id, and a show lookup only returns its latest ~200 episodes). The embed page is plain HTML, CSS and one small script, so it can be dropped into any site with `<iframe src="…/embed/?t=…">`; no API key is involved.

## Notes and limitations

- Songs are **full length** from Audius and Jamendo; podcast episodes come from Apple's podcast feeds. Radio is live and cannot be seeked.
- Jamendo stream URLs carry a temporary token, so a Jamendo track saved in a playlist can stop playing once that token ages out. Open the track from search again to refresh it.
- Videos need `PUBLIC_YOUTUBE_API_KEY`; without it the Videos page stays empty and explains why. Playback also depends on the uploader allowing embeds and on the daily YouTube quota.
- Availability and audio quality depend entirely on the upstream APIs and can change without notice.
- The Audius free tier allows roughly 10 requests/second and 500k requests/month per app name — fine for personal use, but don't hammer it.
- Liked songs, history, play counts, the current queue and volume live in `localStorage`, so they do not sync across devices.
- Autoplay after a reload depends on the browser's autoplay policy; if it is blocked the last song stays loaded and paused at the saved position.
- This is a hobby project, not a licensed music service. See [/terms](src/pages/terms.astro) for the full disclaimer.

## License

[MIT](LICENSE) © 2026 dnysaz

Music and metadata remain the property of their respective artists and rights holders.
