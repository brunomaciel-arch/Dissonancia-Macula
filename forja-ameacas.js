/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — forja-ameacas.js
   Forja de Ameaças (Modo Mestre). Entradas: nº de PJs, nível do grupo,
   dificuldade, quantidade e tipo. Sorteia fichas individuais, com números
   aleatórios limitados aos valores de cada patente (Incômodo a Sublime).
   API: openForjaAmeacas({ toast })   ·   planEncounter(entrada, rnd)
   Persistência própria (dm_forja_ameacas); não toca nas fichas.
   ══════════════════════════════════════════════════════ */

const KEY = 'dm_forja_ameacas';
const T = ['Incômodo', 'Perigo', 'Formidável', 'Imponente', 'Sublime'];
const PA = [1, 2, 4, 6, 10], MU = [1.25, 2, 3, 4], FXA = [2.3, 1.5, 1, .65, .4, .25];
const DIFF = ['Fácil', 'Normal', 'Difícil', 'Mortal'];
const fx = d => d <= -3 ? 3.5 : d >= 4 ? .15 : FXA[d + 2];
const eff = (t, b) => PA[t] * fx(b - (t + 1));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = n => String(+n.toFixed(1)).replace('.', ',');
const ri = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));

/* P(acerto) exata de 2d10+Δ contra 2d10 (empate do defensor; 10-10 acerta, 1-1 falha), Δ de −14 a +20 */
const PH = [.003, .006, .011, .019, .03, .046, .067, .095, .13, .172, .22, .275, .335, .399, .466, .534, .601, .665, .725, .78, .828, .87, .905, .933, .954, .97, .981, .989, .994, .997, .999, 1, 1, 1, 1];
const ph = d => PH[Math.max(-14, Math.min(20, d)) + 14];
/* PJ de Referência por faixa (= patente): Acerto, Reação, RD do Traje, Físico */
const PJR = [null, { atk: 5, R: 3, rd: 0, fis: 5 }, { atk: 7, R: 5, rd: 0, fis: 7 }, { atk: 9, R: 6, rd: 4, fis: 9 }, { atk: 11, R: 7, rd: 4, fis: 11 }, { atk: 12, R: 8, rd: 8, fis: 12 }];

/* Criaturas Corrompidas e Animais/Humanos: bloco Fúria / Carne / Instinto */
const CB = [[3, 2, 2], [5, 5, 4], [8, 9, 6], [9, 9, 8], [12, 12, 10]], FV = [5, 6, 10, 12, 15];
const CD = [[[1, 6]], [[1, 8]], [[2, 6]], [[2, 6], [1, 4]], [[2, 6], [2, 4]]];   // dados de ameaça [[n,lados],...]
const CF = ['2 / 1', '2 / 1', '3 / 1', '4 / 2', '4 (+1) / 3'], AM = [1, 1, 1, 2, 3], ND = [5, 10, 15, 20, 25];
/* Adversários (ficha de PJ): atributos Fís/Ins/Raz/Pre/Prs base, Vida, RD, dados, A. Maiores */
const AB = [
  { at: [3, 2, 1, 2, 1], v: 10, rd: 0, d: [[1, 8]], fa: '2 / 1', pd: 0, am: 1 },
  { at: [5, 3, 2, 2, 1], v: 12, rd: 0, d: [[2, 6], [1, 4]], fa: '2 / 1', pd: 3, am: 1 },
  { at: [9, 4, 3, 3, 2], v: 20, rd: 4, d: [[2, 6], [1, 4]], fa: '3 / 1', pd: 11, am: 1 },
  { at: [12, 8, 5, 5, 2], v: 30, rd: 8, d: [[2, 6], [1, 4]], fa: '4 / 1', pd: 28, am: 1 },
  { at: [12, 10, 8, 8, 3], v: 40, rd: 8, d: [[4, 6], [1, 4]], fa: '4 (+1) / 3', pd: 50, am: 3 },
];
const AN = ['Capanga', 'Combatente treinado', 'Especialista', 'Veterano', 'Catástrofe viva'];
const KL = { c: 'Criatura Corrompida', an: 'Animal', hu: 'Humano', a: 'Adversário' };
const dstr = (d, flat) => d.map(x => x[0] + 'd' + x[1]).join('+') + '+' + flat;
const dper = d => d.reduce((s, x) => s + x[0] * (x[1] + 1) / 2, 0);

/* Índice de Ameaça analítico (dano × resistência contra o PJ de referência da faixa da patente) */
function ia(t, u) {
  const p = PJR[t + 1], pd = 7 + p.fis + 1 + 2.5;
  return u.am * ph(u.acc - p.R) * Math.max(1, u.avg - p.rd) * (u.vida + u.bm) / (ph(p.atk - u.R) * Math.max(1, pd - u.rd));
}
const unitC = (t, [F, C, I]) => ({ am: AM[t], acc: F, R: I, rd: C >> 1, vida: C * FV[t], bm: 0, avg: dper(CD[t]) + F });
const unitA = (t, [F, I, Rz, P]) => ({ am: AB[t].am, acc: F, R: (P + F) >> 1, rd: AB[t].rd, vida: AB[t].v, bm: t ? (Rz + I) * 5 : 0, avg: dper(AB[t].d) + F + 1 });

/** Sorteia atributos por transferências unitárias dentro de limites, aceitando só fichas
 *  com Índice de Ameaça a ±10% do valor-base da patente (validado em simulação). */
function roll(t, kind, rnd) {
  const isA = kind === 'a', base = isA ? AB[t].at.slice() : CB[t].slice();
  const mk = isA ? unitA : unitC, r0 = ia(t, mk(t, base));
  let lo = base.map(x => Math.max(1, x - (t === 0 ? 1 : 2))), hi = base.map(x => x + (t === 0 ? 1 : 2));
  if (isA) { hi = hi.map(x => Math.min(12, x)); hi[0] = Math.min(12, base[0] + 1); lo[0] = Math.max(1, base[0] - 1); } else lo[2] = Math.max(1, base[2] - 1);
  if (isA && t === 0) return { at: base, r: 1 };             // Capanga: ficha fixa
  let best = { at: base, r: 1 };
  for (let tries = 0; tries < 60; tries++) {
    const a = base.slice();
    for (let k = 0; k < 3; k++) { const i = ri(0, a.length - 1, rnd), j = ri(0, a.length - 1, rnd); if (i !== j && a[i] < hi[i] && a[j] > lo[j]) { a[i]++; a[j]--; } }
    const r = ia(t, mk(t, a)) / r0;
    if (Math.abs(r - 1) <= .1) { best = { at: a, r }; if (a.some((x, i) => x !== base[i])) break; }
  }
  return best;
}

function sheet(kind, t, band, rnd) {
  const { at, r } = roll(t, kind, rnd), f = fx(band - (t + 1));
  let rows, name = `${t === 0 && kind === 'a' ? AN[0] : KL[kind]} · ${T[t]}`;
  if (kind === 'a') {
    const [F, I, Rz, P, Ps] = at, bm = t ? (Rz + I) * 5 : 0, d = AB[t].d;
    rows = [['Vida', AB[t].v], ['Barreira', bm || '0 (sem Catalisador)'], ['RD (Traje)', AB[t].rd], ['Acerto', '+' + F], ['Dano', `${dstr(d, F + 1)} (${f1(dper(d) + F + 1)})`], ['Reação', '+' + ((P + F) >> 1)], ['FA / A. Maiores', AB[t].fa], ['ND Execução', ND[t]], ['PD da ficha', AB[t].pd], ['Fís/Ins/Raz/Pre/Prs', at.join('/')], ['PA', PA[t]]];
    if (t > 0) name = `${AN[t]} · ${T[t]}`;
  } else {
    const [F, C, I] = at;
    rows = [['Vida', C * FV[t]], ['RD (sem Barreira)', C >> 1], ['Acerto', '+' + F], ['Dano', `${dstr(CD[t], F)} (${f1(dper(CD[t]) + F)})`], ['Reação', '+' + I], ['Iniciativa', '2d10+' + I], ['FA / A. Maiores', CF[t]], ['ND Execução', ND[t]], ['Fúria/Carne/Instinto', at.join('/')]];
    if (kind !== 'c') rows.push(['Anticorrupção', 'não se aplica']);
    rows.push(['PA', PA[t]]);
  }
  return { f, r, name, rows, t, kind, e: eff(t, band) * Math.sqrt(r) };
}

/** Distribui Q ameaças em até dois patamares vizinhos para fechar o orçamento de PA. */
function mix(Q, B, band) {
  let t0 = 0, bd = 1e9;
  for (let t = 0; t < 5; t++) { const d = Math.abs(Q * eff(t, band) - B); if (d < bd) { bd = d; t0 = t; } }
  const c = [0, 0, 0, 0, 0]; c[t0] = Q;
  const tot = () => c.reduce((s, n, t) => s + n * eff(t, band), 0);
  for (let it = 0; it < 40; it++) {
    let best = null, cur = Math.abs(tot() - B);
    for (let t = 0; t < 5; t++) if (c[t]) for (const u of [-1, 1]) {
      const v = t + u; if (v < 0 || v > 4) continue;
      c[t]--; c[v]++; const d = Math.abs(tot() - B); c[t]++; c[v]--;
      if (d < cur - 1e-9 && (!best || d < best.d)) best = { t, v, d };
    }
    if (!best) break; c[best.t]--; c[best.v]++;
  }
  return c;
}

/** Entrada: { n, band, diff, qty, kind:'c'|'an'|'hu'|'a', manual?:{c0..,h0..,a0..} } */
export function planEncounter(s, rnd = Math.random) {
  const N = Math.max(1, Math.min(8, +s.n || 4)), band = Math.max(1, Math.min(5, +s.band || 3)), budget = Math.max(1, Math.round(MU[+s.diff] * N));
  const list = [];
  if (s.manual) { for (let t = 0; t < 5; t++) for (const k of ['c', 'h', 'a']) for (let i = 0; i < Math.min(30, +s.manual[k + t] || 0); i++) list.push([t, k === 'h' ? (rnd() < .5 ? 'an' : 'hu') : k]); }
  else { const Q = Math.max(1, Math.min(20, +s.qty || 1)), c = mix(Q, budget, band); c.forEach((n, t) => { for (let i = 0; i < n; i++) list.push([t, s.kind]); }); }
  const units = list.map(([t, k]) => sheet(k, t, band, rnd));
  const sum = units.reduce((a, u) => a + u.e, 0), rew = units.reduce((a, u) => a + PA[u.t] * Math.min(1, u.f), 0);
  const dr = Math.min(120, 6.5 * (sum / N) ** 2), label = dr < 5 ? 'Trivial' : dr < 15 ? 'Fácil' : dr < 35 ? 'Normal' : dr < 65 ? 'Difícil' : 'Mortal';
  const warn = [];
  if (!s.manual && units.length && Math.abs(sum - budget) / budget > .25) {
    const m = Math.max(1, Math.round(budget / eff(Math.min(4, band - 1), band)));
    warn.push(`Com ${units.length} ameaça(s) não é possível chegar a "${DIFF[+s.diff]}" para este grupo. Tente cerca de ${m} da patente ${T[Math.min(4, band - 1)]}.`);
  }
  for (const t of new Set(units.map(u => u.t))) {
    const d = band - (t + 1);
    if (d <= -2) warn.push(`${T[t]} está ${-d} faixas acima do grupo: perigo alto.`);
    if (d >= 3) warn.push(`${T[t]} é trivial para este grupo e rende pouco PA.`);
  }
  return { N, band, budget, units, sum, rew, dr, label, warn };
}

const CSS = `
.fa{max-width:1040px;width:96vw}.fa .modal__body{max-height:72vh;overflow:auto}
.fa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.fa label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-dim)}
.fa details{margin-top:12px;padding:8px;border:1px dashed var(--border-mid);border-radius:6px}.fa summary{cursor:pointer;color:var(--text-mid);font-size:13px}
.fa-sum{display:flex;flex-wrap:wrap;gap:22px;align-items:baseline;margin:16px 0 8px}
.fa-big{font-size:26px;font-weight:700;color:var(--text-bright);font-variant-numeric:tabular-nums}
.fa-k{font-size:12px;color:var(--text-dim)}
.fa-tag{padding:2px 10px;border-radius:4px;font-weight:700;color:#050a14}.fa-tag.l1{background:var(--green)}.fa-tag.l2{background:var(--gold)}.fa-tag.l3{background:var(--red)}
.fa-w{border-left:3px solid var(--gold);padding:5px 10px;margin:6px 0;background:var(--bg-panel);color:var(--text-mid);font-size:13px}
.fa-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin-top:8px}
.fa-card{border:1px solid var(--border-mid);border-left:5px solid var(--magenta);border-radius:8px;padding:9px 11px;background:var(--bg-panel)}
.fa-card.a{border-left-color:var(--cyan)}.fa-card.an,.fa-card.hu{border-left-color:var(--gold)}
.fa-card h3{margin:0;font-size:14px;color:var(--text-bright)}
.fa-st{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:5px 10px;margin-top:6px}
.fa-st div{font-size:11px;color:var(--text-dim)}.fa-st b{display:block;font-size:13px;color:var(--text-bright);font-variant-numeric:tabular-nums}
`;
const DEF = { n: 4, band: 3, diff: 1, qty: 4, kind: 'c' };
const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage */ } };
let root, TOAST, last = '';
const $ = id => root.querySelector('#fa-' + id);
const opt = (a, sel) => a.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');

function mount() {
  if (root) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  root = document.createElement('div'); root.className = 'modal-backdrop'; root.hidden = true;
  root.innerHTML = `<div class="modal fa"><div class="modal__header"><h2 class="modal__title">☠ Forja de Ameaças</h2><button class="modal__close" data-x>✕</button></div>
  <div class="modal__body"><div class="fa-grid" id="fa-ctl"></div>
  <details><summary>Avançado: informar a lista de inimigos manualmente</summary><div class="fa-k" style="margin:6px 0">Quantidade por patente. As fichas também são sorteadas e a dificuldade real é calculada.</div><div class="fa-grid" id="fa-mg"></div><button class="btn btn--ghost btn--sm" id="fa-gm" style="margin-top:8px">Gerar da lista</button></details>
  <div id="fa-out" aria-live="polite"></div></div>
  <div class="modal__footer"><button class="btn btn--primary btn--sm" id="fa-gen">Gerar ameaças</button><button class="btn btn--ghost btn--sm" id="fa-cp">Copiar texto</button></div></div>`;
  document.body.append(root);
  root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-x]')) root.hidden = true; });
  $('gen').addEventListener('click', () => run(false)); $('gm').addEventListener('click', () => run(true)); $('cp').addEventListener('click', copy);
}

function draw(s) {
  const inp = (id, v, a) => `<input class="field-input" id="fa-${id}" type="number" ${a} value="${esc(v)}">`;
  const sel = (id, o, v) => `<select class="field-input field-select" id="fa-${id}">${opt(o, v)}</select>`;
  $('ctl').innerHTML = `<label>Número de PJs${inp('n', s.n, 'min="1" max="8"')}</label>
  <label>Nível do grupo${sel('band', [[1, 'PD 0–3'], [2, 'PD 4–8'], [3, 'PD 9–15'], [4, 'PD 16–23'], [5, 'PD 24–30']], s.band)}</label>
  <label>Dificuldade${sel('diff', DIFF.map((d, i) => [i, d]), s.diff)}</label>
  <label>Quantidade de ameaças${inp('qty', s.qty, 'min="1" max="20"')}</label>
  <label>Tipo${sel('kind', [['c', 'Criatura Corrompida'], ['an', 'Animal'], ['hu', 'Humano'], ['a', 'Adversário']], s.kind)}</label>`;
  $('mg').innerHTML = ['c', 'h', 'a'].map(k => T.map((n, t) => `<label>${k === 'a' ? 'Adversário' : k === 'h' ? 'Animal/Humano' : 'Criatura'} · ${n}${inp('m' + k + t, 0, 'min="0" max="30"')}</label>`).join('')).join('');
}
const read = () => ({ n: +$('n').value || 4, band: +$('band').value, diff: +$('diff').value, qty: +$('qty').value || 4, kind: $('kind').value });

function run(manual) {
  const s = read(); save(s);
  if (manual) { s.manual = {}; ['c', 'h', 'a'].forEach(k => T.forEach((_, t) => { s.manual[k + t] = +$('m' + k + t).value || 0; })); }
  const r = planEncounter(s);
  if (!r.units.length) { last = ''; $('out').innerHTML = '<div class="fa-w">Informe ao menos um inimigo na lista.</div>'; return; }
  const lv = r.dr < 35 ? 'l1' : r.dr < 65 ? 'l2' : 'l3';
  last = `PJs ${r.N} · faixa ${r.band} · orçamento ${r.budget} PA · usado ${f1(r.sum)} PA · dreno ${Math.round(r.dr)}% (${r.label}) · PA de recompensa ${f1(r.rew)}\n`;
  let h = `<div class="fa-sum"><div><div class="fa-big">${f1(r.sum)} / ${r.budget}</div><div class="fa-k">PA usados / orçamento</div></div><div><div class="fa-big">${Math.round(r.dr)}%</div><div class="fa-k">dreno estimado da reserva do grupo</div></div><div><span class="fa-tag ${lv}">${r.label}</span><div class="fa-k">dificuldade real</div></div><div><div class="fa-big">${f1(r.rew)}</div><div class="fa-k">PA de recompensa</div></div></div>`;
  h += r.warn.map(w => `<div class="fa-w">${esc(w)}</div>`).join('') + '<div class="fa-list">';
  r.units.forEach((u, i) => {
    h += `<div class="fa-card ${u.kind}"><h3>#${i + 1} ${esc(u.name)}</h3><div class="fa-k">Poder ${Math.round(u.r * 100)}% da patente · PA ${u.e.toFixed(2).replace('.', ',')}</div><div class="fa-st">${u.rows.map(w => `<div>${esc(w[0])}<b>${esc(w[1])}</b></div>`).join('')}</div></div>`;
    last += `#${i + 1} ${u.name}: ${u.rows.map(w => w[0] + ' ' + w[1]).join(', ')}\n`;
  });
  $('out').innerHTML = h + '</div>';
}

async function copy() {
  try { await navigator.clipboard.writeText(last); TOAST?.('Encontro copiado!', 'success'); } catch { TOAST?.('Copiar indisponível neste navegador.'); }
}

/** Abre a Forja de Ameaças. @param {{toast?:Function}} opts */
export function openForjaAmeacas(opts = {}) {
  mount(); TOAST = opts.toast; draw(load()); run(false); root.hidden = false;
}
