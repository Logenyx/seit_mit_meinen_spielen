'use strict';

(() => {
  // ---------- Settings ----------
  const GRID = 20;
  const START_INTERVAL = 150; // ms per step at the start
  const MIN_INTERVAL = 60;    // fastest possible speed
  const SPEEDUP = 5;          // ms faster for every food eaten
  const SWIPE_MIN = 30;       // px a finger must travel to count as a swipe
  const MAX_QUEUED_TURNS = 3;

  // ---------- Translations ----------
  const STRINGS = {
    ru: {
      title: 'ЗМЕЙКА',
      score: 'Счёт',
      best: 'Рекорд',
      ready: 'Собери как можно больше еды',
      start: 'Играть',
      resume: 'Продолжить',
      restart: 'Заново',
      paused: 'Пауза',
      gameOver: 'Игра окончена',
      win: 'Победа!',
      yourScore: 'Твой счёт: {score}',
      newBest: 'Новый рекорд: {score}!',
      hintKeys: 'WASD / стрелки — движение · Пробел — пауза · Enter — старт',
      hintTouch: 'Свайп — движение · Тап — пауза',
      soundOn: 'Звук включён',
      soundOff: 'Звук выключен',
    },
    en: {
      title: 'SNAKE',
      score: 'Score',
      best: 'Best',
      ready: 'Eat as much as you can',
      start: 'Play',
      resume: 'Resume',
      restart: 'Play again',
      paused: 'Paused',
      gameOver: 'Game over',
      win: 'You win!',
      yourScore: 'Your score: {score}',
      newBest: 'New best: {score}!',
      hintKeys: 'WASD / arrows — move · Space — pause · Enter — start',
      hintTouch: 'Swipe — move · Tap — pause',
      soundOn: 'Sound on',
      soundOff: 'Sound off',
    },
    de: {
      title: 'SCHLANGE',
      score: 'Punkte',
      best: 'Rekord',
      ready: 'Friss so viel wie möglich',
      start: 'Spielen',
      resume: 'Weiter',
      restart: 'Nochmal',
      paused: 'Pause',
      gameOver: 'Spiel vorbei',
      win: 'Gewonnen!',
      yourScore: 'Deine Punkte: {score}',
      newBest: 'Neuer Rekord: {score}!',
      hintKeys: 'WASD / Pfeiltasten — bewegen · Leertaste — Pause · Enter — Start',
      hintTouch: 'Wischen — bewegen · Tippen — Pause',
      soundOn: 'Ton an',
      soundOff: 'Ton aus',
    },
  };

  // ---------- Storage (may be unavailable, e.g. private mode) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
    },
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const playBtn = $('play');
  const hintEl = $('hint');
  const soundBtn = $('sound');
  const langBtns = document.querySelectorAll('[data-lang]');

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const COLORS = {
    board: color('--board'),
    grid: color('--grid'),
    snake: color('--snake'),
    snakeAlt: color('--snake-alt'),
    head: color('--head'),
    food: color('--food'),
  };

  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  // ---------- Directions ----------
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  // e.code is the physical key, so WASD works with any keyboard layout.
  const KEY_DIRS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  // ---------- Game state ----------
  let snake = [];
  let dir = DIRS.right;
  let dirQueue = [];
  let food = { x: 0, y: 0 };
  let score = 0;
  let best = Number(store.get('snake.best', 0)) || 0;
  let isNewBest = false;
  let isWin = false; // the snake filled the whole board
  let interval = START_INTERVAL;
  let state = 'ready'; // ready | running | paused | over
  let acc = 0;
  let lastTime = 0;

  let lang = 'en';
  let soundOn = store.get('snake.sound', '1') === '1';

  let size = canvas.width;
  let cell = size / GRID;

  // ---------- Sound (synthesized, no files) ----------
  const sfx = (() => {
    let ac = null;

    function ensure() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ac = new AC();
      }
      if (ac && ac.state === 'suspended') ac.resume();
    }

    function tone(from, to, dur, type = 'square', vol = 0.07, delay = 0) {
      if (!soundOn || !ac) return;
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    return {
      ensure,
      start() { tone(330, 330, 0.06); tone(660, 660, 0.08, 'square', 0.07, 0.07); },
      eat() { tone(660, 1040, 0.08); },
      die() { tone(440, 90, 0.5, 'sawtooth', 0.06); },
    };
  })();

  // ---------- Game logic ----------
  function reset() {
    const mid = Math.floor(GRID / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dir = DIRS.right;
    dirQueue = [];
    score = 0;
    isNewBest = false;
    isWin = false;
    interval = START_INTERVAL;
    acc = 0;
    placeFood();
    updateHud();
  }

  function placeFood() {
    const taken = new Set(snake.map((s) => s.y * GRID + s.x));
    const free = [];
    for (let i = 0; i < GRID * GRID; i++) if (!taken.has(i)) free.push(i);
    if (free.length === 0) return false; // board is full
    const i = free[Math.floor(Math.random() * free.length)];
    food = { x: i % GRID, y: Math.floor(i / GRID) };
    return true;
  }

  function queueDir(d) {
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    const reverse = d.x === -last.x && d.y === -last.y;
    if (d === last || reverse) return;
    if (dirQueue.length < MAX_QUEUED_TURNS) dirQueue.push(d);
  }

  function step() {
    if (dirQueue.length) dir = dirQueue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      gameOver();
      return;
    }

    const eating = head.x === food.x && head.y === food.y;
    // When not eating, the tail moves away this step, so the head may enter its cell.
    const body = eating ? snake : snake.slice(0, -1);
    if (body.some((s) => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }

    snake.unshift(head);
    if (eating) {
      score++;
      interval = Math.max(MIN_INTERVAL, interval - SPEEDUP);
      sfx.eat();
      updateHud();
      if (!placeFood()) {
        isWin = true;
        gameOver();
      }
    } else {
      snake.pop();
    }
  }

  function start() {
    if (state === 'over') reset();
    state = 'running';
    acc = 0;
    sfx.start();
    renderOverlay();
  }

  function pause() {
    if (state !== 'running') return;
    state = 'paused';
    renderOverlay();
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'running';
    acc = 0;
    renderOverlay();
  }

  function togglePause() {
    if (state === 'running') pause();
    else if (state === 'paused') resume();
    else start();
  }

  function gameOver() {
    state = 'over';
    if (isWin) sfx.start();
    else sfx.die();
    if (score > best) {
      best = score;
      isNewBest = true;
      store.set('snake.best', best);
    }
    updateHud();
    renderOverlay();
  }

  function onDirection(d) {
    if (state === 'running') {
      queueDir(d);
    } else if (state === 'ready') {
      queueDir(d);
      start();
    }
  }

  // ---------- UI ----------
  const t = (key, vars = {}) =>
    STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  function renderOverlay() {
    if (state === 'running') {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    hintEl.textContent = t(isTouch ? 'hintTouch' : 'hintKeys');

    if (state === 'ready') {
      overlayTitle.textContent = t('title');
      overlayText.textContent = t('ready');
      playBtn.textContent = t('start');
    } else if (state === 'paused') {
      overlayTitle.textContent = t('paused');
      overlayText.textContent = '';
      playBtn.textContent = t('resume');
    } else {
      overlayTitle.textContent = t(isWin ? 'win' : 'gameOver');
      overlayText.textContent = t(isNewBest ? 'newBest' : 'yourScore', { score });
      playBtn.textContent = t('restart');
    }
  }

  function updateSoundBtn() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    const label = t(soundOn ? 'soundOn' : 'soundOff');
    soundBtn.title = label;
    soundBtn.setAttribute('aria-label', label);
  }

  function detectLang() {
    const saved = store.get('snake.lang', null);
    if (saved && STRINGS[saved]) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return STRINGS[nav] ? nav : 'en';
  }

  function applyLanguage(l) {
    lang = STRINGS[l] ? l : 'en';
    store.set('snake.lang', lang);
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    updateSoundBtn();
    renderOverlay();
  }

  // ---------- Rendering ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(GRID, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== s) {
      canvas.width = s;
      canvas.height = s;
    }
    size = s;
    cell = s / GRID;
  }

  function cellRect(x, y, inset) {
    const x0 = Math.round(x * cell);
    const y0 = Math.round(y * cell);
    const x1 = Math.round((x + 1) * cell);
    const y1 = Math.round((y + 1) * cell);
    ctx.fillRect(x0 + inset, y0 + inset, x1 - x0 - inset * 2, y1 - y0 - inset * 2);
  }

  function drawEyes(head) {
    const e = Math.max(2, Math.round(cell * 0.16));
    const cx = head.x * cell + cell / 2;
    const cy = head.y * cell + cell / 2;
    const fwd = cell * 0.18;
    const side = cell * 0.2;
    // Two eyes placed forward along the direction, spread sideways.
    const px = -dir.y;
    const py = dir.x;
    ctx.fillStyle = COLORS.board;
    for (const s of [-1, 1]) {
      const ex = cx + dir.x * fwd + px * side * s;
      const ey = cy + dir.y * fwd + py * side * s;
      ctx.fillRect(Math.round(ex - e / 2), Math.round(ey - e / 2), e, e);
    }
  }

  function draw(time) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.board;
    ctx.fillRect(0, 0, size, size);

    // Grid
    ctx.fillStyle = COLORS.grid;
    const line = Math.max(1, Math.round(size / 400));
    for (let i = 1; i < GRID; i++) {
      const p = Math.round(i * cell);
      ctx.fillRect(p, 0, line, size);
      ctx.fillRect(0, p, size, line);
    }

    const gap = Math.max(1, Math.round(cell * 0.08));

    // Food (pulsing). After a win there is no free cell, so no food.
    if (!isWin) {
      const pulse = 0.55 + 0.45 * Math.sin(time / 140);
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.fillStyle = COLORS.food;
      ctx.shadowColor = COLORS.food;
      ctx.shadowBlur = cell * 0.6 * pulse;
      cellRect(food.x, food.y, gap + Math.round(cell * 0.12));
      ctx.globalAlpha = 1;
    }

    // Snake, tail first so the head is drawn on top
    ctx.shadowColor = COLORS.snake;
    ctx.shadowBlur = cell * 0.35;
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      if (i === 0) ctx.fillStyle = state === 'over' && !isWin ? COLORS.food : COLORS.head;
      else ctx.fillStyle = i % 2 ? COLORS.snake : COLORS.snakeAlt;
      cellRect(s.x, s.y, gap);
    }
    ctx.shadowBlur = 0;
    if (snake.length) drawEyes(snake[0]);
  }

  function loop(time) {
    requestAnimationFrame(loop);
    const dt = Math.min(time - lastTime, 250); // avoid a burst of steps after a stall
    lastTime = time;

    if (state === 'running') {
      acc += dt;
      while (acc >= interval && state === 'running') {
        acc -= interval;
        step();
      }
    }
    draw(time);
  }

  // ---------- Input: keyboard ----------
  document.addEventListener('keydown', (e) => {
    sfx.ensure();
    const d = KEY_DIRS[e.code];
    if (d) {
      e.preventDefault();
      onDirection(DIRS[d]);
      return;
    }
    if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' && state !== 'running') return;
      togglePause();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (e.repeat) return;
      if (state === 'paused') resume();
      else if (state !== 'running') start();
    }
  });

  // ---------- Input: touch (swipes anywhere on the page) ----------
  let touchStart = null;
  let swiped = false;

  document.addEventListener('touchstart', (e) => {
    sfx.ensure();
    if (e.touches.length !== 1) return;
    const p = e.touches[0];
    touchStart = { x: p.clientX, y: p.clientY };
    swiped = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!touchStart) return;
    const p = e.touches[0];
    const dx = p.clientX - touchStart.x;
    const dy = p.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) onDirection(dx > 0 ? DIRS.right : DIRS.left);
    else onDirection(dy > 0 ? DIRS.down : DIRS.up);
    // Re-anchor so the player can chain turns without lifting the finger.
    touchStart = { x: p.clientX, y: p.clientY };
    swiped = true;
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    touchStart = null;
    if (swiped) return;
    if (e.target.closest('button')) return; // buttons handle their own taps
    togglePause();
  });

  // ---------- Input: buttons ----------
  playBtn.addEventListener('click', () => {
    sfx.ensure();
    playBtn.blur();
    if (state === 'paused') resume();
    else start();
  });

  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    store.set('snake.sound', soundOn ? '1' : '0');
    sfx.ensure();
    updateSoundBtn();
    soundBtn.blur();
  });

  langBtns.forEach((b) => b.addEventListener('click', () => {
    applyLanguage(b.dataset.lang);
    b.blur();
  }));

  // Pause automatically when the player leaves the tab or window.
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);
  window.addEventListener('resize', resize);

  // ---------- Init ----------
  reset();
  applyLanguage(detectLang());
  resize();
  requestAnimationFrame((time) => {
    lastTime = time;
    loop(time);
  });
})();
