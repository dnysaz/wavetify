import { artworkAt, formatTime, getTrackById, type Track } from '../lib/api';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const audio = el<HTMLAudioElement>('audio');
const playBtn = el<HTMLButtonElement>('play');
const art = el<HTMLDivElement>('art');
const backdrop = el<HTMLDivElement>('backdrop');
const kicker = el<HTMLParagraphElement>('kicker');
const title = el<HTMLParagraphElement>('title');
const artist = el<HTMLParagraphElement>('artist');
const progress = el<HTMLDivElement>('progress');
const fill = el<HTMLSpanElement>('fill');
const time = el<HTMLSpanElement>('time');
const desc = el<HTMLParagraphElement>('desc');
const cta = el<HTMLAnchorElement>('cta');
const error = el<HTMLParagraphElement>('error');

const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const pauseIcon =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

const trackId = new URLSearchParams(location.search).get('t') ?? '';
let current: Track | null = null;

function sourceLabel(track: Track): string {
  if (track.live) return 'Live radio';
  if (track.source === 'deezer' || track.source === 'itunes') return '30-second preview';
  if (track.source === 'podcast') return 'Podcast episode';
  return 'Full track';
}

function render(track: Track) {
  current = track;
  title.textContent = track.title;
  artist.textContent = track.artist;
  desc.textContent = (track.description ?? '').trim();
  kicker.textContent = `Wavetify · ${sourceLabel(track)}`;
  document.title = `${track.title} — Wavetify`;

  if (track.artwork) {
    const img = document.createElement('img');
    img.src = artworkAt(track.artwork, 'md');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    art.append(img);
    backdrop.style.backgroundImage = `url(${JSON.stringify(artworkAt(track.artwork, 'md'))})`;
  }

  audio.src = track.src;
  playBtn.disabled = false;
  time.textContent = track.live ? 'LIVE' : `0:00 / ${formatTime(track.duration)}`;
  progress.hidden = track.live === true;
  cta.href = `/?t=${encodeURIComponent(track.id)}`;
}

function fail(message: string) {
  error.hidden = false;
  error.textContent = message;
  kicker.textContent = 'Wavetify';
  title.textContent = 'Not available';
  artist.textContent = '';
}

function totalTime(): number {
  const known = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : current?.duration ?? 0;
  return known;
}

function paint() {
  if (!current || current.live) return;
  const total = totalTime();
  const ratio = total ? Math.min(1, audio.currentTime / total) : 0;
  fill.style.width = `${ratio * 100}%`;
  time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(total)}`;
}

playBtn.addEventListener('click', () => {
  if (audio.paused) void audio.play().catch(() => {});
  else audio.pause();
});

audio.addEventListener('play', () => {
  playBtn.innerHTML = pauseIcon;
  playBtn.setAttribute('aria-label', 'Pause');
});
audio.addEventListener('pause', () => {
  playBtn.innerHTML = playIcon;
  playBtn.setAttribute('aria-label', 'Play');
});
audio.addEventListener('timeupdate', paint);
audio.addEventListener('ended', () => {
  fill.style.width = '0%';
  if (current && !current.live) time.textContent = `0:00 / ${formatTime(current.duration)}`;
});

progress.addEventListener('click', (event) => {
  if (!current || current.live) return;
  const total = totalTime();
  if (!total) return;
  const rect = progress.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * total;
  paint();
});

async function boot() {
  if (!trackId) {
    fail('No track was requested.');
    return;
  }
  const track = await getTrackById(trackId);
  if (!track) {
    fail('This track is not available right now.');
    return;
  }
  render(track);
}

void boot();
