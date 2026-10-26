import {GAMES} from './catalog-data.js';

export const THEME_KEY = 'god-games-ru:theme';
const MODES = new Set(['all', 'live', 'demo']);
export function filterGames(games, query = '', mode = 'all') {
  const search = String(query).trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const selected = MODES.has(mode) ? mode : 'all';
  return games.filter(game => (selected === 'all' || game.mode === selected) && (!search || [game.title, game.originalName, game.key].join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').includes(search)));
}
export function gameCountLabel(count) {
  const n = Math.abs(count) % 100, ending = n % 10;
  return `${count} ${n > 10 && n < 20 ? 'игр' : ending === 1 ? 'игра' : ending >= 2 && ending <= 4 ? 'игры' : 'игр'}`;
}

function bootCatalog() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;
  const queryInput = document.getElementById('game-search');
  const clearButton = document.getElementById('search-clear');
  const summary = document.getElementById('catalog-summary');
  const empty = document.getElementById('search-empty');
  const loading = document.getElementById('page-loading');
  let mode = 'all', query = '';
  const params = new URLSearchParams(location.search);
  if (MODES.has(params.get('filter'))) mode = params.get('filter');
  query = String(params.get('q') || '').slice(0, 100);
  queryInput.value = query;

  function applyTheme(dark, persist = false) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(dark));
    });
    document.querySelectorAll('[data-theme-label]').forEach(node => {node.textContent = dark ? 'Светлая тема' : 'Тёмная тема';});
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#0d111b' : '#f7f8fb';
    if (persist) {try {localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');} catch {}}
  }
  let dark = document.documentElement.dataset.theme === 'dark';
  try {dark = localStorage.getItem(THEME_KEY) === 'dark';} catch {}
  applyTheme(dark);
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme !== 'dark', true)));
  window.addEventListener('storage', event => {if (event.key === THEME_KEY) applyTheme(event.newValue === 'dark');});

  function cardFor(game, index) {
    const card = document.createElement('a');
    card.className = 'game-card';
    card.href = game.href;
    card.dataset.game = game.key;
    card.style.setProperty('--order', String(index));
    card.setAttribute('aria-label', `Открыть «${game.title}» · ${game.mode === 'live' ? 'Наш поток' : 'Учебный режим'}`);
    const wrap = document.createElement('span');
    wrap.className = 'game-image-wrap';
    const image = document.createElement('img');
    image.className = 'game-image';
    image.src = game.image;
    image.alt = '';
    image.loading = index < 6 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.width = 300; image.height = 300;
    image.addEventListener('error', () => {
      image.hidden = true; wrap.classList.add('missing');
      if (!wrap.querySelector('.game-fallback')) {
        const fallback = document.createElement('span');
        fallback.className = 'game-fallback';
        fallback.textContent = game.title.split(' ').map(word => word[0]).slice(0, 2).join('');
        wrap.appendChild(fallback);
      }
    }, {once: true});
    wrap.appendChild(image);
    if (game.isNew) {
      const badge = document.createElement('span'); badge.className = 'game-new'; badge.textContent = 'НОВОЕ'; wrap.appendChild(badge);
    }
    const badge = document.createElement('span');
    badge.className = 'game-mode ' + game.mode;
    if (game.mode === 'live') {const dot = document.createElement('span'); dot.className = 'mini-dot'; dot.setAttribute('aria-hidden', 'true'); badge.appendChild(dot);}
    badge.appendChild(document.createTextNode(game.mode === 'live' ? 'LIVE' : 'ДЕМО'));
    wrap.appendChild(badge);
    const title = document.createElement('span'); title.className = 'game-title'; title.textContent = game.title;
    const caption = document.createElement('span'); caption.className = 'game-caption'; caption.textContent = game.mode === 'live' ? game.key === 'luckyjetv12' ? 'Карточка V12' : 'Персонаж и облака' : 'Учебный режим';
    card.append(wrap, title, caption);
    card.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !loading) return;
      document.getElementById('loading-title').textContent = game.title;
      const thumbnail = document.getElementById('loading-image');
      thumbnail.src = game.image; thumbnail.alt = '';
      loading.hidden = false;
      // The link still navigates normally. Never show invented loading percentages.
      window.setTimeout(() => {loading.hidden = true;}, 1600);
    });
    return card;
  }
  function updateAddress() {
    try {
      const url = new URL(location.href);
      mode === 'all' ? url.searchParams.delete('filter') : url.searchParams.set('filter', mode);
      query.trim() ? url.searchParams.set('q', query.trim()) : url.searchParams.delete('q');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch {}
  }
  function render() {
    const visible = filterGames(GAMES, query, mode);
    const fragment = document.createDocumentFragment();
    visible.forEach((game, index) => fragment.appendChild(cardFor(game, index)));
    grid.replaceChildren(fragment);
    grid.hidden = visible.length === 0;
    empty.hidden = visible.length !== 0;
    clearButton.hidden = !query;
    summary.textContent = query.trim() || mode !== 'all' ? `Найдено: ${gameCountLabel(visible.length)}` : `${gameCountLabel(GAMES.length)} в коллекции`;
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-filter-count]').forEach(node => {node.textContent = String(filterGames(GAMES, '', node.dataset.filterCount).length);});
  }
  queryInput.addEventListener('input', () => {query = queryInput.value.slice(0, 100); render(); updateAddress();});
  document.querySelectorAll('.search-form').forEach(form => form.addEventListener('submit', event => event.preventDefault()));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {mode = button.dataset.filter; render(); updateAddress();}));
  clearButton.addEventListener('click', () => {query = ''; queryInput.value = ''; render(); updateAddress(); queryInput.focus();});
  document.querySelectorAll('[data-reset-search]').forEach(button => button.addEventListener('click', () => {query = ''; mode = 'all'; queryInput.value = ''; render(); updateAddress(); queryInput.focus();}));
  window.addEventListener('pageshow', () => {if (loading) loading.hidden = true;});
  render();
}

if (typeof document !== 'undefined') {
  bootCatalog();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
    }, {once: true});
  }
}
