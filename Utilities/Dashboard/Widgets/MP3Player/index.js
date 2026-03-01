const STYLE_ID = 'chronos-mp3-player-style';
const DEFAULT_PLAYLIST_SLUG = 'default';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  .mp3-player {
    --mp3-accent: var(--chronos-accent, var(--accent, #7aa2f7));
    --mp3-accent-soft: var(--chronos-accent-soft, rgba(122, 162, 247, 0.28));
    --mp3-accent-strong: var(--chronos-accent-strong, #4f6fa8);
    position: relative;
    background:
      linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 38%, rgba(0,0,0,0.3)),
      linear-gradient(180deg, rgba(86, 97, 114, 0.36) 0%, rgba(52, 59, 72, 0.32) 44%, rgba(36, 42, 52, 0.3) 100%);
    border: 1px solid rgba(255,255,255,0.28);
    border-radius: 20px;
    padding: 16px;
    box-shadow:
      inset 1px 1px 0 rgba(255,255,255,0.42),
      inset -2px -2px 8px rgba(0,0,0,0.35),
      0 14px 24px rgba(0,0,0,0.45);
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
    backdrop-filter: saturate(125%) blur(8px);
    -webkit-backdrop-filter: saturate(125%) blur(8px);
  }
  .mp3-player::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background:
      repeating-linear-gradient(
        90deg,
        rgba(255,255,255,0.02) 0px,
        rgba(255,255,255,0.02) 2px,
        rgba(0,0,0,0.02) 2px,
        rgba(0,0,0,0.02) 4px
      );
    mix-blend-mode: soft-light;
    opacity: 0.55;
  }
  .mp3-screen {
    position: relative;
    background:
      radial-gradient(circle at 22% 18%, rgba(188, 241, 255, 0.18), rgba(188, 241, 255, 0) 44%),
      linear-gradient(180deg, #a9bd9f 0%, #6f8868 55%, #4f644c 100%);
    border: 1px solid rgba(31, 48, 25, 0.55);
    border-radius: 12px;
    padding: 14px;
    color: #1f3020;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 120px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.45),
      inset 0 -1px 0 rgba(0,0,0,0.24),
      inset 0 0 28px rgba(28, 63, 26, 0.28);
  }
  .mp3-screen::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 10px;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 30%);
  }
  .mp3-track-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-shadow: 0 1px 0 rgba(255,255,255,0.25);
  }
  .mp3-track-artist {
    font-size: 13px;
    opacity: 0.84;
  }
  .mp3-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-weight: 700;
    color: #2a3f2b;
  }
  .mp3-progress input[type="range"] {
    flex: 1;
    accent-color: var(--mp3-accent);
    filter: saturate(0.85);
  }
  .mp3-controls {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 4px 0 0;
  }
  .mp3-collapse-toggle {
    align-self: center;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.24);
    background: linear-gradient(180deg, rgba(255,255,255,0.2), rgba(0,0,0,0.08));
    color: rgba(235, 242, 255, 0.94);
    padding: 6px 12px;
    font-size: 12px;
    letter-spacing: 0.2px;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
  }
  .mp3-collapse-toggle:hover {
    filter: brightness(1.06);
  }
  .mp3-collapsible[hidden] {
    display: none !important;
  }
  .mp3-collapsible {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mp3-controls button {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.34);
    background:
      radial-gradient(circle at 30% 28%, rgba(255,255,255,0.45), rgba(255,255,255,0) 44%),
      linear-gradient(180deg, #fafbfd 0%, #c8cfda 54%, #9fa8b8 100%);
    color: #1e2733;
    font-size: 18px;
    cursor: pointer;
    transition: transform 0.08s ease, box-shadow 0.14s ease, filter 0.14s ease;
    box-shadow:
      inset 0 1px 1px rgba(255,255,255,0.75),
      inset 0 -2px 3px rgba(0,0,0,0.22),
      0 2px 4px rgba(0,0,0,0.38);
  }
  .mp3-controls button:hover {
    filter: brightness(1.04);
  }
  .mp3-controls button.active {
    color: var(--mp3-accent-strong);
    box-shadow:
      inset 0 2px 4px rgba(255,255,255,0.35),
      inset 0 -4px 8px rgba(0,0,0,0.28),
      0 0 0 2px var(--mp3-accent-soft);
  }
  .mp3-controls button:active {
    transform: translateY(1px);
    box-shadow:
      inset 0 3px 5px rgba(0,0,0,0.3),
      inset 0 -1px 2px rgba(255,255,255,0.24),
      0 1px 2px rgba(0,0,0,0.35);
  }
  .mp3-toolbar,
  .mp3-upload-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    padding: 10px;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(238,243,252,0.1), rgba(22,26,34,0.05));
    border: 1px solid rgba(255,255,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.22);
  }
  .mp3-toolbar select,
  .mp3-toolbar input {
    flex: 1;
    min-width: 140px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    background: linear-gradient(180deg, #e1e7f1, #c5cfde);
    color: #1f2732;
    padding: 6px 8px;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
  }
  .mp3-toolbar button,
  .mp3-upload-row button {
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.28);
    background: linear-gradient(180deg, #f9fbfe, #bcc7d8);
    color: #1f2732;
    padding: 6px 10px;
    cursor: pointer;
    font-weight: 600;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.75),
      0 1px 2px rgba(0,0,0,0.2);
  }
  .mp3-toolbar button:active,
  .mp3-upload-row button:active {
    transform: translateY(1px);
    box-shadow: inset 0 2px 3px rgba(0,0,0,0.24);
  }
  .mp3-lists {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .mp3-list {
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 12px;
    padding: 10px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.015)),
      linear-gradient(180deg, rgba(60, 68, 84, 0.4), rgba(44, 51, 65, 0.34));
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 180px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.22),
      inset 0 -1px 0 rgba(0,0,0,0.24);
  }
  .mp3-list-title {
    font-weight: 600;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--mp3-accent);
    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  }
  .mp3-tracklist {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }
  .mp3-track-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.14);
    background: linear-gradient(180deg, rgba(250,252,255,0.11), rgba(101,112,131,0.08));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.22);
    font-size: 13px;
    color: #f2f6ff;
  }
  .mp3-track-row.playing {
    border-color: var(--mp3-accent);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.35),
      0 0 0 1px var(--mp3-accent-soft);
  }
  .mp3-link,
  .mp3-link-inline {
    color: var(--mp3-accent);
    text-decoration: underline;
    font-weight: 500;
  }
  .mp3-link:hover,
  .mp3-link-inline:hover {
    color: var(--mp3-accent-strong);
  }
  .mp3-track-row button {
    border: 1px solid rgba(255,255,255,0.26);
    background: linear-gradient(180deg, #f7f9ff, #c1cbdb);
    color: #1c2a3a;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.75);
  }
  .mp3-track-label {
    flex: 1;
  }
  .mp3-hint {
    font-size: 12px;
    color: rgba(236, 244, 255, 0.8);
  }
  .mp3-status {
    font-size: 12px;
    color: rgba(232, 241, 255, 0.78);
    padding: 2px 4px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  }
  `;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

export function mount(el, context) {
  // Load CSS
  if (!document.getElementById('mp3player-css')) {
    const link = document.createElement('link');
    link.id = 'mp3player-css';
    link.rel = 'stylesheet';
    link.href = './Widgets/MP3Player/mp3player.css';
    document.head.appendChild(link);
  }

  el.className = 'widget mp3player-widget';

  injectStyles();
  const tpl = `
    <div class="header">
      <div class="title">MP3 Player</div>
      <div class="controls">
        <button class="icon-btn" id="mp3Min" title="Minimize">_</button>
        <button class="icon-btn" id="mp3Close" title="Close">x</button>
      </div>
    </div>
    <div class="mp3-player">
      <div class="mp3-screen">
        <div class="mp3-track-title" id="mp3TrackTitle">No track selected</div>
        <div class="mp3-track-artist" id="mp3TrackArtist">Drop MP3 files or upload to get started.</div>
        <a id="mp3TrackLink" class="mp3-link" href="#" target="_blank" rel="noopener" style="display:none;">Visit artist site</a>
        <div class="mp3-progress">
          <span class="mp3-time" id="mp3Elapsed">00:00</span>
          <input type="range" min="0" max="1000" value="0" id="mp3Seek" />
          <span class="mp3-time" id="mp3Remaining">00:00</span>
        </div>
      </div>
      <div class="mp3-controls">
        <button id="mp3Prev" title="Previous track">⏮</button>
        <button id="mp3Play" title="Play/Pause">▶</button>
        <button id="mp3Next" title="Next track">⏭</button>
        <button id="mp3Shuffle" title="Shuffle">🔀</button>
        <button id="mp3Repeat" title="Repeat">🔁</button>
      </div>
      <button id="mp3CollapseToggle" class="mp3-collapse-toggle" aria-expanded="false">Show Library & Playlist Tools ▾</button>
      <div id="mp3Collapsible" class="mp3-collapsible" hidden>
        <div class="mp3-toolbar">
          <select id="mp3PlaylistSelect"></select>
          <input id="mp3PlaylistName" class="input" placeholder="Playlist name" />
          <button id="mp3NewPlaylist">New</button>
          <button id="mp3SavePlaylist">Save</button>
          <button id="mp3DeletePlaylist">Delete</button>
          <button id="mp3Refresh">Refresh</button>
        </div>
        <div class="mp3-upload-row">
          <button id="mp3UploadBtn">Upload MP3s</button>
          <input type="file" id="mp3FileInput" accept=".mp3,audio/mpeg" multiple style="display:none;" />
          <span class="mp3-hint">Files saved to User/Media/MP3</span>
        </div>
        <div class="mp3-lists">
          <div class="mp3-list">
            <div class="mp3-list-title">Library</div>
            <div class="mp3-tracklist" id="mp3LibraryList"></div>
          </div>
          <div class="mp3-list">
            <div class="mp3-list-title">Playlist Tracks</div>
            <div class="mp3-tracklist" id="mp3PlaylistList"></div>
          </div>
        </div>
        <div class="mp3-status" id="mp3Status"></div>
      </div>
    </div>
    <div class="resizer e"></div>
    <div class="resizer s"></div>
    <div class="resizer se"></div>
  `;
  el.innerHTML = tpl;

  const btnMin = el.querySelector('#mp3Min');
  const btnClose = el.querySelector('#mp3Close');
  const titleEl = el.querySelector('#mp3TrackTitle');
  const artistEl = el.querySelector('#mp3TrackArtist');
  const linkEl = el.querySelector('#mp3TrackLink');
  const elapsedEl = el.querySelector('#mp3Elapsed');
  const remainingEl = el.querySelector('#mp3Remaining');
  const seekEl = el.querySelector('#mp3Seek');
  const playBtn = el.querySelector('#mp3Play');
  const prevBtn = el.querySelector('#mp3Prev');
  const nextBtn = el.querySelector('#mp3Next');
  const shuffleBtn = el.querySelector('#mp3Shuffle');
  const repeatBtn = el.querySelector('#mp3Repeat');
  const collapseToggleBtn = el.querySelector('#mp3CollapseToggle');
  const collapsibleEl = el.querySelector('#mp3Collapsible');
  const playlistSelect = el.querySelector('#mp3PlaylistSelect');
  const playlistNameInput = el.querySelector('#mp3PlaylistName');
  const newPlaylistBtn = el.querySelector('#mp3NewPlaylist');
  const savePlaylistBtn = el.querySelector('#mp3SavePlaylist');
  const deletePlaylistBtn = el.querySelector('#mp3DeletePlaylist');
  const refreshBtn = el.querySelector('#mp3Refresh');
  const uploadBtn = el.querySelector('#mp3UploadBtn');
  const fileInput = el.querySelector('#mp3FileInput');
  const libraryList = el.querySelector('#mp3LibraryList');
  const playlistList = el.querySelector('#mp3PlaylistList');
  const statusEl = el.querySelector('#mp3Status');

  const audio = new Audio();
  audio.preload = 'metadata';

  const state = {
    library: [],
    playlists: [],
    currentPlaylist: null,
    playlistTracks: [],
    playOrder: [],
    playOrderPos: -1,
    currentIndex: -1,
    shuffle: false,
    repeat: 'off', // off|all|one
  };

  loadState();

  function apiBase() {
    const o = window.location.origin;
    if (!o || o === 'null' || o.startsWith('file:')) return 'http://127.0.0.1:7357';
    return o;
  }

  function fmt(sec) {
    const safe = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function normalizeUrl(url) {
    if (!url) return null;
    let s = String(url).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) {
      s = `https://${s.replace(/^\/+/, '')}`;
    }
    try {
      const u = new URL(s);
      return u.toString();
    } catch {
      return null;
    }
  }

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#f59f85' : '#9ab4ff';
    if (msg) console.log('[Chronos][MP3]', msg);
  }

  async function loadLibrary() {
    try {
      const resp = await fetch(apiBase() + '/api/media/mp3');
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Failed to load library');
      state.library = data.files || [];
      renderLibrary();
      _ensureDefaultPlaylistPresence();
    } catch (err) {
      setStatus(err?.message || 'Failed to load library', true);
    }
  }

  async function loadPlaylists() {
    try {
      const resp = await fetch(apiBase() + '/api/media/playlists');
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Failed to load playlists');
      state.playlists = data.playlists || [];
      renderPlaylistOptions();
      if (!state.currentPlaylist && state.playlists.length) {
        selectPlaylist(state.playlists[0].slug);
      } else if (state.currentPlaylist) {
        selectPlaylist(state.currentPlaylist.slug, false);
      }
    } catch (err) {
      setStatus(err?.message || 'Failed to load playlists', true);
    }
  }

  function renderLibrary() {
    libraryList.innerHTML = '';
    if (!state.library.length) {
      const empty = document.createElement('div');
      empty.className = 'mp3-hint';
      empty.textContent = 'No MP3 files detected.';
      libraryList.appendChild(empty);
      return;
    }
    state.library.forEach(track => {
      const row = document.createElement('div');
      row.className = 'mp3-track-row';
      row.dataset.file = track.file;
      row.innerHTML = `
        <button class="mp3-icon" data-action="play" title="Play">▶</button>
        <div class="mp3-track-label">${escapeHtml(track.title || track.file)}</div>
        <button class="mp3-icon" data-action="add" title="Add to playlist">＋</button>
      `;
      if (state.playlistTracks[state.currentIndex]?.file === track.file) {
        row.classList.add('playing');
      }
      libraryList.appendChild(row);
    });
  }

  function renderPlaylistOptions() {
    const currentSlug = state.currentPlaylist?.slug || '';
    playlistSelect.innerHTML = '';
    state.playlists.forEach(pl => {
      const opt = document.createElement('option');
      opt.value = pl.slug;
      opt.textContent = `${pl.name} (${pl.track_count ?? 0})`;
      playlistSelect.appendChild(opt);
    });
    if (currentSlug) {
      const match = state.playlists.find(p => p.slug === currentSlug);
      playlistSelect.value = match ? currentSlug : '';
    } else if (state.playlists.length) {
      playlistSelect.value = state.playlists[0].slug;
    }
  }

  function renderPlaylistTracks() {
    playlistList.innerHTML = '';
    if (!state.playlistTracks.length) {
      const empty = document.createElement('div');
      empty.className = 'mp3-hint';
      empty.textContent = 'No tracks in this playlist.';
      playlistList.appendChild(empty);
      return;
    }
    state.playlistTracks.forEach((track, idx) => {
      const row = document.createElement('div');
      row.className = 'mp3-track-row';
      row.dataset.index = idx;
      row.innerHTML = `
        <button class="mp3-icon" data-action="play" title="Play track">▶</button>
        <div class="mp3-track-label">${escapeHtml(track.title || track.file)}${track.artist ? ' · ' + escapeHtml(track.artist) : ''}</div>
        <button class="mp3-icon" data-action="up" title="Move up">▲</button>
        <button class="mp3-icon" data-action="down" title="Move down">▼</button>
        <button class="mp3-icon" data-action="remove" title="Remove">✖</button>
      `;
      if (state.currentIndex === idx) {
        row.classList.add('playing');
      }
      playlistList.appendChild(row);
    });
  }

  async function selectPlaylist(slug, fetchDetail = true) {
    if (!slug) return;
    try {
      if (fetchDetail) {
        const resp = await fetch(apiBase() + `/api/media/playlists?name=${encodeURIComponent(slug)}`);
        const data = await resp.json();
        if (!resp.ok || data.ok === false) throw new Error(data.error || 'Failed to load playlist');
        state.currentPlaylist = data.playlist;
      } else if (!state.currentPlaylist || state.currentPlaylist.slug !== slug) {
        // fallback fetch if stale
        await selectPlaylist(slug, true);
        return;
      }
      const playlist = state.currentPlaylist;
      const rawTracks = (playlist?.tracks || []).map(t => ({ ...t }));
      state.playlistTracks = rawTracks;
      state.currentIndex = -1;
      state.playOrder = [];
      state.playOrderPos = -1;
      playlistNameInput.value = playlist?.name || '';
      if (playlistSelect.value !== slug) playlistSelect.value = slug;
      renderPlaylistTracks();
      saveState();
    } catch (err) {
      setStatus(err?.message || 'Failed to load playlist', true);
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[s] || s));
  }

  function updateButtons() {
    const playing = !audio.paused;
    playBtn.textContent = playing ? '⏸' : '▶';
    shuffleBtn.classList.toggle('active', state.shuffle);
    const repeatIcons = { off: '🔁', all: '🔂', one: '🔂1' };
    repeatBtn.textContent = repeatIcons[state.repeat] || '🔁';
    repeatBtn.classList.toggle('active', state.repeat !== 'off');
  }

  function setTrackInfo(track) {
    titleEl.textContent = track ? (track.title || track.file) : 'No track selected';
    const artist = track?.artist || track?.album;
    if (artist) artistEl.textContent = artist;
    else artistEl.textContent = track ? track.file : 'Upload an MP3 to begin.';
    if (linkEl) {
      const website = normalizeUrl(track?.website || track?.link);
      if (website && track) {
        let label = track.website_label;
        if (!label) {
          try {
            const host = new URL(website).hostname;
            label = host.replace(/^www\./i, '');
          } catch {
            label = website;
          }
        }
        linkEl.href = website;
        linkEl.textContent = label || 'Visit artist site';
        linkEl.style.display = 'inline-flex';
      } else {
        linkEl.style.display = 'none';
      }
    }
  }

  function updateProgressUI() {
    const duration = audio.duration || state.playlistTracks[state.currentIndex]?.length || 0;
    const current = audio.currentTime || 0;
    elapsedEl.textContent = fmt(current);
    remainingEl.textContent = fmt(Math.max(0, duration - current));
    if (duration > 0) {
      seekEl.value = Math.min(1000, Math.floor((current / duration) * 1000));
    } else {
      seekEl.value = 0;
    }
  }

  function rebuildPlayOrder(startIndex) {
    const indices = state.playlistTracks.map((_, idx) => idx);
    if (!indices.length) {
      state.playOrder = [];
      state.playOrderPos = -1;
      return;
    }
    if (state.shuffle) {
      const rest = indices.filter(i => i !== startIndex);
      shuffleArray(rest);
      state.playOrder = [startIndex, ...rest];
    } else {
      state.playOrder = indices;
    }
    state.playOrderPos = state.playOrder.indexOf(startIndex);
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function ensureOrderForIndex(index) {
    if (!state.playlistTracks.length) return;
    if (!state.playOrder.length || !state.playOrder.includes(index)) {
      rebuildPlayOrder(index);
    } else {
      state.playOrderPos = state.playOrder.indexOf(index);
    }
  }

  function playIndex(index) {
    if (index < 0 || index >= state.playlistTracks.length) return;
    const track = state.playlistTracks[index];
    const url = `${apiBase()}${track.url || `/media/mp3/${encodeURIComponent(track.file)}`}`;
    state.currentIndex = index;
    ensureOrderForIndex(index);
    audio.src = url;
    setTrackInfo(track);
    audio.play().catch(() => { });
    renderPlaylistTracks();
    renderLibrary();
    updateButtons();
    context?.bus?.emit?.('mp3:play', { track });
  }

  function nextTrack(auto = false) {
    if (!state.playlistTracks.length) return;
    if (state.playOrderPos < 0) {
      const idx = state.currentIndex >= 0 ? state.currentIndex : 0;
      rebuildPlayOrder(idx);
    }
    let nextPos = state.playOrderPos + 1;
    if (nextPos >= state.playOrder.length) {
      if (state.repeat === 'all') nextPos = 0;
      else {
        if (auto) {
          audio.pause();
          audio.currentTime = 0;
          updateButtons();
        }
        return;
      }
    }
    state.playOrderPos = nextPos;
    playIndex(state.playOrder[nextPos]);
  }

  function prevTrack() {
    if (!state.playlistTracks.length) return;
    if (state.playOrderPos <= 0) {
      playIndex(state.playOrder[0] ?? 0);
      return;
    }
    state.playOrderPos -= 1;
    playIndex(state.playOrder[state.playOrderPos]);
  }

  function togglePlay() {
    if (!state.playlistTracks.length) {
      setStatus('No tracks to play.', true);
      return;
    }
    if (audio.paused) {
      if (state.currentIndex < 0) {
        playIndex(0);
      } else {
        audio.play().catch(() => { });
        updateButtons();
      }
    } else {
      audio.pause();
      updateButtons();
    }
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.currentIndex >= 0) {
      rebuildPlayOrder(state.currentIndex);
    }
    updateButtons();
    saveState();
  }

  function cycleRepeat() {
    if (state.repeat === 'off') state.repeat = 'all';
    else if (state.repeat === 'all') state.repeat = 'one';
    else state.repeat = 'off';
    updateButtons();
    saveState();
  }

  function addTrackToPlaylist(fileName) {
    if (!fileName) return;
    const track = state.library.find(t => t.file === fileName);
    const entry = track ? { file: track.file, title: track.title, artist: track.artist, length: track.length } : { file: fileName };
    state.playlistTracks.push(entry);
    renderPlaylistTracks();
    setStatus(`Added ${fileName} to playlist`);
  }

  function removeTrack(index) {
    if (index < 0 || index >= state.playlistTracks.length) return;
    state.playlistTracks.splice(index, 1);
    if (state.currentIndex === index) {
      audio.pause();
      state.currentIndex = -1;
    }
    renderPlaylistTracks();
  }

  function moveTrack(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.playlistTracks.length) return;
    const [item] = state.playlistTracks.splice(index, 1);
    state.playlistTracks.splice(target, 0, item);
    renderPlaylistTracks();
  }

  async function savePlaylist() {
    if (!state.currentPlaylist && !state.playlistTracks.length && !playlistNameInput.value.trim()) {
      setStatus('Nothing to save.', true);
      return;
    }
    try {
      const slug = state.currentPlaylist?.slug;
      const body = {
        slug,
        name: playlistNameInput.value.trim() || state.currentPlaylist?.name || 'Playlist',
        tracks: state.playlistTracks.map(t => ({ file: t.file, title: t.title, artist: t.artist, length: t.length })),
        shuffle: state.shuffle,
        repeat: state.repeat,
      };
      const resp = await fetch(apiBase() + '/api/media/playlists/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Failed to save playlist');
      state.currentPlaylist = { slug: data.slug, name: body.name };
      setStatus('Playlist saved.');
      await loadPlaylists();
      selectPlaylist(data.slug, true);
    } catch (err) {
      setStatus(err?.message || 'Failed to save playlist', true);
    }
  }

  async function deletePlaylist() {
    if (!state.currentPlaylist?.slug) {
      setStatus('No playlist selected', true);
      return;
    }
    if (!confirm(`Delete playlist "${state.currentPlaylist.name}"?`)) return;
    try {
      const resp = await fetch(apiBase() + '/api/media/playlists/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: state.currentPlaylist.slug }),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Delete failed');
      setStatus('Playlist deleted.');
      state.currentPlaylist = null;
      state.playlistTracks = [];
      await loadPlaylists();
      renderPlaylistTracks();
    } catch (err) {
      setStatus(err?.message || 'Failed to delete playlist', true);
    }
  }

  async function createPlaylist() {
    const name = prompt('Playlist name?');
    if (!name) return;
    playlistNameInput.value = name;
    state.playlistTracks = [];
    state.currentPlaylist = null;
    await savePlaylist();
  }

  async function uploadFiles(files) {
    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const payload = { filename: file.name, data: base64 };
        const resp = await fetch(apiBase() + '/api/media/mp3/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        if (!resp.ok || data.ok === false) throw new Error(data.error || `Failed to upload ${file.name}`);
        setStatus(`Uploaded ${file.name}`);
      } catch (err) {
        setStatus(err?.message || `Failed to upload ${file.name}`, true);
      }
    }
    await loadLibrary();
    if (state.currentPlaylist?.slug === DEFAULT_PLAYLIST_SLUG) {
      selectPlaylist(DEFAULT_PLAYLIST_SLUG, true);
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Unsupported file reader result'));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleAudioEnded() {
    if (state.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => { });
      return;
    }
    nextTrack(true);
  }

  function handleSeekInput() {
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const pct = Number(seekEl.value) / 1000;
    audio.currentTime = pct * duration;
  }

  function saveState() {
    try {
      const snapshot = {
        playlist: state.currentPlaylist?.slug || null,
        shuffle: state.shuffle,
        repeat: state.repeat,
      };
      localStorage.setItem('chronos_mp3_widget', JSON.stringify(snapshot));
    } catch { }
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem('chronos_mp3_widget') || '{}');
      if (typeof stored.shuffle === 'boolean') state.shuffle = stored.shuffle;
      if (stored.repeat) state.repeat = stored.repeat;
      if (stored.playlist) state.currentPlaylist = { slug: stored.playlist };
    } catch { }
  }

  function _ensureDefaultPlaylistPresence() {
    if (!state.playlists.length) return;
    if (!state.playlists.find(pl => pl.slug === DEFAULT_PLAYLIST_SLUG)) {
      // Nothing to do; server will create automatically when needed.
    }
  }

  function setCollapsibleOpen(isOpen) {
    if (!collapseToggleBtn || !collapsibleEl) return;
    const open = !!isOpen;
    collapsibleEl.hidden = !open;
    collapseToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    collapseToggleBtn.textContent = open
      ? 'Hide Library & Playlist Tools ▴'
      : 'Show Library & Playlist Tools ▾';
  }

  audio.addEventListener('timeupdate', updateProgressUI);
  audio.addEventListener('play', updateButtons);
  audio.addEventListener('pause', updateButtons);
  audio.addEventListener('ended', handleAudioEnded);
  audio.addEventListener('loadedmetadata', updateProgressUI);

  btnMin?.addEventListener('click', () => el.classList.toggle('minimized'));
  btnClose?.addEventListener('click', () => { el.style.display = 'none'; });
  playBtn?.addEventListener('click', togglePlay);
  prevBtn?.addEventListener('click', () => prevTrack());
  nextBtn?.addEventListener('click', () => nextTrack());
  shuffleBtn?.addEventListener('click', toggleShuffle);
  repeatBtn?.addEventListener('click', cycleRepeat);
  collapseToggleBtn?.addEventListener('click', () => {
    setCollapsibleOpen(collapsibleEl?.hidden);
  });
  seekEl?.addEventListener('change', handleSeekInput);
  playlistSelect?.addEventListener('change', e => selectPlaylist(e.target.value, true));
  newPlaylistBtn?.addEventListener('click', createPlaylist);
  savePlaylistBtn?.addEventListener('click', () => { savePlaylist(); });
  deletePlaylistBtn?.addEventListener('click', deletePlaylist);
  refreshBtn?.addEventListener('click', () => { loadLibrary(); loadPlaylists(); });
  uploadBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async ev => {
    const files = Array.from(ev.target.files || []);
    if (files.length) await uploadFiles(files);
    ev.target.value = '';
  });

  libraryList?.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-action]');
    const row = ev.target.closest('.mp3-track-row');
    if (!btn || !row) return;
    const file = row.dataset.file;
    if (!file) return;
    if (btn.dataset.action === 'play') {
      const idx = state.playlistTracks.findIndex(t => t.file === file);
      if (idx >= 0) playIndex(idx);
      else {
        addTrackToPlaylist(file);
        renderPlaylistTracks();
      }
    } else if (btn.dataset.action === 'add') {
      addTrackToPlaylist(file);
    }
  });

  playlistList?.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-action]');
    const row = ev.target.closest('.mp3-track-row');
    if (!btn || !row) return;
    const idx = Number(row.dataset.index);
    if (Number.isNaN(idx)) return;
    switch (btn.dataset.action) {
      case 'play':
        playIndex(idx);
        break;
      case 'up':
        moveTrack(idx, -1);
        break;
      case 'down':
        moveTrack(idx, 1);
        break;
      case 'remove':
        removeTrack(idx);
        break;
      default:
    }
  });

  loadLibrary().then(loadPlaylists).then(() => updateButtons());
  setCollapsibleOpen(false);
  updateButtons();

  return {
    play: () => togglePlay(),
    next: () => nextTrack(),
    prev: () => prevTrack(),
  };
}
