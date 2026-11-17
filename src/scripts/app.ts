import {
  decodeEntities,
  formatTime,
  getArtistTracks,
  getPodcastEpisodes,
  getPodcastShows,
  getRadioByCountry,
  getRadioStations,
  getTrackById,
  getTrending,
  getTrendingMusicVideos,
  getYouTubeVideoDetails,
  hasYouTubeApiKey,
  hasJamendoKey,
  searchAudius,
  searchJamendo,
  searchPodcasts,
  searchRadio,
  searchYouTubeVideos,
  type Show,
  type Track,
  type YouTubeVideo,
  type YouTubeVideoDetails,
} from '../lib/api';

const LIKED_KEY = 'wavetify:liked';
const HISTORY_KEY = 'wavetify:history';
const STATS_KEY = 'wavetify:stats';
const PLAYING_KEY = 'wavetify:playing';
const VOLUME_KEY = 'wavetify:volume';
const SEARCHES_KEY = 'wavetify:searches';
const VIDEO_CACHE_KEY = 'wavetify:youtube-videos';
const VIDEO_DETAILS_KEY = 'wavetify:youtube-details';
const PLAYLISTS_KEY = 'wavetify:playlists';

// The app was called echoX before the rename; carry saved state across so
// nobody loses their likes, playlists, history or last played track.
function migrateLegacyStorage() {
  const legacyPrefix = 'echox:';
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(legacyPrefix))
      .forEach((key) => {
        const next = `wavetify:${key.slice(legacyPrefix.length)}`;
        const value = localStorage.getItem(key);
        if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value);
        localStorage.removeItem(key);
      });
  } catch {
    /* private mode or storage disabled */
  }
}

migrateLegacyStorage();
const HISTORY_MAX = 40;
const STATS_MAX = 200;
const LIKED_MAX = 200;
const PLAYLISTS_MAX = 40;
const PLAYLIST_TRACKS_MAX = 500;
const SEARCHES_MAX = 8;
const VIDEO_CACHE_TTL = 6 * 60 * 60 * 1000;
const VIDEO_DETAILS_TTL = 24 * 60 * 60 * 1000;
const TRACK_SOURCES = new Set([
  'audius',
  'jamendo',
  // Legacy preview sources, kept so saved tracks still load.
  'deezer',
  'itunes',
  'podcast',
  'radio',
  'youtubeVideo',
]);

const playIcon =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const pauseIcon =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const audio = el<HTMLAudioElement>('audio');
const player = el<HTMLElement>('player');
const nowArt = el<HTMLDivElement>('now-art');
const nowTitle = el<HTMLDivElement>('now-title');
const nowArtist = el<HTMLDivElement>('now-artist');
const nowSrc = el<HTMLDivElement>('now-src');
const playBtn = el<HTMLButtonElement>('play-btn');
const likeBtn = el<HTMLButtonElement>('like-btn');
const fullBtn = el<HTMLButtonElement>('full-btn');
const seek = el<HTMLInputElement>('seek');
const cur = el<HTMLSpanElement>('cur');
const dur = el<HTMLSpanElement>('dur');
const volume = el<HTMLInputElement>('volume');
const muteBtn = el<HTMLButtonElement>('mute-btn');
let videoMode = false;
let videoPlaying = false;

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (videoId: string) => void;
  getCurrentTime?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  destroy?: () => void;
};

type YouTubeApi = {
  Player: new (target: HTMLElement, options: Record<string, unknown>) => YouTubePlayer;
};

let ytPlayer: YouTubePlayer | null = null;
let fallbackFrame: HTMLIFrameElement | null = null;
let loadedVideoId: string | null = null;
let ytApiPromise: Promise<YouTubeApi | null> | null = null;

const detail = el<HTMLElement>('detail');
const detailArt = el<HTMLDivElement>('detail-art');
const detailVideoFrame = el<HTMLElement>('detail-video-frame');
const detailVideoFs = el<HTMLButtonElement>('detail-video-fs');
const detailVideoInfo = el<HTMLElement>('detail-video-info');
const detailViews = el<HTMLElement>('detail-views');
const detailLikes = el<HTMLElement>('detail-likes');
const detailComments = el<HTMLElement>('detail-comments');
const detailVideoDesc = el<HTMLParagraphElement>('detail-video-desc');
const detailVideoLink = el<HTMLAnchorElement>('detail-video-link');
const detailTitle = el<HTMLHeadingElement>('detail-title');
const detailArtist = el<HTMLParagraphElement>('detail-artist');
const detailMeta = el<HTMLSpanElement>('detail-meta');
const detailPlay = el<HTMLButtonElement>('detail-play');
const detailLike = el<HTMLButtonElement>('detail-like');
const detailList = el<HTMLDivElement>('detail-list');
const detailCount = el<HTMLSpanElement>('detail-count');
const detailArtistName = el<HTMLSpanElement>('detail-artist-name');
const detailListPrefix = el<HTMLSpanElement>('detail-list-prefix');
const detailVibeArt = el<HTMLSpanElement>('detail-vibe-art');
const detailShare = el<HTMLButtonElement>('detail-share');
const playerShare = el<HTMLButtonElement>('player-share');
const npShare = el<HTMLButtonElement>('np-share');
const shareDialog = el<HTMLDialogElement>('share-dialog');
const shareArt = el<HTMLDivElement>('share-art');
const shareName = el<HTMLParagraphElement>('share-name');
const shareBy = el<HTMLParagraphElement>('share-by');
const shareLink = el<HTMLInputElement>('share-link');
const shareEmbed = el<HTMLInputElement>('share-embed');
const sharePreview = el<HTMLIFrameElement>('share-preview');
const confirmDialog = el<HTMLDialogElement>('confirm-dialog');
const confirmTitle = el<HTMLHeadingElement>('confirm-title');
const confirmText = el<HTMLParagraphElement>('confirm-text');
const confirmOk = el<HTMLButtonElement>('confirm-ok');
const confirmCancel = el<HTMLButtonElement>('confirm-cancel');
const shareCopyLink = el<HTMLButtonElement>('share-copy-link');
const shareCopyEmbed = el<HTMLButtonElement>('share-copy-embed');
const shareNative = el<HTMLButtonElement>('share-native');
const nowOpen = el<HTMLButtonElement>('now-open');

const np = el<HTMLElement>('np');
const npAmbient = el<HTMLDivElement>('np-ambient');
const npArt = el<HTMLDivElement>('np-art');
const npTitle = el<HTMLHeadingElement>('np-title');
const npArtist = el<HTMLParagraphElement>('np-artist');
const npSource = el<HTMLSpanElement>('np-source');
const npDesc = el<HTMLParagraphElement>('np-desc');
const npInfo = el<HTMLDListElement>('np-info');
const npFacts = el<HTMLElement>('np-facts');
const npFactsTitle = el<HTMLHeadingElement>('np-facts-title');
const npList = el<HTMLElement>('np-list');
const npListTitle = el<HTMLHeadingElement>('np-list-title');
const npTracks = el<HTMLDivElement>('np-tracks');
const npLink = el<HTMLAnchorElement>('np-link');
const npLike = el<HTMLButtonElement>('np-like');
const npPlay = el<HTMLButtonElement>('np-play');
const npVideo = el<HTMLElement>('np-video');
const npVideoFrame = el<HTMLElement>('np-video-frame');
const npVideoExpand = el<HTMLButtonElement>('np-video-expand');
const npVideoFs = el<HTMLButtonElement>('np-video-fs');
const npVideoPip = el<HTMLButtonElement>('np-video-pip');
const npBody = document.querySelector<HTMLElement>('.np-body') as HTMLElement;
const npTop = document.querySelector<HTMLElement>('.np-top') as HTMLElement;
const npSeek = el<HTMLInputElement>('np-seek');
const npCur = el<HTMLSpanElement>('np-cur');
const npDur = el<HTMLSpanElement>('np-dur');
const npProgress = el<HTMLElement>('np-progress');
const npDetail = el<HTMLButtonElement>('np-detail');
const npClose = el<HTMLButtonElement>('np-close');
const npPrev = el<HTMLButtonElement>('np-prev');
const npNext = el<HTMLButtonElement>('np-next');

const trendingGrid = el<HTMLDivElement>('trending-grid');
const videosGrid = el<HTMLDivElement>('videos-grid');
const videosHeading = el<HTMLHeadingElement>('videos-heading');
const videosHint = el<HTMLParagraphElement>('videos-hint');
const homeVideos = el<HTMLDivElement>('home-videos');
const homeVideosHead = el<HTMLDivElement>('home-videos-head');
const videoPlayAgain = el<HTMLDivElement>('video-play-again');
const videoPlayAgainHead = el<HTMLDivElement>('video-play-again-head');
const videoMostPlayed = el<HTMLDivElement>('video-most-played');
const videoMostPlayedHead = el<HTMLDivElement>('video-most-played-head');
const genreChips = el<HTMLDivElement>('genre-chips');
const searchInput = el<HTMLInputElement>('search-input');
const searchHeading = el<HTMLHeadingElement>('search-heading');
const searchHint = el<HTMLParagraphElement>('search-hint');
const audiusHead = el<HTMLDivElement>('audius-head');
const jamendoHead = el<HTMLDivElement>('jamendo-head');
const podcastHead = el<HTMLDivElement>('podcast-head');
const radioHead = el<HTMLDivElement>('radio-head');
const videoHead = el<HTMLDivElement>('video-head');
const audiusResults = el<HTMLDivElement>('audius-results');
const jamendoResults = el<HTMLDivElement>('jamendo-results');
const podcastResults = el<HTMLDivElement>('podcast-results');
const radioResults = el<HTMLDivElement>('radio-results');
const videoResults = el<HTMLDivElement>('video-results');
const homePlayAgainHead = el<HTMLDivElement>('home-play-again-head');
const homePlayAgain = el<HTMLDivElement>('home-play-again');
const pageBg = el<HTMLDivElement>('page-bg');
const pageBgTop = el<HTMLDivElement>('page-bg-top');
const homePodcastsHead = el<HTMLDivElement>('home-podcasts-head');
const homePodcasts = el<HTMLDivElement>('home-podcasts');
const homeRadioHead = el<HTMLDivElement>('home-radio-head');
const homeRadio = el<HTMLDivElement>('home-radio');
const homeClearHistory = el<HTMLButtonElement>('home-clear-history');
const podcastsHeading = el<HTMLHeadingElement>('podcasts-heading');
const podcastsHint = el<HTMLParagraphElement>('podcasts-hint');
const podcastsBack = el<HTMLButtonElement>('podcasts-back');
const podcastsGrid = el<HTMLDivElement>('podcasts-grid');
const podcastsMore = el<HTMLButtonElement>('podcasts-more');
const radioGrid = el<HTMLDivElement>('radio-grid');
const radioMore = el<HTMLButtonElement>('radio-more');
const likedGrid = el<HTMLDivElement>('liked-grid');
const likedStatus = el<HTMLDivElement>('liked-status');
const playAgainHead = el<HTMLDivElement>('play-again-head');
const playAgainGrid = el<HTMLDivElement>('play-again-grid');
const mostPlayedHead = el<HTMLDivElement>('most-played-head');
const mostPlayedGrid = el<HTMLDivElement>('most-played-grid');
const historyHead = el<HTMLDivElement>('history-head');
const historyList = el<HTMLDivElement>('history-list');
const topbar = document.querySelector<HTMLElement>('.topbar') as HTMLElement;
const searchToggle = el<HTMLButtonElement>('search-toggle');
const searchCancel = el<HTMLButtonElement>('search-cancel');

let queue: Track[] = [];
let index = -1;
let current: Track | null = null;
let searchTimer: number | undefined;
let searchSeq = 0;
let lastVolume = 0.8;
let detailOpen = false;
let detailKey: string | null = null;
let detailTracks: Track[] = [];

interface HistoryEntry {
  track: Track;
  playedAt: number;
}

interface PlayStat {
  track: Track;
  count: number;
  lastPlayed: number;
}

interface SavedPlayback {
  track: Track;
  queue: Track[];
  index: number;
  time: number;
  playing: boolean;
  savedAt: number;
}

const liked = new Map<string, Track>(loadLiked());
const history: HistoryEntry[] = loadHistory();
const stats = new Map<string, PlayStat>(loadStats());
const playlists: Playlist[] = loadPlaylists();

interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  tracks: Track[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

function loadLiked(): [string, Track][] {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    const list = raw ? (JSON.parse(raw) as Track[]) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(isTrack)
      .slice(-LIKED_MAX)
      .map((track) => normalizeTrack(track))
      .map((track) => [track.id, track] as [string, Track]);
  } catch {
    return [];
  }
}

function saveLiked() {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify([...liked.values()]));
  } catch {
    /* storage full or blocked: keep the in-memory likes */
  }
}

// Playlists keep a full snapshot of every track, not just an id: only Audius can
// be looked up again by id, and the other sources need the title, artwork and
// stream URL that were known when the track was saved.
function loadPlaylists(): Playlist[] {
  const stored = readStore<Playlist[]>(PLAYLISTS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item) => !!item && typeof item.id === 'string' && typeof item.name === 'string')
    .slice(0, PLAYLISTS_MAX)
    .map((item) => ({
      id: item.id,
      name: item.name,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      tracks: Array.isArray(item.tracks) ? item.tracks.filter(isTrack).map(normalizeTrack) : [],
    }));
}

function savePlaylists() {
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  } catch {
    /* storage full or blocked: the playlist still lives in memory */
  }
}

function loadVolume(): number {
  const stored = readStore<number | null>(VOLUME_KEY, null);
  return typeof stored === 'number' && Number.isFinite(stored) && stored >= 0 && stored <= 1
    ? stored
    : 0.8;
}

function saveVolume(value: number) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(value));
  } catch {
    /* storage blocked: the volume still applies for this session */
  }
}

function loadSearches(): string[] {
  const raw = readStore<string[]>(SEARCHES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 1);
}

function saveSearch(query: string) {
  const recent = loadSearches().filter((item) => item.toLowerCase() !== query.toLowerCase());
  recent.unshift(query);
  try {
    localStorage.setItem(SEARCHES_KEY, JSON.stringify(recent.slice(0, SEARCHES_MAX)));
  } catch {
    /* storage blocked: recommendations just use the in-memory history */
  }
}

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Entities were stored before YouTube titles were decoded; clean them on read.
function normalizeTrack(track: Track): Track {
  return {
    ...track,
    title: decodeEntities(track.title),
    artist: decodeEntities(track.artist),
  };
}

function isTrack(value: unknown): value is Track {
  const track = value as Partial<Track> | null;
  return (
    !!track &&
    typeof track.id === 'string' &&
    typeof track.title === 'string' &&
    typeof track.src === 'string' &&
    typeof track.source === 'string' &&
    TRACK_SOURCES.has(track.source)
  );
}

function loadHistory(): HistoryEntry[] {
  const raw = readStore<HistoryEntry[]>(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && isTrack(entry.track) && typeof entry.playedAt === 'number')
    .slice(0, HISTORY_MAX)
    .map((entry) => ({ ...entry, track: normalizeTrack(entry.track) }));
}

function loadStats(): [string, PlayStat][] {
  const raw = readStore<PlayStat[]>(STATS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((stat) => stat && isTrack(stat.track) && stat.count > 0)
    .map((stat) => ({ ...stat, track: normalizeTrack(stat.track) }))
    .map((stat) => [stat.track.id, stat] as [string, PlayStat]);
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  } catch {
    /* storage full or blocked: keep the in-memory list */
  }
}

function saveStats() {
  try {
    const list = [...stats.values()]
      .sort((a, b) => b.lastPlayed - a.lastPlayed)
      .slice(0, STATS_MAX);
    localStorage.setItem(STATS_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: keep the in-memory counts */
  }
}

let lastPlaybackSave = 0;

function savePlayback(force = false) {
  if (!current) return;
  const now = Date.now();
  if (!force && now - lastPlaybackSave < 4000) return;
  lastPlaybackSave = now;
  try {
    const safeQueue = queue.slice(0, 60);
    const saved: SavedPlayback = {
      track: current,
      queue: safeQueue,
      index: index >= 0 && index < safeQueue.length ? index : 0,
      time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      playing: !audio.paused,
      savedAt: now,
    };
    localStorage.setItem(PLAYING_KEY, JSON.stringify(saved));
  } catch {
    /* storage full or blocked: keep playing anyway */
  }
}

function restorePlayback() {
  const saved = readStore<SavedPlayback | null>(PLAYING_KEY, null);
  if (!saved || !isTrack(saved.track)) return;
  // A video waiting for a click should not start itself on page load.
  if (saved.track.videoId) return;

  const tracks = Array.isArray(saved.queue) ? saved.queue.filter(isTrack) : [];
  let list = tracks.length ? tracks : [saved.track];
  let position = list.findIndex((track) => track.id === saved.track?.id);
  if (position < 0) {
    list = [saved.track];
    position = 0;
  }

  queue = list;
  index = position;
  loadTrack(saved.track, false);

  const startAt = Math.max(0, Number(saved.time) || 0);
  const resume = () => {
    if (startAt > 0 && Number.isFinite(audio.duration) && startAt < audio.duration - 1) {
      audio.currentTime = startAt;
    }
    if (saved.playing) {
      // Browsers may block autoplay; the song stays loaded and paused.
      void audio.play().catch(() => {
        nowSrc.textContent = 'PAUSED · TAP PLAY TO RESUME';
      });
    }
  };
  if (audio.readyState >= 1) resume();
  else audio.addEventListener('loadedmetadata', resume, { once: true });
}

// A shared link ("/?t=source:id") loads that exact track in a fresh tab.
async function openSharedTrack(trackId: string) {
  const clean = new URL(location.href);
  clean.searchParams.delete('t');
  // `history` is the in-app play history, so target the browser API explicitly.
  window.history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);

  const track = await getTrackById(trackId);
  if (!track) {
    nowSrc.textContent = 'SHARED TRACK UNAVAILABLE';
    return;
  }
  queue = [track];
  index = 0;
  loadTrack(track, false);
  void audio.play().catch(() => {
    nowSrc.textContent = 'PAUSED · TAP PLAY TO RESUME';
  });
  if (track.live) closeDetail();
  else void openDetail(track);
}

function recordPlay(track: Track) {
  const at = Date.now();
  const existing = history.findIndex((entry) => entry.track.id === track.id);
  if (existing >= 0) history.splice(existing, 1);
  history.unshift({ track, playedAt: at });
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  saveHistory();

  const stat = stats.get(track.id);
  stats.set(track.id, { track, count: (stat?.count ?? 0) + 1, lastPlayed: at });
  saveStats();

  if (currentView === 'library') renderLibrary();
  if (currentView === 'home') {
    renderHomePlayAgain();
    renderHomeVideos();
  }
  if (currentView === 'videos') renderVideoLibrary();
}

function skeletonGrid(count = 6): string {
  return `<div class="skeleton-grid">${'<div class="skeleton"></div>'.repeat(count)}</div>`;
}

function showStatus(target: HTMLElement, message: string, isError = false) {
  target.innerHTML = `<div class="status${isError ? ' error' : ''}">${escapeHtml(message)}</div>`;
}

function paintRange(input: HTMLInputElement, percent: number) {
  const p = Math.max(0, Math.min(1, percent)) * 100;
  input.style.background = `linear-gradient(to right, var(--accent) ${p}%, #35353f ${p}%)`;
}

function coverMarkup(track: Pick<Track, 'artwork'>, size: 'sm' | 'md' | 'lg'): string {
  const fallback = `<span class="art-fallback art-fallback-${size}" aria-hidden="true">
    <span class="art-fallback-mark">♪</span>
    <span class="art-fallback-word">echo<span class="brand-x">X</span></span>
  </span>`;
  if (!track.artwork) return fallback;
  return `${fallback}<img loading="lazy" src="${escapeHtml(track.artwork)}" alt="" data-cover />`;
}

// A playlist has no artwork of its own: build its cover from the covers of the
// tracks inside it, up to a 2x2 grid.
function playlistCover(playlist: Playlist, size: 'md' | 'lg'): string {
  const fallback = `<span class="art-fallback art-fallback-${size}" aria-hidden="true">
    <span class="art-fallback-mark">♪</span>
    <span class="art-fallback-word">echo<span class="brand-x">X</span></span>
  </span>`;
  const covers = playlist.tracks
    .map((track) => track.artwork)
    .filter((src): src is string => typeof src === 'string' && src.length > 0)
    .slice(0, 4);
  if (!covers.length) return fallback;
  const cells = covers
    .map((src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy" data-cover />`)
    .join('');
  return `${fallback}<div class="pl-cover pl-cover-${covers.length}">${cells}</div>`;
}

// A broken cover reveals the branded fallback behind it. One capture-phase
// listener replaces per-image inline handlers, which a strict CSP would block.
document.addEventListener(
  'error',
  (event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement && target.hasAttribute('data-cover')) {
      target.style.display = 'none';
    }
  },
  true
);

function artistKey(track: Track): string {
  switch (track.source) {
    case 'audius':
      return `audius:${track.artistHandle ?? track.artist}`;
    case 'jamendo':
      return `jamendo:${track.artistId ?? track.artist}`;
    case 'deezer':
      return `deezer:${track.artistId ?? track.artist}`;
    case 'podcast':
      return `podcast:${track.artistId ?? track.artist}`;
    case 'radio':
      return `radio:${track.countryCode ?? track.artist}`;
    default:
      return `itunes:${track.artistId ?? track.artist}`;
  }
}

function sourceBadge(track: Track): { label: string; className: string } {
  switch (track.source) {
    case 'audius':
    case 'jamendo':
      return { label: 'FULL', className: '' };
    case 'radio':
      return { label: 'LIVE', className: ' live' };
    case 'podcast':
      return { label: 'PODCAST', className: ' podcast' };
    case 'youtubeVideo':
      return { label: 'VIDEO', className: '' };
    default:
      return { label: 'PREVIEW', className: ' preview' };
  }
}

function sourceMeta(track: Track, short = false): string {
  const labels = short
    ? {
        audius: 'AUDIUS · FULL TRACK',
        jamendo: 'JAMENDO · FULL TRACK',
        deezer: 'DEEZER · 30S PREVIEW',
        itunes: 'APPLE MUSIC · 30S PREVIEW',
        podcast: 'APPLE PODCASTS · EPISODE',
        radio: 'LIVE RADIO',
        youtubeVideo: 'YouTube · music video',
      }
    : {
        audius: 'Audius · full track',
        jamendo: 'Jamendo · full track',
        deezer: 'Deezer · 30s preview',
        itunes: 'Apple Music · 30s preview',
        podcast: 'Apple Podcasts · episode',
        radio: 'Live radio',
        youtubeVideo: 'YouTube · music video',
      };
  return labels[track.source];
}

/* ---------------- Cards ---------------- */

function makeCard(track: Track, list: Track[], position: number): HTMLButtonElement {
  const badge = sourceBadge(track);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.dataset.trackId = track.id;
  card.innerHTML = `
    <div class="card-art">
      ${coverMarkup(track, 'md')}
      <span class="badge-src${badge.className}">${badge.label}</span>
      <span class="card-eq"><i></i><i></i><i></i></span>
      <span class="card-play">${playIcon}</span>
    </div>
    <div class="card-title">${escapeHtml(track.title)}</div>
    <div class="card-artist">${escapeHtml(track.artist)}</div>
  `;
  card.addEventListener('click', () => {
    if (current?.id === track.id && !detailOpen) {
      togglePlay();
      return;
    }
    playQueue(list, position);
    // Live stations have no artist catalogue to expand.
    if (track.live) closeDetail();
    else void openDetail(track);
  });
  return card;
}

function renderGrid(container: HTMLElement, tracks: Track[], more?: HomeMore) {
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';
  tracks.forEach((track, i) => grid.append(makeCard(track, tracks, i)));
  if (more) grid.append(makeViewMoreCard(more));
  container.append(grid);
  syncPlayingCards();
}

type HomeMore = { label: string; view: View };

/** The extra card at the end of a Home row, linking to the matching view. */
function makeViewMoreCard(more: HomeMore): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card card-more';
  card.innerHTML = `
    <div class="card-art">
      <span class="card-more-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </span>
    </div>
    <div class="card-title">View more</div>
    <div class="card-artist">${escapeHtml(more.label)}</div>
  `;
  card.addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>(`[data-view="${more.view}"]`)?.click();
  });
  return card;
}

function makeShowCard(show: Show): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.innerHTML = `
    <div class="card-art">
      ${coverMarkup({ artwork: show.artwork }, 'md')}
      <span class="badge-src show">SHOW</span>
    </div>
    <div class="card-title">${escapeHtml(show.title)}</div>
    <div class="card-artist">${escapeHtml(show.publisher)}</div>
  `;
  card.addEventListener('click', () => void openPodcastShow(show));
  return card;
}

function renderShowGrid(container: HTMLElement, shows: Show[], more?: HomeMore) {
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';
  shows.forEach((show) => grid.append(makeShowCard(show)));
  if (more) grid.append(makeViewMoreCard(more));
  container.append(grid);
}

function syncPlayingCards() {
  const activePlaying = videoMode ? videoPlaying : !audio.paused;
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    card.classList.toggle('playing', card.dataset.trackId === current?.id);
    const play = card.querySelector<HTMLElement>('.card-play');
    if (play) {
      play.innerHTML = card.classList.contains('playing') && activePlaying ? pauseIcon : playIcon;
    }
  });
  // Detail, history and queue rows share the same playing state as the cards.
  document.querySelectorAll<HTMLElement>('.row').forEach((row) => {
    const playing = row.dataset.trackId === current?.id;
    row.classList.toggle('playing', playing);
    const play = row.querySelector<HTMLElement>('.row-play');
    if (play) play.innerHTML = playing && activePlaying ? pauseIcon : playIcon;
  });
}

/* ---------------- Expanded detail panel ---------------- */

async function openDetail(track: Track) {
  detailOpen = true;
  detail.hidden = false;
  syncVibe();
  renderDetailHead(track);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const key = artistKey(track);
  const isRadio = track.live === true;
  detailKey = key;
  detailCount.textContent = '';
  detailList.innerHTML = `<div class="row-skeleton"></div><div class="row-skeleton"></div><div class="row-skeleton"></div>`;

  try {
    const tracks = isRadio
      ? track.countryCode
        ? await getRadioByCountry(track.countryCode)
        : []
      : isVideoTrack(track)
        ? await relatedVideoTracks(track)
        : await getArtistTracks(track);
    if (detailKey !== key || !detailOpen) return;
    // A live station lists the other stations from its own region.
    const list = isRadio ? tracks.filter((item) => item.id !== track.id) : tracks;
    detailTracks = list.length ? list : [track];
    renderDetailList(track);
  } catch {
    if (detailKey !== key) return;
    detailTracks = [track];
    showStatus(
      detailList,
      isRadio
        ? 'Could not load other stations from this region.'
        : 'Could not load more songs from this artist.',
      true
    );
    detailCount.textContent = '';
  }
}

function setDetailBackdrop(url: string) {
  detailVibeArt.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : '';
  if (!url) return;
  // Some station logos refuse hotlinking; fall back to the accent wash.
  const probe = new Image();
  probe.onerror = () => {
    if (detailVibeArt.style.backgroundImage.includes(url)) detailVibeArt.style.backgroundImage = '';
  };
  probe.src = url;
}

type VideoDetailsStore = Record<string, { savedAt: number; details: YouTubeVideoDetails }>;
let videoDetailsStore: VideoDetailsStore | null = null;
let detailInfoVideoId: string | null = null;

function videoDetailsCache(): VideoDetailsStore {
  if (!videoDetailsStore) {
    videoDetailsStore = readStore<VideoDetailsStore>(VIDEO_DETAILS_KEY, {});
  }
  return videoDetailsStore;
}

function readVideoDetailsCache(videoId: string): YouTubeVideoDetails | null {
  const entry = videoDetailsCache()[videoId];
  if (!entry || Date.now() - entry.savedAt > VIDEO_DETAILS_TTL) return null;
  return entry.details;
}

function writeVideoDetailsCache(videoId: string, details: YouTubeVideoDetails) {
  const store = videoDetailsCache();
  store[videoId] = { savedAt: Date.now(), details };
  const ids = Object.keys(store);
  if (ids.length > 60) {
    ids
      .sort((a, b) => store[a].savedAt - store[b].savedAt)
      .slice(0, ids.length - 60)
      .forEach((id) => delete store[id]);
  }
  try {
    localStorage.setItem(VIDEO_DETAILS_KEY, JSON.stringify(store));
  } catch {
    /* storage blocked: details still last for this visit */
  }
}

function compactCount(value?: string): string | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  const short = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (num >= 1e9) return `${short(num / 1e9)}B`;
  if (num >= 1e6) return `${short(num / 1e6)}M`;
  if (num >= 1e3) return `${short(num / 1e3)}K`;
  return num.toLocaleString('en-US');
}

function applyVideoDetails(details: YouTubeVideoDetails) {
  detailViews.textContent = compactCount(details.viewCount) ?? '—';
  detailLikes.textContent = compactCount(details.likeCount) ?? '—';
  detailComments.textContent = compactCount(details.commentCount) ?? '—';
  const description = details.description?.trim();
  detailVideoDesc.textContent = description || 'No description for this video.';
  detailVideoDesc.classList.toggle('is-empty', !description);
}

async function renderVideoInfo(track: Track) {
  const videoId = track.videoId;
  if (!videoId) {
    detailInfoVideoId = null;
    detailVideoInfo.hidden = true;
    return;
  }

  detailInfoVideoId = videoId;
  detailVideoInfo.hidden = false;
  detailVideoLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  detailViews.textContent = '—';
  detailLikes.textContent = '—';
  detailComments.textContent = '—';
  const fallback = track.description?.trim();
  detailVideoDesc.textContent = fallback || 'Loading description…';
  detailVideoDesc.classList.toggle('is-empty', !fallback);

  const cached = readVideoDetailsCache(videoId);
  if (cached) {
    applyVideoDetails(cached);
    return;
  }

  try {
    const details = await getYouTubeVideoDetails(videoId);
    if (!details || detailInfoVideoId !== videoId) return;
    writeVideoDetailsCache(videoId, details);
    applyVideoDetails(details);
  } catch {
    if (detailInfoVideoId === videoId && !fallback) {
      detailVideoDesc.textContent = 'Description is not available right now.';
      detailVideoDesc.classList.add('is-empty');
    }
  }
}

function renderDetailHead(track: Track) {
  detail.classList.toggle('is-video', Boolean(track.videoId));
  void syncVideoPreview();
  void renderVideoInfo(track);
  detailArt.innerHTML = coverMarkup(track, 'lg');
  setDetailBackdrop(track.artwork);
  detailTitle.textContent = track.title;
  detailArtist.textContent = track.artist;
  detailArtistName.textContent = track.live ? track.country || track.artist : track.artist;
  detailListPrefix.textContent = track.live ? 'Other live stations in' : 'More from';
  detailMeta.textContent = sourceMeta(track);
  const playing = videoMode ? videoPlaying : !audio.paused;
  detailPlay.innerHTML = playing ? pauseIcon : playIcon;
  detailPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  detailLike.classList.toggle('liked', liked.has(track.id));
}

function renderDetailList(active: Track) {
  const unit = active.live ? 'station' : active.videoId ? 'video' : 'song';
  detailCount.textContent = `${detailTracks.length} ${detailTracks.length === 1 ? unit : `${unit}s`}`;
  detailList.innerHTML = '';
  detailTracks.forEach((track, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.dataset.trackId = track.id;
    row.classList.toggle('playing', track.id === active.id);
    row.innerHTML = `
      <span class="row-index">${i + 1}</span>
      <span class="row-art">${coverMarkup(track, 'sm')}</span>
      <span class="row-info">
        <span class="row-title">${escapeHtml(track.title)}</span>
        <span class="row-artist">${escapeHtml(track.artist)}</span>
      </span>
      <span class="row-dur">${track.live ? 'LIVE' : track.videoId ? '' : formatTime(track.duration)}</span>
      <span class="row-play">${playIcon}</span>
    `;
    row.addEventListener('click', () => {
      playQueue(detailTracks, i);
      renderDetailHead(track);
      renderDetailList(track);
    });
    detailList.append(row);
  });
}

function closeDetail() {
  detailOpen = false;
  stopVideoPreview();
  detail.hidden = true;
  detailKey = null;
  // Drop the cached artist list so reopening the panel always matches the
  // track that is actually playing.
  detailTracks = [];
  syncVibe();
}

// The panel background only moves while audio is actually running.
function syncVibe() {
  detail.classList.toggle('is-playing', detailOpen && !audio.paused);
}

/* ---------------- Full-screen now playing ---------------- */

function makeNpPlaylistRow(playlist: Playlist, track: Track, position: number): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row';
  row.dataset.trackId = track.id;
  row.classList.toggle('playing', track.id === current?.id);
  row.innerHTML = `
    <span class="row-index">${position + 1}</span>
    <span class="row-art">${coverMarkup(track, 'sm')}</span>
    <span class="row-info">
      <span class="row-title">${escapeHtml(track.title)}</span>
      <span class="row-artist">${escapeHtml(track.artist)}</span>
    </span>
    <span class="row-dur">${track.live ? 'LIVE' : formatTime(track.duration)}</span>
    <span class="row-play">${iconFor(track)}</span>
  `;
  row.addEventListener('click', () => {
    playQueue(playlist.tracks.slice(), position, { id: playlist.id, name: playlist.name });
  });
  return row;
}

function iconFor(track: Track): string {
  const playing = track.id === current?.id && !audio.paused;
  return playing ? pauseIcon : playIcon;
}

// Playing from a playlist opens a playlist-flavoured now playing sheet: the
// playlist cover, its name and only the tracks it contains.
function renderPlaylistNowPlaying(playlist: Playlist, track: Track) {
  np.classList.add('is-playlist');
  npArt.innerHTML = playlistCover(playlist, 'lg');
  const firstCover = playlist.tracks.find((item) => !!item.artwork)?.artwork;
  npAmbient.style.backgroundImage = firstCover ? `url(${JSON.stringify(firstCover)})` : 'none';
  npTitle.textContent = playlist.name;
  const count = playlist.tracks.length;
  npArtist.textContent = `${count} ${count === 1 ? 'track' : 'tracks'} · ${track.artist}`;
  // Keep this short: on a phone the eyebrow shares one line with the icons.
  npSource.textContent = 'PLAYLIST';
  npDesc.hidden = true;
  npDesc.textContent = '';
  npLike.disabled = false;
  npShare.disabled = false;
  npAdd.disabled = false;
  npLike.classList.toggle('liked', liked.has(track.id));
  npProgress.hidden = track.live === true || !!track.videoId;
  npCur.textContent = '0:00';
  npDur.textContent = track.live ? 'LIVE' : formatTime(track.duration);
  paintRange(npSeek, 0);
  npLink.hidden = true;
  npDetail.hidden = true;
  npFacts.hidden = true;
  npInfo.innerHTML = '';
  npList.hidden = false;
  npListTitle.textContent = `In ${playlist.name}`;
  npTracks.innerHTML = '';
  playlist.tracks.forEach((item, i) => npTracks.append(makeNpPlaylistRow(playlist, item, i)));
  syncNowPlaying();
}

function renderNowPlaying(track: Track) {
  np.classList.toggle('is-live', track.live === true);
  const playlist = queuePlaylist ? findPlaylist(queuePlaylist.id) : null;
  if (playlist) {
    renderPlaylistNowPlaying(playlist, track);
    return;
  }
  np.classList.remove('is-playlist');
  npList.hidden = true;
  npTracks.innerHTML = '';
  npDetail.hidden = false;
  npArt.innerHTML = coverMarkup(track, 'lg');
  npAmbient.style.backgroundImage = track.artwork ? `url(${JSON.stringify(track.artwork)})` : 'none';
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist;
  npSource.textContent = track.live ? `${sourceMeta(track)} · on air` : sourceMeta(track);
  npDesc.textContent = track.description ?? '';
  npDesc.hidden = !track.description;
  npLike.disabled = false;
  npShare.disabled = false;
  npAdd.disabled = false;
  npLike.classList.toggle('liked', liked.has(track.id));
  npDetail.textContent = track.live ? 'More live stations in this country' : 'More from this artist';
  npProgress.hidden = track.live === true || !!track.videoId;
  npCur.textContent = '0:00';
  npDur.textContent = track.live ? 'LIVE' : formatTime(track.duration);
  paintRange(npSeek, 0);
  npLink.hidden = !track.link;
  if (track.link) {
    npLink.href = track.link;
    npLink.textContent = `${track.linkLabel ?? 'Open source'} ↗`;
  }

  const facts = track.info ?? [];
  npFacts.hidden = facts.length === 0;
  npFactsTitle.textContent = track.live
    ? 'Station details'
    : track.source === 'podcast'
      ? 'Episode details'
      : 'Track details';
  npInfo.innerHTML = facts
    .map(
      (fact) =>
        `<div class="np-fact"><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`
    )
    .join('');

  syncNowPlaying();
}

function syncNowPlaying() {
  if (videoMode) {
    syncVideoUi();
    return;
  }
  const playing = !audio.paused;
  npPlay.innerHTML = playing ? pauseIcon : playIcon;
  npPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

let npReturnFocus: HTMLElement | null = null;

function openNowPlaying() {
  if (!current) return;
  if (pipMode) setPip(false);
  // The big player takes over the video; drop the muted card preview.
  stopVideoPreview();
  np.classList.remove('is-closing');
  renderNowPlaying(current);
  npReturnFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  np.hidden = false;
  document.body.classList.add('np-open');
  npClose.focus({ preventScroll: true });
}

let npClosing = false;

function closeNowPlaying() {
  if (np.hidden || npClosing) return;
  if (pipMode) setPip(false);
  npClosing = true;
  np.classList.add('is-closing');

  const finish = () => {
    if (!npClosing) return;
    npClosing = false;
    np.classList.remove('is-closing');
    np.hidden = true;
    document.body.classList.remove('np-open');
    npReturnFocus?.focus({ preventScroll: true });
    npReturnFocus = null;
    // Back on the page: bring the muted card preview back, in sync.
    void syncVideoPreview();
  };

  const sheet = np.querySelector('.np-sheet');
  if (!sheet) {
    finish();
    return;
  }
  // Slide the page back down, with a timer in case the animation is skipped.
  sheet.addEventListener('animationend', finish, { once: true });
  window.setTimeout(finish, 400);
}

// Reopen the artist list the current song was started from (e.g. after
// switching to another menu), without reloading or interrupting playback.
function showPlayingList() {
  if (!current) return;
  if (current.live) {
    if (detailOpen && detailKey === artistKey(current)) {
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    void openDetail(current);
    return;
  }
  if (detailOpen) {
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (!detailTracks.length) {
    void openDetail(current);
    return;
  }
  detailOpen = true;
  detail.hidden = false;
  detailKey = artistKey(current);
  renderDetailHead(current);
  renderDetailList(current);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onTrackChanged(track: Track) {
  if (!np.hidden) renderNowPlaying(track);
  if (!detailOpen) return;
  // A new artist needs a fresh list; otherwise just move the highlight.
  if (artistKey(track) !== detailKey) {
    void openDetail(track);
    return;
  }
  renderDetailHead(track);
  renderDetailList(track);
}

/* ---------------- Share & embed ---------------- */

function shareLinks(track: Track) {
  const link = new URL('/', location.origin);
  link.searchParams.set('t', track.id);
  const embed = new URL('/embed/', location.origin);
  embed.searchParams.set('t', track.id);
  const label = `${track.title} — ${track.artist}`
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  const code = `<iframe src="${embed.toString()}" width="360" height="152" style="border:0;border-radius:14px" loading="lazy" allow="autoplay; encrypted-media" title="${label}"></iframe>`;
  return { link: link.toString(), embed: embed.toString(), code };
}

function resetCopy(button: HTMLButtonElement, label: string) {
  button.textContent = label;
  button.classList.remove('is-done');
}

function legacyCopy(value: string) {
  const field = document.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.top = '-1000px';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const ok = document.execCommand('copy');
  field.remove();
  return ok;
}

async function copyValue(value: string, button: HTMLButtonElement) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(value);
    copied = true;
  } catch {
    copied = legacyCopy(value);
  }
  button.textContent = copied ? 'Copied' : 'Select';
  button.classList.toggle('is-done', copied);
  window.setTimeout(() => resetCopy(button, 'Copy'), 1600);
}

function openShare(track: Track) {
  const { link, embed, code } = shareLinks(track);
  shareArt.innerHTML = '';
  if (track.artwork) {
    const img = document.createElement('img');
    img.src = track.artwork;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    shareArt.append(img);
  } else {
    shareArt.innerHTML = '<span aria-hidden="true">♪</span>';
  }
  shareName.textContent = track.title;
  shareBy.textContent = track.artist;
  shareLink.value = link;
  shareEmbed.value = code;
  // Load the real embed page so the preview can actually be played.
  if (sharePreview.src !== embed) sharePreview.src = embed;
  resetCopy(shareCopyLink, 'Copy');
  resetCopy(shareCopyEmbed, 'Copy');
  shareNative.hidden = typeof navigator.share !== 'function';
  if (typeof shareDialog.showModal === 'function') shareDialog.showModal();
  else shareDialog.setAttribute('open', '');
}

/* ---------------- Player ---------------- */

// When a queue comes from a playlist the player labels itself with the
// playlist name, which is more useful than the source while listening.
let queuePlaylist: { id: string; name: string } | null = null;

function playQueue(list: Track[], position: number, playlist?: { id: string; name: string }) {
  queue = list;
  index = position;
  queuePlaylist = playlist ?? null;
  loadTrack(queue[index], true);
}

function loadTrack(track: Track, autoplay: boolean) {
  current = track;
  paintHomeBackdrops();
  player.classList.remove('disabled');
  nowTitle.textContent = queuePlaylist?.name ?? track.title;
  nowArtist.textContent = track.artist;
  nowSrc.textContent = sourceMeta(track, true);
  nowArt.innerHTML = coverMarkup(track, 'md');
  nowOpen.disabled = false;
  likeBtn.disabled = false;
  fullBtn.disabled = false;
  playerShare.disabled = false;
  likeBtn.classList.toggle('liked', liked.has(track.id));
  const live = track.live === true;
  const isVideo = typeof track.videoId === 'string' && track.videoId.length > 0;
  if (isVideo) {
    // Stop the audio element before the video takes over, and never leave it
    // pointing at an empty source (that fires a misleading stream error).
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    void startYouTubePlayer(track.videoId as string);
  } else {
    exitVideoMode();
    audio.src = track.src;
  }
  cur.textContent = live || isVideo ? '' : '0:00';
  seek.value = '0';
  seek.disabled = live || isVideo;
  paintRange(seek, 0);
  dur.textContent = live ? 'LIVE' : isVideo ? '' : formatTime(track.duration);
  syncPlayingCards();
  onTrackChanged(track);
  savePlayback(true);
  if (autoplay) {
    recordPlay(track);
    if (!isVideo) {
      void audio.play().catch(() => {
        nowSrc.textContent = 'PLAYBACK FAILED · TRY ANOTHER SONG';
      });
    }
  }
}

function togglePlay() {
  if (!current) {
    if (queue.length) loadTrack(queue[0], true);
    return;
  }
  if (videoMode) {
    toggleVideoPlay();
    return;
  }
  if (audio.paused) void audio.play().catch(() => {});
  else audio.pause();
}

function loadYouTubeApi(): Promise<YouTubeApi | null> {
  const w = window as unknown as { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    // The iframe API calls this global once it is ready; if it never loads
    // (blocked network, extension) fall back to a plain embed.
    const previous = w.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => resolve(w.YT?.Player ? w.YT : null), 8000);
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      previous?.();
      resolve(w.YT?.Player ? w.YT : null);
    };
    // Load it as a classic script: the iframe API is not an ES module, and
    // importing the URL as one can leave `window.YT` undefined.
    if (!document.querySelector('script[data-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeApi = '';
      document.head.append(script);
    }
  });
  return ytApiPromise;
}

function clearVideoPlayer() {
  try {
    ytPlayer?.destroy?.();
  } catch {
    /* the player may already be gone */
  }
  ytPlayer = null;
  fallbackFrame = null;
  loadedVideoId = null;
  npVideoFrame.innerHTML = '';
}

// Muted copy of the current video shown in the "Now playing" card while the
// full-screen player is closed; the hidden main player keeps the audio.
let previewPlayer: YouTubePlayer | null = null;
let previewVideoId: string | null = null;

function stopVideoPreview() {
  try {
    previewPlayer?.destroy?.();
  } catch {
    /* the preview may already be gone */
  }
  previewPlayer = null;
  previewVideoId = null;
  detailVideoFrame.innerHTML = '';
}

async function syncVideoPreview() {
  const videoId = current?.videoId;
  const shouldShow = videoMode && detailOpen && np.hidden && typeof videoId === 'string';
  if (!shouldShow) {
    if (previewPlayer || previewVideoId) stopVideoPreview();
    return;
  }

  if (previewPlayer && previewVideoId === videoId) {
    if (videoPlaying) previewPlayer.playVideo();
    else previewPlayer.pauseVideo();
    return;
  }

  stopVideoPreview();
  const startAt = ytPlayer?.getCurrentTime?.() ?? 0;
  const api = await loadYouTubeApi();
  if (!videoMode || !detailOpen || !np.hidden || current?.videoId !== videoId) return;
  if (!api) return;

  const host = document.createElement('div');
  detailVideoFrame.append(host);
  previewVideoId = videoId;
  previewPlayer = new api.Player(host, {
    videoId,
    playerVars: {
      autoplay: 0,
      mute: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      disablekb: 1,
      iv_load_policy: 3,
    },
    events: {
      onReady: (event: { target: YouTubePlayer }) => {
        if (startAt > 1) event.target.seekTo?.(startAt, true);
        if (videoPlaying) event.target.playVideo();
      },
    },
  });
}

function createYouTubePlayer(api: YouTubeApi, videoId: string) {
  clearVideoPlayer();
  const host = document.createElement('div');
  npVideoFrame.append(host);
  loadedVideoId = videoId;
  ytPlayer = new api.Player(host, {
    videoId,
    playerVars: {
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      origin: location.origin,
    },
    events: {
      onReady: (event: { target: YouTubePlayer }) => {
        videoPlaying = true;
        event.target.playVideo();
        syncVideoUi();
        syncPlayingCards();
      },
      onStateChange: (event: { data: number }) => {
        // 0 = ended, 1 = playing, 2 = paused.
        if (event.data === 1) videoPlaying = true;
        else if (event.data === 0 || event.data === 2) videoPlaying = false;
        else return;
        syncVideoUi();
        syncPlayingCards();
        if (event.data === 0) {
          // Advance the queue like the audio player does once the video ends.
          window.setTimeout(() => {
            if (videoMode && current?.videoId && index + 1 < queue.length) step(1);
          }, 0);
        }
      },
    },
  });
}

function createFallbackPlayer(videoId: string) {
  clearVideoPlayer();
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  frame.allowFullscreen = true;
  frame.title = 'Now playing video';
  npVideoFrame.append(frame);
  fallbackFrame = frame;
  loadedVideoId = videoId;
}

function iframeCommand(func: 'playVideo' | 'pauseVideo') {
  fallbackFrame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
}

async function startYouTubePlayer(videoId: string) {
  videoMode = true;
  videoPlaying = true;
  npVideo.hidden = false;
  np.classList.add('video-mode');
  npBody.classList.add('video-mode');
  syncVideoUi();
  void syncVideoPreview();

  if (loadedVideoId === videoId) {
    // The same video is already mounted: just resume it.
    if (ytPlayer) ytPlayer.playVideo();
    else iframeCommand('playVideo');
    return;
  }

  clearVideoPlayer();
  const api = await loadYouTubeApi();
  // The user may have switched tracks while the API was loading.
  if (!videoMode || current?.videoId !== videoId) return;
  if (api) createYouTubePlayer(api, videoId);
  else createFallbackPlayer(videoId);
}

function exitVideoMode() {
  const wasPip = pipMode;
  videoMode = false;
  videoPlaying = false;
  setExpanded(false);
  setPip(false);
  stopVideoPreview();
  np.classList.remove('video-mode');
  npBody.classList.remove('video-mode');
  npVideo.hidden = true;
  if (document.fullscreenElement === npVideo) void document.exitFullscreen().catch(() => {});
  clearVideoPlayer();
  // Leaving pip means the next track should not reopen the full player.
  if (wasPip) closeNowPlaying();
}

function toggleVideoPlay() {
  if (!videoMode || !current?.videoId) return;
  videoPlaying = !videoPlaying;
  if (videoPlaying) {
    if (ytPlayer) ytPlayer.playVideo();
    else if (fallbackFrame) iframeCommand('playVideo');
    else void startYouTubePlayer(current.videoId);
  } else if (ytPlayer) {
    ytPlayer.pauseVideo();
  } else {
    iframeCommand('pauseVideo');
  }
  syncVideoUi();
  syncPlayingCards();
  void syncVideoPreview();
}

function syncVideoUi() {
  const label = videoPlaying ? 'Pause' : 'Play';
  const icon = videoPlaying ? pauseIcon : playIcon;
  playBtn.innerHTML = icon;
  playBtn.setAttribute('aria-label', label);
  if (detailOpen) {
    detailPlay.innerHTML = icon;
    detailPlay.setAttribute('aria-label', label);
  }
  npPlay.innerHTML = icon;
  npPlay.setAttribute('aria-label', label);
}

// Real fullscreen for the video; iOS Safari has no element fullscreen, so the
// button is hidden there and YouTube's own fullscreen control takes over.
if (typeof npVideo.requestFullscreen !== 'function') npVideoFs.hidden = true;
npVideoFs.addEventListener('click', () => {
  if (document.fullscreenElement === npVideo) {
    void document.exitFullscreen().catch(() => {});
    return;
  }
  if (typeof npVideo.requestFullscreen === 'function') {
    void npVideo.requestFullscreen().catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === npVideo;
  npVideo.classList.toggle('is-fullscreen', active);
  npVideoFs.classList.toggle('is-on', active);
  npVideoFs.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Fullscreen video');
});

function setExpanded(expanded: boolean) {
  npVideo.classList.toggle('is-expanded', expanded);
  npVideoExpand.classList.toggle('is-on', expanded);
  npVideoExpand.setAttribute('aria-label', expanded ? 'Shrink video' : 'Enlarge video');
}

let pipMode = false;
// Last position the floating window was dragged to, kept between PiP sessions.
let pipPosition: { left: number; top: number } | null = null;
let pipDrag: { pointerId: number; offsetX: number; offsetY: number } | null = null;

/** Keep the floating window fully on screen, however the viewport changes. */
function clampPip(left: number, top: number): { left: number; top: number } {
  const rect = np.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
}

function placePip(left: number, top: number) {
  const pos = clampPip(left, top);
  pipPosition = pos;
  np.style.left = `${pos.left}px`;
  np.style.top = `${pos.top}px`;
  np.style.right = 'auto';
  np.style.bottom = 'auto';
}

// Picture in picture for a cross-origin YouTube iframe: the browser PiP API
// cannot take over the player, so now playing itself shrinks into a floating
// video window that can be dragged anywhere in the page.
function setPip(active: boolean) {
  pipMode = active;
  np.classList.toggle('is-pip', active);
  npVideoPip.classList.toggle('is-on', active);
  npVideoPip.setAttribute('aria-label', active ? 'Exit picture in picture' : 'Picture in picture');
  np.setAttribute('aria-modal', active ? 'false' : 'true');
  document.body.classList.toggle('np-open', !active && !np.hidden);

  if (active) {
    // Measure after the class lands so the default sits above the player bar.
    const rect = np.getBoundingClientRect();
    const fallbackLeft = window.innerWidth - rect.width - 16;
    const fallbackTop = window.innerHeight - rect.height - 104;
    placePip(pipPosition?.left ?? fallbackLeft, pipPosition?.top ?? fallbackTop);
  } else {
    pipDrag = null;
    np.classList.remove('is-dragging');
    for (const prop of ['left', 'top', 'right', 'bottom']) np.style.removeProperty(prop);
  }
}

/* Drag the floating window by its control strip, not by the YouTube iframe. */
npTop.addEventListener('pointerdown', (event) => {
  if (!pipMode || (event.target as HTMLElement).closest('button')) return;
  const rect = np.getBoundingClientRect();
  pipDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  np.classList.add('is-dragging');
  npTop.setPointerCapture(event.pointerId);
  event.preventDefault();
});
npTop.addEventListener('pointermove', (event) => {
  if (!pipDrag || event.pointerId !== pipDrag.pointerId) return;
  placePip(event.clientX - pipDrag.offsetX, event.clientY - pipDrag.offsetY);
});
const endPipDrag = (event: PointerEvent) => {
  if (!pipDrag || event.pointerId !== pipDrag.pointerId) return;
  pipDrag = null;
  np.classList.remove('is-dragging');
  try {
    npTop.releasePointerCapture(event.pointerId);
  } catch {
    /* the capture may already be gone */
  }
};
npTop.addEventListener('pointerup', endPipDrag);
npTop.addEventListener('pointercancel', endPipDrag);

window.addEventListener('resize', () => {
  if (!pipMode || !pipPosition) return;
  placePip(pipPosition.left, pipPosition.top);
});

npVideoExpand.addEventListener('click', () => {
  if (pipMode) setPip(false);
  setExpanded(!npVideo.classList.contains('is-expanded'));
});

npVideoPip.addEventListener('click', () => {
  if (!pipMode) {
    setExpanded(false);
    if (document.fullscreenElement === npVideo) void document.exitFullscreen().catch(() => {});
  }
  setPip(!pipMode);
});

// Fullscreen from the card goes to the real player (and then native fullscreen).
detailVideoFs.addEventListener('click', () => {
  openNowPlaying();
  if (typeof npVideo.requestFullscreen === 'function') {
    void npVideo.requestFullscreen().catch(() => {});
  }
});

function step(delta: number) {
  if (!queue.length) return;
  const next = (index + delta + queue.length) % queue.length;
  index = next;
  loadTrack(queue[next], true);
}

audio.addEventListener('play', () => {
  // Video playback owns the transport controls; the audio element is idle.
  if (videoMode) return;
  if (current) nowSrc.textContent = sourceMeta(current, true);
  savePlayback(true);
  syncVibe();
  syncNowPlaying();
  playBtn.innerHTML = pauseIcon;
  playBtn.setAttribute('aria-label', 'Pause');
  if (detailOpen) {
    detailPlay.innerHTML = pauseIcon;
    detailPlay.setAttribute('aria-label', 'Pause');
  }
  syncPlayingCards();
});

audio.addEventListener('pause', () => {
  if (videoMode) return;
  savePlayback(true);
  syncVibe();
  syncNowPlaying();
  playBtn.innerHTML = playIcon;
  playBtn.setAttribute('aria-label', 'Play');
  if (detailOpen) {
    detailPlay.innerHTML = playIcon;
    detailPlay.setAttribute('aria-label', 'Play');
  }
  syncPlayingCards();
});

audio.addEventListener('loadedmetadata', () => {
  dur.textContent = current?.live ? 'LIVE' : formatTime(audio.duration);
  if (!np.hidden) npDur.textContent = current?.live ? 'LIVE' : formatTime(audio.duration);
  audio.volume = Number(volume.value);
});

audio.addEventListener('seeked', () => savePlayback(true));

window.addEventListener('pagehide', () => savePlayback(true));

audio.addEventListener('timeupdate', () => {
  savePlayback();
  if (current?.live) return;
  const total = audio.duration || 0;
  cur.textContent = formatTime(audio.currentTime);
  if (total > 0) {
    seek.value = String(Math.round((audio.currentTime / total) * 1000));
    paintRange(seek, audio.currentTime / total);
  }
  if (!np.hidden) {
    npCur.textContent = formatTime(audio.currentTime);
    if (total > 0) {
      const ratio = audio.currentTime / total;
      npSeek.value = String(Math.round(ratio * 1000));
      paintRange(npSeek, ratio);
    }
  }
});

audio.addEventListener('ended', () => {
  if (index + 1 < queue.length) step(1);
  else {
    audio.pause();
    audio.currentTime = 0;
  }
});

// Jamendo stream URLs carry a short-lived token, so a track saved in a playlist
// can fail to load long after it was added. Ask the API for that same track
// again, swap in the fresh URL everywhere it is stored and carry on playing.
const jamendoRetry = new Map<string, number>();
let refreshingJamendo = false;

function patchTrackSource(id: string, src: string): boolean {
  let changed = false;
  const apply = (candidate: Track | null | undefined) => {
    if (candidate && candidate.id === id && candidate.src !== src) {
      candidate.src = src;
      changed = true;
    }
  };
  apply(current);
  queue.forEach(apply);
  apply(liked.get(id));
  history.forEach((entry) => apply(entry.track));
  [...stats.values()].forEach((stat) => apply(stat.track));
  playlists.forEach((playlist) => playlist.tracks.forEach(apply));
  return changed;
}

async function refreshJamendoSource(track: Track): Promise<boolean> {
  if (track.source !== 'jamendo' || refreshingJamendo) return false;
  // One attempt per track per minute, so a dead track cannot loop forever.
  const lastTry = jamendoRetry.get(track.id) ?? 0;
  if (Date.now() - lastTry < 60_000) return false;
  jamendoRetry.set(track.id, Date.now());
  refreshingJamendo = true;
  nowSrc.textContent = 'REFRESHING STREAM…';
  try {
    const fresh = await getTrackById(track.id);
    if (!fresh || fresh.source !== 'jamendo' || !fresh.src) {
      nowSrc.textContent = 'STREAM UNAVAILABLE';
      return false;
    }
    if (patchTrackSource(track.id, fresh.src)) savePlaylists();
    const resumeAt = audio.currentTime;
    audio.src = fresh.src;
    if (resumeAt > 0) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          try {
            audio.currentTime = resumeAt;
          } catch {
            /* the track may be shorter than the old position */
          }
        },
        { once: true }
      );
    }
    await audio.play().catch(() => {
      nowSrc.textContent = 'PLAYBACK FAILED · TRY ANOTHER SONG';
    });
    nowSrc.textContent = sourceMeta(track, true);
    savePlayback(true);
    return true;
  } catch {
    nowSrc.textContent = 'STREAM UNAVAILABLE';
    return false;
  } finally {
    refreshingJamendo = false;
  }
}

audio.addEventListener('error', () => {
  const track = current;
  if (track && track.source === 'jamendo' && audio.getAttribute('src')) {
    void refreshJamendoSource(track);
    return;
  }
  nowSrc.textContent = 'STREAM UNAVAILABLE';
});

playBtn.addEventListener('click', togglePlay);
detailPlay.addEventListener('click', togglePlay);
nowOpen.addEventListener('click', (event) => {
  // The cover opens the full-screen player. The title opens the artist list,
  // except while a playlist is playing: then it opens that playlist's player.
  if ((event.target as HTMLElement).closest('.now-art')) {
    openNowPlaying();
    return;
  }
  if (queuePlaylist && findPlaylist(queuePlaylist.id)) {
    openNowPlaying();
    return;
  }
  showPlayingList();
});

el<HTMLButtonElement>('next-btn').addEventListener('click', () => step(1));
el<HTMLButtonElement>('prev-btn').addEventListener('click', () => {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  step(-1);
});

seek.addEventListener('input', () => {
  if (current?.live) return;
  const total = audio.duration || 0;
  if (!total) return;
  const ratio = Number(seek.value) / 1000;
  audio.currentTime = ratio * total;
  paintRange(seek, ratio);
  cur.textContent = formatTime(audio.currentTime);
});

volume.addEventListener('input', () => {
  const value = Number(volume.value);
  audio.volume = value;
  audio.muted = value === 0;
  if (value > 0) lastVolume = value;
  saveVolume(value);
  paintRange(volume, value);
  syncMuteIcon();
});

// The paths sit slightly off the viewBox centre, so nudge each set to keep the
// glyph in the middle of the round button.
const speakerIcon =
  '<g transform="translate(1.3 0)"><path d="M4 9.5h3L12 5v14L7 14.5H4z" /><path d="M16 9a4 4 0 0 1 0 6" /></g>';
const mutedIcon =
  '<g transform="translate(-0.25 0)"><path d="M4 9.5h3L12 5v14L7 14.5H4z" /><path d="m16.5 9.5 4 4" /><path d="m20.5 9.5-4 4" /></g>';

function syncMuteIcon() {
  const muted = audio.muted || audio.volume === 0;
  muteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${muted ? mutedIcon : speakerIcon}</svg>`;
  muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  muteBtn.classList.toggle('muted', muted);
}

muteBtn.addEventListener('click', () => {
  if (audio.muted || audio.volume === 0) {
    audio.muted = false;
    audio.volume = lastVolume;
    volume.value = String(lastVolume);
  } else {
    lastVolume = audio.volume;
    audio.muted = true;
    audio.volume = 0;
    volume.value = '0';
  }
  paintRange(volume, Number(volume.value));
  syncMuteIcon();
});

function toggleLike(track: Track, buttons: HTMLButtonElement[]) {
  if (liked.has(track.id)) {
    liked.delete(track.id);
  } else {
    liked.set(track.id, track);
    // Keep memory and storage on the same limit, dropping the oldest like.
    while (liked.size > LIKED_MAX) {
      const oldest = liked.keys().next().value;
      if (oldest === undefined) break;
      liked.delete(oldest);
    }
  }
  saveLiked();
  const isLiked = liked.has(track.id);
  buttons.forEach((btn) => btn.classList.toggle('liked', isLiked));
  npLike.classList.toggle('liked', isLiked);
  if (currentView === 'library') renderLibrary();
}

likeBtn.addEventListener('click', () => {
  if (!current) return;
  toggleLike(current, [likeBtn, detailLike]);
});

detailLike.addEventListener('click', () => {
  if (!current) return;
  toggleLike(current, [likeBtn, detailLike]);
});

npLike.addEventListener('click', () => {
  if (!current) return;
  toggleLike(current, [likeBtn, detailLike]);
});

fullBtn.addEventListener('click', openNowPlaying);
npClose.addEventListener('click', closeNowPlaying);

detailShare.addEventListener('click', () => {
  if (current) openShare(current);
});
playerShare.addEventListener('click', () => {
  if (current) openShare(current);
});
npShare.addEventListener('click', () => {
  if (current) openShare(current);
});
shareCopyLink.addEventListener('click', () => void copyValue(shareLink.value, shareCopyLink));
shareCopyEmbed.addEventListener('click', () => void copyValue(shareEmbed.value, shareCopyEmbed));
shareDialog.addEventListener('close', () => {
  sharePreview.src = 'about:blank';
});
shareNative.addEventListener('click', async () => {
  if (!current) return;
  const { link } = shareLinks(current);
  try {
    await navigator.share({ title: current.title, text: `${current.title} — ${current.artist}`, url: link });
  } catch {
    /* the share sheet was dismissed */
  }
});
npPlay.addEventListener('click', togglePlay);
npDetail.addEventListener('click', () => {
  closeNowPlaying();
  showPlayingList();
});

npSeek.addEventListener('input', () => {
  if (current?.live) return;
  const total = audio.duration || 0;
  if (!total) return;
  const ratio = Number(npSeek.value) / 1000;
  audio.currentTime = ratio * total;
  paintRange(npSeek, ratio);
  npCur.textContent = formatTime(audio.currentTime);
});

npPrev.addEventListener('click', () => {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  step(-1);
});
npNext.addEventListener('click', () => step(1));

// Keep keyboard focus inside the modal while it is open.
np.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = [
    ...np.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((node) => node.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

el<HTMLButtonElement>('detail-close').addEventListener('click', closeDetail);

document.addEventListener('keydown', (event) => {
  if (confirmDialog.open) return;
  if (event.key === 'Escape' && !np.hidden) {
    closeNowPlaying();
    return;
  }
  if (event.key === 'Escape' && currentView === 'terms') {
    closeTerms();
    return;
  }
  if (event.key === 'Escape' && currentView === 'about') {
    closeAbout();
    return;
  }
  if (event.key === 'Escape' && detailOpen) {
    closeDetail();
    return;
  }
  if (event.code !== 'Space') return;
  const target = event.target as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
  event.preventDefault();
  togglePlay();
});

/* ---------------- Views ---------------- */

const views = [
  'home',
  'search',
  'videos',
  'library',
  'playlists',
  'podcasts',
  'radio',
  'terms',
  'about',
] as const;
type View = (typeof views)[number];

let currentView: View = 'home';
let termsReturn: View = 'home';
let aboutReturn: View = 'home';
// Where the mobile search field returns to when it is dismissed.
let searchReturn: View = 'home';

// Searching from Podcasts or Radio limits the results to that source; from
// anywhere else every source is searched, songs first.
type SearchScope = 'all' | 'podcast' | 'radio' | 'video';
let searchScope: SearchScope = 'all';

// The search field follows the page it was opened from: Videos searches only
// YouTube, radio only stations, podcasts only episodes, and Home searches all.
function scopeFromView(view: View): SearchScope {
  if (view === 'podcasts') return 'podcast';
  if (view === 'radio') return 'radio';
  if (view === 'videos') return 'video';
  return 'all';
}

function applySearchScope() {
  const songs = searchScope === 'all';
  const podcasts = searchScope === 'all' || searchScope === 'podcast';
  const radio = searchScope === 'all' || searchScope === 'radio';
  const videos = searchScope === 'all' || searchScope === 'video';

  // Without a Jamendo client id the section would only ever show an empty
  // state, so hide it and let Audius cover full tracks.
  const jamendo = songs && hasJamendoKey();
  audiusHead.hidden = !songs;
  jamendoHead.hidden = !jamendo;
  audiusResults.hidden = !songs;
  jamendoResults.hidden = !jamendo;
  podcastHead.hidden = !podcasts;
  podcastResults.hidden = !podcasts;
  radioHead.hidden = !radio;
  radioResults.hidden = !radio;
  videoHead.hidden = !videos;
  videoResults.hidden = !videos;

  searchInput.placeholder =
    searchScope === 'podcast'
      ? 'Search podcast episodes…'
      : searchScope === 'radio'
        ? 'Search live radio…'
        : searchScope === 'video'
          ? 'Search YouTube videos…'
          : 'Search songs, artists, genres…';
  searchHint.textContent =
    searchScope === 'podcast'
      ? 'Type at least 2 characters to search podcast episodes.'
      : searchScope === 'radio'
        ? 'Type at least 2 characters to search live radio stations.'
        : searchScope === 'video'
          ? 'Type at least 2 characters to search YouTube music videos.'
          : 'Type at least 2 characters to search full tracks from Audius and Jamendo, podcast episodes, live radio and videos.';
}

// On mobile the top bar shows the Wavetify wordmark plus a magnifier; the search
// field only takes over the bar once the magnifier (or Search tab) is tapped.
function setSearchOpen(open: boolean) {
  topbar.classList.toggle('searching', open);
  searchToggle.setAttribute('aria-expanded', String(open));
  if (open) window.setTimeout(() => searchInput.focus(), 30);
  else searchInput.blur();
}

function setView(view: View, nav?: string) {
  currentView = view;
  document.title =
    view === 'terms'
      ? 'Terms & Conditions | Wavetify'
      : view === 'about'
        ? 'About Wavetify — Open-Source Free Music Player'
        : view === 'podcasts'
          ? 'Podcasts | Wavetify'
          : view === 'radio'
            ? 'Live radio | Wavetify'
            : view === 'videos'
              ? 'Videos | Wavetify'
              : view === 'playlists'
                ? 'Playlists | Wavetify'
                : 'Wavetify — Free Music, Videos, Radio & Podcasts Online';
  views.forEach((name) => {
    el<HTMLElement>(`view-${name}`).hidden = name !== view;
  });
  const activeNav = nav ?? (view === 'library' ? 'liked' : view);
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === activeNav);
  });
  // On phones the Library tab stands for both Liked and Playlists.
  const libraryTab = document.querySelector<HTMLElement>('.nav-library-tab');
  libraryTab?.classList.toggle('active', view === 'library' || view === 'playlists');
  if (view !== 'search') setSearchOpen(false);
  if (view === 'library') renderLibrary();
  if (view === 'playlists') renderPlaylists();
  if (view === 'search') {
    searchHint.hidden = searchInput.value.trim().length >= 2;
    if (topbar.classList.contains('searching')) searchInput.focus();
  }
}

// The magnifier in the top bar opens the dedicated search page (the one the
// old bottom-navigation Search tab used to show) instead of a bare field.
function openSearchPage() {
  if (currentView !== 'search') {
    searchReturn = currentView === 'terms' ? 'home' : currentView;
  }
  const nextScope = currentView === 'search' ? searchScope : scopeFromView(currentView);
  const scopeChanged = nextScope !== searchScope;
  searchScope = nextScope;
  applySearchScope();
  setView('search');
  setSearchOpen(true);

  // Coming from another view can change the sources; refresh the old query
  // instead of leaving results from the previous scope on screen.
  const query = searchInput.value.trim();
  if (scopeChanged && query.length >= 2) {
    void runSearch(query);
    return;
  }
  if (scopeChanged) {
    // Drop any response still in flight from the previous scope.
    searchSeq += 1;
    searchHeading.textContent =
      searchScope === 'podcast'
        ? 'Search podcasts'
        : searchScope === 'radio'
          ? 'Search live radio'
          : 'Search results';
    searchHint.hidden = query.length >= 2;
    [audiusResults, jamendoResults, podcastResults, radioResults].forEach(
      (container) => (container.innerHTML = '')
    );
  }
}

function scrollToLibrarySection(section: string) {
  const head = document.getElementById(`${section}-head`);
  if (head && !head.hidden) {
    head.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  window.scrollTo({ top: 0 });
}

document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view as View;
    if (view === 'search') {
      openSearchPage();
    } else {
      // The sidebar entry always lands on the playlist index, not the last
      // playlist that happened to be open.
      if (view === 'playlists') {
        openPlaylistId = null;
        resetPlaylistSearch();
      }
      setView(view, btn.dataset.nav);
      if (view === 'podcasts') void loadPodcasts();
      if (view === 'radio') void loadRadio();
      if (view === 'videos') void loadVideos();
      if (view === 'home') renderHomeVideos();
    }
    closeDetail();
    if (btn.dataset.section) scrollToLibrarySection(btn.dataset.section);
    else window.scrollTo({ top: 0 });
  });
});

searchToggle.addEventListener('click', openSearchPage);
// On mobile the X closes the field *and* leaves the results page, returning to
// whatever view the search was opened from instead of leaving a dead page.
searchCancel.addEventListener('click', () => {
  setSearchOpen(false);
  if (currentView !== 'search') return;
  setView(searchReturn);
  window.scrollTo({ top: 0 });
});

/* ---------------- Terms, without interrupting playback ---------------- */

function openTerms() {
  if (currentView !== 'terms') termsReturn = currentView;
  setView('terms');
  closeDetail();
  window.scrollTo({ top: 0 });
}

function closeTerms() {
  setView(termsReturn);
  window.scrollTo({ top: 0 });
}

document.querySelectorAll<HTMLAnchorElement>('[data-open-terms]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openTerms();
  });
});

el<HTMLButtonElement>('terms-close').addEventListener('click', closeTerms);

/* ---------------- About, also without interrupting playback ---------------- */

function openAbout() {
  if (currentView !== 'about') aboutReturn = currentView;
  setView('about');
  closeDetail();
  window.scrollTo({ top: 0 });
}

function closeAbout() {
  setView(aboutReturn);
  window.scrollTo({ top: 0 });
}

document.querySelectorAll<HTMLAnchorElement>('[data-open-about]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openAbout();
  });
});

el<HTMLButtonElement>('about-close').addEventListener('click', closeAbout);

/* ---------------- Confirmation dialog ---------------- */

let confirmResolve: ((ok: boolean) => void) | null = null;

function askConfirm(title: string, text: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmOk.textContent = okLabel;
    if (typeof confirmDialog.showModal === 'function') confirmDialog.showModal();
    else confirmDialog.setAttribute('open', '');
    confirmCancel.focus();
  });
}

function settleConfirm(ok: boolean) {
  const resolve = confirmResolve;
  if (!resolve) return;
  confirmResolve = null;
  if (confirmDialog.open) confirmDialog.close();
  else confirmDialog.removeAttribute('open');
  resolve(ok);
}

confirmOk.addEventListener('click', () => settleConfirm(true));
confirmCancel.addEventListener('click', () => settleConfirm(false));
// Covers the close button and Escape, which dismiss the dialog natively.
confirmDialog.addEventListener('close', () => settleConfirm(false));

let clearHistoryTimer: number | undefined;

homeClearHistory.addEventListener('click', async () => {
  window.clearTimeout(clearHistoryTimer);
  const resetLabel = () => {
    clearHistoryTimer = window.setTimeout(() => {
      homeClearHistory.textContent = 'Clear history';
    }, 2200);
  };
  if (!history.length && stats.size === 0) {
    homeClearHistory.textContent = 'History is already empty';
    resetLabel();
    return;
  }
  const confirmed = await askConfirm(
    'Clear history?',
    'This removes your play history and play counts from this device. Liked songs and playlists are kept.',
    'Clear history'
  );
  if (!confirmed) return;
  history.length = 0;
  stats.clear();
  saveHistory();
  saveStats();
  renderHomePlayAgain();
  renderHomeVideos();
  renderLibrary();
  renderVideoLibrary();
  homeClearHistory.textContent = 'History cleared';
  resetLabel();
});

// The logo jumps back to Home in-page instead of reloading, so audio keeps playing.
document.querySelectorAll<HTMLAnchorElement>('.brand, .mobile-brand').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setView('home');
    renderHomeVideos();
    closeDetail();
    window.scrollTo({ top: 0 });
  });
});

/* ---------------- Home ---------------- */

async function loadHome() {
  renderHomeVideos();
  trendingGrid.innerHTML = skeletonGrid();
  try {
    const tracks = await getTrending(18);
    if (!tracks.length) {
      showStatus(trendingGrid, 'No playable songs right now.');
      return;
    }
    renderGrid(trendingGrid, tracks.slice(0, 10), { label: 'All songs', view: 'search' });
    renderGenreChips(tracks);
  } catch {
    showStatus(trendingGrid, 'Could not reach Audius. Check your connection and reload.', true);
  }
}

/* ---------------- YouTube videos ---------------- */

interface VideoCache {
  savedAt: number;
  seed: string;
  tracks: Track[];
}

// The recommendations currently rendered on the Videos page, reused by the
// "More from <channel>" list so both show the same set of videos.
let recommendedVideoTracks: Track[] = [];

function isVideoTrack(value: unknown): value is Track {
  const track = value as Partial<Track> | null;
  return (
    !!track &&
    track.source === 'youtubeVideo' &&
    typeof track.id === 'string' &&
    typeof track.title === 'string' &&
    typeof track.videoId === 'string'
  );
}

function videoToTrack(video: YouTubeVideo): Track {
  return {
    id: `youtubeVideo:${video.id}`,
    title: video.title,
    artist: video.channelTitle || 'YouTube',
    artwork: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    duration: 0,
    src: '',
    source: 'youtubeVideo',
    description: video.description,
    videoId: video.id,
  };
}

/** Up to 10 distinct videos the user has already watched on this device. */
function watchedVideos(): Track[] {
  const seen = new Set<string>();
  const tracks: Track[] = [];
  history.forEach((entry) => {
    const track = entry.track;
    if (!isVideoTrack(track) || seen.has(track.id)) return;
    seen.add(track.id);
    tracks.push(track);
  });
  return tracks.slice(0, 10);
}

function renderHomeVideos() {
  const tracks = watchedVideos();
  homeVideosHead.hidden = tracks.length === 0;
  homeVideos.hidden = tracks.length === 0;
  homeVideos.innerHTML = '';
  if (tracks.length) renderGrid(homeVideos, tracks, { label: 'All videos', view: 'videos' });
}

/** Video-only "Play again" and "Mostly played" rows on the Videos page. */
async function relatedVideoTracks(track: Track): Promise<Track[]> {
  let pool = recommendedVideoTracks;
  if (!pool.length) {
    try {
      const videos = await searchYouTubeVideos(track.artist || track.title, 10);
      pool = videos.map(videoToTrack);
    } catch {
      pool = [];
    }
  }
  const seen = new Set<string>();
  const list: Track[] = [];
  const add = (item: Track) => {
    if (!isVideoTrack(item) || seen.has(item.id)) return;
    seen.add(item.id);
    list.push(item);
  };
  add(track);
  pool.forEach(add);
  return list;
}

function renderVideoLibrary() {
  const watched = watchedVideos();
  videoPlayAgainHead.hidden = watched.length === 0;
  videoPlayAgain.hidden = watched.length === 0;
  videoPlayAgain.innerHTML = '';
  if (watched.length) renderGrid(videoPlayAgain, watched);

  const mostPlayed = [...stats.values()]
    .filter((stat) => isVideoTrack(stat.track))
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .slice(0, 8)
    .map((stat) => stat.track);
  videoMostPlayedHead.hidden = mostPlayed.length === 0;
  videoMostPlayed.hidden = mostPlayed.length === 0;
  videoMostPlayed.innerHTML = '';
  if (mostPlayed.length) renderGrid(videoMostPlayed, mostPlayed);
}

/** Search queries and played tracks used as YouTube recommendation seeds. */
function videoQueries(): string[] {
  const seeds: string[] = [];
  const add = (value: string) => {
    const query = value.replace(/\s+/g, ' ').trim();
    if (query.length < 2) return;
    if (seeds.some((seed) => seed.toLowerCase() === query.toLowerCase())) return;
    seeds.push(query);
  };

  loadSearches().forEach(add);
  [...stats.values()]
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .forEach((stat) => add(`${stat.track.title} ${stat.track.artist}`));
  history.forEach((entry) => add(`${entry.track.title} ${entry.track.artist}`));

  // Two queries keep the search quota bill at 200 units per refresh.
  return seeds.slice(0, 2);
}

async function collectVideos(queries: string[]): Promise<YouTubeVideo[]> {
  const results = await Promise.allSettled(queries.map((query) => searchYouTubeVideos(query, 5)));
  const seen = new Set<string>();
  const videos: YouTubeVideo[] = [];
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach((video) => {
      if (seen.has(video.id)) return;
      seen.add(video.id);
      videos.push(video);
    });
  });
  return videos.slice(0, 10);
}

function readVideoCache(seed: string): Track[] | null {
  const cached = readStore<VideoCache | null>(VIDEO_CACHE_KEY, null);
  if (!cached || !Array.isArray(cached.tracks)) return null;
  if (cached.seed !== seed || Date.now() - cached.savedAt > VIDEO_CACHE_TTL) return null;
  const tracks = cached.tracks.filter(isVideoTrack).map(normalizeTrack);
  return tracks.length ? tracks : null;
}

function writeVideoCache(seed: string, tracks: Track[]) {
  try {
    const cached: VideoCache = { savedAt: Date.now(), seed, tracks };
    localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(cached));
  } catch {
    /* storage blocked: the list still works for this visit */
  }
}

async function loadVideos() {
  renderVideoLibrary();
  if (!hasYouTubeApiKey()) {
    videosHeading.textContent = 'Videos';
    showStatus(videosGrid, 'YouTube videos are not configured (missing API key).');
    return;
  }

  const queries = videoQueries();
  // Seeded cache: repeat visits (and repeat searches) skip the API entirely.
  const seed = queries.length ? `queries:${queries.join('|')}` : 'chart:music';
  const cached = readVideoCache(seed);
  if (cached) {
    recommendedVideoTracks = cached;
    showVideoHeading(queries.length > 0);
    renderGrid(videosGrid, cached);
    return;
  }

  videosGrid.innerHTML = skeletonGrid();
  try {
    let videos = queries.length ? await collectVideos(queries) : [];
    const personalized = videos.length > 0;
    if (!videos.length) videos = await getTrendingMusicVideos(10);
    if (!videos.length) {
      showStatus(videosGrid, 'No videos right now.');
      return;
    }
    const tracks = videos.map(videoToTrack);
    recommendedVideoTracks = tracks;
    showVideoHeading(personalized);
    renderGrid(videosGrid, tracks);
    writeVideoCache(seed, tracks);
  } catch {
    showStatus(videosGrid, 'Could not reach YouTube. Please try again.', true);
  }
}

function showVideoHeading(personalized: boolean) {
  videosHeading.textContent = personalized ? 'Videos for you' : 'Trending music videos';
  videosHint.textContent = personalized
    ? 'YouTube picks based on what you play and search for on this device.'
    : 'Popular music videos on YouTube right now. Play or search something to personalize this list.';
}

/* ---------------- Podcasts & live radio ---------------- */

let podcastShowCache: Show[] = [];
let topRadioCache: Track[] = [];

const PODCAST_PAGE = 20;
let podcastsShows: Show[] = [];
let podcastsOffset = 0;
let podcastsDone = false;
let podcastsLoading = false;

async function loadPodcastShows(): Promise<Show[]> {
  if (podcastShowCache.length) return podcastShowCache;
  podcastShowCache = await getPodcastShows(12);
  return podcastShowCache;
}

function showPodcastChoices() {
  podcastsBack.hidden = true;
  podcastsHeading.textContent = 'Podcasts';
  podcastsHint.hidden = false;
  podcastsHint.textContent = 'Popular series from Apple Podcasts. Tap a show to see its episodes.';
  renderShowGrid(podcastsGrid, podcastsShows);
  podcastsMore.hidden = podcastsDone || podcastsShows.length === 0;
}

async function loadPodcasts(reset = true) {
  if (podcastsLoading) return;
  if (reset && podcastsShows.length) {
    showPodcastChoices();
    return;
  }
  if (reset) {
    podcastsShows = [];
    podcastsOffset = 0;
    podcastsDone = false;
    podcastsGrid.innerHTML = skeletonGrid();
    podcastsMore.hidden = true;
  } else if (podcastsDone) {
    return;
  }

  podcastsLoading = true;
  if (!reset) {
    podcastsMore.disabled = true;
    podcastsMore.textContent = 'Loading…';
  }
  try {
    const batch = await getPodcastShows(PODCAST_PAGE, podcastsOffset);
    podcastsOffset += batch.length;
    podcastsShows = [...podcastsShows, ...batch];
    podcastsDone = batch.length < PODCAST_PAGE;
    if (!podcastsShows.length) {
      podcastsDone = true;
      showStatus(podcastsGrid, 'No podcasts available right now.');
    } else {
      showPodcastChoices();
    }
  } catch {
    if (!podcastsShows.length) {
      showStatus(podcastsGrid, 'Could not reach Apple Podcasts. Please try again.', true);
    }
  } finally {
    podcastsLoading = false;
    podcastsMore.disabled = false;
    podcastsMore.textContent = 'Load more shows';
    podcastsMore.hidden = podcastsDone || podcastsShows.length === 0;
  }
}

async function openPodcastShow(show: Show) {
  setView('podcasts', 'podcasts');
  podcastsBack.hidden = false;
  podcastsMore.hidden = true;
  podcastsHeading.textContent = show.title;
  podcastsHint.hidden = false;
  podcastsHint.textContent = show.publisher;
  podcastsGrid.innerHTML = skeletonGrid();
  window.scrollTo({ top: 0 });
  try {
    const episodes = await getPodcastEpisodes(show.id);
    if (!episodes.length) {
      showStatus(podcastsGrid, 'No episodes available for this show.');
      return;
    }
    renderGrid(podcastsGrid, episodes);
  } catch {
    showStatus(podcastsGrid, 'Could not load episodes. Please try again.', true);
  }
}

podcastsBack.addEventListener('click', () => void loadPodcasts());
podcastsMore.addEventListener('click', () => void loadPodcasts(false));

async function loadTopRadio(): Promise<Track[]> {
  if (topRadioCache.length) return topRadioCache;
  topRadioCache = await getRadioStations(10, 0);
  return topRadioCache;
}

// Room for the filters (HTTPS-only, no HLS) so each page still shows ~20.
const RADIO_PAGE = 28;
let radioStations: Track[] = [];
let radioOffset = 0;
let radioLoading = false;
let radioDone = false;

function renderRadioStations() {
  radioGrid.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';
  radioStations.forEach((station, i) => grid.append(makeCard(station, radioStations, i)));
  radioGrid.append(grid);
  syncPlayingCards();
}

async function loadRadio(reset = true) {
  if (radioLoading) return;
  if (reset) {
    radioStations = [];
    radioOffset = 0;
    radioDone = false;
    radioGrid.innerHTML = skeletonGrid();
    radioMore.hidden = true;
  } else if (radioDone) {
    return;
  }

  radioLoading = true;
  if (!reset) {
    radioMore.disabled = true;
    radioMore.textContent = 'Loading…';
  }
  try {
    const batch = await getRadioStations(RADIO_PAGE, radioOffset);
    radioOffset += RADIO_PAGE;
    radioStations = [...radioStations, ...batch];
    if (!radioStations.length) {
      showStatus(radioGrid, 'No live stations available right now.');
      radioDone = true;
    } else {
      renderRadioStations();
      radioDone = batch.length === 0;
    }
  } catch {
    if (!radioStations.length) {
      showStatus(radioGrid, 'Could not reach Radio Browser. Please try again.', true);
    }
  } finally {
    radioLoading = false;
    radioMore.disabled = false;
    radioMore.textContent = 'Load more stations';
    radioMore.hidden = radioDone || radioStations.length === 0;
  }
}

radioMore.addEventListener('click', () => void loadRadio(false));

// One full-screen artwork backdrop for the whole page, taken from whatever is
// playing (or was played last). The sharp layer only covers the top, so the
// image reads clearly at the top and dissolves into blur further down.
function paintHomeBackdrops() {
  const art = (current ?? history[0]?.track)?.artwork?.replace(/"/g, '%22');
  [pageBg, pageBgTop].forEach((layer) => {
    if (!art) {
      layer.style.removeProperty('--page-art');
      layer.classList.remove('has-art');
      return;
    }
    layer.style.setProperty('--page-art', `url("${art}")`);
    layer.classList.add('has-art');
  });
}

function renderHomePlayAgain() {
  const recent = history.slice(0, 10);
  homePlayAgainHead.hidden = recent.length === 0;
  homePlayAgain.hidden = recent.length === 0;
  homePlayAgain.innerHTML = '';
  if (recent.length) {
    renderGrid(homePlayAgain, recent.map((entry) => entry.track), { label: 'All history', view: 'library' });
  }
  paintHomeBackdrops();
}

async function loadHomeExtras() {
  renderHomePlayAgain();
  try {
    const shows = await loadPodcastShows();
    const hasShows = shows.length > 0;
    homePodcastsHead.hidden = !hasShows;
    homePodcasts.hidden = !hasShows;
    homePodcasts.innerHTML = '';
    if (hasShows) renderShowGrid(homePodcasts, shows.slice(0, 10), { label: 'All shows', view: 'podcasts' });
  } catch {
    homePodcastsHead.hidden = true;
    homePodcasts.hidden = true;
  }
  try {
    const stations = await loadTopRadio();
    const hasStations = stations.length > 0;
    homeRadioHead.hidden = !hasStations;
    homeRadio.hidden = !hasStations;
    homeRadio.innerHTML = '';
    if (hasStations) renderGrid(homeRadio, stations.slice(0, 10), { label: 'All stations', view: 'radio' });
  } catch {
    homeRadioHead.hidden = true;
    homeRadio.hidden = true;
  }
}

function renderGenreChips(tracks: Track[]) {
  const genres = [...new Set(tracks.map((t) => t.genre).filter(Boolean))].slice(0, 6) as string[];
  genreChips.innerHTML = '';
  genres.forEach((genre) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = genre;
    chip.addEventListener('click', () => {
      searchInput.value = genre;
      void runSearch(genre);
    });
    genreChips.append(chip);
  });
}

/* ---------------- Search ---------------- */

async function runSearch(rawQuery: string) {
  const query = rawQuery.trim();
  if (query.length >= 2) saveSearch(query);
  // Only the newest search may paint results: slower responses from an older
  // query are discarded instead of overwriting fresher ones.
  const seq = ++searchSeq;

  // Starting a search from another view inherits that view's sources.
  if (currentView !== 'search') {
    searchScope = scopeFromView(currentView);
    applySearchScope();
  }

  if (query.length < 2) {
    setView('search');
    searchHint.hidden = false;
    searchHeading.textContent =
      searchScope === 'podcast'
        ? 'Search podcasts'
        : searchScope === 'radio'
          ? 'Search live radio'
          : searchScope === 'video'
            ? 'Search videos'
            : 'Search results';
    [
      audiusResults,
      jamendoResults,
      podcastResults,
      radioResults,
      videoResults,
    ].forEach((container) => (container.innerHTML = ''));
    return;
  }

  setView('search');
  closeDetail();
  searchHint.hidden = true;
  const label =
    searchScope === 'podcast'
      ? 'Podcast results'
      : searchScope === 'radio'
        ? 'Radio results'
        : searchScope === 'video'
          ? 'Video results'
          : 'Results';
  searchHeading.textContent = `${label} for “${query}”`;

  const wantSongs = searchScope === 'all';
  const wantPodcasts = searchScope === 'all' || searchScope === 'podcast';
  const wantRadio = searchScope === 'all' || searchScope === 'radio';
  const wantVideos = searchScope === 'all' || searchScope === 'video';

  const wantJamendo = wantSongs && hasJamendoKey();
  if (wantSongs) audiusResults.innerHTML = skeletonGrid();
  if (wantJamendo) jamendoResults.innerHTML = skeletonGrid();
  if (wantPodcasts) podcastResults.innerHTML = skeletonGrid();
  if (wantRadio) radioResults.innerHTML = skeletonGrid();
  if (wantVideos) videoResults.innerHTML = skeletonGrid(4);

  const [audius, jamendo, podcasts, radio, videos] = await Promise.allSettled([
    wantSongs ? searchAudius(query) : Promise.resolve<Track[]>([]),
    wantJamendo ? searchJamendo(query, 12) : Promise.resolve<Track[]>([]),
    wantPodcasts ? searchPodcasts(query) : Promise.resolve<Track[]>([]),
    wantRadio ? searchRadio(query) : Promise.resolve<Track[]>([]),
    wantVideos
      ? searchYouTubeVideos(query, 6).then((list) => list.map(videoToTrack))
      : Promise.resolve<Track[]>([]),
  ]);

  if (seq !== searchSeq) return;

  if (wantSongs) {
    renderResults(audius, audiusResults, 'No full tracks matched on Audius.', 'Audius search failed. Please try again.');
    if (wantJamendo) {
      renderResults(
        jamendo,
        jamendoResults,
        'No full tracks matched on Jamendo.',
        'Jamendo search failed. Please try again.'
      );
    }
  }
  if (wantPodcasts) {
    renderResults(podcasts, podcastResults, 'No podcast episodes matched.', 'Podcast search failed. Please try again.');
  }
  if (wantRadio) {
    renderResults(radio, radioResults, 'No live radio stations matched.', 'Radio search failed. Please try again.');
  }
  if (wantVideos) {
    renderResults(videos, videoResults, 'No videos matched.', 'YouTube search failed. Please try again.');
  }
}

function renderResults(
  result: PromiseSettledResult<Track[]>,
  container: HTMLElement,
  emptyMessage: string,
  failedMessage: string
) {
  if (result.status === 'fulfilled' && result.value.length) {
    renderGrid(container, result.value);
    return;
  }
  const failed = result.status === 'rejected';
  showStatus(container, failed ? failedMessage : emptyMessage, failed);
}

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  const value = searchInput.value;
  searchTimer = window.setTimeout(() => void runSearch(value), 400);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    window.clearTimeout(searchTimer);
    void runSearch(searchInput.value);
  }
  if (event.key === 'Escape') {
    searchInput.value = '';
    setView('home');
    closeDetail();
  }
});

/* ---------------- Library ---------------- */

function timeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function makeHistoryRow(entry: HistoryEntry, list: Track[], position: number): HTMLButtonElement {
  const track = entry.track;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row';
  row.dataset.trackId = track.id;
  row.classList.toggle('playing', track.id === current?.id);
  row.innerHTML = `
    <span class="row-index">${position + 1}</span>
    <span class="row-art">${coverMarkup(track, 'sm')}</span>
    <span class="row-info">
      <span class="row-title">${escapeHtml(track.title)}</span>
      <span class="row-artist">${escapeHtml(track.artist)}</span>
    </span>
    <span class="row-dur">${timeAgo(entry.playedAt)}</span>
    <span class="row-play">${playIcon}</span>
  `;
  row.addEventListener('click', () => {
    playQueue(list, position);
    void openDetail(track);
  });
  return row;
}

function renderLibrary() {
  const recent = history.slice(0, 6);
  playAgainHead.hidden = recent.length === 0;
  playAgainGrid.hidden = recent.length === 0;
  playAgainGrid.innerHTML = '';
  if (recent.length) renderGrid(playAgainGrid, recent.map((entry) => entry.track));

  const most = [...stats.values()]
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .slice(0, 8);
  mostPlayedHead.hidden = most.length === 0;
  mostPlayedGrid.hidden = most.length === 0;
  mostPlayedGrid.innerHTML = '';
  if (most.length) renderGrid(mostPlayedGrid, most.map((stat) => stat.track));

  const entries = history.slice(0, 16);
  const recentTracks = entries.map((entry) => entry.track);
  historyHead.hidden = entries.length === 0;
  historyList.hidden = entries.length === 0;
  historyList.innerHTML = '';
  entries.forEach((entry, i) => historyList.append(makeHistoryRow(entry, recentTracks, i)));

  const tracks = [...liked.values()].reverse();
  likedStatus.hidden = tracks.length > 0;
  likedGrid.innerHTML = '';
  if (tracks.length) renderGrid(likedGrid, tracks);

  renderPlaylists();
  syncPlayingCards();
}

/* ---------------- Playlists ---------------- */

const playlistsHeading = el<HTMLHeadingElement>('playlists-heading');
const playlistsIndex = el<HTMLDivElement>('playlists-index');
const playlistsStatus = el<HTMLDivElement>('playlists-status');
const playlistsGrid = el<HTMLDivElement>('playlists-grid');
const playlistDetail = el<HTMLDivElement>('playlist-detail');
const playlistBack = el<HTMLButtonElement>('playlist-back');
const playlistName = el<HTMLHeadingElement>('playlist-name');
const playlistCount = el<HTMLSpanElement>('playlist-count');
const playlistPlay = el<HTMLButtonElement>('playlist-play');
const playlistDelete = el<HTMLButtonElement>('playlist-delete');
const playlistEmpty = el<HTMLDivElement>('playlist-empty');
const playlistTracks = el<HTMLDivElement>('playlist-tracks');
const playlistNew = el<HTMLButtonElement>('playlist-new');
const playlistSheet = el<HTMLDialogElement>('playlist-sheet');
const playlistSheetTrack = el<HTMLParagraphElement>('playlist-sheet-track');
const playlistPick = el<HTMLDivElement>('playlist-pick');
const playlistSheetEmpty = el<HTMLParagraphElement>('playlist-sheet-empty');
const playlistCreate = el<HTMLFormElement>('playlist-create');
const playlistCreateName = el<HTMLInputElement>('playlist-create-name');
const detailAdd = el<HTMLButtonElement>('detail-add');
const npAdd = el<HTMLButtonElement>('np-add');
const libraryPlaylists = el<HTMLDivElement>('library-playlists');
const libraryPlaylistsStatus = el<HTMLDivElement>('library-playlists-status');
const libraryPlaylistsAll = el<HTMLButtonElement>('library-playlists-all');
const playlistSearch = el<HTMLInputElement>('playlist-search');
const playlistSearchHint = el<HTMLParagraphElement>('playlist-search-hint');
const playlistResults = el<HTMLDivElement>('playlist-results');

const plusIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
const checkIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
const removeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg>';

// Which playlist is opened inside the Playlists view, and the track the sheet
// was opened for (null when the user is only creating a playlist).
let openPlaylistId: string | null = null;
let playlistSheetFor: Track | null = null;
let playlistSearchHits: Track[] = [];
let playlistSearchTimer: number | undefined;
let playlistSearchSeq = 0;

function findPlaylist(id: string | null): Playlist | null {
  if (!id) return null;
  return playlists.find((playlist) => playlist.id === id) ?? null;
}

function createPlaylist(name: string, track: Track | null): Playlist | null {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!clean || playlists.length >= PLAYLISTS_MAX) return null;
  const playlist: Playlist = {
    id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    createdAt: Date.now(),
    tracks: track ? [track] : [],
  };
  playlists.unshift(playlist);
  savePlaylists();
  renderPlaylists();
  return playlist;
}

/** Adds the track, or takes it out when it is already in the playlist. */
function togglePlaylistTrack(playlist: Playlist, track: Track): boolean {
  const at = playlist.tracks.findIndex((item) => item.id === track.id);
  if (at >= 0) {
    playlist.tracks.splice(at, 1);
  } else {
    if (playlist.tracks.length >= PLAYLIST_TRACKS_MAX) return false;
    playlist.tracks.push(track);
  }
  savePlaylists();
  renderPlaylists();
  return at < 0;
}

function makePlaylistCard(playlist: Playlist): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card playlist-card';
  const first: Track | undefined = playlist.tracks[0];
  const count = playlist.tracks.length;
  card.innerHTML = `
    <div class="card-art playlist-art">
      ${playlistCover(playlist, 'md')}
      <span class="badge-src playlist-badge">${count} ${count === 1 ? 'track' : 'tracks'}</span>
    </div>
    <div class="card-title">${escapeHtml(playlist.name)}</div>
    <div class="card-artist">${first ? escapeHtml(first.artist) : 'Empty playlist'}</div>
  `;
  card.addEventListener('click', () => {
    openPlaylistId = playlist.id;
    resetPlaylistSearch();
    if (currentView !== 'playlists') setView('playlists', 'playlists');
    else renderPlaylists();
    window.scrollTo({ top: 0 });
  });
  return card;
}

function makePlaylistRow(playlist: Playlist, track: Track, position: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'playlist-item';
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row';
  row.dataset.trackId = track.id;
  row.classList.toggle('playing', track.id === current?.id);
  row.innerHTML = `
    <span class="row-index">${position + 1}</span>
    <span class="row-art">${coverMarkup(track, 'sm')}</span>
    <span class="row-info">
      <span class="row-title">${escapeHtml(track.title)}</span>
      <span class="row-artist">${escapeHtml(track.artist)}</span>
    </span>
    <span class="row-dur">${track.live ? 'LIVE' : formatTime(track.duration)}</span>
    <span class="row-play">${playIcon}</span>
  `;
  row.addEventListener('click', () => {
    playQueue(playlist.tracks.slice(), position, { id: playlist.id, name: playlist.name });
    if (track.live) closeDetail();
    else void openDetail(track);
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'playlist-row-remove';
  remove.title = 'Remove from playlist';
  remove.setAttribute('aria-label', `Remove ${track.title} from ${playlist.name}`);
  remove.innerHTML = removeIcon;
  remove.addEventListener('click', () => {
    togglePlaylistTrack(playlist, track);
  });
  item.append(row, remove);
  return item;
}

function renderPlaylists() {
  // The Library view groups the same cards under Liked songs.
  libraryPlaylistsStatus.hidden = playlists.length > 0;
  libraryPlaylists.innerHTML = '';
  if (playlists.length) {
    const libraryGrid = document.createElement('div');
    libraryGrid.className = 'grid';
    playlists.slice(0, 8).forEach((playlist) => libraryGrid.append(makePlaylistCard(playlist)));
    libraryPlaylists.append(libraryGrid);
  }

  playlistsStatus.hidden = playlists.length > 0;
  playlistsGrid.innerHTML = '';
  if (playlists.length) {
    const grid = document.createElement('div');
    grid.className = 'grid';
    playlists.forEach((playlist) => grid.append(makePlaylistCard(playlist)));
    playlistsGrid.append(grid);
  }

  const open = findPlaylist(openPlaylistId);
  if (!open) openPlaylistId = null;
  playlistDetail.hidden = !open;
  playlistsIndex.hidden = !!open;
  // The page title only belongs to the index; an open playlist names itself.
  playlistsHeading.hidden = !!open;
  if (!open) return;

  playlistName.textContent = open.name;
  playlistCount.textContent = `${open.tracks.length} ${open.tracks.length === 1 ? 'track' : 'tracks'}`;
  const searching = playlistSearchHits.length > 0;
  playlistEmpty.hidden = searching || open.tracks.length > 0;
  playlistPlay.disabled = open.tracks.length === 0;
  playlistTracks.innerHTML = '';
  playlistTracks.hidden = searching;
  open.tracks.forEach((track, i) => playlistTracks.append(makePlaylistRow(open, track, i)));
  syncPlayingCards();
}

playlistBack.addEventListener('click', () => {
  openPlaylistId = null;
  resetPlaylistSearch();
  renderPlaylists();
  window.scrollTo({ top: 0 });
});

libraryPlaylistsAll.addEventListener('click', () => {
  openPlaylistId = null;
  setView('playlists', 'playlists');
  window.scrollTo({ top: 0 });
});

playlistPlay.addEventListener('click', () => {
  const playlist = findPlaylist(openPlaylistId);
  if (!playlist || !playlist.tracks.length) return;
  playQueue(playlist.tracks.slice(), 0, { id: playlist.id, name: playlist.name });
});

playlistDelete.addEventListener('click', async () => {
  const playlist = findPlaylist(openPlaylistId);
  if (!playlist) return;
  const confirmed = await askConfirm(
    'Delete playlist?',
    `“${playlist.name}” will be removed from this device. The tracks in it stay available everywhere else.`,
    'Delete playlist'
  );
  if (!confirmed) return;
  const at = playlists.indexOf(playlist);
  if (at >= 0) playlists.splice(at, 1);
  openPlaylistId = null;
  savePlaylists();
  renderPlaylists();
});

function openPlaylistSheet(track: Track | null) {
  playlistSheetFor = track;
  playlistSheetTrack.hidden = !track;
  playlistSheetTrack.textContent = track ? `${track.title} — ${track.artist}` : '';
  renderPlaylistPicker();
  playlistCreateName.value = '';
  if (typeof playlistSheet.showModal === 'function') playlistSheet.showModal();
  else playlistSheet.setAttribute('open', '');
  // Only pull up the keyboard when the sheet is opened just to name a playlist.
  if (!track) window.setTimeout(() => playlistCreateName.focus(), 40);
}

function closePlaylistSheet() {
  if (playlistSheet.open) playlistSheet.close();
  else playlistSheet.removeAttribute('open');
}

function renderPlaylistPicker() {
  const track = playlistSheetFor;
  playlistPick.innerHTML = '';
  playlistPick.hidden = !track;
  playlistSheetEmpty.hidden = !track || playlists.length > 0;
  if (!track) return;
  playlists.forEach((playlist) => {
    const inside = playlist.tracks.some((item) => item.id === track.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'playlist-pick-row';
    row.classList.toggle('is-in', inside);
    row.setAttribute('aria-pressed', String(inside));
    row.innerHTML = `
      <span class="playlist-pick-name">${escapeHtml(playlist.name)}</span>
      <span class="playlist-pick-count">${playlist.tracks.length}</span>
      <span class="playlist-pick-icon">${inside ? checkIcon : plusIcon}</span>
    `;
    row.addEventListener('click', () => {
      togglePlaylistTrack(playlist, track);
      renderPlaylistPicker();
    });
    playlistPick.append(row);
  });
}

function resetPlaylistSearch() {
  window.clearTimeout(playlistSearchTimer);
  playlistSearchSeq += 1;
  playlistSearch.value = '';
  playlistSearchHits = [];
  playlistResults.innerHTML = '';
  playlistResults.hidden = true;
  playlistTracks.hidden = false;
  playlistSearchHint.hidden = false;
  playlistSearchHint.textContent =
    'Type at least 2 characters, then tap a result to add it to this playlist.';
}

function renderPlaylistResults(playlist: Playlist) {
  playlistResults.innerHTML = '';
  const showing = playlistSearchHits.length > 0;
  playlistResults.hidden = !showing;
  // While results are on screen they replace the track list, so the two lists
  // never compete for the same scroll area.
  playlistTracks.hidden = showing;
  playlistEmpty.hidden = showing || playlist.tracks.length > 0;
  playlistSearchHits.forEach((track) => {
    const inside = playlist.tracks.some((item) => item.id === track.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'playlist-result';
    row.classList.toggle('is-in', inside);
    row.innerHTML = `
      <span class="playlist-result-art">${coverMarkup(track, 'sm')}</span>
      <span class="playlist-result-info">
        <span class="playlist-result-title">${escapeHtml(track.title)}</span>
        <span class="playlist-result-artist">${escapeHtml(track.artist)}</span>
      </span>
      <span class="playlist-result-action">${inside ? checkIcon : plusIcon}</span>
    `;
    row.addEventListener('click', () => {
      const playlistNow = findPlaylist(openPlaylistId);
      if (!playlistNow) return;
      togglePlaylistTrack(playlistNow, track);
      renderPlaylistResults(playlistNow);
    });
    playlistResults.append(row);
  });
}

// Search full tracks and podcasts without leaving the playlist card.
async function runPlaylistSearch(rawQuery: string) {
  const query = rawQuery.trim();
  const seq = ++playlistSearchSeq;
  if (!findPlaylist(openPlaylistId)) return;
  if (query.length < 2) {
    playlistSearchHits = [];
    playlistResults.innerHTML = '';
    playlistResults.hidden = true;
    playlistTracks.hidden = false;
    const playlist = findPlaylist(openPlaylistId);
    if (playlist) playlistEmpty.hidden = playlist.tracks.length > 0;
    playlistSearchHint.hidden = false;
    playlistSearchHint.textContent =
      'Type at least 2 characters, then tap a result to add it to this playlist.';
    return;
  }
  playlistSearchHint.hidden = false;
  playlistSearchHint.textContent = `Searching for “${query}”…`;
  const results = await Promise.allSettled([
    searchAudius(query, 8),
    hasJamendoKey() ? searchJamendo(query, 8) : Promise.resolve<Track[]>([]),
    searchPodcasts(query, 6),
  ]);
  if (seq !== playlistSearchSeq) return;
  const playlist = findPlaylist(openPlaylistId);
  if (!playlist) return;
  const hits: Track[] = [];
  const seen = new Set<string>();
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach((track) => {
      if (seen.has(track.id)) return;
      seen.add(track.id);
      hits.push(track);
    });
  });
  playlistSearchHits = hits.slice(0, 24);
  playlistSearchHint.hidden = playlistSearchHits.length > 0;
  if (!playlistSearchHits.length) playlistSearchHint.textContent = 'Nothing matched. Try another word.';
  renderPlaylistResults(playlist);
}

playlistSearch.addEventListener('input', () => {
  window.clearTimeout(playlistSearchTimer);
  const value = playlistSearch.value;
  playlistSearchTimer = window.setTimeout(() => void runPlaylistSearch(value), 450);
});

playlistCreate.addEventListener('submit', (event) => {
  event.preventDefault();
  const track = playlistSheetFor;
  const created = createPlaylist(playlistCreateName.value, track);
  if (!created) {
    playlistCreateName.focus();
    return;
  }
  playlistCreateName.value = '';
  if (track) {
    renderPlaylistPicker();
    return;
  }
  // Creating from the Playlists view: open the new, empty playlist right away.
  closePlaylistSheet();
  openPlaylistId = created.id;
  setView('playlists', 'playlists');
  window.scrollTo({ top: 0 });
});

playlistNew.addEventListener('click', () => openPlaylistSheet(null));
detailAdd.addEventListener('click', () => {
  if (current) openPlaylistSheet(current);
});
npAdd.addEventListener('click', () => {
  if (current) openPlaylistSheet(current);
});

/* ---------------- Init ---------------- */

export function init() {
  const storedVolume = loadVolume();
  lastVolume = storedVolume > 0 ? storedVolume : 0.8;
  audio.volume = storedVolume;
  audio.muted = storedVolume === 0;
  volume.value = String(storedVolume);
  paintRange(volume, storedVolume);
  syncMuteIcon();
  paintRange(seek, 0);
  playBtn.innerHTML = playIcon;
  detailPlay.innerHTML = playIcon;
  const syncTopbar = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
  syncTopbar();
  window.addEventListener('scroll', syncTopbar, { passive: true });
  setView('home');
  renderLibrary();
  paintHomeBackdrops();
  restorePlayback();
  const shared = new URLSearchParams(location.search).get('t');
  if (shared) void openSharedTrack(shared);
  void loadHome();
  void loadHomeExtras();
}
