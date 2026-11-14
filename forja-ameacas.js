/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — forja-ameacas.js
   Forja de Ameaças (Modo Mestre): Criaturas Corrompidas, Animais / Humanos
   e Adversários em cinco patentes, equilibrados pelo nº de PJs.
   API: openForjaAmeacas({ toast })
   Persistência própria (dm_forja_ameacas); não toca nas fichas.
   ══════════════════════════════════════════════════════ */

const KEY = 'dm_forja_ameacas';
const T = ['Incômodo', 'Perigo', 'Formidável', 'Imponente', 'Sublime'];
const PA = [1, 2, 4, 6, 10], MU = [1.25, 2, 3, 4], FXA = [2.3, 1.5, 1, .65, .4, .25];
const fx = d => d <= -3 ? 3.5 : d >= 4 ? .15 : FXA[d + 2];
const eff = (t, b) => PA[t] * fx(b - (t + 1));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = n => String(+n.toFixed(1)).replace('.', ',');

/* Criaturas Corrompidas e Animais/Humanos: mesmo bloco (Fúria / Carne / Instinto) */
const CB = [[3, 2, 2], [5, 5, 4], [8, 9, 6], [9, 9, 8], [12, 12, 10]], FV = [5, 6, 10, 12, 15];
const CD = ['1d6', '1d8', '2d6', '2d6+1d4', '2d6+2d4'], CA = [3.5, 4.5, 7, 9.5, 12];
const CF = ['2 / 1', '2 / 1', '3 / 1', '4 / 2', '4 (+1) / 3'], ND = [5, 10, 15, 20, 25];
const AD = {
  pd: [0, 3, 11, 28, 50], at: ['3/2/1/2/1', '5/3/2/2/1', '9/4/3/3/2', '12/8/5/5/2', '12/10/8/8/3'],
  v: [10, 12, 20, 30, 40], bm: [0, 25, 35, 65, 90], rd: [0, 0, 4, 8, 8], ac: [3, 5, 9, 12, 12], re: [2, 3, 6, 8, 10],
  dn: ['1d8+4', '2d6+1d4+6', '2d6+1d4+10', '2d6+1d4+13', '4d6+1d4+13'], da: [8.5, 15.5, 19.5, 22.5, 29.5],
  fa: ['2 / 1', '2 / 1', '3 / 1', '4 / 1', '4 (+1) / 3'],
};
const AN = ['Capanga', 'Combatente treinado', 'Especialista', 'Veterano', 'Catástrofe viva'];
const PF = [['Equilibrado', 0, 0, 0], ['Predador', 1, -1, 0], ['Furioso', 2, -1, -1], ['Ágil', -1, -1, 2], ['Resistente', -1, 2, -1], ['Bruto', 1, 1, -2]];
const KL = { c: 'Criatura Corrompida', h: 'Animal / Humano', a: 'Adversário' };
const DEF = { n: 4, band: 3, diff: 1, kind: 'c', nat: 'Animal', mode: 'auto', tier: 2, qty: 3, prof: '0', man: { c2: 2 } };

const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage */ } };

function sheet(k, t, band, pi, nat) {
  const f = fx(band - (t + 1));
  if (k === 'a') {
    return { f, name: `${AN[t]} · ${T[t]}`, rows: [['Vida', AD.v[t]], ['Barreira', AD.bm[t] || '0 (sem Catalisador)'], ['RD (Traje)', AD.rd[t]], ['Acerto', '+' + AD.ac[t]], ['Dano', `${AD.dn[t]} (${f1(AD.da[t])})`], ['Reação', '+' + AD.re[t]], ['FA / A. Maiores', AD.fa[t]], ['ND Execução', ND[t]], ['PD da ficha', AD.pd[t]], ['Fís/Ins/Raz/Pre/Prs', AD.at[t]], ['PA', PA[t]]] };
  }
  const p = PF[pi]; let [F, C, I] = CB[t];
  F = Math.max(1, F + p[1]); C = Math.max(1, C + p[2]); I = Math.max(1, I + p[3]);
  const rows = [['Vida', C * FV[t]], ['RD (sem Barreira)', C >> 1], ['Acerto', '+' + F], ['Dano', `${CD[t]}+${F} (${f1(CA[t] + F)})`], ['Reação', '+' + I], ['Iniciativa', '2d10+' + I], ['FA / A. Maiores', CF[t]], ['ND Execução', ND[t]], ['Fúria/Carne/Instinto', `${F}/${C}/${I}`]];
  if (k === 'h') rows.push(['Anticorrupção', 'não se aplica']);
  rows.push(['PA', PA[t]]);
  return { f, name: `${k === 'h' ? nat : KL.c} · ${T[t]} · ${p[0]}`, rows };
}

/** Calcula o encontro a partir dos parâmetros. Pura, sem DOM (testável). */
export function planEncounter(s, rnd = Math.random) {
  const N = Math.max(1, Math.min(8, +s.n || 4)), band = +s.band, budget = Math.max(1, Math.round(MU[+s.diff] * N));
  const g = [];
  if (s.mode === 'man') {
    for (let t = 0; t < 5; t++) for (const k of ['c', 'h', 'a']) { const q = Math.max(0, Math.min(30, +s.man[k + t] || 0)); if (q) g.push({ t, n: q, k }); }
  } else if (s.mode === 'auto') {
    let L = 0; for (let t = 0; t < 5; t++) if (eff(t, band) <= .65 * budget) L = t;
    g.push({ t: L, n: 1 });
    const l = Math.max(0, L - 2);
    const m = L === 0 ? Math.min(10, Math.round(budget / eff(0, band)) - 1) : Math.min(8, Math.floor((budget - eff(L, band)) / eff(l, band)));
    if (L === 0 && m > 0) g[0].n = m + 1; else if (m > 0) g.push({ t: l, n: m });
  } else if (s.mode === 'tier') {
    const t = +s.tier; g.push({ t, n: Math.max(1, Math.min(20, Math.round(budget / eff(t, band)))) });
  } else {
    const q = Math.max(1, +s.qty || 1); let bt = 0, bd = 1e9;
    for (let t = 0; t < 5; t++) { const d = Math.abs(q * eff(t, band) - budget); if (d < bd) { bd = d; bt = t; } }
    g.push({ t: bt, n: q });
  }
  let sum = 0, rew = 0; const warn = [];
  const groups = g.map((x, i) => {
    const k = x.k || (s.kind === 'm' ? (i === 0 ? 'a' : 'c') : s.kind);
    const pi = s.prof === 'r' ? Math.floor(rnd() * PF.length) : +s.prof;
    const sh = sheet(k, x.t, band, pi, s.nat), e = eff(x.t, band), d = band - (x.t + 1);
    sum += e * x.n; rew += PA[x.t] * Math.min(1, sh.f) * x.n;
    if (d <= -2) warn.push(`${T[x.t]} está ${-d} faixas acima do grupo: use com cuidado ou reduza a quantidade.`);
    if (d >= 3) warn.push(`${T[x.t]} é trivial para este grupo e rende pouco PA.`);
    return { ...x, k, sh, e };
  });
  const dr = Math.min(120, 6.5 * (sum / N) ** 2);
  const label = dr < 5 ? 'Trivial' : dr < 15 ? 'Fácil' : dr < 35 ? 'Normal' : dr < 65 ? 'Difícil' : 'Mortal';
  return { N, band, budget, groups, sum, rew, dr, label, warn: [...new Set(warn)] };
}

const CSS = `
.fa{max-width:1040px;width:96vw}.fa .modal__body{max-height:72vh;overflow:auto}
.fa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.fa label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--text-dim)}
.fa h4{margin:14px 0 6px;color:var(--gold);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.fa-man{margin-top:12px;padding:8px;border:1px dashed var(--border-mid);border-radius:6px}
.fa-man .fa-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.fa-sum{display:flex;flex-wrap:wrap;gap:22px;align-items:baseline;margin:16px 0 8px}
.fa-big{font-size:26px;font-weight:700;color:var(--text-bright);font-variant-numeric:tabular-nums}
.fa-k{font-size:12px;color:var(--text-dim)}
.fa-tag{padding:2px 10px;border-radius:4px;font-weight:700;color:#050a14}.fa-tag.l1{background:var(--green)}.fa-tag.l2{background:var(--gold)}.fa-tag.l3{background:var(--red)}
.fa-w{border-left:3px solid var(--gold);padding:5px 10px;margin:6px 0;background:var(--bg-panel);color:var(--text-mid);font-size:13px}
.fa-card{border:1px solid var(--border-mid);border-left:5px solid var(--magenta);border-radius:8px;padding:10px 12px;margin:10px 0;background:var(--bg-panel)}
.fa-card.a{border-left-color:var(--cyan)}.fa-card.h{border-left-color:var(--gold)}
.fa-card h3{margin:0 0 2px;font-size:15px;color:var(--text-bright)}
.fa-st{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px 12px;margin-top:6px}
.fa-st div{font-size:11.5px;color:var(--text-dim)}.fa-st b{display:block;font-size:14px;color:var(--text-bright);font-variant-numeric:tabular-nums}
`;
let root, S, TOAST, last = '';

const opt = (a, sel) => a.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');

function mount() {
  if (root) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  root = document.createElement('div'); root.className = 'modal-backdrop'; root.hidden = true;
  root.innerHTML = `<div class="modal fa"><div class="modal__header"><h2 class="modal__title">☠ Forja de Ameaças</h2><button class="modal__close" data-x>✕</button></div>
  <div class="modal__body"><div class="fa-grid" id="fa-ctl"></div><div class="fa-man" id="fa-man"><div class="fa-k">Quantidade por patente. A dificuldade real é comparada ao orçamento da dificuldade escolhida.</div><div class="fa-grid" id="fa-mg"></div></div><div id="fa-out" aria-live="polite"></div></div>
  <div class="modal__footer"><button class="btn btn--primary btn--sm" id="fa-gen">Gerar encontro</button><button class="btn btn--ghost btn--sm" id="fa-cp">Copiar texto</button></div></div>`;
  document.body.append(root);
  root.addEventListener('click', e => { if (e.target === root || e.target.closest('[data-x]')) root.hidden = true; });
  root.querySelector('#fa-gen').addEventListener('click', build);
  root.querySelector('#fa-cp').addEventListener('click', copy);
  root.querySelector('#fa-ctl').addEventListener('change', e => { if (e.target.id === 'fa-mode') vis(); });
}
const $ = id => root.querySelector('#fa-' + id);

function drawControls() {
  const s = S, inp = (id, v, a = '') => `<input class="field-input" id="fa-${id}" type="number" ${a} value="${esc(v)}">`;
  const sel = (id, o, v) => `<select class="field-input field-select" id="fa-${id}">${opt(o, v)}</select>`;
  $('ctl').innerHTML = `<label>Número de PJs${inp('n', s.n, 'min="1" max="8"')}</label>
  <label>Faixa do grupo${sel('band', [[1, '1 · PD 0–3'], [2, '2 · PD 4–8'], [3, '3 · PD 9–15'], [4, '4 · PD 16–23'], [5, '5 · PD 24–30']], s.band)}</label>
  <label>Dificuldade${sel('diff', [[0, 'Fácil'], [1, 'Normal'], [2, 'Difícil'], [3, 'Mortal']], s.diff)}</label>
  <label>Origem${sel('kind', [['c', 'Criaturas Corrompidas'], ['h', 'Animais / Humanos'], ['a', 'Adversários'], ['m', 'Misto (líder adversário)']], s.kind)}</label>
  <label>Natureza (Animais / Humanos)${sel('nat', [['Animal', 'Animal'], ['Humano', 'Humano'], ['Animal / Humano', 'Genérico']], s.nat)}</label>
  <label>Modo${sel('mode', [['auto', 'Automático: líder e capangas'], ['tier', 'Fixar patente, calcular quantidade'], ['qty', 'Fixar quantidade, escolher patente'], ['man', 'Manual: informar inimigos e calcular a dificuldade']], s.mode)}</label>
  <label id="fa-lt">Patente${sel('tier', T.map((n, i) => [i, n]), s.tier)}</label>
  <label id="fa-lq">Quantidade de inimigos${inp('qty', s.qty, 'min="1" max="20"')}</label>
  <label>Perfil dos blocos${sel('prof', [...PF.map((p, i) => [i, p[0]]), ['r', 'Aleatório']], s.prof)}</label>`;
  $('mg').innerHTML = ['c', 'h', 'a'].map(k => T.map((n, t) => `<label>${k === 'a' ? 'Adversário' : k === 'h' ? 'Animal/Humano' : 'Criatura'} · ${n}${inp('m' + k + t, s.man[k + t] || 0, 'min="0" max="30"')}</label>`).join('')).join('');
  vis();
}
function vis() { const m = $('mode').value; $('lt').hidden = m !== 'tier'; $('lq').hidden = m !== 'qty'; $('man').hidden = m !== 'man'; }

function read() {
  const man = {}; ['c', 'h', 'a'].forEach(k => T.forEach((_, t) => { man[k + t] = Math.max(0, Math.min(30, +$('m' + k + t).value || 0)); }));
  return { n: +$('n').value || 4, band: +$('band').value, diff: +$('diff').value, kind: $('kind').value, nat: $('nat').value, mode: $('mode').value, tier: +$('tier').value, qty: +$('qty').value || 3, prof: $('prof').value, man };
}

function build() {
  S = read(); save(S);
  const r = planEncounter(S);
  if (!r.groups.length) { last = ''; $('out').innerHTML = '<div class="fa-w">Informe ao menos um inimigo para calcular a dificuldade.</div>'; return; }
  const lv = r.dr < 35 ? 'l1' : r.dr < 65 ? 'l2' : 'l3';
  last = `PJs ${r.N} · faixa ${r.band} · orçamento ${r.budget} PA · usado ${f1(r.sum)} PA · dreno ${Math.round(r.dr)}% (${r.label}) · PA de recompensa ${f1(r.rew)}\n`;
  let h = `<div class="fa-sum"><div><div class="fa-big">${f1(r.sum)} / ${r.budget}</div><div class="fa-k">PA usados / orçamento</div></div><div><div class="fa-big">${Math.round(r.dr)}%</div><div class="fa-k">dreno estimado da reserva do grupo</div></div><div><span class="fa-tag ${lv}">${r.label}</span><div class="fa-k">dificuldade real</div></div><div><div class="fa-big">${f1(r.rew)}</div><div class="fa-k">PA de recompensa</div></div></div>`;
  h += r.warn.map(w => `<div class="fa-w">${esc(w)}</div>`).join('');
  for (const x of r.groups) {
    h += `<div class="fa-card ${x.k === 'a' ? 'a' : x.k === 'h' ? 'h' : ''}"><h3>×${x.n} ${esc(x.sh.name)}</h3><div class="fa-k">PA efetivo: ${x.e.toFixed(2).replace('.', ',')} cada · fator de faixa ×${String(x.sh.f).replace('.', ',')}</div><div class="fa-st">${x.sh.rows.map(w => `<div>${esc(w[0])}<b>${esc(w[1])}</b></div>`).join('')}</div></div>`;
    last += `${x.n}x ${x.sh.name}: ${x.sh.rows.map(w => w[0] + ' ' + w[1]).join(', ')}\n`;
  }
  $('out').innerHTML = h;
}

async function copy() {
  const t = TOAST;
  try { await navigator.clipboard.writeText(last); t?.('Encontro copiado!', 'success'); } catch { t?.('Copiar indisponível neste navegador.'); }
}

/** Abre a Forja de Ameaças. @param {{toast?:Function}} opts */
export function openForjaAmeacas(opts = {}) {
  mount();
  TOAST = opts.toast;
  S = load();
  drawControls();
  build();
  root.hidden = false;
}
