/* =========================================================
   Senha Temporária — script.js (Otimizado)
   ========================================================= */
(() => {
  'use strict';

  const DEFAULT_SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const DIGITS = '0123456789';
  const MAX_HISTORY = 5;
  const RING_CIRC = 2 * Math.PI * 64;

  const PRESETS = {
    pin:  { length: 6,  upper: false, lower: false, digits: true,  symbols: false, seconds: 300 },
    wifi: { length: 12, upper: true,  lower: true,  digits: true,  symbols: false, seconds: 3600 },
    max:  { length: 32, upper: true,  lower: true,  digits: true,  symbols: true,  seconds: 300 },
  };

  const LEVELS = [
    { max: 28, label: 'Muito fraca', tone: 'danger' },
    { max: 45, label: 'Fraca', tone: 'warn' },
    { max: 65, label: 'Razoável', tone: 'mid' },
    { max: 90, label: 'Boa', tone: 'good' },
    { max: Infinity, label: 'Forte', tone: 'strong' },
  ];

  const $ = (sel) => document.querySelector(sel); const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    form: $('#generator-form'), presets: $$('[data-preset]'),
    length: $('#length'),
    lengthNumber: $('#length-number'), sets: $$('input[name="set"]'),
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

  const state = {
    password: '', length: 0, hidden: false, active: false, expired: false,
    deadline: 0, durationSec: 60, durationLong: '', timerId: null, history: []
  };

  const uniqueChars = (text) => [...new Set(Array.from(text).filter(c => !/\s/.test(c)))];

  const randomInt = (max) => {
    if (max <= 1) return 0;
    const limit = 0x100000000 - (0x100000000 % max);
    const buf = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % max;
  };

  const readConfig = () => {
    const on = (name) => els.sets.find(i => i.value === name)?.checked;
    const opt = els.duration.selectedOptions[0];
    return {
      length: Number(els.length.value),
      upper: on('upper'), lower: on('lower'), digits: on('digits'), symbols: on('symbols'),
      symbolChars: els.symbols.value, seconds: Number(els.duration.value),
      short: opt.dataset.short, long: opt.textContent.trim()
    };
  };

  const getPools = (cfg) => {
    const pools = [];
    if (cfg.upper) pools.push(Array.from(UPPER));
    if (cfg.lower) pools.push(Array.from(LOWER));
    if (cfg.digits) pools.push(Array.from(DIGITS));
    if (cfg.symbols) {
      const chars = uniqueChars(cfg.symbolChars);
      if (chars.length) pools.push(chars);
    }
    return pools;
  };

  const getAlphabet = (pools) => [...new Set(pools.flat())];

  function toast(title, message, tone = 'success') {
    if (!els.toasts) return;
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.innerHTML = `<div class="toast__body"><p class="toast__title">${title}</p><p class="toast__msg">${message}</p></div>`;
    els.toasts.append(el);
    while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); }, 3600);
  }

  function renderStrength(cfg) {
    const pools = getPools(cfg);
    const alphabet = getAlphabet(pools);
    const bits = alphabet.length > 1 ? cfg.length * Math.log2(alphabet.length) : 0;
    const level = LEVELS.find(l => bits < l.max);

    els.strengthBits.textContent = `${Math.round(bits)} bits`;
    els.strengthLabel.textContent = bits > 0 ? level.label : '—';
    els.strengthCard.dataset.tone = bits > 0 ? level.tone : 'danger';
    els.strengthBar.style.width = bits > 0 ? `${Math.max(6, Math.min(100, (bits / 128) * 100))}%` : '0%';
    els.strengthNote.textContent = alphabet.length ? `${cfg.length} caracteres × conjunto de ${alphabet.length}` : 'Selecione ao menos um conjunto';
  }

  function syncUI() {
    const cfg = readConfig();
    const min = Number(els.length.min), max = Number(els.length.max);
    els.lengthNumber.textContent = String(cfg.length);
    els.length.style.setProperty('--fill', `${((cfg.length - min) / (max - min)) * 100}%`);
    els.symbols.disabled = !cfg.symbols;
    els.symbolsHint.textContent = uniqueChars(els.symbols.value).slice(0, 4).join('') || '—';
    renderStrength(cfg);

    els.presets.forEach(btn => {
      const p = PRESETS[btn.dataset.preset];
      const match = p && p.length === cfg.length && p.upper === cfg.upper && p.lower === cfg.lower &&
                    p.digits === cfg.digits && p.symbols === cfg.symbols && p.seconds === cfg.seconds;
      btn.classList.toggle('is-active', match);
    });
  }

  function renderVault() {
    const mode = state.active ? 'active' : state.expired ? 'expired' : 'idle';
    els.vault.dataset.state = mode;
    els.status.dataset.state = mode;
    els.status.textContent = { idle: 'Aguardando', active: 'Em uso', expired: 'Expirada' }[mode];

    if (state.active) {
      els.password.classList.remove('is-empty');
      els.password.textContent = state.hidden ? '•'.repeat(state.length) : state.password;
      els.generatedAt.textContent = `gerada ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      els.password.classList.add('is-empty');
      els.password.textContent = state.expired ? 'Senha expirada. Gere uma nova.' : 'Configure ao lado e gere sua senha.';
    }

    els.toggleBtn.disabled = !state.active;
    els.copyBtn.disabled = !state.active;
    els.emailBtn.disabled = !state.active;
    els.toggleLabel.textContent = state.hidden ? 'Mostrar' : 'Ocultar';
    els.toggleIcon.setAttribute('href', state.hidden ? '#i-eye' : '#i-eye-off');
    if (!state.active) els.emailForm.hidden = true;
  }

  function generate() {
    const cfg = readConfig();
    const pools = getPools(cfg);
    const alphabet = getAlphabet(pools);
    
    if (alphabet.length < 2) {
      toast('Atenção', 'Selecione ao menos dois caracteres ou conjuntos válidos.', 'error');
      return;
    }

    const out = pools.slice(0, cfg.length).map(p => p[randomInt(p.length)]);
    while (out.length < cfg.length) out.push(alphabet[randomInt(alphabet.length)]);
    
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }

    state.password = out.join('');
    state.length = cfg.length;
    state.active = true;
    state.expired = false;
    state.hidden = false;
    state.deadline = Date.now() + cfg.seconds * 1000;
    state.durationLong = cfg.long;

    pushHistory(cfg);
    startTimer();
    renderVault();
    toast('Senha criada', `Válida por ${cfg.short}.`);
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = setInterval(tick, 200);
    tick();
  }

  function tick() {
    if (!state.active) return;
    const remaining = Math.max(0, state.deadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const total = Number(els.duration.value) * 1000;
    const ratio = remaining / total;

    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    els.time.textContent = `${m}:${s}`;
    els.ring.style.strokeDashoffset = String(RING_CIRC * (1 - ratio));

    if (remaining <= 0) {
      clearInterval(state.timerId);
      state.active = false;
      state.expired = true;
      renderVault();
      toast('Expirada', 'A senha foi descartada.', 'warn');
    }
  }

  function pushHistory(cfg) {
    state.history.unshift(cfg);
    if (state.history.length > MAX_HISTORY) state.history.pop();
    renderHistory();
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    els.historyCount.textContent = `${state.history.length}/${MAX_HISTORY}`;
    state.history.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="history-chip" data-index="${idx}"><i>••••••</i><span>${entry.length} car. · ${entry.short}</span></button>`;
      els.historyList.append(li);
    });
  }

  // Eventos
  els.form.addEventListener('submit', e => { e.preventDefault(); generate(); });
  els.form.addEventListener('input', syncUI);

  els.sets.forEach(input => {
    input.addEventListener('change', () => {
      if (!els.sets.some(s => s.checked)) input.checked = true;
      syncUI();
    });
  });

  els.presets.forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      els.length.value = p.length;
      ['upper', 'lower', 'digits', 'symbols'].forEach(k => {
        const el = els.sets.find(i => i.value === k);
        if (el) el.checked = p[k];
      });
      els.duration.value = String(p.seconds);
      generate();
    });
  });

  els.toggleBtn.addEventListener('click', () => { state.hidden = !state.hidden; renderVault(); });
  
  els.copyBtn.addEventListener('click', async () => {
    if (!state.active) return;
    await navigator.clipboard.writeText(state.password);
    toast('Copiado!', 'Cole onde precisar.');
  });

  els.emailBtn.addEventListener('click', () => {
    els.emailForm.hidden = !els.emailForm.hidden;
    if (!els.emailForm.hidden) els.emailInput.focus();
  });

  els.emailForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = els.emailInput.value.trim();
    if (!email) return;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Senha temporária')}&body=${encodeURIComponent('Senha: ' + state.password)}`;
    toast('E-mail pronto', 'Verifique seu aplicativo de e-mail.');
  });

  els.historyList.addEventListener('click', e => {
    const btn = e.target.closest('[data-index]');
    if (!btn) return;
    const cfg = state.history[Number(btn.dataset.index)];
    if (!cfg) return;
    els.length.value = cfg.length;
    ['upper', 'lower', 'digits', 'symbols'].forEach(k => {
      const el = els.sets.find(i => i.value === k);
      if (el) el.checked = cfg[k];
    });
    if (cfg.symbolChars) els.symbols.value = cfg.symbolChars;
    els.duration.value = String(cfg.seconds);
    syncUI();
    toast('Restaurado', 'Configurações aplicadas.');
  });

  // Inicialização
  els.ring.style.strokeDasharray = String(RING_CIRC);
  els.ring.style.strokeDashoffset = String(RING_CIRC);
  syncUI();
  renderVault();
  renderHistory();
})();
