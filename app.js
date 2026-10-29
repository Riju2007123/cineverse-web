// CineVerse Web
const BASE = 'https://v3-cinemeta.strem.io';
const IMG_POSTER = (id) => `https://images.metahub.space/poster/medium/${id}/img`;
const IMG_BG = (id) => `https://images.metahub.space/background/medium/${id}/img`;
const IMG_EP = (id) => `https://episodes.metahub.space/episode/medium/${id}/img`;

const state = {
  screen: { name: 'home' },
  home: null,
  browse: { type: 'movie', genre: 'Action', items: [], loading: false, loadedKey: '' },
  search: { query: '', results: [], searching: false, filter: 'all', recents: loadRecents() },
  library: { tab: 'list' },
  details: null,
  grid: null,
  player: null,
};

const HOME_ROWS = [
  { title: 'Trending movies', type: 'movie', catalog: 'top' },
  { title: 'New releases', type: 'movie', catalog: 'year' },
  { title: 'Trending series', type: 'series', catalog: 'top' },
  { title: 'New episodes', type: 'series', catalog: 'last-videos' },
  { title: 'Top rated movies', type: 'movie', catalog: 'imdbRating' },
  { title: 'Action', type: 'movie', catalog: 'top', genre: 'Action' },
  { title: 'Comedy', type: 'movie', catalog: 'top', genre: 'Comedy' },
  { title: 'Sci-Fi', type: 'movie', catalog: 'top', genre: 'Sci-Fi' },
  { title: 'Horror', type: 'movie', catalog: 'top', genre: 'Horror' },
  { title: 'Drama series', type: 'series', catalog: 'top', genre: 'Drama' },
];
const BROWSE_GENRES = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','Horror','Mystery','Romance','Sci-Fi','Thriller','War','Western'];

// ---------- storage ----------
function ls(key, def) { try { const raw = localStorage.getItem(key); return raw == null ? def : JSON.parse(raw); } catch { return def; } }
function ss(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function loadRecents() { return ls('cv_recents', []); }
function saveRecents(v) { ss('cv_recents', v); }
function getWatchlist() { return ls('cv_watchlist', []); }
function setWatchlist(v) { ss('cv_watchlist', v); }
function getHistory() { return ls('cv_history', []); }
function setHistory(v) { ss('cv_history', v); }
function isSaved(id) { return getWatchlist().some(t => t.id === id); }
function toggleSave(title) {
  const list = getWatchlist();
  const idx = list.findIndex(t => t.id === title.id);
  if (idx >= 0) list.splice(idx, 1); else list.unshift(titleToJson(title));
  setWatchlist(list);
  return idx < 0;
}
function titleToJson(t) {
  return {
    id: t.id, type: t.type, name: t.name, poster: t.poster, background: t.background,
    logo: t.logo, description: t.description, genres: t.genres, rating: t.rating,
    releaseInfo: t.releaseInfo, runtime: t.runtime, cast: t.cast, director: t.director,
    tmdb: t.tmdbId || 0,
  };
}
function titleFromJson(o) {
  if (!o) return null;
  return {
    id: o.id, type: o.type || 'movie', name: o.name, poster: o.poster, background: o.background,
    logo: o.logo, description: o.description, genres: o.genres || [], rating: o.rating,
    releaseInfo: o.releaseInfo, runtime: o.runtime, cast: o.cast || [], director: o.director || [],
    videos: [], tmdbId: o.tmdb || 0,
    isSeries: (o.type === 'series'),
  };
}
function recordPlay(title, key, label) {
  const hist = getHistory();
  const entry = { key, titleId: title.id, type: title.type, name: title.name, poster: title.poster, label, at: Date.now() };
  const idx = hist.findIndex(h => h.key === key);
  if (idx >= 0) hist.splice(idx, 1);
  hist.unshift(entry);
  setHistory(hist.slice(0, 50));
}
function addSearch(q) {
  const r = loadRecents();
  const idx = r.indexOf(q);
  if (idx >= 0) r.splice(idx, 1);
  r.unshift(q);
  const out = r.slice(0, 8);
  saveRecents(out);
  state.search.recents = out;
  return out;
}

// ---------- API ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function parseMeta(json) {
  const id = json.imdb_id || json.id || '';
  const type = json.type || 'movie';
  const genres = (json.genres || json.genre || []);
  const videosRaw = json.videos || [];
  const videos = [];
  for (const v of videosRaw) {
    const season = v.season || 0;
    if (season <= 0) continue;
    videos.push({
      id: v.id || '',
      season,
      episode: v.episode || 0,
      name: v.name || `Episode ${v.episode || ''}`,
      overview: v.overview || null,
      thumbnail: v.thumbnail || null,
      released: v.released || null,
    });
  }
  const poster = (json.poster && json.poster.startsWith('http')) ? json.poster : `https://images.metahub.space/poster/medium/${id}/img`;
  const background = (json.background && json.background.startsWith('http')) ? json.background : `https://images.metahub.space/background/medium/${id}/img`;
  return {
    id, type, name: json.name || '',
    poster, background,
    logo: (json.logo && json.logo.startsWith('http')) ? json.logo : null,
    description: json.description || null,
    genres: Array.isArray(genres) ? genres : [],
    rating: (json.imdbRating && json.imdbRating !== 'null') ? json.imdbRating : null,
    releaseInfo: json.releaseInfo || json.year || '',
    runtime: json.runtime || null,
    cast: json.cast || [],
    director: json.director || [],
    videos,
    tmdbId: json.moviedb_id || 0,
    isSeries: type === 'series',
  };
}
async function apiCatalog(type, opts = {}) {
  const { genre, search, catalog = 'top', skip = 0 } = opts;
  const extras = [];
  if (search != null) extras.push('search=' + encodeURIComponent(search));
  else if (genre != null) extras.push('genre=' + encodeURIComponent(genre));
  if (skip > 0) extras.push('skip=' + skip);
  let url = `${BASE}/catalog/${type}/${catalog}`;
  if (extras.length) url += '/' + extras.join('&');
  url += '.json';
  const json = await getJson(url);
  const metas = json.metas || [];
  return metas.map(parseMeta).filter(t => t.id && t.name);
}
async function apiDetails(id, type) {
  const json = await getJson(`${BASE}/meta/${type}/${id}.json`);
  if (!json.meta) throw new Error('Title not found');
  return parseMeta(json.meta);
}
async function apiSearch(q) {
  const [m, s] = await Promise.allSettled([apiCatalog('movie', { search: q }), apiCatalog('series', { search: q })]);
  const movies = m.status === 'fulfilled' ? m.value : [];
  const series = s.status === 'fulfilled' ? s.value : [];
  const merged = new Map();
  for (const t of [...movies, ...series]) if (!merged.has(t.id)) merged.set(t.id, t);
  const ql = q.toLowerCase();
  return [...merged.values()].sort((a, b) => {
    const aStart = a.name.toLowerCase().startsWith(ql) ? 0 : 1;
    const bStart = b.name.toLowerCase().startsWith(ql) ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

// ---------- providers ----------
function providerUrls(title, season, episode) {
  const out = [];
  // VidFast needs tmdb
  if (title.tmdbId) {
    out.push({ name: 'VidFast', url: season && episode
      ? `https://vidfast.pro/tv/${title.tmdbId}/${season}/${episode}?autoPlay=true`
      : `https://vidfast.pro/movie/${title.tmdbId}?autoPlay=true` });
  }
  out.push({ name: 'VidLink', url: season && episode
    ? `https://vidlink.pro/tv/${title.id}/${season}/${episode}`
    : `https://vidlink.pro/movie/${title.id}` });
  out.push({ name: '2Embed', url: season && episode
    ? `https://www.2embed.cc/embedtv/${title.id}&s=${season}&e=${episode}`
    : `https://www.2embed.cc/embed/${title.id}` });
  return out;
}

// ---------- shell ----------
const app = document.getElementById('app');
app.innerHTML = `
  <div class="app">
    <main id="main" class="main"></main>
    <nav class="bottomnav">
      <button data-nav="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>Home</span></button>
      <button data-nav="browse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>Browse</span></button>
      <button data-nav="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><span>Search</span></button>
      <button data-nav="library"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span>My list</span></button>
    </nav>
    <div id="modal" class="modal hidden"></div>
  </div>
`;
document.querySelectorAll('.bottomnav button').forEach(b => {
  b.addEventListener('click', () => go(b.dataset.nav));
});

const main = document.getElementById('main');
const modal = document.getElementById('modal');

// event delegation for data-action
main.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'open') {
    const id = target.dataset.id, type = target.dataset.type;
    // find title object? We'll store in a lookup by id; fallback fetch details
    openTitleById(id, type);
  } else if (action === 'seeall') {
    const title = target.dataset.title, type = target.dataset.type, catalog = target.dataset.catalog, genre = target.dataset.genre || null;
    go('grid', { title, type, catalog, genre });
  } else if (action === 'play') {
    const id = target.dataset.id, type = target.dataset.type, season = target.dataset.season ? +target.dataset.season : null, episode = target.dataset.episode ? +target.dataset.episode : null, label = target.dataset.label;
    // need title object; fetch details then play
    playTitle(id, type, season, episode, label);
  } else if (action === 'season') {
    const n = +target.dataset.season;
    if (state.details) { state.details.season = n; renderDetails(); }
  } else if (action === 'toggleSave') {
    const id = target.dataset.id;
    toggleSaveById(id);
  } else if (action === 'removeSave') {
    const id = target.dataset.id;
    const list = getWatchlist().filter(t => t.id !== id);
    setWatchlist(list);
    renderLibrary();
  }
});

// ---------- navigation ----------
function go(name, params = {}) {
  state.screen = { name, ...params };
  if (name === 'home' && !state.home) {
    state.home = { loading: true, rows: [], error: null };
    loadHome();
  }
  if (name === 'browse' && !state.browse.loadedKey) loadBrowse();
  if (name === 'search') { /* no-op */ }
  if (name === 'library') { /* no-op */ }
  if (name === 'details') loadDetails(params.id, params.type);
  if (name === 'grid') loadGrid(params);
  renderScreen();
  updateNav();
}
function updateNav() {
  document.querySelectorAll('.bottomnav button').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === state.screen.name || (state.screen.name === 'details' && false));
  });
  // highlight none for details/grid
}
// initial
go('home');

// ---------- title lookup cache ----------
const titleCache = new Map();
function cacheTitle(t) { titleCache.set(t.id, t); return t; }
async function getTitle(id, type) {
  if (titleCache.has(id)) return titleCache.get(id);
  const t = await apiDetails(id, type);
  cacheTitle(t);
  return t;
}

async function openTitleById(id, type) {
  go('details', { id, type });
}
async function playTitle(id, type, season, episode, label) {
  try {
    const title = await getTitle(id, type);
    recordPlay(title, season && episode ? `${id}:${season}:${episode}` : id, label || title.name);
    openPlayer(title, season, episode, label || title.name);
  } catch (e) { alert('Could not load title'); }
}
async function toggleSaveById(id) {
  try {
    const type = state.details?.title?.id === id ? state.details.title.type : (titleCache.get(id)?.type || 'movie');
    const title = await getTitle(id, type);
    const saved = toggleSave(title);
    // update details if open
    if (state.screen.name === 'details' && state.details && state.details.title && state.details.title.id === id) {
      renderDetails();
    }
    renderLibrary();
  } catch {}
}

// ---------- home ----------
async function loadHome() {
  try {
    const results = await Promise.all(HOME_ROWS.map(async spec => {
      try { const items = await apiCatalog(spec.type, { genre: spec.genre, catalog: spec.catalog }); return [spec, items]; }
      catch { return [spec, []]; }
    }));
    const rows = results.filter(([, items]) => items.length > 0);
    state.home = { loading: false, rows, error: rows.length ? null : 'Could not reach the catalogue. Check your connection.' };
    for (const [, items] of rows) items.forEach(cacheTitle);
  } catch (e) {
    state.home = { loading: false, rows: [], error: e.message || 'Could not load' };
  }
  renderHome();
}
function renderHome() {
  if (state.screen.name !== 'home') return;
  const h = state.home || { loading: true, rows: [], error: null };
  let html = `<div class="topbar"><span class="title">CINEVERSE</span><button onclick="App.go('search')">🔍</button></div>`;
  // hero from first rows
  const heroTitles = [];
  for (const [spec, items] of h.rows.slice(0, 3)) {
    for (const t of items.slice(0, 2)) {
      if (!heroTitles.find(x => x.id === t.id)) heroTitles.push(t);
      if (heroTitles.length >= 6) break;
    }
    if (heroTitles.length >= 6) break;
  }
  if (heroTitles.length) {
    const hero = heroTitles[0];
    html += `<div class="hero" data-action="open" data-id="${hero.id}" data-type="${hero.type}">
      <img src="${escapeHtml(hero.background || hero.poster)}" alt="">
      <div class="overlay">
        <h3>${escapeHtml(hero.name)}</h3>
        <p>${escapeHtml(hero.metaLine || '')}</p>
        <div class="actions">
          <button class="btn primary" data-action="play" data-id="${hero.id}" data-type="${hero.type}" data-label="${escapeHtml(hero.name)}">▶ Watch</button>
          <button class="btn ghost" data-action="open" data-id="${hero.id}" data-type="${hero.type}">Details</button>
        </div>
      </div>
    </div>`;
  }
  // continue watching
  const hist = getHistory();
  const cont = hist.map(e => ({ entry: e, progress: null })).slice(0, 10);
  // We don't have progress; show recently opened
  if (hist.length) {
    html += `<div class="section"><h2>Recently opened</h2></div><div class="row">`;
    for (const e of hist.slice(0, 12)) {
      const t = titleFromJson({ id: e.titleId, type: e.type, name: e.name, poster: e.poster });
      html += `<div class="card" data-action="open" data-id="${e.titleId}" data-type="${e.type}">
        <div class="card-poster"><img src="${escapeHtml(e.poster || '')}" loading="lazy"></div>
        <div class="card-title">${escapeHtml(e.name)}</div>
      </div>`;
    }
    html += `</div>`;
  }
  if (h.loading) {
    html += `<div class="spinner"></div>`;
  }
  if (h.error) {
    html += `<div class="empty">${escapeHtml(h.error)}<br><button class="btn primary" onclick="App.reloadHome()">Retry</button></div>`;
  }
  for (const [spec, items] of h.rows) {
    html += `<div class="section"><h2>${escapeHtml(spec.title)} <span style="float:right;font-size:12px;color:var(--primary);cursor:pointer" data-action="seeall" data-title="${escapeHtml(spec.title)}" data-type="${spec.type}" data-catalog="${spec.catalog}" data-genre="${spec.genre || ''}">See all</span></h2></div>`;
    html += `<div class="row">`;
    for (const t of items) {
      html += cardHtml(t);
    }
    html += `</div>`;
  }
  html += `<div style="padding:20px;text-align:center;"><button class="btn ghost" onclick="App.go('search')">Search the full catalogue</button></div>`;
  main.innerHTML = html;
}
function cardHtml(t, progress) {
  return `<div class="card" data-action="open" data-id="${t.id}" data-type="${t.type}">
    <div class="card-poster">
      <img src="${escapeHtml(t.poster || '')}" alt="${escapeHtml(t.name)}" loading="lazy" onerror="this.style.opacity=.3">
      ${progress != null ? `<div class="progress"><div style="width:${Math.round(progress*100)}%"></div></div>` : ''}
    </div>
    <div class="card-title">${escapeHtml(t.name)}</div>
  </div>`;
}

// ---------- browse ----------
async function loadBrowse() {
  const b = state.browse;
  const key = b.type + '|' + b.genre;
  if (b.loadedKey === key) return;
  b.loading = true;
  b.loadedKey = key;
  renderBrowse();
  try {
    const items = await apiCatalog(b.type, { genre: b.genre, catalog: 'top' });
    items.forEach(cacheTitle);
    b.items = items;
  } catch (e) { b.items = []; }
  b.loading = false;
  renderBrowse();
}
function renderBrowse() {
  if (state.screen.name !== 'browse') return;
  const b = state.browse;
  let html = `<div class="topbar"><span class="title">Browse</span></div>`;
  html += `<div class="filters">
    <button class="filter-pill ${b.type==='movie'?'active':''}" onclick="App.setBrowseType('movie')">Movies</button>
    <button class="filter-pill ${b.type==='series'?'active':''}" onclick="App.setBrowseType('series')">Series</button>
  </div>`;
  html += `<div class="row" style="flex-wrap:wrap;overflow-x:auto;">`;
  for (const g of BROWSE_GENRES) {
    html += `<button class="season-pill ${b.genre===g?'active':''}" onclick="App.setBrowseGenre('${g}')">${g}</button>`;
  }
  html += `</div>`;
  if (b.loading) html += `<div class="spinner"></div>`;
  else if (!b.items.length) html += `<div class="empty">Nothing here yet.</div>`;
  else {
    html += `<div class="grid">`;
    for (const t of b.items) html += cardHtml(t);
    html += `</div>`;
  }
  main.innerHTML = html;
}

// ---------- search ----------
function renderSearch() {
  if (state.screen.name !== 'search') return;
  const s = state.search;
  let html = `<div class="topbar"><span class="title">Search</span></div>`;
  html += `<input class="search-input" id="searchInput" placeholder="Movies, series, people…" value="${escapeHtml(s.query)}" />`;
  html += `<div class="filters">
    <button class="filter-pill ${s.filter==='all'?'active':''}" onclick="App.setSearchFilter('all')">All</button>
    <button class="filter-pill ${s.filter==='movie'?'active':''}" onclick="App.setSearchFilter('movie')">Movies</button>
    <button class="filter-pill ${s.filter==='series'?'active':''}" onclick="App.setSearchFilter('series')">Series</button>
  </div>`;
  if (!s.query.trim()) {
    if (s.recents.length) {
      html += `<div class="section"><h2>Recent searches</h2></div><div class="row">`;
      for (const r of s.recents) html += `<button class="season-pill" onclick="App.submitSearch('${escapeHtml(r)}')">${escapeHtml(r)}</button>`;
      html += `</div>`;
    }
    html += `<div class="empty">Find something to watch<br><span class="muted">Search across the whole IMDb catalogue.</span></div>`;
  } else if (s.searching) {
    html += `<div class="spinner"></div>`;
  } else {
    const filtered = s.filter === 'movie' ? s.results.filter(t=>!t.isSeries)
      : s.filter === 'series' ? s.results.filter(t=>t.isSeries) : s.results;
    if (!filtered.length) html += `<div class="empty">No results for "${escapeHtml(s.query)}".</div>`;
    else {
      html += `<div class="grid">`;
      for (const t of filtered) html += cardHtml(t);
      html += `</div>`;
    }
  }
  main.innerHTML = html;
  const inp = document.getElementById('searchInput');
  if (inp) {
    inp.focus();
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch {}
    let debounce;
    inp.addEventListener('input', (e) => {
      state.search.query = e.target.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => doSearch(state.search.query), 300);
      // update recents? no
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { addSearch(state.search.query); state.search.recents = loadRecents(); renderSearch(); }
    });
  }
}
async function doSearch(q) {
  if (!q.trim()) { state.search.results = []; state.search.searching = false; renderSearch(); return; }
  state.search.searching = true;
  renderSearch();
  try {
    const res = await apiSearch(q.trim());
    res.forEach(cacheTitle);
    state.search.results = res;
  } catch { state.search.results = []; }
  state.search.searching = false;
  renderSearch();
}

// ---------- details ----------
async function loadDetails(id, type) {
  state.details = { loading: true, error: null, title: null, season: 0 };
  renderDetails();
  try {
    const t = await apiDetails(id, type);
    cacheTitle(t);
    const seasons = [...new Set(t.videos.map(v=>v.season))].sort((a,b)=>a-b);
    state.details = { loading: false, error: null, title: t, season: seasons.length ? seasons[0] : 0 };
  } catch (e) {
    state.details = { loading: false, error: e.message || 'Could not load', title: null, season: 0 };
  }
  renderDetails();
}
function renderDetails() {
  if (state.screen.name !== 'details') return;
  const d = state.details;
  if (!d) { main.innerHTML = '<div class="spinner"></div>'; return; }
  if (d.loading) { main.innerHTML = '<div class="spinner"></div>'; return; }
  if (!d.title) { main.innerHTML = `<div class="empty">${escapeHtml(d.error || 'Not found')}</div>`; return; }
  const t = d.title;
  const saved = isSaved(t.id);
  const seasons = [...new Set(t.videos.map(v=>v.season))].sort((a,b)=>a-b);
  const episodes = t.videos.filter(v => v.season === d.season);
  let html = '';
  html += `<div class="details-backdrop"><img src="${escapeHtml(t.background || t.poster)}" alt=""><div class="fade"></div></div>`;
  html += `<div class="details-body"><div class="details-row">
    <div class="details-poster"><img src="${escapeHtml(t.poster)}" alt=""></div>
    <div class="details-info">
      <h2>${escapeHtml(t.name)}</h2>
      <div class="meta-line">${escapeHtml(metaLine(t))}</div>
      <div class="genre-list">${t.genres.slice(0,4).map(g=>`<span class="chip">${escapeHtml(g)}</span>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn primary" data-action="play" data-id="${t.id}" data-type="${t.type}" data-season="${t.isSeries && t.videos.length ? (t.videos.slice().sort((a,b)=>a.season*1000+a.episode - (b.season*1000+b.episode))[0].season) : ''}" data-episode="${t.isSeries && t.videos.length ? (t.videos.slice().sort((a,b)=>a.season*1000+a.episode - (b.season*1000+b.episode))[0].episode) : ''}" data-label="${escapeHtml(t.name)}">${t.isSeries ? 'Play S' + (seasons[0]||1) + 'E1' : 'Watch'}</button>
        <button class="btn ghost" data-action="toggleSave" data-id="${t.id}">${saved ? '★ Saved' : '＋ Save'}</button>
      </div>
    </div>
  </div>`;
  html += `<div class="section-block"><h3>Overview</h3><p class="muted">${escapeHtml(t.description || 'No overview available.')}</p></div>`;
  if (t.cast && t.cast.length) {
    html += `<div class="section-block"><h3>Cast</h3><p class="muted">${escapeHtml(t.cast.slice(0,8).join(', '))}</p></div>`;
  }
  if (t.director && t.director.length) {
    html += `<div class="section-block"><h3>Director</h3><p class="muted">${escapeHtml(t.director.join(', '))}</p></div>`;
  }
  if (t.isSeries && t.videos.length) {
    html += `<div class="section-block"><h3>Episodes</h3></div>`;
    html += `<div class="seasons">`;
    for (const s of seasons) {
      html += `<button class="season-pill ${d.season===s?'active':''}" data-action="season" data-season="${s}">${s===0?'Specials':'Season '+s}</button>`;
    }
    html += `</div>`;
    for (const ep of episodes) {
      html += `<div class="episode" data-action="play" data-id="${t.id}" data-type="${t.type}" data-season="${ep.season}" data-episode="${ep.episode}" data-label="${escapeHtml(t.name + ' — ' + ep.label)}">
        <div class="episode-thumb"><img src="${escapeHtml(ep.thumbnail || '')}" loading="lazy" onerror="this.style.opacity=.2"></div>
        <div class="episode-info">
          <div class="title">${escapeHtml(ep.label + '  ' + ep.name)}</div>
          <div class="desc">${escapeHtml(ep.overview || ep.released || '')}</div>
        </div>
        <span style="color:var(--primary);font-size:20px;">▶</span>
      </div>`;
    }
  }
  html += `</div>`;
  html += `<button style="position:fixed;top:10px;left:10px;z-index:60;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;" onclick="App.go('home')">←</button>`;
  main.innerHTML = html;
}
function metaLine(t) {
  const parts = [];
  const y = t.releaseInfo ? t.releaseInfo.slice(0,4) : '';
  if (y && /\d/.test(y)) parts.push(y);
  if (t.runtime) parts.push(t.runtime);
  if (t.rating) parts.push('★ ' + t.rating);
  return parts.join('  ·  ');
}

// ---------- grid (see all) ----------
async function loadGrid(params) {
  state.grid = { title: params.title, type: params.type, catalog: params.catalog, genre: params.genre, items: [], loading: true, loadingMore: false, endReached: false };
  renderGrid();
  try {
    const items = await apiCatalog(params.type, { genre: params.genre, catalog: params.catalog });
    items.forEach(cacheTitle);
    state.grid.items = items;
    state.grid.endReached = items.length < 45;
  } catch { state.grid.items = []; }
  state.grid.loading = false;
  renderGrid();
}
function renderGrid() {
  if (state.screen.name !== 'grid') return;
  const g = state.grid;
  let html = `<div class="topbar"><span class="title">${escapeHtml(g.title)}</span><button onclick="App.go('home')">←</button></div>`;
  if (g.loading) html += `<div class="spinner"></div>`;
  else if (!g.items.length) html += `<div class="empty">Nothing here yet.</div>`;
  else {
    html += `<div class="grid">`;
    for (const t of g.items) html += cardHtml(t);
    html += `</div>`;
  }
  main.innerHTML = html;
}

// ---------- library ----------
function renderLibrary() {
  if (state.screen.name !== 'library') return;
  const tab = state.library.tab;
  const watchlist = getWatchlist().map(titleFromJson).filter(Boolean);
  const hist = getHistory();
  let html = `<div class="topbar"><span class="title">My list</span></div>`;
  html += `<div class="filters">
    <button class="filter-pill ${tab==='list'?'active':''}" onclick="App.setLibTab('list')">Watchlist</button>
    <button class="filter-pill ${tab==='continue'?'active':''}" onclick="App.setLibTab('continue')">Continue watching</button>
  </div>`;
  if (tab === 'continue') {
    if (!hist.length) html += `<div class="empty">Nothing in progress.<br><span class="muted">Start a movie or an episode and it shows up here.</span></div>`;
    else {
      html += `<div class="grid">`;
      for (const e of hist) {
        html += `<div class="card" data-action="open" data-id="${e.titleId}" data-type="${e.type}">
          <div class="card-poster"><img src="${escapeHtml(e.poster||'')}" loading="lazy"></div>
          <div class="card-title">${escapeHtml(e.name)}</div>
        </div>`;
      }
      html += `</div>`;
    }
  } else {
    if (!watchlist.length) html += `<div class="empty">Your list is empty.<br><span class="muted">Tap Save on any movie or series.</span></div>`;
    else {
      html += `<div class="grid">`;
      for (const t of watchlist) {
        html += `<div class="card" data-action="open" data-id="${t.id}" data-type="${t.type}">
          <div class="card-poster"><img src="${escapeHtml(t.poster||'')}" loading="lazy"></div>
          <div class="card-title">${escapeHtml(t.name)}</div>
        </div>
        <div style="text-align:center;font-size:11px;color:var(--primary);cursor:pointer;margin-top:-4px;" data-action="removeSave" data-id="${t.id}">Remove</div>`;
      }
      html += `</div>`;
    }
  }
  main.innerHTML = html;
}

// ---------- player ----------
function openPlayer(title, season, episode, label) {
  const providers = providerUrls(title, season, episode);
  state.player = { title, season, episode, label, providers, active: 0, customUrl: '' };
  renderPlayer();
}
function renderPlayer() {
  const p = state.player;
  if (!p) { modal.classList.add('hidden'); modal.innerHTML = ''; return; }
  modal.classList.remove('hidden');
  const prov = p.providers[p.active];
  let body;
  if (p.customMode) {
    body = `<video id="customVideo" controls autoplay playsinline style="width:100%;height:100%;background:#000;"></video>`;
  } else {
    body = `<iframe src="${escapeHtml(prov.url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen webkitallowfullscreen mozallowfullscreen referrerpolicy="origin"></iframe>`;
  }
  modal.innerHTML = `
    <div class="modal-header">
      <span class="label">${escapeHtml(p.label)}</span>
      <button onclick="App.closePlayer()">✕</button>
    </div>
    <div class="modal-tabs">
      ${p.providers.map((pr,i)=>`<button class="${i===p.active&&!p.customMode?'active':''}" onclick="App.setProvider(${i})">${pr.name}</button>`).join('')}
      <button class="${p.customMode?'active':''}" onclick="App.setCustomMode(true)">Custom link</button>
    </div>
    <div class="modal-body">${body}</div>
    <div class="modal-footer">
      ${p.customMode ? `
        <input id="customUrl" placeholder="Direct video / .m3u8 / .mpd URL" value="${escapeHtml(p.customUrl)}">
        <button class="btn primary" onclick="App.playCustom()">Play</button>
      ` : `
        <a href="${escapeHtml(prov.url)}" target="_blank" rel="noopener">Open ${escapeHtml(prov.name)} in new tab ↗</a>
      `}
      <button class="btn ghost" onclick="App.toggleFullscreen()">Fullscreen</button>
    </div>
  `;
  if (p.customMode) {
    // noop until play
  }
}
function setProvider(i) {
  state.player.active = i;
  state.player.customMode = false;
  renderPlayer();
}
function setCustomMode(v) {
  state.player.customMode = v;
  renderPlayer();
}
function playCustom() {
  const url = document.getElementById('customUrl').value.trim();
  state.player.customUrl = url;
  const video = document.getElementById('customVideo');
  if (!video) return;
  if (url.includes('.m3u8') && window.Hls && Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
  } else {
    video.src = url;
    video.play().catch(()=>{});
  }
}
function toggleFullscreen() {
  const iframe = document.querySelector('.modal-body iframe');
  const video = document.querySelector('.modal-body video');
  const target = iframe || video || document.querySelector('.modal');
  if (!target) return;
  const req = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
  if (!document.fullscreenElement && req) {
    try { req.call(target); } catch (e) { console.warn(e); }
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}
function closePlayer() {
  state.player = null;
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

// ---------- App global ----------
window.state = state;
window.openPlayer = openPlayer;
window.getTitle = getTitle;
const App = {
  go, reloadHome: () => { state.home = null; go('home'); },
  setBrowseType: (t) => { state.browse.type = t; state.browse.loadedKey = ''; loadBrowse(); },
  setBrowseGenre: (g) => { state.browse.genre = g; state.browse.loadedKey = ''; loadBrowse(); },
  setSearchFilter: (f) => { state.search.filter = f; renderSearch(); },
  submitSearch: (q) => { state.search.query = q; addSearch(q); state.search.recents = loadRecents(); doSearch(q); },
  setLibTab: (t) => { state.library.tab = t; renderLibrary(); },
  closePlayer, setProvider, setCustomMode, playCustom, toggleFullscreen,
};
window.App = App;

// search input handling bridge
function renderScreen() {
  const s = state.screen;
  if (s.name === 'home') renderHome();
  else if (s.name === 'browse') renderBrowse();
  else if (s.name === 'search') renderSearch();
  else if (s.name === 'library') renderLibrary();
  else if (s.name === 'details') renderDetails();
  else if (s.name === 'grid') renderGrid();
}
// patch go to call renderScreen already does

// handle browser back
window.addEventListener('popstate', () => {
  // simple: go home
  go('home');
});

// expose for inline handlers
window.historyBack = () => history.back();
