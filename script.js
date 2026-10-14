(() => {
  'use strict';
  const $= s => document.querySelector(s),$$ = s => Array.from(document.querySelectorAll(s));
  const CHARS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?' };
  const RING_CIRC = 2 * Math.PI * 64;
  let state = { pwd: '', active: false, timer: null, history: [] };

  const rand = max => {
    const buf = new Uint32Array(1);
    let limit = 0x100000000 - (0x100000000 % max);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  };

  const getConfig = () => ({
    length: Number($('#length').value),
    upper: $('input[value="upper"]').checked,
    lower: $('input[value="lower"]').checked,
    digits: $('input[value="digits"]').checked,
    symbols: $('input[value="symbols"]').checked,
    symbolChars: $('#symbols').value || CHARS.symbols,
    seconds: Number($('#duration').value)
  });

  const generate = () => {
    const cfg = getConfig();
    let pools = [];
    if (cfg.upper) pools.push(Array.from(CHARS.upper));
    if (cfg.lower) pools.push(Array.from(CHARS.lower));
    if (cfg.digits) pools.push(Array.from(CHARS.digits));
    if (cfg.symbols) pools.push(Array.from(cfg.symbolChars));
    
    if (!pools.length) return alert('Selecione ao menos um conjunto!');

    const alphabet = [...new Set(pools.flat())];
    let out = pools.map(p => p[rand(p.length)]);
    while (out.length < cfg.length) out.push(alphabet[rand(alphabet.length)]);
    for (let i = out.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }

    state.pwd = out.join('');
    state.active = true;
    state.deadline = Date.now() + cfg.seconds * 1000;
    
    // Histórico simples
    state.history.unshift(`${cfg.length} car.`);
    if (state.history.length > 5) state.history.pop();
    $('#history-count.textContent') = `${state.history.length}/5`;

    render();
    startTimer(cfg.seconds);
  };

  const render = () => {
    $('#password').textContent = state.active ? state.pwd : 'Gere uma senha.';
    $('#status').textContent = state.active ? 'Em uso' : 'Aguardando';
    $('#toggle-visibility').disabled = !state.active;
    $('#copy-btn').disabled = !state.active;
  };

  const startTimer = (sec) => {
    clearInterval(state.timer);
    const end = Date.now() + sec * 1000;
    state.timer = setInterval(() => {
      const rem = Math.max(0, end - Date.now());
      const s = Math.ceil(rem / 1000);
      const m = String(Math.floor(s / 60)).padStart(2, '0');
      const sc = String(s % 60).padStart(2, '0');
      $('#time').textContent = `${m}:${sc}`;
      $('#ring-progress').style.strokeDashoffset = String(RING_CIRC * (1 - rem / (sec * 1000)));
      if (rem <= 0) {
        clearInterval(state.timer);
        state.active = false;
        render();
      }
    }, 200);
  };

  $('#generator-form').addEventListener('submit', e => { e.preventDefault(); generate(); });
  $('#generator-form').addEventListener('input', () => $('#length-number').textContent = $('#length').value);
  $('#copy-btn').addEventListener('click', () => navigator.clipboard.writeText(state.pwd));
  $('#toggle-visibility').addEventListener('click', () => {
    const p = $('#password');
    p.textContent = p.textContent.includes('•') ? state.pwd : '•'.repeat(state.pwd.length);
  });

  $('#ring-progress').style.strokeDasharray = String(RING_CIRC);
  $('#ring-progress').style.strokeDashoffset = String(RING_CIRC);
  render();
})();
