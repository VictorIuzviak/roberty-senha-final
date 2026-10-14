/* =========================================================
   Senha Temporária — script.js
   Tudo roda no navegador: a senha nunca é enviada nem salva.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Constantes ---------- */
  const DEFAULT_SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const UPPER = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const LOWER = Array.from('abcdefghijklmnopqrstuvwxyz');
  const DIGITS = Array.from('0123456789');

  const MAX_HISTORY = 5;
  const RING_CIRC = 2 * Math.PI * 64; // raio do anel no SVG
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PRESETS = {
    pin:  { length: 6,  upper: false, lower: false, digits: true,  symbols: false, seconds: 300 },
    wifi: { length: 12, upper: true,  lower: true,  digits: true,  symbols: false, seconds: 3600 },
    max:  { length: 32, upper: true,  lower: true,  digits: true,  symbols: true,  seconds: 300 },
  };

  const LEVELS = [
    { max: 28,       label: 'Muito fraca', tone: 'danger' },
    { max: 45,       label: 'Fraca',       tone: 'warn' },
    { max: 65,       label: 'Razoável',    tone: 'mid' },
    { max: 90,       label: 'Boa',         tone: 'good' },
    { max: Infinity, label: 'Forte',       tone: 'strong' },
  ];

  const STATUS_LABEL = { idle: 'Aguardando', active: 'Em uso', expired: 'Expirada' };

  /* ---------- Elementos ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    form: $('#generator-form'),
    presets: $$('[data-preset]'),
    length: $('#length'),
    lengthNumber: $('#length-number'),
    sets: $$('input[name="set"]'),
    symbols: $('#symbols'),
    symbolsHint: $('#symbols-hint'),
    duration: $('#duration'),

    status: $('#status'),
    vault: $('#vault'),
    generatedAt: $('#generated-at'),
    password: $('#password'),
    toggleBtn: $('#toggle-visibility'),
    toggleIcon: $('#toggle-icon'),
    toggleLabel: $('#toggle-label'),
    copyBtn: $('#copy-btn'),
    copyLabel: $('#copy-label'),
    emailBtn: $('#email-btn'),
    emailForm: $('#email-form'),
    emailInput: $('#email-input'),

    timerCard: $('#timer-card'),
    ring: $('#ring-progress'),
    time: $('#time'),

    strengthCard: $('#strength-card'),
    strengthBits: $('#strength-bits'),
    strengthLabel: $('#strength-label'),
    strengthMeter: $('#strength-meter'),
    strengthBar: $('#strength-bar'),
    strengthNote: $('#strength-note'),

    historyList: $('#history-list'),
    historyCount: $('#history-count'),
    toasts: $('#toasts'),
  };

  /* ---------- Estado (apenas em memória) ---------- */
  const state = {
    password: '',
    length: 0,
    hidden: false,
    active: false,
    expired: false,
    deadline: 0,
    durationSec: 60,
    generatedAt: null,
    durationShort: '',
    durationLong: '',
    timerId: null,
    raf: 0,
    history: [],
  };

  /* ---------- Utilidades ---------- */
  const pad2 = (n) => String(n).padStart(2, '0');

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }

  const formatClock = (date) =>
    date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  /** Caracteres únicos, sem espaços (respeita emojis/pares substitutos). */
  const uniqueChars = (text) => [...new Set(Array.from(text).filter((c) => !/\s/.test(c)))];

  /** Inteiro aleatório uniforme em [0, max) usando crypto (sem viés de módulo). */
  function randomInt(max) {
    if (max <= 1) return 0;
    const range = 0x100000000; // 2^32
    const limit = range - (range % max);
    const buf = new Uint32Array(1);
    let x;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % max;
  }

  function makeIcon(id) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  }

  /* ---------- Configuração ---------- */
  function readConfig() {
    const on = (name) => els.sets.find((input) => input.value === name).checked;
    const option = els.duration.selectedOptions[0];
    return {
      length: Number(els.length.value),
      upper: on('upper'),
      lower: on('lower'),
      digits: on('digits'),
      symbols: on('symbols'),
      symbolChars: els.symbols.value,
      seconds: Number(els.duration.value),
      short: option.dataset.short,
      long: option.textContent.trim(),
    };
  }

  function getPools(cfg) {
    const pools = [];
    if (cfg.upper) pools.push(UPPER);
    if (cfg.lower) pools.push(LOWER);
    if (cfg.digits) pools.push(DIGITS);
    if (cfg.symbols) {
      const chars = uniqueChars(cfg.symbolChars);
      if (chars.length) pools.push(chars);
    }
    return pools;
  }

  const getAlphabet = (pools) => [...new Set(pools.flat())];

  function estimate(cfg) {
    const size = getAlphabet(getPools(cfg)).length;
    const bits = size > 1 ? cfg.length * Math.log2(size) : 0;
    return { size, bits };
  }

  function applyConfig(cfg) {
    els.length.value = cfg.length;
    const setChecked = (name, value) => {
      els.sets.find((input) => input.value === name).checked = value;
    };
    setChecked('upper', cfg.upper);
    setChecked('lower', cfg.lower);
    setChecked('digits', cfg.digits);
    setChecked('symbols', cfg.symbols);

    if (typeof cfg.symbolChars === 'string' && cfg.symbolChars) {
      els.symbols.value = cfg.symbolChars;
    } else if (cfg.symbols && uniqueChars(els.symbols.value).length === 0) {
      els.symbols.value = DEFAULT_SYMBOLS;
    }

    els.duration.value = String(cfg.seconds);
    syncUI();
  }

  /* ---------- Geração ---------- */
  function buildPassword(length, pools, alphabet) {
    // garante ao menos um caractere de cada conjunto escolhido
    const out = pools.slice(0, length).map((pool) => pool[randomInt(pool.length)]);
    while (out.length < length) out.push(alphabet[randomInt(alphabet.length)]);

    // embaralha (Fisher–Yates com aleatoriedade segura)
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join('');
  }

  function generate() {
    const cfg = readConfig();

    if (cfg.symbols && uniqueChars(cfg.symbolChars).length === 0) {
      toast('Defina os símbolos', 'Digite ao menos um símbolo ou desmarque o conjunto.', 'error');
      els.symbols.focus();
      return;
    }

    const pools = getPools(cfg);
    const alphabet = getAlphabet(pools);
    if (alphabet.length < 2) {
      toast('Conjunto muito pequeno', 'Use pelo menos dois caracteres diferentes.', 'error');
      return;
    }

    state.password = buildPassword(cfg.length, pools, alphabet);
    state.length = cfg.length;
    state.hidden = false;
    state.active = true;
    state.expired = false;
    state.durationSec = cfg.seconds;
    state.durationShort = cfg.short;
    state.durationLong = cfg.long;
    state.deadline = Date.now() + cfg.seconds * 1000;
    state.generatedAt = new Date();

    pushHistory(cfg);
    startTimer();
    renderVault();
    playReveal(state.password);
    toast('Senha temporária criada', `Válida por ${cfg.short}.`);
  }

  /* ---------- Renderização ---------- */
  function renderStrength(cfg) {
    const { size, bits } = estimate(cfg);
    const level = LEVELS.find((l) => bits < l.max);

    els.strengthBits.textContent = `${Math.round(bits)} bits`;
    els.strengthLabel.textContent = bits > 0 ? level.label : '—';
    els.strengthCard.dataset.tone = bits > 0 ? level.tone : 'danger';
    els.strengthBar.style.width = bits > 0 ? `${Math.max(6, Math.min(100, (bits / 128) * 100))}%` : '0%';
    els.strengthMeter.setAttribute('aria-valuenow', String(Math.round(Math.min(bits, 128))));
    els.strengthNote.textContent = size
      ? `${cfg.length} caracteres × conjunto de ${size}`
      : 'Selecione ao menos um conjunto';
  }

  function syncPresets(cfg) {
    els.presets.forEach((btn) => {
      const p = PRESETS[btn.dataset.preset];
      const match =
        p.length === cfg.length && p.upper === cfg.upper && p.lower === cfg.lower &&
        p.digits === cfg.digits && p.symbols === cfg.symbols && p.seconds === cfg.seconds;
      btn.classList.toggle('is-active', match);
      btn.setAttribute('aria-pressed', String(match));
    });
  }

  function syncUI() {
    const cfg = readConfig();
    const min = Number(els.length.min);
    const max = Number(els.length.max);

    els.lengthNumber.textContent = String(cfg.length);
    els.length.style.setProperty('--fill', `${((cfg.length - min) / (max - min)) * 100}%`);
    els.symbols.disabled = !cfg.symbols;
    els.symbolsHint.textContent = uniqueChars(els.symbols.value).slice(0, 4).join('') || '—';

    renderStrength(cfg);
    syncPresets(cfg);
  }

  function renderVault() {
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }

    const mode = state.active ? 'active' : state.expired ? 'expired' : 'idle';
    els.vault.dataset.state = mode;
    els.status.dataset.state = mode;
    els.status.textContent = STATUS_LABEL[mode];

    if (state.active) {
      els.password.classList.remove('is-empty');
      els.password.style.setProperty('--len', String(state.length));
      els.password.textContent = state.hidden ? '•'.repeat(state.length) : state.password;
      els.generatedAt.textContent = `gerada ${formatClock(state.generatedAt)}`;
    } else {
      els.password.classList.add('is-empty');
      els.password.textContent = state.expired
        ? 'Senha expirada. Gere uma nova para continuar.'
        : 'Configure ao lado e gere sua senha.';
      els.generatedAt.textContent = state.expired ? `gerada ${formatClock(state.generatedAt)}` : '—';
    }

    els.toggleBtn.disabled = !state.active;
    els.copyBtn.disabled = !state.active;
    els.emailBtn.disabled = !state.active;
    els.toggleLabel.textContent = state.hidden ? 'Mostrar' : 'Ocultar';
    els.toggleIcon.setAttribute('href', state.hidden ? '#i-eye' : '#i-eye-off');

    if (!state.active) closeMailer();
  }

  /** Efeito rápido de "embaralhar" até revelar a senha (desligado com movimento reduzido). */
  function playReveal(finalText) {
    if (REDUCED_MOTION) return;
    const chars = Array.from(finalText);
    const duration = 420;
    const start = performance.now();

    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const fixed = Math.floor(progress * chars.length);
      els.password.textContent = chars
        .map((c, i) => (i < fixed ? c : chars[Math.floor(Math.random() * chars.length)]))
        .join('');
      if (progress < 1) {
        state.raf = requestAnimationFrame(frame);
      } else {
        state.raf = 0;
        renderVault();
      }
    };
    state.raf = requestAnimationFrame(frame);
  }

  /* ---------- Timer ---------- */
  function setRing(ratio) {
    els.ring.style.strokeDashoffset = String(RING_CIRC * (1 - ratio));
  }

  function renderTimerIdle() {
    els.time.textContent = '--:--';
    els.time.dataset.long = 'false';
    els.timerCard.dataset.tone = 'idle';
    setRing(0);
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = setInterval(tick, 200);
    tick();
  }

  function tick() {
    if (!state.active) return;

    const total = state.durationSec * 1000;
    const remaining = Math.max(0, state.deadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const ratio = remaining / total;

    els.time.textContent = formatTime(seconds);
    els.time.dataset.long = String(seconds >= 3600);
    setRing(ratio);
    els.timerCard.dataset.tone = ratio <= 0.1 || seconds <= 10 ? 'danger' : ratio <= 0.25 ? 'warn' : 'ok';

    if (remaining <= 0) expire();
  }

  function expire() {
    clearInterval(state.timerId);
    state.timerId = null;
    state.active = false;
    state.expired = true;
    state.password = ''; // descarta a senha

    els.time.textContent = '00:00';
    els.time.dataset.long = 'false';
    els.timerCard.dataset.tone = 'expired';
    setRing(0);

    renderVault();
    toast('Senha expirada', 'A senha foi descartada desta página.', 'warn');
  }

  /* ---------- Ações da senha ---------- */
  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* cai no plano B */ }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove();
    return ok;
  }

  async function copyPassword() {
    if (!state.active) return;
    const ok = await writeClipboard(state.password);
    if (!ok) {
      toast('Não consegui copiar', 'Selecione a senha e copie manualmente.', 'error');
      return;
    }
    els.copyBtn.classList.add('is-done');
    els.copyLabel.textContent = 'Copiado';
    setTimeout(() => {
      els.copyBtn.classList.remove('is-done');
      els.copyLabel.textContent = 'Copiar';
    }, 1600);
    toast('Senha copiada', 'Cole onde precisar antes que ela expire.');
  }

  function toggleVisibility() {
    if (!state.active) return;
    state.hidden = !state.hidden;
    renderVault();
  }

  function openMailer() {
    els.emailForm.hidden = false;
    els.emailBtn.setAttribute('aria-expanded', 'true');
    els.emailInput.focus();
  }

  function closeMailer() {
    els.emailForm.hidden = true;
    els.emailBtn.setAttribute('aria-expanded', 'false');
  }

  function sendByEmail(event) {
    event.preventDefault();
    if (!state.active) return;

    const email = els.emailInput.value.trim();
    if (!email || !els.emailInput.checkValidity()) {
      toast('E-mail inválido', 'Confira o endereço e tente de novo.', 'error');
      els.emailInput.focus();
      return;
    }

    const expiresAt = new Date(state.deadline);
    const subject = 'Sua senha temporária';
    const body =
      `Senha temporária: ${state.password}\n\n` +
      `Válida por ${state.durationLong.toLowerCase()} (expira às ${formatClock(expiresAt)}).\n` +
      'Gerada localmente no navegador e não armazenada online.';

    const address = encodeURIComponent(email).replace(/%40/g, '@');
    window.location.href =
      `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    toast('Abrindo seu app de e-mail', 'Revise a mensagem antes de enviar.');
  }

  /* ---------- Histórico (só configurações, nunca a senha) ---------- */
  function pushHistory(cfg) {
    state.history.unshift({
      length: cfg.length, upper: cfg.upper, lower: cfg.lower, digits: cfg.digits,
      symbols: cfg.symbols, symbolChars: cfg.symbolChars,
      seconds: cfg.seconds, short: cfg.short,
    });
    state.history = state.history.slice(0, MAX_HISTORY);
    renderHistory();
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    els.historyCount.textContent = `${state.history.length}/${MAX_HISTORY}`;

    if (!state.history.length) {
      const empty = document.createElement('li');
      empty.className = 'history__empty';
      empty.textContent = 'Nenhuma geração ainda.';
      els.historyList.append(empty);
      return;
    }

    state.history.forEach((entry, index) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-chip';
      btn.dataset.index = String(index);
      btn.title = 'Reaplicar estas configurações';

      const dots = document.createElement('i');
      dots.textContent = '••••••';
      const text = document.createElement('span');
      text.textContent = `${entry.length} car. · ${entry.short}`;

      btn.append(dots, text);
      li.append(btn);
      els.historyList.append(li);
    });
  }

  /* ---------- Avisos ---------- */
  function toast(title, message, tone = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    if (tone === 'error') el.setAttribute('role', 'alert');

    const body = document.createElement('div');
    const t = document.createElement('p');
    t.className = 'toast__title';
    t.textContent = title;
    const m = document.createElement('p');
    m.className = 'toast__msg';
    m.textContent = message;
    body.append(t, m);

    el.append(makeIcon(tone === 'success' ? 'i-circle-check' : 'i-alert'), body);
    els.toasts.append(el);

    while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();

    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    }, 3600);
  }

  /* ---------- Eventos ---------- */
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });

  els.form.addEventListener('input', syncUI);

  // sempre mantém ao menos um conjunto ativo
  els.sets.forEach((input) => {
    input.addEventListener('change', () => {
      if (!els.sets.some((s) => s.checked)) {
        input.checked = true;
        toast('Mantenha um conjunto', 'Ao menos um tipo de caractere precisa ficar ativo.', 'error');
      }
      syncUI();
    });
  });

  els.presets.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyConfig(PRESETS[btn.dataset.preset]);
      generate();
    });
  });

  els.toggleBtn.addEventListener('click', toggleVisibility);
  els.copyBtn.addEventListener('click', copyPassword);
  els.emailBtn.addEventListener('click', () => (els.emailForm.hidden ? openMailer() : closeMailer()));
  els.emailForm.addEventListener('submit', sendByEmail);
  els.emailForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMailer();
      els.emailBtn.focus();
    }
  });

  els.historyList.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-index]');
    if (!btn) return;
    applyConfig(state.history[Number(btn.dataset.index)]);
    toast('Configuração restaurada', 'Ajuste o que quiser e gere de novo.');
  });

  // abas em segundo plano atrasam timers: confere o relógio ao voltar
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });

  /* ---------- Início ---------- */
  els.ring.style.strokeDasharray = String(RING_CIRC);
  els.ring.style.strokeDashoffset = String(RING_CIRC);
  syncUI();
  renderVault();
  renderTimerIdle();
  renderHistory();
})();
