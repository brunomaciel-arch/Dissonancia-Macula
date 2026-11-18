/* ══════════════════════════════════════════════════════════════
   iniciativa.js — Rastreador de Iniciativa (exclusivo do Mestre)

   · Módulo independente, no mesmo molde da Forja de Ameaças:
     injeta o próprio CSS e o próprio modal, sem tocar nas fichas.
   · Modo campanha: fichas dos jogadores entram LIGADAS (Vida, BM, FA
     e modificador acompanham a ficha ao vivo, somente leitura).
   · Modo manual: tudo é digitado pelo Mestre, sem login nem campanha.
   · Oponentes são sempre editáveis à mão (inclusive as FA).
   · RD (Traje): da ficha nos jogadores ligados; manual nos demais.
     "Dano bruto" desconta a RD e tira só da Vida (nunca da BM).
   · Dado livre: mesma sintaxe da aba Perícias (ex.: 4d6+2).
   · Persistência: localStorage, uma lista por campanha + uma manual.
   ══════════════════════════════════════════════════════════════ */

const KEY = 'dm_iniciativa:';
const FA_N = 5;
const VIDA_MIN = -10;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const d10 = () => 1 + Math.floor(Math.random() * 10);
const uid = () => Math.random().toString(36).slice(2, 9);
const sgn = n => (n >= 0 ? '+' : '') + n;

/* Mesma classificação das rolagens da ficha (dice.js) */
function quality(a, b, total) {
  if (a === 10 && b === 10) return ['✦ Axioma', 'axioma'];
  if (a === 1 && b === 1) return ['✖ Absurdo', 'absurdo'];
  return total % 2 === 0 ? ['~ Fluidez', 'fluidez'] : ['~ Atrito', 'atrito'];
}

/* ── Estado ─────────────────────────────────────────────────── */
let root, TOAST;
let camp = { code: '', name: '', chars: [] };   // alimentado pelo master.js
let scope = 'manual';                           // 'manual' | 'camp'
let st = null;                                  // { round, turnId, list: [...] }

const keyOf = () => KEY + (scope === 'camp' && camp.code ? camp.code : 'manual');
const blank = () => ({ round: 1, turnId: null, list: [], rolls: [] });

function load() {
  try {
    const o = JSON.parse(localStorage.getItem(keyOf()));
    if (o && Array.isArray(o.list)) return { ...blank(), ...o };
  } catch { /* storage indisponível ou corrompido */ }
  return blank();
}
function save() { try { localStorage.setItem(keyOf(), JSON.stringify(st)); } catch { /* ignora */ } }

function mk(over = {}) {
  return {
    id: uid(), kind: 'op', name: 'Oponente', srcId: null, gone: false, out: false,
    vida: 10, vidaMax: 10, bm: 0, bmMax: 0, rd: 0, fa: Array(FA_N).fill(false), mod: 0,
    init: null, dice: null, ...over,
  };
}

/** Atualiza os combatentes ligados com o que veio das fichas. */
function syncLinked() {
  if (scope !== 'camp') return false;
  let changed = false;
  for (const c of st.list) {
    if (!c.srcId) continue;
    const src = camp.chars.find(x => x.id === c.srcId);
    if (!src) { if (!c.gone) { c.gone = true; changed = true; } continue; }
    const next = { name: src.name, vida: src.vida, vidaMax: src.vidaMax, bm: src.bm, bmMax: src.bmMax, rd: src.rd ?? 0, fa: src.fa.slice(0, FA_N), mod: src.mod, gone: false };
    for (const k in next) if (JSON.stringify(c[k]) !== JSON.stringify(next[k])) { c[k] = next[k]; changed = true; }
  }
  return changed;
}

/* ── Ordem e turnos ─────────────────────────────────────────── */
function order() {
  return st.list.map((c, i) => ({ c, i })).sort((A, B) => {
    const an = A.c.init == null, bn = B.c.init == null;
    if (an !== bn) return an ? 1 : -1;                       // sem rolagem vai para o fim
    if (!an && A.c.init !== B.c.init) return B.c.init - A.c.init;
    if (A.c.mod !== B.c.mod) return B.c.mod - A.c.mod;      // empate: maior modificador
    return A.i - B.i;                                       // depois: ordem de entrada
  }).map(x => x.c);
}

function step(dir) {
  const full = order();
  if (!full.some(c => !c.out)) { TOAST?.('Ninguém ativo na ordem de iniciativa.'); return; }
  const cur = full.findIndex(c => c.id === st.turnId);
  const n = full.length;
  let k = cur;
  for (let j = 1; j <= n; j++) {
    k = ((cur < 0 ? (dir > 0 ? -1 : 0) : cur) + dir * j + n * 2) % n;
    if (!full[k].out) break;
  }
  if (cur >= 0) {
    if (dir > 0 && k <= cur) st.round++;
    if (dir < 0 && k >= cur && st.round > 1) st.round--;
  }
  st.turnId = full[k].id;
}

/* ── Rolagem ────────────────────────────────────────────────── */
function roll(c) {
  const a = d10(), b = d10();
  c.dice = [a, b];
  c.init = a + b + c.mod;
}

/* ── Dado livre (mesma sintaxe e limites da aba Perícias) ───── */
function parseExpr(expr) {
  const cleaned = String(expr).replace(/\s/g, '').toLowerCase();
  if (!cleaned) return null;
  const tokens = cleaned.match(/[+-]?[^+-]+/g);
  if (!tokens) return null;
  const dice = []; let bonus = 0;
  for (const token of tokens) {
    const dm = token.match(/^([+-]?)(\d+)d(\d+)$/);
    if (dm) {
      const sign = dm[1] === '-' ? -1 : 1, count = parseInt(dm[2], 10), sides = parseInt(dm[3], 10);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
      dice.push({ count, sides, sign });
    } else {
      const nm = token.match(/^([+-]?\d+)$/);
      if (!nm) return null;
      bonus += parseInt(nm[1], 10);
    }
  }
  return dice.length ? { dice, bonus } : null;
}

function rollExpr(expr) {
  const p = parseExpr(expr);
  if (!p) return null;
  const vals = []; let total = p.bonus;
  for (const { count, sides, sign } of p.dice) {
    for (let i = 0; i < count; i++) { const r = 1 + Math.floor(Math.random() * sides); vals.push(sign * r); total += sign * r; }
  }
  const label = p.dice.map((d, i) => `${d.sign < 0 ? '-' : (i ? '+' : '')}${d.count}d${d.sides}`).join('') + (p.bonus ? (p.bonus > 0 ? `+${p.bonus}` : `${p.bonus}`) : '');
  return { label, vals, bonus: p.bonus, total };
}

function fmtRoll(r) {
  const shown = r.vals.slice(0, 12).map((v, i) => (v < 0 ? `−${-v}` : (i ? `+${v}` : `${v}`))).join(' ');
  return `${shown}${r.vals.length > 12 ? ' ···' : ''}${r.bonus ? ` ${r.bonus > 0 ? '+' : '−'}${Math.abs(r.bonus)}` : ''}`;
}

let errTimer = 0;
function doFree() {
  const inp = $('#if-input'), err = $('#if-err');
  const r = rollExpr(inp.value);
  if (!r) {
    err.textContent = 'Formato inválido. Ex: 4d6+2  /  3d8+1';
    clearTimeout(errTimer); errTimer = setTimeout(() => { err.textContent = ''; }, 3000);
    return false;
  }
  err.textContent = '';
  st.rolls = [{ label: r.label, detail: fmtRoll(r), total: r.total }, ...(st.rolls || [])].slice(0, 10);
  return true;
}

function drawFree() {
  const h = st.rolls || [];
  $('#if-clear').style.display = h.length ? '' : 'none';
  $('#if-res').innerHTML = h.length
    ? `<span class="ini-fres__label">${esc(h[0].label)}</span> <span class="ini-fres__det">${esc(h[0].detail)}</span> <span class="ini-fres__tot">= ${h[0].total}</span>`
    : '<span class="ini-hint">Nenhuma rolagem ainda.</span>';
  $('#if-hist').innerHTML = h.slice(1).map(x => `<span class="ini-hchip" title="${esc(x.detail)}">${esc(x.label)} = <b>${x.total}</b></span>`).join('');
}

/* ── Interface ──────────────────────────────────────────────── */
const CSS = `
.ini{max-width:1180px;width:97vw}.ini .modal__body{max-height:76vh;overflow:auto}
.ini label{font-size:11px;color:var(--text-dim);display:flex;flex-direction:column;gap:3px}
.ini-free{border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:8px 10px;margin-bottom:10px;display:grid;gap:6px}
.ini-free__row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ini-free__row .field-input{width:190px}
.ini-fres__label{color:var(--text-dim);font-size:12px}.ini-fres__det{color:var(--text-mid);font-size:12px}.ini-fres__tot{font-family:var(--font-display);font-size:22px;color:var(--gold);margin-left:4px}
.ini-ferr{color:var(--red);font-size:12px;min-height:14px;margin:0}
.ini-hist{display:flex;flex-wrap:wrap;gap:6px}.ini-hchip{font-size:11px;color:var(--text-dim);border:1px solid var(--border-mid);border-radius:10px;padding:1px 8px}.ini-hchip b{color:var(--text-bright)}
.ini-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.ini-round{font-family:var(--font-display);font-size:20px;color:var(--gold);letter-spacing:.06em;margin:0 8px;font-variant-numeric:tabular-nums}
.ini-sp{flex:1}
.ini-add{border:1px dashed var(--border-mid);border-radius:var(--radius-md);padding:8px 10px;margin-bottom:12px;display:grid;gap:8px}
.ini-form{display:grid;grid-template-columns:110px minmax(120px,2fr) repeat(5,minmax(64px,1fr)) auto;gap:8px;align-items:end}
.ini-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--text-dim)}
.ini-hint{font-size:12px;color:var(--text-dim)}
.ini-row{display:grid;grid-template-columns:22px 150px minmax(130px,1.3fr) minmax(150px,1fr) minmax(150px,1fr) 62px 124px auto;gap:10px;align-items:center;
  padding:8px 10px;margin:6px 0;border:1px solid var(--border-mid);border-left:4px solid var(--magenta);border-radius:var(--radius-md);background:var(--bg-panel)}
.ini-row.pj{border-left-color:var(--cyan)}
.ini-row.turn{box-shadow:0 0 0 1px var(--gold),0 0 14px var(--gold-glow);background:var(--bg-card)}
.ini-row.out{opacity:.45}
.ini-row.gone .ini-who small:last-child{color:var(--red)}
.ini-mark{color:var(--gold);font-size:16px;text-align:center}
.ini-roll{display:flex;gap:6px;align-items:center}
.ini-roll .field-input{width:62px;font-size:18px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
.ini-dice{display:block;font-size:10.5px;color:var(--text-dim);margin-top:2px;white-space:nowrap}
.ini-q{font-weight:700}.ini-q.axioma{color:var(--gold)}.ini-q.absurdo{color:var(--red)}.ini-q.fluidez{color:var(--cyan)}.ini-q.atrito{color:var(--text-mid)}
.ini-who{display:flex;flex-direction:column;gap:3px;min-width:0}
.ini-who .field-input{font-weight:700;color:var(--text-bright)}
.ini-who small{font-size:10.5px;color:var(--text-dim);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ini-mod{width:46px!important;padding:1px 4px!important;font-size:11px!important}
.ini-stat{display:flex;flex-direction:column;gap:3px}
.ini-stat__top{display:flex;gap:4px;align-items:center;font-size:11px;color:var(--text-dim)}
.ini-stat__top b{width:26px;color:var(--text-mid)}
.ini-num{width:48px!important;padding:2px 4px!important;text-align:center;font-variant-numeric:tabular-nums}
.ini-delta{width:52px!important;padding:2px 4px!important;text-align:center;margin-left:auto}
.ini-stat .agent-card__bar-track{width:100%}
.ini-neg{color:var(--red)!important}
.ini-dmg{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ini-dmg .field-input{width:92px!important;padding:2px 6px!important;font-size:12px}
.ini-dmgnote{font-size:10.5px;color:var(--text-dim)}
.ini-rd{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--text-dim)}
.ini-rd .ini-num{width:52px!important}
.ini-fa{display:flex;gap:4px}
.ini-hex{width:20px;height:22px;border:0;padding:0;cursor:pointer;background:var(--border-mid);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.ini-hex.on{background:var(--cyan);box-shadow:0 0 6px var(--cyan-glow)}
.ini-hex:disabled{cursor:default}
.ini-ctl{display:flex;gap:6px;justify-content:flex-end}
.ini-empty{padding:26px;text-align:center;color:var(--text-dim);border:1px dashed var(--border-mid);border-radius:var(--radius-md)}
@media(max-width:900px){.ini-form{grid-template-columns:repeat(3,1fr)}.ini-row{grid-template-columns:22px 1fr 1fr}.ini-row>*{min-width:0}}
`;

const $ = s => root.querySelector(s);

function mount() {
  if (root) return;
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  root = document.createElement('div'); root.className = 'modal-backdrop'; root.hidden = true;
  root.innerHTML = `<div class="modal ini"><div class="modal__header"><h2 class="modal__title">⏱ Rastreador de Iniciativa</h2><button class="modal__close" data-x>✕</button></div>
  <div class="modal__body">
    <div class="ini-bar" id="ini-bar"></div>
    <div class="ini-free">
      <div class="ini-free__row"><label for="if-input">Dado livre</label>
        <input class="field-input" id="if-input" type="text" placeholder="ex: 4d6+2  /  3d8+1" spellcheck="false">
        <button class="btn btn--primary btn--sm" data-act="free">Rolar</button>
        <button class="btn btn--ghost btn--sm" data-act="free-clear" id="if-clear" title="Apaga o histórico de rolagens do dado livre">🗑 Limpar histórico</button>
        <span id="if-res"></span></div>
      <p class="ini-ferr" id="if-err"></p>
      <div class="ini-hist" id="if-hist"></div>
    </div>
    <div class="ini-add" id="ini-add"></div>
    <div id="ini-list"></div>
  </div></div>`;
  document.body.append(root);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    if (e.target.id === 'if-input') { if (doFree()) { save(); drawFree(); } return; }
    e.target.blur();
  });
}

function render() {
  drawBar(); drawFree(); drawAdd(); drawList();
}

function drawBar() {
  const opts = `<option value="manual"${scope === 'manual' ? ' selected' : ''}>Lista manual (sem campanha)</option>` +
    (camp.code ? `<option value="camp"${scope === 'camp' ? ' selected' : ''}>Campanha: ${esc(camp.name || camp.code)}</option>` : '');
  $('#ini-bar').innerHTML = `<select class="field-input field-select" id="ini-scope" style="width:auto">${opts}</select>
    <button class="btn btn--ghost btn--sm" data-act="prev">◀ Anterior</button>
    <span class="ini-round">RODADA ${st.round}</span>
    <button class="btn btn--primary btn--sm" data-act="next">Próximo ▶</button>
    <span class="ini-sp"></span>
    <button class="btn btn--ghost btn--sm" data-act="roll-pend" title="Rola só quem ainda não tem iniciativa">🎲 Rolar pendentes</button>
    <button class="btn btn--ghost btn--sm" data-act="roll-all" title="Rola todos de novo, sobrescrevendo valores">🎲 Rolar todos</button>
    <button class="btn btn--ghost btn--sm" data-act="reset" title="Rodada 1, apaga as iniciativas; mantém os combatentes">↺ Reiniciar combate</button>
    <button class="btn btn--danger btn--sm" data-act="clear">Limpar lista</button>`;
}

function drawAdd() {
  const keep = {};
  ['kind', 'name', 'vida', 'bm', 'rd', 'mod', 'qty'].forEach(k => { const el = $('#ia-' + k); if (el) keep[k] = el.value; });
  const inList = new Set(st.list.map(c => c.srcId).filter(Boolean));
  const avail = scope === 'camp' ? camp.chars.filter(c => !inList.has(c.id)) : [];
  let chips;
  if (scope !== 'camp') chips = `<div class="ini-hint">Modo manual. Para importar as fichas dos jogadores, escolha uma campanha no Modo Mestre e troque a lista acima.</div>`;
  else if (!camp.chars.length) chips = `<div class="ini-hint">Nenhuma ficha nesta campanha ainda.</div>`;
  else chips = `<div class="ini-chips">Fichas da campanha:
      ${avail.map(c => `<button class="btn btn--ghost btn--sm" data-act="add-pj" data-src="${esc(c.id)}">+ ${esc(c.name)}</button>`).join('') || '<span>todas já estão na lista</span>'}
      ${avail.length > 1 ? '<button class="btn btn--primary btn--sm" data-act="add-all">+ Todas</button>' : ''}</div>`;
  $('#ini-add').innerHTML = `${chips}
    <div class="ini-form">
      <label>Tipo<select class="field-input field-select" id="ia-kind"><option value="op">Oponente</option><option value="pj">Jogador (manual)</option></select></label>
      <label>Nome<input class="field-input" id="ia-name" placeholder="Corrompido"></label>
      <label>Vida<input class="field-input" id="ia-vida" type="number" value="10"></label>
      <label>Barreira<input class="field-input" id="ia-bm" type="number" value="0"></label>
      <label>RD<input class="field-input" id="ia-rd" type="number" min="0" value="0"></label>
      <label>Mod. inic.<input class="field-input" id="ia-mod" type="number" value="0"></label>
      <label>Qtd.<input class="field-input" id="ia-qty" type="number" min="1" max="20" value="1"></label>
      <button class="btn btn--primary btn--sm" data-act="add-man">Adicionar</button>
    </div>`;
  for (const k in keep) $('#ia-' + k).value = keep[k];
}

function statBlock(c, f, label, ro) {
  const cur = c[f], max = c[f + 'Max'];
  const pct = max > 0 ? clamp(cur / max * 100, 0, 100) : 0;
  const fill = f === 'vida' ? 'green' : 'cyan';
  const flag = (f === 'vida' && cur <= 0) ? ' ini-neg' : '';
  return `<div class="ini-stat"><div class="ini-stat__top"><b>${label}</b>
      <input class="field-input ini-num${flag}" type="number" data-id="${c.id}" data-f="${f}" value="${cur}"${ro ? ' readonly' : ''}>/
      <input class="field-input ini-num" type="number" data-id="${c.id}" data-f="${f}Max" value="${max}"${ro ? ' readonly' : ''}>
      ${ro ? '' : `<input class="field-input ini-delta" data-id="${c.id}" data-f="${f}Delta" placeholder="±" title="Digite -5 para dano ou +3 para cura e pressione Enter">`}</div>
    <div class="agent-card__bar-track"><div class="agent-card__bar-fill agent-card__bar-fill--${fill}" data-bar="${c.id}:${f}" style="width:${pct}%"></div></div>${f === 'vida' ? dmgBlock(c, ro) : ''}</div>`;
}

function dmgBlock(c, ro) {
  const tip = ro ? 'Calcula o dano líquido (dano − RD). A ficha do jogador não é alterada.' : 'Dano bruto: subtrai a RD e tira o resultado só da Vida (a BM não é afetada). Enter para aplicar.';
  return `<div class="ini-dmg"><input class="field-input" type="number" min="1" data-id="${c.id}" data-f="dmg" placeholder="${ro ? 'calcular dano' : 'aplicar dano'}" title="${tip}">${c.note ? `<span class="ini-dmgnote">${esc(c.note)}</span>` : ''}</div>`;
}

function drawList() {
  const full = order();
  if (!full.length) { $('#ini-list').innerHTML = `<div class="ini-empty">Nenhum combatente ainda. Adicione jogadores e oponentes acima.</div>`; return; }
  $('#ini-list').innerHTML = full.map(c => {
    const ro = !!c.srcId;              // ligado à ficha: somente leitura
    const q = c.dice ? quality(c.dice[0], c.dice[1], c.init ?? 0) : null;
    const hex = c.fa.map((on, i) => `<button class="ini-hex${on ? ' on' : ''}" data-act="fa" data-id="${c.id}" data-i="${i}"${ro ? ' disabled' : ''} title="Fonte de Ação ${i + 1}"></button>`).join('');
    return `<div class="ini-row ${c.kind}${c.id === st.turnId ? ' turn' : ''}${c.out ? ' out' : ''}${c.gone ? ' gone' : ''}" data-row="${c.id}">
      <div class="ini-mark">${c.id === st.turnId ? '▶' : ''}</div>
      <div><div class="ini-roll"><input class="field-input" type="number" data-id="${c.id}" data-f="init" value="${c.init ?? ''}" placeholder="—" title="Iniciativa (digite para definir à mão)">
        <button class="btn btn--ghost btn--sm" data-act="roll" data-id="${c.id}" title="Rolar 2d10 + modificador">🎲</button></div>
        <span class="ini-dice">${c.dice ? `${c.dice[0]}+${c.dice[1]} ${sgn(c.mod)} · <span class="ini-q ${q[1]}">${q[0]}</span>` : `2d10 ${sgn(c.mod)}`}</span></div>
      <div class="ini-who"><input class="field-input" data-id="${c.id}" data-f="name" value="${esc(c.name)}"${ro ? ' readonly' : ''}>
        <small>${c.kind === 'pj' ? 'JOGADOR' : 'OPONENTE'} · mod ${ro ? sgn(c.mod) : `<input class="field-input ini-mod" type="number" data-id="${c.id}" data-f="mod" value="${c.mod}">`}</small>
        ${ro ? `<small>${c.gone ? 'ficha fora da campanha (última leitura)' : 'ficha ao vivo'}</small>` : ''}</div>
      ${statBlock(c, 'vida', 'VID', ro)}${statBlock(c, 'bm', 'BM', ro)}
      <div class="ini-rd"><span title="Redução de Dano (Traje)">RD</span><input class="field-input ini-num" type="number" min="0" data-id="${c.id}" data-f="rd" value="${c.rd ?? 0}"${ro ? ' readonly' : ''}></div>
      <div class="ini-fa">${hex}</div>
      <div class="ini-ctl"><button class="btn btn--ghost btn--sm" data-act="out" data-id="${c.id}" title="Fora de combate (pula a vez)">${c.out ? '↩' : '☠'}</button>
        <button class="btn btn--ghost btn--sm" data-act="del" data-id="${c.id}" title="Remover">✕</button></div>
    </div>`;
  }).join('');
}

/* ── Ações ──────────────────────────────────────────────────── */
const get = id => st.list.find(c => c.id === id);

function addMany(base, qty) {
  for (let i = 1; i <= qty; i++) {
    const c = mk({ ...base });
    if (qty > 1) c.name = `${base.name} ${i}`;
    st.list.push(c);
  }
}

function onClick(e) {
  if (e.target === root || e.target.closest('[data-x]')) { root.hidden = true; return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, c = b.dataset.id ? get(b.dataset.id) : null;
  switch (act) {
    case 'free': if (!doFree()) return; break;
    case 'free-clear': st.rolls = []; break;
    case 'next': step(1); break;
    case 'prev': step(-1); break;
    case 'roll': if (c) roll(c); break;
    case 'roll-pend': st.list.forEach(x => { if (!x.out && x.init == null) roll(x); }); break;
    case 'roll-all': st.list.forEach(x => { if (!x.out) roll(x); }); break;
    case 'reset':
      if (!confirm('Reiniciar o combate? A rodada volta a 1 e as iniciativas são apagadas.')) return;
      st.round = 1; st.turnId = null; st.list.forEach(x => { x.init = null; x.dice = null; }); break;
    case 'clear':
      if (!st.list.length || !confirm('Remover todos os combatentes desta lista?')) return;
      st = { ...blank(), rolls: st.rolls || [] }; break;
    case 'out': if (c) { c.out = !c.out; if (c.out && st.turnId === c.id) step(1); } break;
    case 'del':
      if (!c) return;
      if (st.turnId === c.id) { c.out = true; step(1); if (st.turnId === c.id) st.turnId = null; }
      st.list = st.list.filter(x => x !== c); break;
    case 'fa':
      if (!c || c.srcId) return;
      { const i = int(b.dataset.i); c.fa = c.fa.map((_, k) => (c.fa[i] ? k < i : k <= i)); } break;
    case 'add-pj': {
      const s = camp.chars.find(x => x.id === b.dataset.src); if (!s) return;
      st.list.push(mk({ kind: 'pj', srcId: s.id, name: s.name })); syncLinked(); break;
    }
    case 'add-all': {
      const have = new Set(st.list.map(x => x.srcId));
      camp.chars.filter(x => !have.has(x.id)).forEach(s => st.list.push(mk({ kind: 'pj', srcId: s.id, name: s.name })));
      syncLinked(); break;
    }
    case 'add-man': {
      const v = id => $('#ia-' + id).value;
      const vida = Math.max(1, int(v('vida'), 10)), bm = Math.max(0, int(v('bm'), 0));
      const base = { kind: v('kind'), name: (v('name') || '').trim() || (v('kind') === 'pj' ? 'Jogador' : 'Oponente'), vida, vidaMax: vida, bm, bmMax: bm, rd: Math.max(0, int(v('rd'), 0)), mod: int(v('mod'), 0) };
      addMany(base, clamp(int(v('qty'), 1), 1, 20)); break;
    }
    default: return;
  }
  save(); render();
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'ini-scope') { save(); scope = t.value; st = load(); syncLinked(); render(); return; }
  const c = t.dataset.id ? get(t.dataset.id) : null, f = t.dataset.f;
  if (!c || !f) return;
  if (c.srcId && f !== 'init' && f !== 'dmg') return;  // ficha ligada: só iniciativa e a calculadora de dano

  if (f === 'dmg') {                                 // dano bruto → desconta RD → só Vida
    const bruto = int(t.value, 0); t.value = '';
    if (bruto < 1) return;
    const rd = Math.max(0, c.rd ?? 0), liq = Math.max(0, bruto - rd);
    if (c.srcId) c.note = `${bruto} − RD ${rd} = ${liq} de dano líquido (aplique na ficha do jogador)`;
    else {
      const antes = c.vida; c.vida = applyStat('vida', c.vida - liq, c.vidaMax);
      c.note = liq ? `${bruto} − RD ${rd} = ${liq} na Vida (${antes}→${c.vida})` : `${bruto} − RD ${rd}: a RD absorveu tudo`;
    }
    save(); render(); return;
  }

  if (f.endsWith('Delta')) {                         // ±valor em Vida/BM
    const base = f.slice(0, -5), d = int(t.value, 0); t.value = '';
    if (!d) return;
    c[base] = applyStat(base, c[base] + d, c[base + 'Max']);
  } else if (f === 'name') c.name = t.value.trim() || c.name;
  else if (f === 'init') { c.init = t.value === '' ? null : int(t.value); c.dice = null; }
  else if (f === 'mod') c.mod = int(t.value, 0);
  else if (f === 'rd') c.rd = Math.max(0, int(t.value, c.rd ?? 0));
  else if (f === 'vida' || f === 'bm') c[f] = applyStat(f, int(t.value, c[f]), c[f + 'Max']);
  else if (f === 'vidaMax' || f === 'bmMax') {
    const base = f.slice(0, -3); c[f] = Math.max(0, int(t.value, c[f]));
    c[base] = applyStat(base, c[base], c[f]);
  }
  save(); render();
}

function applyStat(f, v, max) { return f === 'vida' ? clamp(v, VIDA_MIN, max) : clamp(v, 0, max); }

/* ── API pública ────────────────────────────────────────────── */

/** O master.js chama isto sempre que a campanha ou as fichas mudam.
 *  @param {{code:string,name:string,chars:Array<{id,name,vida,vidaMax,bm,bmMax,fa:boolean[],mod:number}>}} data */
export function feedCampaign(data) {
  const trocou = data.code !== camp.code;
  camp = { code: data.code || '', name: data.name || '', chars: data.chars || [] };
  if (!root || root.hidden) return;                  // modal fechado: sincroniza ao abrir
  if (trocou) { save(); scope = camp.code ? 'camp' : 'manual'; st = load(); }
  if (syncLinked()) save();
  render();
}

/** Abre o Rastreador de Iniciativa. @param {{toast?:Function}} opts */
export function openIniciativa(opts = {}) {
  mount();
  TOAST = opts.toast;
  scope = camp.code ? 'camp' : 'manual';
  st = load();
  if (syncLinked()) save();
  render();
  root.hidden = false;
}
