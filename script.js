/**
 * script.js — CinéRank
 * ─────────────────────────────────────────────────────────────
 * Handles all frontend logic:
 *  - Page navigation
 *  - Discover / swipe interactions
 *  - Pairwise comparison (ELO-style ranking)
 *  - Ranking list rendering
 *  - Browse grid with search & filter
 *  - Toast notifications
 *  - Modal detail view
 *  - fetch() stubs for Flask backend integration
 * ─────────────────────────────────────────────────────────────
 * BACKEND INTEGRATION: Search for "API CALL" comments to find
 * every place a real HTTP request should be made to Flask.
 * Base URL: const API_BASE = 'http://127.0.0.1:5000'
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:5000'; // Flask dev server

// ELO settings for the ranking algorithm
const ELO_K = 32;      // K-factor (how fast ratings change)
const ELO_BASE = 1200; // Starting rating for every film

// ─────────────────────────────────────────────────────────────
// PLACEHOLDER MOVIE DATA
// Replace / augment this with a real /movies API endpoint.
// Each movie object mirrors what Flask would return.
// ─────────────────────────────────────────────────────────────
let ALL_MOVIES = [];


async function loadMovies() {
  try {
  const res = await fetch("http://127.0.0.1:5000/movies/popular");
  const movies = await res.json();

  console.log("MOVIES RECEIVED:", movies);

    ALL_MOVIES = movies;

    state.discoverQueue = [...ALL_MOVIES];

    renderDiscoverStack();
    renderDiscoverStack(movies);

  } catch (err) {
    console.error("Error loading movies:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
let state = {
  // Discover deck — movies not yet acted on
  discoverQueue: [...ALL_MOVIES],
  // Set of movie IDs the user has watched
  watchedIds: new Set(),
  // Map of movie ID → ELO score  (populated when movie is watched)
  eloScores: {},
  // Total comparisons made this session
  comparesDone: 0,
  // Current pair on the comparison page
  currentPair: null,
  // Active genre filter in the browse grid
  activeGenre: 'All',
  // Current discover card index
  deckIndex: 0,
};

// ─────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const dom = {
  navbar:        $('navbar'),
  hamburger:     $('hamburger'),
  navLinks:      $('navLinks'),
  pages: {
    discover:    $('page-discover'),
    compare:     $('page-compare'),
    ranking:     $('page-ranking'),
    grid:        $('page-grid'),
  },
  // Discover
  cardStack:     $('cardStack'),
  skipBtn:       $('skipBtn'),
  watchBtn:      $('watchBtn'),
  rewindBtn:     $('rewindBtn'),
  discoverCount: $('discoverCount'),
  // Compare
  compareArena:  $('compareArena'),
  compareEmpty:  $('compareEmpty'),
  leftPoster:    $('leftPoster'),
  leftTitle:     $('leftTitle'),
  leftYear:      $('leftYear'),
  rightPoster:   $('rightPoster'),
  rightTitle:    $('rightTitle'),
  rightYear:     $('rightYear'),
  compareLeft:   $('compareLeft'),
  compareRight:  $('compareRight'),
  skipPairBtn:   $('skipPairBtn'),
  comparesDone:  $('comparesDone'),
  // Ranking
  rankingList:   $('rankingList'),
  rankingEmpty:  $('rankingEmpty'),
  // Grid
  movieGrid:     $('movieGrid'),
  genreFilters:  $('genreFilters'),
  gridSearch:    $('gridSearch'),
  // Toast
  toast:         $('toast'),
  // Modal
  modalBackdrop: $('modalBackdrop'),
  modal:         $('modal'),
  modalClose:    $('modalClose'),
  modalContent:  $('modalContent'),
};

// ─────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────
function navigateTo(pageId) {
  // Hide all pages
  Object.values(dom.pages).forEach((p) => p.classList.remove('active'));
  // Show requested page
  const page = dom.pages[pageId];
  if (!page) return;
  page.classList.add('active');
  // Update nav link active state
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });
  // Close mobile menu
  dom.navLinks.classList.remove('open');
  dom.hamburger.classList.remove('open');
  // Page-specific refresh
  if (pageId === 'ranking') renderRanking();
  if (pageId === 'compare') loadComparePair();
}

// Wire up nav links
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

// Hamburger toggle
dom.hamburger.addEventListener('click', () => {
  dom.hamburger.classList.toggle('open');
  dom.navLinks.classList.toggle('open');
});

// Global helper (called from inline onclick in HTML)
window.navigateTo = navigateTo;

// ─────────────────────────────────────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = '') {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => {
    dom.toast.className = 'toast';
  }, 2600);
}

// ─────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────
function openModal(movie) {
  const watched = state.watchedIds.has(movie.id);
  dom.modalContent.innerHTML = `
    ${movie.poster
      ? `<img class="modal-poster" src="${movie.poster}" alt="${movie.title}" onerror="this.style.display='none'">`
      : ''}
    <div class="modal-body">
      <h2 class="modal-title">${movie.title}</h2>
      <div class="modal-meta">
        <span>${movie.year}</span>
        <span>·</span>
        <span>${movie.director || ''}</span>
        <span>·</span>
        ${(movie.genres || []).map((g) => `<span class="genre-tag">${g}</span>`).join('')}
      </div>
      <p class="modal-desc">${movie.description || ''}</p>
      <div class="modal-actions">
        ${watched
          ? `<button class="ghost-btn" disabled>✓ In your list</button>`
          : `<button class="cta-btn" onclick="markWatched(${movie.id}); closeModal();">+ Add to Watched</button>`}
      </div>
    </div>
  `;
  dom.modalBackdrop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  dom.modalBackdrop.classList.add('hidden');
  document.body.style.overflow = '';
}

dom.modalClose.addEventListener('click', closeModal);
dom.modalBackdrop.addEventListener('click', (e) => {
  if (e.target === dom.modalBackdrop) closeModal();
});

// ─────────────────────────────────────────────────────────────
// PAGE 1 — DISCOVER (Swipe / Tinder style)
// ─────────────────────────────────────────────────────────────

/** Build the visual card stack (top 3 cards visible) */
function renderDiscoverStack() {
  dom.cardStack.innerHTML = '';
  const remaining = state.discoverQueue.slice(state.deckIndex);

  if (remaining.length === 0) {
    dom.cardStack.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1rem;color:var(--text-secondary);text-align:center;">
        <div style="font-size:3rem;">🎞️</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.6rem;letter-spacing:.06em;color:var(--text-primary);">You've seen it all</div>
        <div style="font-size:.88rem;">Browse to add more films</div>
        <button class="cta-btn" style="margin-top:.5rem;" onclick="navigateTo('grid')">Browse Films</button>
      </div>`;
    return;
  }

  // Render up to 3 cards (stack effect)
  const slice = remaining.slice(0, 3).reverse(); // back-to-front
  slice.forEach((movie) => {
    dom.cardStack.appendChild(buildDiscoverCard(movie));
  });

  // Attach drag/swipe to the top card
  attachSwipeListeners(dom.cardStack.lastElementChild, remaining[0]);
}

/** Create a single discover card DOM element */
function buildDiscoverCard(movie) {
  const card = document.createElement('div');
  card.className = 'discover-card';
  card.dataset.id = movie.id;

  card.innerHTML = `
    <div class="swipe-feedback feedback-watch">WATCHED</div>
    <div class="swipe-feedback feedback-skip">SKIP</div>
    ${movie.poster
      ? `<img class="card-poster" src="${movie.poster}" alt="${movie.title}" draggable="false"
           onerror="this.outerHTML='<div class=\\'card-poster-placeholder\\'>🎬</div>'">`
      : `<div class="card-poster-placeholder">🎬</div>`}
    <div class="card-body">
      <div class="card-title">${movie.title}</div>
      <div class="card-meta">
        <span class="card-year">${movie.year}</span>
        <span class="card-dot">●</span>
        <div class="card-genres">
          ${(movie.genres || []).map(g => `<span class="genre-tag">${g}</span>`).join('')}
        </div>
      </div>
    </div>
  `;

  return card;
}

/** Attach mouse + touch drag-to-swipe behaviour to the top card */
function attachSwipeListeners(card, movie) {
  let startX = 0, startY = 0, currentX = 0, isDragging = false;
  const feedbackWatch = card.querySelector('.feedback-watch');
  const feedbackSkip  = card.querySelector('.feedback-skip');

  const onStart = (clientX, clientY) => {
    startX = clientX;
    startY = clientY;
    isDragging = true;
    card.style.transition = 'none';
  };

  const onMove = (clientX) => {
    if (!isDragging) return;
    currentX = clientX - startX;
    const rotate = currentX * 0.06;
    card.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
    // Show feedback label based on direction
    const threshold = 40;
    feedbackWatch.style.opacity = currentX > threshold ? Math.min((currentX - threshold) / 60, 1) : 0;
    feedbackSkip.style.opacity  = currentX < -threshold ? Math.min((-currentX - threshold) / 60, 1) : 0;
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = '';
    feedbackWatch.style.opacity = 0;
    feedbackSkip.style.opacity  = 0;

    const SWIPE_THRESHOLD = 80;
    if (currentX > SWIPE_THRESHOLD) {
      animateSwipe(card, 'right', movie);
    } else if (currentX < -SWIPE_THRESHOLD) {
      animateSwipe(card, 'left', movie);
    } else {
      // Snap back
      card.style.transform = '';
    }
    currentX = 0;
  };

  // Mouse events
  card.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => { if (isDragging) onMove(e.clientX); });
  window.addEventListener('mouseup', onEnd);

  // Touch events
  card.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    onStart(t.clientX, t.clientY);
  }, { passive: true });
  card.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    onMove(t.clientX);
  }, { passive: true });
  card.addEventListener('touchend', onEnd);
}

/** Programmatically trigger a swipe animation */
function animateSwipe(card, direction, movie) {
  card.classList.add(direction === 'right' ? 'swiping-right' : 'swiping-left');

  card.addEventListener('animationend', () => {
    card.remove();
    state.deckIndex++;
    if (direction === 'right') {
      markWatched(movie.id);
    }
    // Rebuild stack to show next card
    renderDiscoverStack();
  }, { once: true });
}

/** Mark a movie as watched (swipe right or button click) */
function markWatched(movieId) {
  if (state.watchedIds.has(movieId)) return; // already tracked
  state.watchedIds.add(movieId);
  // Initialise ELO score
  if (!state.eloScores[movieId]) state.eloScores[movieId] = ELO_BASE;

  const movie = ALL_MOVIES.find((m) => m.id === movieId);
  updateDiscoverCounter();
  showToast(`✓ ${movie ? movie.title : 'Film'} added to your list`, 'success');

  // ── API CALL: POST /watched ──────────────────────────────
  // Sends the watched movie to the Flask backend.
  // Uncomment when backend is ready.
  /*
  fetch(`${API_BASE}/watched`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie_id: movieId }),
  })
    .then((res) => res.json())
    .then((data) => console.log('POST /watched →', data))
    .catch((err) => console.error('POST /watched failed:', err));
  */
}

/** Update the "X films in your list" counter */
function updateDiscoverCounter() {
  dom.discoverCount.textContent = state.watchedIds.size;
}

// Button: "Watched"
dom.watchBtn.addEventListener('click', () => {
  const topCard = dom.cardStack.querySelector('.discover-card');
  if (!topCard) return;
  const movieId = parseInt(topCard.dataset.id);
  const movie = ALL_MOVIES.find((m) => m.id === movieId);
  animateSwipe(topCard, 'right', movie);
});

// Button: "Skip"
dom.skipBtn.addEventListener('click', () => {
  const topCard = dom.cardStack.querySelector('.discover-card');
  if (!topCard) return;
  const movieId = parseInt(topCard.dataset.id);
  const movie = ALL_MOVIES.find((m) => m.id === movieId);
  animateSwipe(topCard, 'left', movie);
});

// Button: "Undo" — remove the last action by decrementing deckIndex
dom.rewindBtn.addEventListener('click', () => {
  if (state.deckIndex === 0) {
    showToast('Nothing to undo');
    return;
  }
  // If last action was a watch, un-watch it
  const lastIndex = state.deckIndex - 1;
  const lastMovie = state.discoverQueue[lastIndex];
  if (state.watchedIds.has(lastMovie.id)) {
    state.watchedIds.delete(lastMovie.id);
    delete state.eloScores[lastMovie.id];
    updateDiscoverCounter();
  }
  state.deckIndex--;
  renderDiscoverStack();
  showToast('↩ Undone');
});

// ─────────────────────────────────────────────────────────────
// PAGE 2 — COMPARE (ELO pairwise championship)
// ─────────────────────────────────────────────────────────────

/** Pick a pair of watched movies and display them */
function loadComparePair() {
  const watchedMovies = getWatchedMovies();

  if (watchedMovies.length < 2) {
    dom.compareArena.classList.add('hidden');
    dom.compareEmpty.classList.remove('hidden');
    return;
  }

  dom.compareArena.classList.remove('hidden');
  dom.compareEmpty.classList.add('hidden');

  // Choose a pair: pick the two movies with the closest ELO scores
  // (more interesting match-ups than fully random)
  const sorted = [...watchedMovies].sort((a, b) => eloOf(a.id) - eloOf(b.id));
  const pairIndex = Math.floor(Math.random() * (sorted.length - 1));
  const movieA = sorted[pairIndex];
  const movieB = sorted[pairIndex + 1];

  state.currentPair = { a: movieA, b: movieB };
  fillCompareCard('left', movieA);
  fillCompareCard('right', movieB);
}

function fillCompareCard(side, movie) {
  const poster = side === 'left' ? dom.leftPoster : dom.rightPoster;
  const title  = side === 'left' ? dom.leftTitle  : dom.rightTitle;
  const year   = side === 'left' ? dom.leftYear   : dom.rightYear;

  poster.src = movie.poster || '';
  poster.alt = movie.title;
  poster.onerror = () => { poster.style.display = 'none'; };
  title.textContent = movie.title;
  year.textContent  = movie.year;
}

/** Helper: get all watched movie objects */
function getWatchedMovies() {
  return ALL_MOVIES.filter((m) => state.watchedIds.has(m.id));
}

/** Helper: get ELO score (default to base if not set) */
function eloOf(movieId) {
  return state.eloScores[movieId] ?? ELO_BASE;
}

/** ELO calculation */
function calcElo(winnerScore, loserScore, k = ELO_K) {
  const expectedWin  = 1 / (1 + Math.pow(10, (loserScore - winnerScore) / 400));
  const expectedLoss = 1 - expectedWin;
  return {
    newWinner: Math.round(winnerScore + k * (1 - expectedWin)),
    newLoser:  Math.round(loserScore  + k * (0 - expectedLoss)),
  };
}

/** Handle a user picking a winner */
function pickWinner(winnerId, loserId) {
  const winnerScore = eloOf(winnerId);
  const loserScore  = eloOf(loserId);
  const { newWinner, newLoser } = calcElo(winnerScore, loserScore);

  state.eloScores[winnerId] = newWinner;
  state.eloScores[loserId]  = newLoser;
  state.comparesDone++;
  dom.comparesDone.textContent = state.comparesDone;

  const winner = ALL_MOVIES.find((m) => m.id === winnerId);
  showToast(`👑 ${winner ? winner.title : 'Film'} wins this round`, 'success');

  // ── API CALL: POST /compare ──────────────────────────────
  // Sends the comparison result to the Flask backend.
  // Uncomment when backend is ready.
  /*
  fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner: winnerId, loser: loserId }),
  })
    .then((res) => res.json())
    .then((data) => console.log('POST /compare →', data))
    .catch((err) => console.error('POST /compare failed:', err));
  */

  // Short delay then load a new pair
  setTimeout(loadComparePair, 600);
}

// Wire up compare card clicks
dom.compareLeft.addEventListener('click', () => {
  if (!state.currentPair) return;
  dom.compareLeft.classList.add('winner');
  setTimeout(() => dom.compareLeft.classList.remove('winner'), 500);
  pickWinner(state.currentPair.a.id, state.currentPair.b.id);
});

dom.compareRight.addEventListener('click', () => {
  if (!state.currentPair) return;
  dom.compareRight.classList.add('winner');
  setTimeout(() => dom.compareRight.classList.remove('winner'), 500);
  pickWinner(state.currentPair.b.id, state.currentPair.a.id);
});

// Skip pair button
dom.skipPairBtn.addEventListener('click', () => {
  showToast('Pair skipped');
  loadComparePair();
});

// ─────────────────────────────────────────────────────────────
// PAGE 3 — RANKING LIST
// ─────────────────────────────────────────────────────────────

function renderRanking() {
  const watched = getWatchedMovies();

  if (watched.length === 0) {
    dom.rankingList.innerHTML = '';
    dom.rankingEmpty.classList.remove('hidden');
    return;
  }

  dom.rankingEmpty.classList.add('hidden');

  // Sort by ELO descending
  const sorted = [...watched].sort((a, b) => eloOf(b.id) - eloOf(a.id));

  dom.rankingList.innerHTML = '';
  sorted.forEach((movie, index) => {
    const rank   = index + 1;
    const elo    = eloOf(movie.id);
    const item   = document.createElement('div');
    item.className = 'ranking-item';
    item.style.animationDelay = `${index * 40}ms`;

    // Rank number colour class
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';

    item.innerHTML = `
      <span class="rank-number ${rankClass}">${rank}</span>
      ${movie.poster
        ? `<img class="rank-thumb" src="${movie.poster}" alt="${movie.title}"
             onerror="this.outerHTML='<div class=\\'rank-thumb-placeholder\\'>🎬</div>'">`
        : `<div class="rank-thumb-placeholder">🎬</div>`}
      <div class="rank-info">
        <div class="rank-title">${movie.title}</div>
        <div class="rank-year">${movie.year} · ${(movie.genres && movie.genres.length ? movie.genres.join(", ") : "")}</div>
      </div>
      <span class="rank-score">ELO ${elo}</span>
    `;

    item.addEventListener('click', () => openModal(movie));
    dom.rankingList.appendChild(item);
  });
}

// ─────────────────────────────────────────────────────────────
// PAGE 4 — BROWSE GRID
// ─────────────────────────────────────────────────────────────

/** Collect all unique genres from the movie list */
function getAllGenres() {
  const genres = new Set(['All']);
  ALL_MOVIES.forEach((m) => m.genres.forEach((g) => genres.add(g)));
  return [...genres];
}

/** Build genre filter pills */
function renderGenreFilters() {
  dom.genreFilters.innerHTML = '';
  getAllGenres().forEach((genre) => {
    const pill = document.createElement('button');
    pill.className = `filter-pill ${genre === state.activeGenre ? 'active' : ''}`;
    pill.textContent = genre;
    pill.addEventListener('click', () => {
      state.activeGenre = genre;
      document.querySelectorAll('.filter-pill').forEach((p) =>
        p.classList.toggle('active', p.textContent === genre)
      );
      renderMovieGrid();
    });
    dom.genreFilters.appendChild(pill);
  });
}

/** Render the movie grid based on current search + filter */
function renderMovieGrid() {
  const query  = dom.gridSearch.value.toLowerCase().trim();
  const genre  = state.activeGenre;

  const filtered = ALL_MOVIES.filter((m) => {
    const matchesGenre = genre === 'All' || m.genres.includes(genre);
    const matchesQuery = !query ||
      m.title.toLowerCase().includes(query) ||
      (m.director && m.director.toLowerCase().includes(query)) ||
      m.genres.some((g) => g.toLowerCase().includes(query));
    return matchesGenre && matchesQuery;
  });

  dom.movieGrid.innerHTML = '';

  if (filtered.length === 0) {
    dom.movieGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--text-secondary);">
        No films match your search.
      </div>`;
    return;
  }

  filtered.forEach((movie, i) => {
    const card = document.createElement('div');
    card.className = 'grid-card';
    card.style.animationDelay = `${i * 30}ms`;
    const isWatched = state.watchedIds.has(movie.id);

    card.innerHTML = `
      <div class="grid-poster-wrap">
        ${movie.poster
          ? `<img class="grid-poster" src="${movie.poster}" alt="${movie.title}"
               loading="lazy"
               onerror="this.outerHTML='<div class=\\'grid-poster\\" style=\\"background:var(--bg-surface);display:flex;align-items:center;justify-content:center;font-size:2rem;aspect-ratio:2/3\\">🎬</div>'">`
          : `<div class="grid-poster" style="background:var(--bg-surface);display:flex;align-items:center;justify-content:center;font-size:2rem;aspect-ratio:2/3">🎬</div>`}
        ${isWatched ? '<div class="watched-badge">✓</div>' : ''}
        <div class="grid-hover-overlay">
          ${isWatched
            ? `<button class="overlay-btn overlay-btn-watch" disabled style="opacity:.6;cursor:not-allowed;">✓ Watched</button>`
            : `<button class="overlay-btn overlay-btn-watch" onclick="event.stopPropagation();quickAddWatched(${movie.id}, this)">+ Watched</button>`}
          <button class="overlay-btn overlay-btn-detail" onclick="event.stopPropagation();openModal(findMovie(${movie.id}))">Details</button>
        </div>
      </div>
      <div class="grid-info">
        <div class="grid-title">${movie.title}</div>
        <div class="grid-year">${movie.year}</div>
      </div>
    `;

    card.addEventListener('click', () => openModal(movie));
    dom.movieGrid.appendChild(card);
  });
}

/** Quick-add a film to watched directly from the grid overlay button */
window.quickAddWatched = function(movieId, btn) {
  markWatched(movieId);
  btn.textContent = '✓ Watched';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.style.cursor = 'not-allowed';
  // Show watched badge
  const wrap = btn.closest('.grid-poster-wrap');
  if (wrap && !wrap.querySelector('.watched-badge')) {
    const badge = document.createElement('div');
    badge.className = 'watched-badge';
    badge.textContent = '✓';
    wrap.appendChild(badge);
  }
};

/** Expose findMovie globally for onclick handlers */
window.findMovie = (id) => ALL_MOVIES.find((m) => m.id === id);

// Search input debounce
let searchTimer = null;
dom.gridSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderMovieGrid, 220);
});

// ─────────────────────────────────────────────────────────────
// INITIALISE
// ─────────────────────────────────────────────────────────────
function init() {
  renderDiscoverStack();
  renderGenreFilters();
  renderMovieGrid();
  updateDiscoverCounter();

  // Load the Discover page by default
  navigateTo('discover');

  console.log(
    '%c CinéRank loaded — connect to Flask at ' + API_BASE,
    'color: #e8a020; font-weight: bold; font-size: 13px;'
  );
}

// Expose markWatched globally (used in modal inline onclick)
window.markWatched = markWatched;
window.closeModal  = closeModal;
window.openModal   = openModal;

document.addEventListener("DOMContentLoaded", () => {
  loadMovies();
});

// Run
init();


