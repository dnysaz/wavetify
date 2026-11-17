export const APP_NAME = 'wavetify';
const AUDIUS = 'https://api.audius.co/v1';
const YOUTUBE_API_KEY = import.meta.env.PUBLIC_YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
// Jamendo only needs its public client id for read methods; the client secret
// must never ship in the bundle and is not used here.
const JAMENDO_CLIENT_ID = import.meta.env.PUBLIC_JAMENDO_CLIENT_ID as string | undefined;
const JAMENDO = 'https://api.jamendo.com/v3.0';
const JAMENDO_AUDIO_FORMAT = 'mp32';

// `deezer` and `itunes` are legacy preview sources: they are no longer searched
// or fetched, but tracks saved before the switch must keep loading and playing.
export type Source =
  | 'audius'
  | 'jamendo'
  | 'deezer'
  | 'itunes'
  | 'podcast'
  | 'radio'
  | 'youtubeVideo';

export type YouTubeVideo = {
  id: string;
  title: string;
  channelTitle?: string;
  description?: string;
};

export type Show = {
  id: number;
  title: string;
  publisher: string;
  artwork: string;
};

export type InfoItem = { label: string; value: string; href?: string };

export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  src: string;
  source: Source;
  genre?: string;
  album?: string;
  description?: string;
  link?: string;
  linkLabel?: string;
  /** Everything else the source API knows about this item. */
  info?: InfoItem[];
  artistHandle?: string;
  artistId?: number | string;
  permalink?: string;
  live?: boolean;
  country?: string;
  countryCode?: string;
  /** YouTube video id when this track is presented as a music video. */
  videoId?: string;
};

export type ArtSize = 'sm' | 'md' | 'lg';

// CDNs served these covers at full size no matter how small the target element
// is, so a 40px row thumbnail downloaded a 600px JPEG. Audius only exposes
// 150/480/1000 (other sizes answer 400), mzstatic accepts any size.
const APPLE_ART = { sm: 150, md: 300, lg: 600 } as const;
const JAMENDO_ART = { sm: 200, md: 300, lg: 600 } as const;

/**
 * Rewrite a cover URL to a rendition that fits its slot. Unknown hosts are
 * returned untouched so a new source can never break its own artwork.
 */
export function artworkAt(url: string, size: ArtSize): string {
  if (!url) return url;

  // Apple Podcasts / Apple Music (also used by legacy `itunes` saves).
  const apple = url.match(/\/(\d+)x(\d+)(bb|bf|sr|cc|bb-60)\.(jpe?g|png|webp)$/);
  if (apple) return url.replace(apple[0], `/${APPLE_ART[size]}x${APPLE_ART[size]}bb.jpg`);

  // Jamendo resizes on request via the `width` query parameter.
  if (/[?&]width=\d+/.test(url)) return url.replace(/([?&]width=)\d+/, `$1${JAMENDO_ART[size]}`);

  // YouTube stills: the 16:9 thumbnails have three cheap renditions.
  const youtube = url.match(/\/vi\/[^/]+\/(default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg$/);
  if (youtube) {
    const still = size === 'sm' ? 'default' : size === 'md' ? 'mqdefault' : 'hqdefault';
    return url.replace(/\/(default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg$/, `/${still}.jpg`);
  }

  // Audius content nodes: fixed 150/480/1000 renditions, never upscale.
  const audius = url.match(/\/(\d+)x(\d+)\.(jpe?g|png|webp)$/);
  if (audius) {
    const widths = [150, 480, 1000];
    const want = size === 'sm' ? 150 : 480;
    const have = Number(audius[1]) || 480;
    const pick = widths.find((w) => w >= want) ?? widths[widths.length - 1];
    const out = have < pick ? have : pick;
    return url.replace(/\/\d+x\d+(\.(?:jpe?g|png|webp))$/, `/${out}x${out}$1`);
  }

  return url;
}

type AudiusTrack = {
  id: string;
  title: string;
  duration?: number;
  is_streamable?: boolean;
  genre?: string;
  mood?: string;
  tags?: string;
  description?: string;
  release_date?: string;
  created_at?: string;
  play_count?: number;
  favorite_count?: number;
  repost_count?: number;
  permalink?: string;
  artwork?: Record<string, string> & { mirrors?: string[] };
  user?: { name?: string; handle?: string; follower_count?: number; track_count?: number };
};

type ItunesTrack = {
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artistId?: number;
  collectionName?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackNumber?: number;
  trackCount?: number;
  trackExplicitness?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
};

type ItunesShow = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
};

type ItunesPodcast = {
  wrapperType?: string;
  trackId?: number;
  trackName?: string;
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  description?: string;
  releaseDate?: string;
  trackNumber?: number;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
};

type JamendoTrack = {
  id?: string;
  name?: string;
  duration?: number;
  artist_id?: string;
  artist_name?: string;
  album_name?: string;
  album_image?: string;
  image?: string;
  audio?: string;
  audiodownload?: string;
  shareurl?: string;
  releasedate?: string;
  license_ccurl?: string;
};

type DeezerTrack = {
  id?: number;
  title?: string;
  duration?: number;
  preview?: string;
  explicit_lyrics?: boolean;
  artist?: { id?: number; name?: string };
  album?: { id?: number; title?: string; cover_medium?: string; cover_big?: string };
};

type DeezerList = { data?: DeezerTrack[] };

type RadioStation = {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
  clickcount?: number;
  homepage?: string;
  hls?: number;
};

function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function countLabel(value?: number): string | undefined {
  return typeof value === 'number' && value > 0 ? value.toLocaleString('en-US') : undefined;
}

function field(label: string, value?: string | number | null): InfoItem | null {
  if (value === undefined || value === null || value === '') return null;
  const text = typeof value === 'number' ? String(value) : value.trim();
  return text ? { label, value: text } : null;
}

function collect(...items: (InfoItem | null)[]): InfoItem[] {
  return items.filter((item): item is InfoItem => item !== null);
}

// Switching views or coming back to a tab re-asked every API for the same lists.
// A short-lived in-memory cache makes those instant and spares Jamendo's quota.
// Failures are never cached, and 80 entries keeps it from growing unbounded.
const JSON_TTL = 5 * 60 * 1000;
const JSON_MAX = 80;
const jsonCache = new Map<string, { at: number; body: unknown }>();

async function getJson<T>(url: string): Promise<T> {
  const hit = jsonCache.get(url);
  if (hit && Date.now() - hit.at < JSON_TTL) return hit.body as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body = (await res.json()) as T;
  jsonCache.set(url, { at: Date.now(), body });
  if (jsonCache.size > JSON_MAX) {
    const oldest = jsonCache.keys().next().value;
    if (oldest) jsonCache.delete(oldest);
  }
  return body;
}

// Deezer's public API does not send CORS headers, but it supports JSONP.
let jsonpCounter = 0;

function getJsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = `__wavetifyJsonp${++jsonpCounter}`;
    const script = document.createElement('script');
    const globalWindow = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      window.clearTimeout(timer);
      delete globalWindow[callback];
      script.remove();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out'));
    }, 12000);
    globalWindow[callback] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${callback}`;
    script.onerror = () => {
      cleanup();
      reject(new Error('Request failed'));
    };
    document.head.append(script);
  });
}

function fromAudius(t: AudiusTrack): Track | null {
  if (!t.id || !t.title || t.is_streamable === false) return null;
  const art = t.artwork?.['480x480'] ?? t.artwork?.['150x150'] ?? '';
  const link = t.permalink ? `https://audius.co${t.permalink}` : undefined;
  return {
    id: `audius:${t.id}`,
    title: t.title.trim(),
    artist: t.user?.name || t.user?.handle || 'Audius artist',
    artwork: art,
    duration: t.duration ?? 0,
    src: `${AUDIUS}/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    source: 'audius',
    genre: t.genre,
    description: t.description?.trim() || undefined,
    link,
    linkLabel: 'Open on Audius',
    info: collect(
      field('Genre', t.genre),
      field('Mood', t.mood),
      field('Tags', t.tags),
      field('Released', isoDate(t.release_date)),
      field('Uploaded', isoDate(t.created_at)),
      field('Plays', countLabel(t.play_count)),
      field('Favorites', countLabel(t.favorite_count)),
      field('Reposts', countLabel(t.repost_count)),
      field('Artist', t.user?.name),
      field('Handle', t.user?.handle ? `@${t.user.handle}` : undefined),
      field('Followers', countLabel(t.user?.follower_count)),
      field('Tracks', countLabel(t.user?.track_count)),
      field('Audius ID', t.id)
    ),
    artistHandle: t.user?.handle,
    permalink: t.permalink,
  };
}

function fromJamendo(t: JamendoTrack): Track | null {
  if (!t.id || !t.name || !t.audio) return null;
  const artwork = (t.image || t.album_image || '').replace(/width=\d+/, 'width=600');
  return {
    id: `jamendo:${t.id}`,
    title: t.name.trim(),
    artist: t.artist_name?.trim() || 'Jamendo artist',
    artwork,
    duration: t.duration ?? 0,
    src: t.audio,
    source: 'jamendo',
    album: t.album_name,
    link: t.shareurl || `https://www.jamendo.com/track/${t.id}`,
    linkLabel: 'Open on Jamendo',
    info: collect(
      field('Album', t.album_name),
      field('Artist', t.artist_name),
      field('Released', isoDate(t.releasedate)),
      field('Playback', 'Streamed in full from Jamendo'),
      field('License', t.license_ccurl ? t.license_ccurl.split('/licenses/')[1] : undefined),
      field('Jamendo ID', t.id)
    ),
    artistId: t.artist_id,
    permalink: t.shareurl,
  };
}

function fromDeezer(t: DeezerTrack): Track | null {
  if (!t.id || !t.title || !t.preview) return null;
  return {
    id: `deezer:${t.id}`,
    title: t.title.trim(),
    artist: t.artist?.name || 'Deezer artist',
    artwork: t.album?.cover_medium || t.album?.cover_big || '',
    duration: t.duration ?? 0,
    src: t.preview,
    source: 'deezer',
    album: t.album?.title,
    link: `https://www.deezer.com/track/${t.id}`,
    linkLabel: 'Open on Deezer',
    info: collect(
      field('Album', t.album?.title),
      field('Artist', t.artist?.name),
      field('Full length', t.duration ? formatTime(t.duration) : undefined),
      field('Playback', '30-second preview'),
      field('Explicit', t.explicit_lyrics ? 'Yes' : undefined),
      field('Deezer ID', t.id)
    ),
    artistId: t.artist?.id,
    permalink: `https://www.deezer.com/track/${t.id}`,
  };
}

function fromShow(r: ItunesShow): Show | null {
  if (!r.collectionId || !r.collectionName) return null;
  return {
    id: r.collectionId,
    title: r.collectionName,
    publisher: r.artistName || 'Podcast',
    artwork: (r.artworkUrl600 || r.artworkUrl100 || '').replace('100x100', '600x600'),
  };
}

function fromPodcast(r: ItunesPodcast): Track | null {
  if (!r.previewUrl || !r.trackName) return null;
  const duration = Math.round((r.trackTimeMillis ?? 0) / 1000);
  const artwork = (r.artworkUrl600 || r.artworkUrl100 || '').replace('100x100', '600x600');
  // Shared links need the episode metadata inline (see encodePodcastPayload).
  const shareId = encodePodcastPayload({
    e: String(r.trackId ?? r.previewUrl),
    c: r.collectionId ? String(r.collectionId) : undefined,
    t: r.trackName,
    a: r.collectionName || r.artistName || 'Podcast',
    r: artwork || undefined,
    d: duration || undefined,
    s: r.previewUrl,
    al: r.collectionName || undefined,
  });
  return {
    id: shareId,
    title: r.trackName,
    artist: r.collectionName || r.artistName || 'Podcast',
    artwork,
    duration,
    src: r.previewUrl,
    source: 'podcast',
    album: r.collectionName,
    description: r.description?.trim() || undefined,
    link: r.trackViewUrl,
    linkLabel: 'Open in Apple Podcasts',
    info: collect(
      field('Show', r.collectionName),
      field('Publisher', r.artistName),
      field('Released', isoDate(r.releaseDate)),
      field('Episode length', duration ? formatTime(duration) : undefined),
      field('Episode', r.trackNumber),
      field('Playback', 'Streamed from Apple Podcasts')
    ),
    artistId: r.collectionId,
  };
}

function fromRadio(s: RadioStation): Track | null {
  if (!s.stationuuid || !s.url_resolved || !s.name) return null;
  // HTTPS streams only: the site itself is served over HTTPS.
  if (!s.url_resolved.startsWith('https://')) return null;
  // HLS playlists do not play in a plain <audio> element outside Safari.
  if (s.hls === 1 || /\.m3u8(\?|$)/i.test(s.url_resolved)) return null;
  const tag = s.tags?.split(',').filter(Boolean)[0];
  return {
    id: `radio:${s.stationuuid}`,
    title: s.name.trim(),
    artist: s.country || tag || 'Live radio',
    artwork: s.favicon && s.favicon.startsWith('https://') ? s.favicon : '',
    duration: 0,
    src: s.url_resolved,
    source: 'radio',
    genre: tag,
    link: s.homepage?.startsWith('http') ? s.homepage : undefined,
    linkLabel: 'Open station website',
    info: collect(
      field('Country', s.country ? `${s.country}${s.countrycode ? ` (${s.countrycode})` : ''}` : undefined),
      field('Region', s.state),
      field('Language', s.language),
      field('Tags', s.tags ? s.tags.split(',').filter(Boolean).join(', ') : undefined),
      field('Codec', s.codec),
      field('Bitrate', s.bitrate ? `${s.bitrate} kbps` : undefined),
      field('Votes', countLabel(s.votes)),
      field('Clicks', countLabel(s.clickcount)),
      field('Stream', s.url_resolved),
      field('Station ID', s.stationuuid)
    ),
    live: true,
    country: s.country,
    countryCode: s.countrycode,
  };
}

function fromItunes(r: ItunesTrack): Track | null {
  if (r.kind !== 'song' || !r.previewUrl || !r.trackName) return null;
  return {
    id: `itunes:${r.trackId ?? r.previewUrl}`,
    title: r.trackName,
    artist: r.artistName || 'Apple Music',
    artwork: (r.artworkUrl100 || '').replace('100x100', '300x300'),
    duration: Math.round((r.trackTimeMillis ?? 30000) / 1000),
    src: r.previewUrl,
    source: 'itunes',
    album: r.collectionName,
    link: r.trackViewUrl,
    linkLabel: 'Open in Apple Music',
    info: collect(
      field('Album', r.collectionName),
      field('Artist', r.artistName),
      field('Genre', r.primaryGenreName),
      field('Released', isoDate(r.releaseDate)),
      field(
        'Track',
        r.trackNumber ? `${r.trackNumber}${r.trackCount ? ` of ${r.trackCount}` : ''}` : undefined
      ),
      field('Explicit', r.trackExplicitness && r.trackExplicitness !== 'notExplicit' ? 'Yes' : undefined),
      field('Preview length', '30 seconds')
    ),
    artistId: r.artistId,
    permalink: r.trackViewUrl,
  };
}

export async function getTrending(limit = 18): Promise<Track[]> {
  const data = await getJson<{ data?: AudiusTrack[] }>(
    `${AUDIUS}/tracks/trending?app_name=${APP_NAME}&limit=${limit}`
  );
  return (data?.data ?? []).map(fromAudius).filter((t): t is Track => t !== null);
}

export async function searchAudius(query: string, limit = 15): Promise<Track[]> {
  const data = await getJson<{ data?: AudiusTrack[] }>(
    `${AUDIUS}/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP_NAME}&limit=${limit}`
  );
  return (data?.data ?? []).map(fromAudius).filter((t): t is Track => t !== null);
}

// Jamendo's cache occasionally answers an otherwise valid query with an empty
// list (it happens on burst throttling too); retry once before believing it.
async function jamendoRetry(read: () => Promise<Track[]>, attempts = 2): Promise<Track[]> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    const hits = await read();
    if (hits.length) return hits;
  }
  return [];
}

function jamendoTracks(url: string): Promise<Track[]> {
  return getJson<{ results?: JamendoTrack[] } | null>(url).then((data) =>
    (data?.results ?? []).map(fromJamendo).filter((t): t is Track => t !== null)
  );
}

async function fetchJamendo(params: Record<string, string | number>): Promise<JamendoTrack[]> {
  if (!JAMENDO_CLIENT_ID) return [];
  const query = new URLSearchParams({
    client_id: JAMENDO_CLIENT_ID,
    format: 'json',
    audioformat: JAMENDO_AUDIO_FORMAT,
    include: 'licenses',
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  });
  const url = `${JAMENDO}/tracks/?${query.toString()}`;
  const first = await jamendoRetry(() => jamendoTracks(url));
  return first;
}

export async function searchJamendo(query: string, limit = 12): Promise<Track[]> {
  const term = query.trim();
  if (!term) return [];
  return fetchJamendo({ search: term, limit, order: 'relevance' });
}

export function hasJamendoKey(): boolean {
  return typeof JAMENDO_CLIENT_ID === 'string' && JAMENDO_CLIENT_ID.trim().length > 0;
}

// Apple's podcast catalogue is region-scoped. Asking for the Indonesian store
// first surfaces local shows that the default (US) results barely rank, such as
// Close The Door; the global store only tops up when the local one is short.
const PODCAST_COUNTRY = 'ID';

function fetchPodcastEpisodes(query: string, limit: number, country?: string): Promise<Track[]> {
  const region = country ? `&country=${country}` : '';
  return getJson<{ results?: ItunesPodcast[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcastEpisode&limit=${limit}${region}`
  ).then((data) => (data?.results ?? []).map(fromPodcast).filter((t): t is Track => t !== null));
}

export async function searchPodcasts(query: string, limit = 20): Promise<Track[]> {
  let local: Track[] = [];
  let localError: unknown;
  try {
    local = await fetchPodcastEpisodes(query, limit, PODCAST_COUNTRY);
  } catch (error) {
    localError = error;
  }
  if (local.length >= limit) return local;

  let global: Track[] = [];
  try {
    global = await fetchPodcastEpisodes(query, limit);
  } catch (error) {
    if (!local.length) throw localError ?? error;
  }

  const unique = new Map<string, Track>();
  [...local, ...global].forEach((track) => {
    if (!unique.has(track.src)) unique.set(track.src, track);
  });
  return [...unique.values()].slice(0, limit);
}

export async function searchPodcastShows(query: string, limit = 12): Promise<Show[]> {
  const data = await getJson<{ results?: ItunesShow[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&entity=podcast&limit=${limit}`
  );
  return (data?.results ?? []).map(fromShow).filter((s): s is Show => s !== null);
}

const PODCAST_TOPICS = ['comedy', 'news', 'technology', 'indonesia'];
const PODCAST_DISCOVERY_LIMIT = 50;
let podcastDiscovery: Show[] | null = null;
let podcastDiscoveryPromise: Promise<Show[]> | null = null;

async function fetchPodcastDiscovery(): Promise<Show[]> {
  const results = await Promise.allSettled(
    PODCAST_TOPICS.map((topic) => searchPodcastShows(topic, PODCAST_DISCOVERY_LIMIT))
  );
  const unique = new Map<number, Show>();
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach((show) => {
      if (!unique.has(show.id)) unique.set(show.id, show);
    });
  });
  return [...unique.values()];
}

/** A cross-genre selection of podcast series, paged for the Podcasts view. */
export async function getPodcastShows(limit = 20, offset = 0): Promise<Show[]> {
  if (!podcastDiscovery) {
    podcastDiscoveryPromise ??= fetchPodcastDiscovery().catch((error) => {
      podcastDiscoveryPromise = null;
      throw error;
    });
    podcastDiscovery = await podcastDiscoveryPromise;
  }
  return podcastDiscovery.slice(offset, offset + limit);
}

/** Every available episode of one podcast series. */
export async function getPodcastEpisodes(showId: number, limit = 30): Promise<Track[]> {
  const data = await getJson<{ results?: ItunesPodcast[] }>(
    `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=${limit}`
  );
  return (data?.results ?? []).map(fromPodcast).filter((t): t is Track => t !== null);
}

const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search';

function radioList(data: RadioStation[] | null | undefined): RadioStation[] {
  return Array.isArray(data) ? data : [];
}

export async function getRadioStations(limit = 20, offset = 0): Promise<Track[]> {
  const data = await getJson<RadioStation[] | null>(
    `${RADIO_API}?limit=${limit}&offset=${offset}&order=clickcount&reverse=true&hidebroken=true`
  );
  return radioList(data).map(fromRadio).filter((t): t is Track => t !== null);
}

export async function getRadioByCountry(countryCode: string, limit = 40): Promise<Track[]> {
  const data = await getJson<RadioStation[] | null>(
    `${RADIO_API}?countrycode=${encodeURIComponent(countryCode)}&limit=${limit}&order=clickcount&reverse=true&hidebroken=true`
  );
  return radioList(data).map(fromRadio).filter((t): t is Track => t !== null);
}

export async function searchRadio(query: string, limit = 10): Promise<Track[]> {
  const params = `limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
  const byName = radioList(
    await getJson<RadioStation[] | null>(`${RADIO_API}?name=${encodeURIComponent(query)}&${params}`)
  );
  const list = byName.length
    ? byName
    : radioList(await getJson<RadioStation[] | null>(`${RADIO_API}?tag=${encodeURIComponent(query)}&${params}`));
  return list.map(fromRadio).filter((t): t is Track => t !== null);
}

/** All available songs by the same artist. */
export async function getArtistTracks(track: Track, limit = 40): Promise<Track[]> {
  if (track.source === 'audius' && track.artistHandle) {
    const data = await getJson<{ data?: AudiusTrack[] }>(
      `${AUDIUS}/users/handle/${encodeURIComponent(track.artistHandle)}/tracks?app_name=${APP_NAME}&limit=${limit}`
    );
    return (data?.data ?? []).map(fromAudius).filter((t): t is Track => t !== null);
  }

  if (track.source === 'deezer' && track.artistId) {
    const data = await getJsonp<DeezerList>(
      `https://api.deezer.com/artist/${track.artistId}/top?limit=${limit}`
    );
    return (data?.data ?? []).map(fromDeezer).filter((t): t is Track => t !== null);
  }

  if (track.source === 'itunes' && track.artistId) {
    const data = await getJson<{ results?: ItunesTrack[] }>(
      `https://itunes.apple.com/lookup?id=${track.artistId}&entity=song&limit=${limit}`
    );
    return (data?.results ?? []).map(fromItunes).filter((t): t is Track => t !== null);
  }

  if (track.source === 'jamendo' && track.artistId) {
    const url = `${JAMENDO}/artists/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&id=${encodeURIComponent(
      String(track.artistId)
    )}&limit=${limit}&audioformat=${JAMENDO_AUDIO_FORMAT}`;
    return jamendoRetry(() => jamendoTracks(url));
  }

  if (track.source === 'podcast' && track.artistId) {
    const data = await getJson<{ results?: ItunesPodcast[] }>(
      `https://itunes.apple.com/lookup?id=${track.artistId}&entity=podcastEpisode&limit=${limit}`
    );
    return (data?.results ?? []).map(fromPodcast).filter((t): t is Track => t !== null);
  }

  return [track];
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';

// Podcast episodes cannot be looked up by their own id, and a show lookup only
// returns the latest ~200 episodes. A compact payload in the track id keeps
// shared links working for any episode without another network request.
type PodcastPayload = {
  e: string;
  c?: string;
  t: string;
  a: string;
  r?: string;
  d?: number;
  s: string;
  al?: string;
};

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePodcastPayload(payload: PodcastPayload): string {
  return `podcast:${b64urlEncode(JSON.stringify(payload))}`;
}

function decodePodcastPayload(rawId: string): Track | null {
  try {
    const payload = JSON.parse(b64urlDecode(rawId)) as Partial<PodcastPayload> | null;
    if (!payload || !payload.s || !payload.t) return null;
    return {
      id: `podcast:${rawId}`,
      title: payload.t,
      artist: payload.a || 'Podcast',
      artwork: payload.r ?? '',
      duration: payload.d ?? 0,
      src: payload.s,
      source: 'podcast',
      album: payload.al,
      artistId: payload.c ? Number(payload.c) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a shared track id ("source:rawId") back into something playable, so
 * links and embeds work in a fresh tab without the original search results.
 */
export async function getTrackById(trackId: string): Promise<Track | null> {
  const cut = trackId.indexOf(':');
  if (cut < 1) return null;
  const source = trackId.slice(0, cut) as Source;
  const rawId = trackId.slice(cut + 1);
  if (!rawId) return null;

  try {
    if (source === 'audius') {
      const data = await getJson<{ data?: AudiusTrack } | null>(
        `${AUDIUS}/tracks/${encodeURIComponent(rawId)}?app_name=${APP_NAME}`
      );
      return data?.data ? fromAudius(data.data) : null;
    }

    if (source === 'jamendo' && JAMENDO_CLIENT_ID) {
      const url = `${JAMENDO}/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&id=${encodeURIComponent(
        rawId
      )}&audioformat=${JAMENDO_AUDIO_FORMAT}&include=licenses`;
      const hits = await jamendoRetry(() => jamendoTracks(url), 4);
      return hits[0] ?? null;
    }

    if (source === 'deezer') {
      const track = await getJsonp<DeezerTrack | null>(`https://api.deezer.com/track/${encodeURIComponent(rawId)}`);
      return track ? fromDeezer(track) : null;
    }

    if (source === 'itunes') {
      const data = await getJson<{ results?: ItunesTrack[] } | null>(
        `${ITUNES_LOOKUP}?id=${encodeURIComponent(rawId)}`
      );
      const hit = data?.results?.[0];
      return hit ? fromItunes(hit) : null;
    }

    if (source === 'podcast') {
      const inline = decodePodcastPayload(rawId);
      if (inline) return inline;

      // Older "podcast:<showId>:<episodeId>" ids still resolve through the show
      // when the episode is among the latest 200.
      const split = rawId.indexOf(':');
      if (split < 1) return null;
      const showId = rawId.slice(0, split);
      const episodeKey = rawId.slice(split + 1);
      const data = await getJson<{ results?: ItunesPodcast[] } | null>(
        `${ITUNES_LOOKUP}?id=${encodeURIComponent(showId)}&entity=podcastEpisode&limit=200`
      );
      const episodes = (data?.results ?? []).filter((r) => r.wrapperType === 'podcastEpisode');
      const hit = episodes.find((r) => String(r.trackId ?? r.previewUrl) === episodeKey);
      return hit ? fromPodcast(hit) : null;
    }

    if (source === 'radio') {
      const data = await getJson<RadioStation[] | null>(
        `https://de1.api.radio-browser.info/json/stations/byuuid/${encodeURIComponent(rawId)}`
      );
      const hit = Array.isArray(data) ? data[0] : null;
      return hit ? fromRadio(hit) : null;
    }
  } catch {
    return null;
  }

  return null;
}

type YouTubeSearchItem = {
  id?: { videoId?: string } | string;
  snippet?: { title?: string; channelTitle?: string; description?: string };
  status?: { embeddable?: boolean };
};

/** Whether the public YouTube API key is configured at build time. */
export function hasYouTubeApiKey(): boolean {
  return typeof YOUTUBE_API_KEY === 'string' && YOUTUBE_API_KEY.trim().length > 0;
}

// YouTube titles come back HTML-escaped ("Tom &amp; Jerry").
export function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(#x?[0-9a-f]+|amp|quot|apos|lt|gt);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const num = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

function fromYouTubeItem(item: YouTubeSearchItem): YouTubeVideo | null {
  // `search` returns { videoId }, while `videos` returns a plain id string.
  const id = typeof item.id === 'string' ? item.id : item.id?.videoId;
  if (!id) return null;
  return {
    id,
    title: decodeEntities(item.snippet?.title ?? ''),
    channelTitle: item.snippet?.channelTitle ? decodeEntities(item.snippet.channelTitle) : undefined,
    description: item.snippet?.description
      ? decodeEntities(item.snippet.description)
      : undefined,
  };
}

/** Search YouTube videos (used for the "Videos" section and music videos). */
export async function searchYouTubeVideos(query: string, maxResults = 12): Promise<YouTubeVideo[]> {
  if (!hasYouTubeApiKey() || !query.trim()) return [];
  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    q: query,
    type: 'video',
    maxResults: String(maxResults),
    part: 'snippet',
    // Videos that cannot be embedded would show an error inside our player.
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
  });
  const data = await getJson<{ items?: YouTubeSearchItem[] }>(
    `${YOUTUBE_API_BASE}/search?${params.toString()}`
  );
  return (data?.items ?? [])
    .map(fromYouTubeItem)
    .filter((video): video is YouTubeVideo => video !== null);
}

/**
 * Most popular music videos on YouTube. This endpoint costs one quota unit,
 * unlike `search`, so it is the cheap fallback when nothing personal is known.
 */
export async function getTrendingMusicVideos(maxResults = 12): Promise<YouTubeVideo[]> {
  if (!hasYouTubeApiKey()) return [];
  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: 'snippet,status',
    chart: 'mostPopular',
    videoCategoryId: '10',
    maxResults: String(maxResults),
  });
  const data = await getJson<{ items?: YouTubeSearchItem[] }>(
    `${YOUTUBE_API_BASE}/videos?${params.toString()}`
  );
  return (data?.items ?? [])
    // The chart endpoint cannot filter server-side, so drop blocked embeds.
    .filter((item) => item.status?.embeddable !== false)
    .map(fromYouTubeItem)
    .filter((video): video is YouTubeVideo => video !== null);
}

export type YouTubeVideoDetails = {
  description?: string;
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  publishedAt?: string;
};

type YouTubeStatsItem = {
  snippet?: { description?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

/**
 * Full description and public counters for one video. `search` only returns a
 * short snippet, so this costs one extra quota unit (cached by the caller).
 */
export async function getYouTubeVideoDetails(videoId: string): Promise<YouTubeVideoDetails | null> {
  if (!hasYouTubeApiKey() || !videoId) return null;
  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: 'snippet,statistics',
    id: videoId,
  });
  const data = await getJson<{ items?: YouTubeStatsItem[] }>(
    `${YOUTUBE_API_BASE}/videos?${params.toString()}`
  );
  const item = data?.items?.[0];
  if (!item) return null;
  return {
    description: item.snippet?.description ? decodeEntities(item.snippet.description) : undefined,
    viewCount: item.statistics?.viewCount,
    likeCount: item.statistics?.likeCount,
    commentCount: item.statistics?.commentCount,
    publishedAt: item.snippet?.publishedAt,
  };
}

/** Find a YouTube music video for a track (title + artist). */
export async function getMusicVideosFromTrack(track: Track, maxResults = 3): Promise<YouTubeVideo[]> {
  const query = [track.title, track.artist].filter(Boolean).join(' ');
  if (!query) return [];
  const videos = await searchYouTubeVideos(query, maxResults);
  // Prefer a video whose title contains the track title.
  const hit = videos.find((v) => v.title.toLowerCase().includes(track.title.trim().toLowerCase())) ?? videos[0];
  return hit ? [hit] : [];
}
