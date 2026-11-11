/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — forja.js
   Forja das Armas (Arsenal e Módulos, pp. 25–27 do livro).
   Montagem em cinco passos, sorteio, caderno local e saída pronta
   para o Arsenal da ficha (jogador) ou para a concessão (mestre).
   API: openForja({ mode, onUse, useLabel, toast })
   ══════════════════════════════════════════════════════ */

const CK = 'dm_forja_caderno';
const $ = (s, c = document) => c.querySelector(s);
const K = Object.keys;
const pick = a => a[Math.random() * a.length | 0];
const shuf = a => [...a].sort(() => Math.random() - 0.5);
const f1 = n => String(n).replace('.', ',');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── Dados do livro ── */
const CL = {
  peq:  { n: 'Pequena',   d: '1d6', a: 3.5, v: 3, p: 50,  c: 6, w: 'Leve',   wt: 'Leve ou Desarmado', bd: '1d4', h: 'Uma mão' },
  uma:  { n: 'Uma Mão',   d: '1d8', a: 4.5, v: 3, p: 100, c: 6, w: 'Médio',  wt: 'Médio',             bd: '1d6', h: 'Uma mão' },
  duas: { n: 'Duas Mãos', d: '2d6', a: 7,   v: 2, p: 150, c: 4, w: 'Pesado', wt: 'Pesado',            bd: '1d8', h: 'Duas mãos' },
};
const PS = { Desarmado: 1, Leve: 0, 'Médio': -1, Pesado: -2 };
const PF = {
  'Lâmina':   { t: ['Cortante', 'Perfurante'], m: 'cac', e: 'espadas, facas', nm: ['Espada', 'Faca', 'Gládio'] },
  Haste:      { t: ['Perfurante', 'Cortante', 'Impacto'], m: 'cac', e: 'lanças, foices, bastões', nm: ['Lança', 'Foice', 'Bastão'] },
  'Maça':     { t: ['Impacto'], m: 'cac', e: 'martelos, clavas', nm: ['Martelo', 'Clava', 'Malho'] },
  Punho:      { t: ['Impacto'], m: 'cac', e: 'manoplas, soco-inglês', nm: ['Manopla', 'Soco-inglês'] },
  'Flexível': { t: ['Cortante', 'Impacto'], m: 'cac', e: 'correntes, chicotes', nm: ['Corrente', 'Chicote'] },
  Cano:       { t: ['Balístico'], m: 'bal', e: 'pistolas, fuzis', nm: ['Pistola', 'Fuzil', 'Carabina'] },
  Arco:       { t: ['Perfurante', 'Impacto'], m: 'mec', e: 'arcos, bestas', nm: ['Arco', 'Besta'] },
};
const MC = {
  cac: { n: 'Corpo-a-corpo',     g: 1, p: 0,   a: 'Físico',   r: 'Adjacente', t: ['Cortante', 'Perfurante', 'Impacto'] },
  mec: { n: 'Disparo Mecânico',  g: 1, p: 50,  a: 'Precisão', r: 'Curta',     t: ['Perfurante', 'Impacto'] },
  bal: { n: 'Disparo Balístico', g: 2, p: 300, a: 'Precisão', r: 'Curta',     t: ['Balístico'] },
};
const TR = {
  Balístico: '+1 acúmulo de Sangramento por turno', Cortante: '+1 acúmulo de Sangramento por turno',
  Impacto: 'alvo Vulnerável por um turno', Perfurante: 'ignora metade da RD',
};
/* f: c = só corpo-a-corpo · d = só disparo · a = qualquer */
const MD = [
  { i: 'acu', n: 'Acuidade', g: 1, p: 60, f: 'c', d: 'Usa Precisão no lugar de Físico, no acerto e no dano.' },
  { i: 'arr', n: 'Arremesso', g: 1, p: 40, f: 'c', d: 'Arremessa a arma até zona curta, com o mesmo modificador de ataque.' },
  { i: 'alc', n: 'Alcance', g: 1, p: 80, f: 'c', d: 'Ataca até zona curta, sem desvantagem.' },
  { i: 'alm', n: 'Alcance Médio', g: 1, p: 120, f: 'a', d: 'Ataca até zona média, sem desvantagem.' },
  { i: 'cex', n: 'Carga Expandida', g: 1, p: 120, f: 'd', d: '+2 Cargas.' },
  { i: 'gua', n: 'Guarda', g: 1, p: 120, f: 'c', d: '+1 em Aparar (Redirecionamento) para escudo.' },
  { i: 'oc', n: 'Ocultável', g: 1, p: 60, f: 'a', d: 'Escondível, só de uma mão. +1d6 em Engano para escondê-la e em Ataque Furtivo.' },
  { i: 'vc', n: 'Versátil (CaC)', g: 1, p: 175, f: 'c', d: 'Uma ou duas mãos. Duas: +1d4 de dano e +2 em Aparar. Uma: mão livre.' },
  { i: 'vd', n: 'Versátil (Disparo)', g: 1, p: 175, f: 'd', d: 'Uma ou duas mãos. Duas: vantagem no acerto se não se mover. Uma: ataca Agarrado, com desvantagem.' },
  { i: 'alg', n: 'Alcance Longo', g: 2, p: 350, f: 'd', d: 'Ataca até zona longa, sem desvantagem.' },
  { i: 'qui', n: 'Aplicador Químico', g: 2, p: 300, f: 'a', d: 'Aplica Queimadura ou Veneno; em Fluidez no acerto, acúmulos pela tabela.' },
  { i: 'pen', n: 'Penetração', g: 2, p: 300, f: 'a', d: 'Ignora 2 pontos de RD. Não acumula com outras fontes: vale o maior.' },
  { i: 'tra', n: 'Transformação', g: 2, p: 100, f: 'a', d: 'Modo B com Mecanismo e Tipo próprios, dado um degrau abaixo.' },
  { i: 'ano', n: 'Anomalia', g: 3, p: 1000, f: 'a', d: '1 FA: por um turno, Barreiras Mágicas à metade; você fica Enfraquecido.' },
  { i: 'ant', n: 'Anticorrupção', g: 3, p: 1000, f: 'a', d: '2 ações e 1 FA: RD de Criaturas Corrompidas −4 e ND de Execução −4.' },
];
/* Exclusão mútua: 6 do livro + Guarda×Versátil (texto) + 3 inferidas */
const EX = [['oc', 'dm'], ['oc', 'alc'], ['ano', 'ant'], ['acu', 'dm'], ['alm', 'alg'], ['arr', 'dm'],
            ['gua', 'vc'], ['alc', 'alm'], ['vc', 'dm'], ['vd', 'dm']];
const EP = ['do Limiar', 'Cinzenta', 'da Dissonância', 'Rubra', 'de Axio', 'Silente', 'Fria', 'da Mácula', 'Vigilante', 'Última Palavra'];
const LV = ['', 'A', 'R', 'N/M'];
const LVN = ['', 'Aberto (A)', 'Restrito (R)', 'Negro/Militar (N/M)'];

/* ── Estado e regras ── */
let S = blank();
let O = {};                 // opções da abertura atual
let T = 'f';                // aba: f = Forja · c = Caderno
const F = { rt: 'x', rn: '3', rb: '' };

function blank() {
  return { cl: 'uma', pf: 'Lâmina', tp: 'Cortante', ps: 'Leve', m: new Set(), mb: 'cac', tb: 'Cortante', q: 'Queimadura', nm: 'Lâmina do Limiar', prof: false, id: '' };
}
const mech = () => MC[PF[S.pf].m];
const md = i => MD.find(x => x.i === i);
const has = i => S.m.has(i) || (i === 'dm' && S.cl === 'duas');
const nat = i => i === 'oc' && S.cl === 'peq';
const used = () => [...S.m].filter(i => !nat(i)).length;
const kindOk = m => m.f === 'a' || (m.f === 'c') === (PF[S.pf].m === 'cac');
const nome = i => (i === 'dm' ? 'Duas Mãos' : md(i).n);
const peso = () => (S.cl === 'peq' ? S.ps : CL[S.cl].w);
const conf = i => {
  const o = [];
  EX.forEach(([a, b]) => { if (a === i && has(b)) o.push(b); if (b === i && has(a)) o.push(a); });
  return o;
};
const why = m => {
  if (!kindOk(m)) return m.f === 'c' ? 'Só corpo-a-corpo' : 'Só disparo';
  const c = conf(m.i);
  if (c.length) return 'Conflita com ' + nome(c[0]);
  return used() >= CL[S.cl].v ? 'Sem vagas' : '';
};
const price = () => {
  let p = CL[S.cl].p + mech().p;
  S.m.forEach(i => { if (nat(i)) return; p += md(i).p; if (i === 'tra') p += MC[S.mb].p; });
  return p;
};
const band = p => (p <= 300 ? 1 : p <= 999 ? 2 : 3);
const grau = () => {
  let g = Math.max(mech().g, band(price()));
  S.m.forEach(i => { g = Math.max(g, md(i).g); if (i === 'tra') g = Math.max(g, MC[S.mb].g); });
  return g;
};

function norm() {
  const P = PF[S.pf];
  if (!P.t.includes(S.tp)) S.tp = P.t[0];
  if (S.cl !== 'peq') S.ps = CL[S.cl].w;
  else if (S.ps === 'Desarmado' && S.pf !== 'Punho') S.ps = 'Leve';
  if (!MC[S.mb].t.includes(S.tb)) S.tb = MC[S.mb].t[0];
  const old = [...S.m];
  S.m = new Set();
  old.forEach(i => { if (kindOk(md(i)) && !conf(i).length && (nat(i) || used() < CL[S.cl].v)) S.m.add(i); });
}

/* Resumo + item pronto para o Arsenal / concessão */
function info() {
  const c = CL[S.cl], mc = mech(), p = price(), g = grau();
  const at = has('acu') ? 'Precisão' : mc.a;
  let r = mc.r;
  if (has('alc')) r = 'Curta';
  if (has('alm')) r = 'Média';
  if (has('alg')) r = 'Longa';
  const mao = S.cl === 'duas' ? 'Duas (em uma mão: Desvantagem em ataque e dano)'
    : has('vc') ? 'Uma ou duas (duas: +1d4 de dano, +2 Aparar)'
    : has('vd') ? 'Uma ou duas (duas: vantagem se parado)' : c.h;
  const cg = mc.a === 'Físico' ? '' : c.c + (has('cex') ? 2 : 0);
  const pw = PS[peso()];
  const rows = [
    ['Ataque com', at + (has('acu') ? ' (Acuidade)' : '')],
    ['Dano', `${c.d} + ${at}${S.prof ? ' + 1 (' + S.tp + ')' : ''}`],
    ['Dado médio', f1(c.a) + ' (+1 do tipo, com proficiência)'],
    ['Alcance', r + (has('arr') ? ' · arremesso: Curta' : '')],
    ['Iniciativa', `Peso ${pw > 0 ? '+' : ''}${pw} (${peso()})`],
    ['Mãos', mao],
    ['Vagas', `${used()} / ${c.v}`],
    ['Cargas', cg || '—'],
    ['Trauma de Exposição', `${S.tp}: ${TR[S.tp]} (Fluidez, dano direto na Vida)`],
    ['Preço total', p + ' CDU'],
  ];
  const mods = [];
  if (S.cl === 'duas') mods.push('Duas Mãos (nativo): requer as duas mãos.');
  S.m.forEach(i => {
    const m = md(i);
    let t = m.n + (nat(i) ? ' (nativo)' : '') + ': ' + m.d;
    if (i === 'qui') t = `${m.n}: aplica ${S.q}; em Fluidez no acerto, acúmulos pela tabela.`;
    if (i === 'tra') t = `${m.n}: Modo B — ${MC[S.mb].n}, ${S.tb}, dado ${c.bd}, ataca com ${MC[S.mb].a}, alcance ${MC[S.mb].r}.`;
    mods.push(t);
  });
  const nt = [];
  if (g > band(p)) nt.push('Nível elevado pelo Grau do Mecanismo ou Módulo, apesar do preço.');
  if (has('pen') && S.tp === 'Perfurante') nt.push('Penetração e TrE Perfurante não acumulam: vale o maior valor.');
  nt.push(g > 1 ? 'Fora do Mercado Aberto: não serve de arma inicial.'
    : p <= 150 ? 'Cabe nos 150 CDU iniciais fixos.' : 'Mercado Aberto: serve de arma inicial se couber nos seus CDU.');

  const modl = [];
  if (S.cl === 'duas') modl.push('Duas Mãos');
  S.m.forEach(i => {
    const m = md(i);
    modl.push(i === 'qui' ? `${m.n} (${S.q})` : i === 'tra' ? `${m.n} (Modo B: ${MC[S.mb].n}, ${S.tb}, ${c.bd})` : m.n);
  });
  const desc = `${c.n} · ${S.pf} · ${mc.n} · ${S.tp}. Ataca com ${at}. TrE (Fluidez, dano direto na Vida): ${TR[S.tp]}. Mãos: ${mao}.`
    + (cg ? ` Cargas: ${cg}.` : '');
  const item = {
    name: (S.nm || 'Arma sem nome').slice(0, 80), description: desc.slice(0, 500), market: LV[g],
    damage: c.d, range: (r + (has('arr') ? ' (arremesso: Curta)' : '')).slice(0, 60),
    modules: modl.join(', ').slice(0, 200), price: p + ' CDU', qty: 1,
    weaponWeight: (pw >= 0 ? '+' : '') + pw, weaponAttr: at === 'Precisão' ? 'pre' : 'fis', weaponBonus: S.prof ? 1 : 0,
  };
  return { rows, mods, nt, g, p, lv: LVN[g], item };
}

function txt() {
  const f = info();
  return [`${S.nm} — ${CL[S.cl].n}, ${S.pf}, ${mech().n}, ${S.tp} [${f.lv}]`,
    ...f.rows.map(r => `${r[0]}: ${r[1]}`), ...f.mods.map(m => '• ' + m)].join('\n');
}

/* Sorteio respeitando todas as regras, nível máximo e orçamento */
function roll({ th = 'x', mx = 3, bd = 1e9, cc = '' } = {}) {
  for (let t = 0; t < 300; t++) {
    S.cl = cc || pick(K(CL));
    S.pf = pick(K(PF).filter(k => th === 'x' || (th === 'c') === (PF[k].m === 'cac')));
    S.tp = pick(PF[S.pf].t);
    S.ps = S.cl === 'peq' && S.pf === 'Punho' && Math.random() < 0.5 ? 'Desarmado' : 'Leve';
    S.m = new Set(S.cl === 'peq' ? ['oc'] : []);
    S.mb = pick(K(MC)); S.tb = pick(MC[S.mb].t); S.q = pick(['Queimadura', 'Veneno']);
    norm();
    if (price() > bd || grau() > mx) continue;
    shuf(MD).forEach(m => {
      if (Math.random() < 0.5 || why(m) || S.m.has(m.i)) return;
      S.m.add(m.i); norm();
      if (price() > bd || grau() > mx) { S.m.delete(m.i); norm(); }
    });
    S.nm = pick(PF[S.pf].nm) + ' ' + pick(EP);
    return true;
  }
  return false;
}

/* ── Caderno (localStorage) ── */
const bookGet = () => { try { return JSON.parse(localStorage.getItem(CK)) || []; } catch { return []; } };
const bookSet = v => { try { localStorage.setItem(CK, JSON.stringify(v)); } catch { /* sem espaço */ } };
const snap = () => ({ id: S.id, ts: Date.now(), st: { cl: S.cl, pf: S.pf, tp: S.tp, ps: S.ps, m: [...S.m], mb: S.mb, tb: S.tb, q: S.q, nm: S.nm, prof: S.prof } });
const withSt = (st, fn) => { const keep = S; S = { ...blank(), ...st, m: new Set(st.m) }; norm(); try { return fn(); } finally { S = keep; } };

/* ── Interface ── */
const CSS = `
.fj{max-width:1040px;width:96vw}.fj .modal__body{max-height:70vh;overflow:auto}
.fj-tabs{margin-left:auto;margin-right:10px;display:flex;gap:6px}
.fj-g{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:12px}@media(max-width:820px){.fj-g{grid-template-columns:1fr}}
.fj h4{margin:12px 0 6px;color:var(--gold);font-size:12px;letter-spacing:.08em;text-transform:uppercase}.fj h4:first-child{margin-top:0}
.fj-r{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--w,150px),1fr));gap:6px}
.fj-o{text-align:left;background:var(--bg-input);border:1px solid var(--border-mid);border-radius:6px;padding:6px 8px;color:var(--text-mid);cursor:pointer;font:inherit}
.fj-o b{display:block;color:var(--text-bright);font-size:13px}.fj-o i{display:block;font-style:normal;color:var(--gold);font-size:11px}
.fj-o span{display:block;font-size:11.5px;color:var(--text-dim)}.fj-o em{display:block;font-style:normal;color:var(--red);font-size:11px}
.fj-o.on{border-color:var(--cyan);box-shadow:inset 0 0 0 1px var(--cyan)}.fj-o:disabled{opacity:.4;cursor:not-allowed}.fj-o.on:disabled{opacity:1}
.fj-card{border:1px solid var(--border-mid);border-radius:8px;padding:10px;background:var(--bg-panel);align-self:start;position:sticky;top:0}
.fj-lv{padding:1px 8px;border-radius:4px;font-weight:700;color:#050a14}.fj-lv.l1{background:var(--green)}.fj-lv.l2{background:var(--gold)}.fj-lv.l3{background:var(--red)}
.fj table{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0}.fj td,.fj th{border-bottom:1px solid var(--border);padding:3px 6px;text-align:left;vertical-align:top}.fj th{color:var(--cyan);white-space:nowrap}
.fj ul{margin:6px 0;padding-left:18px;font-size:12.5px;color:var(--text-mid)}.fj-nn{font-size:12px;color:var(--text-dim);margin:4px 0}
.fj-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:12px;font-size:12px;color:var(--text-dim)}.fj-bar label{display:flex;flex-direction:column;gap:2px}.fj-bar input[type=number]{width:90px}
.fj-sub{margin-top:8px;padding:8px;border:1px dashed var(--border-mid);border-radius:6px;font-size:12px;color:var(--text-dim)}.fj-sub .fj-r{margin-top:6px}
.fj-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--border)}.fj-row>div{flex:1;min-width:160px}
`;
let root;

function mount() {
  if (root) return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
  root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.hidden = true;
  root.innerHTML = `<div class="modal fj"><div class="modal__header"><h2 class="modal__title">⚒ Forja das Armas</h2>
    <div class="fj-tabs"><button class="btn btn--sm" data-k="tab" data-v="f">Forja</button><button class="btn btn--sm" data-k="tab" data-v="c">Caderno</button></div>
    <button class="modal__close" data-x>✕</button></div><div class="modal__body" id="fj-body"></div><div class="modal__footer" id="fj-foot"></div></div>`;
  document.body.append(root);
  root.addEventListener('click', onClick);
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'fj-nm') S.nm = t.value;
    else if (t.dataset.f === 'prof') { S.prof = t.checked; draw(); }
    else if (t.dataset.f) F[t.dataset.f] = t.value;
  });
}
const B = (k, v, t, on, dis) => `<button class="fj-o${on ? ' on' : ''}" data-k="${k}" data-v="${v}"${dis ? ` disabled title="${esc(dis)}"` : ''}>${t}</button>`;
const toast = (m, t = '') => (O.toast ? O.toast(m, t) : null);

function drawForge() {
  const c = CL[S.cl], P = PF[S.pf], f = info();
  const sel = (id, opts) => `<select class="field-input field-select" data-f="${id}">${opts.map(([v, l]) => `<option value="${v}"${F[id] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  let h = `<div class="fj-bar"><label>Tipo${sel('rt', [['x', 'Qualquer'], ['c', 'Corpo-a-corpo'], ['d', 'Disparo']])}</label>
    <label>Nível máximo${sel('rn', [['1', 'Aberto'], ['2', 'Restrito'], ['3', 'Negro/Militar']])}</label>
    <label>Orçamento (CDU)<input class="field-input" type="number" min="0" data-f="rb" value="${esc(F.rb)}" placeholder="sem limite"></label>
    <button class="btn btn--primary btn--sm" data-k="rnd">Sortear arma</button><span id="fj-ms" style="color:var(--red)"></span></div><div class="fj-g"><div>`;
  h += '<h4>1 · Classe</h4><div class="fj-r" style="--w:170px">' + K(CL).map(k => { const x = CL[k]; return B('cl', k, `<b>${x.n}</b><i>${x.d} · ${x.wt}</i><span>${x.h} · ${x.v} vagas · ${x.p} CDU · ${x.c} cargas</span>`, S.cl === k); }).join('') + '</div>';
  if (S.cl === 'peq') h += '<div class="fj-sub">Peso:<div class="fj-r" style="--w:170px">' + B('ps', 'Leve', '<b>Leve (+0)</b>', S.ps === 'Leve') + B('ps', 'Desarmado', '<b>Desarmado (+1)</b><span>só Perfil Punho</span>', S.ps === 'Desarmado', S.pf !== 'Punho' ? 'Só com Perfil Punho' : '') + '</div></div>';
  h += '<h4>2 · Perfil</h4><div class="fj-r">' + K(PF).map(k => B('pf', k, `<b>${k}</b><i>${PF[k].t.join(', ')}</i><span>${PF[k].e}</span>`, S.pf === k)).join('') + '</div>';
  h += '<h4>3 · Mecanismo (definido pelo Perfil)</h4><div class="fj-r" style="--w:190px">' + K(MC).map(k => { const x = MC[k]; return B('mc', k, `<b>${x.n}</b><i>Grau ${['', 'I', 'II'][x.g]} · ${x.p ? '+' + x.p + ' CDU' : '—'}</i><span>${x.a} · ${x.r}</span>`, PF[S.pf].m === k, PF[S.pf].m === k ? '' : 'Definido pelo Perfil'); }).join('') + '</div>';
  h += '<h4>4 · Tipo de Dano</h4><div class="fj-r" style="--w:190px">' + P.t.map(t => B('tp', t, `<b>${t}</b><span>TrE: ${TR[t]}</span>`, S.tp === t)).join('') + '</div>';
  h += `<h4>5 · Módulos · vagas ${used()}/${c.v}</h4>`;
  if (S.cl === 'duas') h += '<div class="fj-nn"><b>Duas Mãos</b> · nativo, sem custo e sem vaga</div>';
  [1, 2, 3].forEach(g => {
    h += `<div class="fj-nn" style="margin-top:8px">Grau ${['', 'I — Aberto', 'II — Restrito', 'III — Negro/Militar'][g]}</div><div class="fj-r" style="--w:220px">` + MD.filter(m => m.g === g).map(m => {
      const on = S.m.has(m.i), d = on ? '' : why(m);
      const pr = nat(m.i) ? 'nativo · 0 CDU' : '+' + m.p + ' CDU' + (m.i === 'tra' ? ' + Mecanismo B' : '');
      return B('md', m.i, `<b>${m.n}</b><i>${pr}</i><span>${m.d}</span>` + (d ? `<em>${d}</em>` : ''), on, d);
    }).join('') + '</div>';
  });
  if (has('qui')) h += '<div class="fj-sub">Aplicador Químico:<div class="fj-r" style="--w:140px">' + ['Queimadura', 'Veneno'].map(q => B('q', q, `<b>${q}</b>`, S.q === q)).join('') + '</div></div>';
  if (has('tra')) h += `<div class="fj-sub">Modo B (dado ${c.bd}) · Mecanismo:<div class="fj-r" style="--w:170px">` + K(MC).map(k => B('mb', k, `<b>${MC[k].n}</b><i>+${MC[k].p} CDU</i>`, S.mb === k)).join('') + '</div><div style="margin-top:6px">Tipo de Dano:</div><div class="fj-r" style="--w:140px">' + MC[S.mb].t.map(t => B('tb', t, `<b>${t}</b>`, S.tb === t)).join('') + '</div></div>';
  h += `</div><aside class="fj-card"><input class="field-input" id="fj-nm" value="${esc(S.nm)}" maxlength="80" aria-label="Nome da arma">
    <p style="margin:8px 0"><span class="fj-lv l${f.g}">${f.lv}</span> <small>${c.n} · ${S.pf} · ${mech().n} · ${S.tp}</small></p>
    <label style="font-size:12px"><input type="checkbox" data-f="prof"${S.prof ? ' checked' : ''}> Tenho proficiência (+1 do tipo no dano)</label>
    <table>${f.rows.map(r => `<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>
    <ul>${f.mods.map(m => `<li>${esc(m)}</li>`).join('')}</ul>${f.nt.map(n => `<div class="fj-nn">${n}</div>`).join('')}</aside></div>`;
  return h;
}

function drawBook() {
  const list = bookGet();
  if (!list.length) return '<p class="fj-nn">O caderno está vazio. Monte uma arma e use “Salvar no caderno” para anotá-la.</p>';
  return list.map(e => {
    const f = withSt(e.st, info);
    return `<div class="fj-row"><div><b>${esc(e.st.nm)}</b><br><small>${CL[e.st.cl].n} · ${e.st.pf} · ${e.st.tp} · ${f.item.damage} · ${f.p} CDU</small></div>
      <span class="fj-lv l${f.g}">${LV[f.g]}</span>
      <button class="btn btn--ghost btn--sm" data-k="op" data-v="${e.id}">Abrir</button>
      ${O.onUse ? `<button class="btn btn--primary btn--sm" data-k="cu" data-v="${e.id}">${esc(O.useLabel || 'Usar')}</button>` : ''}
      <button class="btn btn--ghost btn--sm" data-k="cc" data-v="${e.id}">Copiar</button>
      <button class="btn btn--ghost btn--sm" data-k="dl" data-v="${e.id}">Excluir</button></div>`;
  }).join('');
}

function draw() {
  norm();
  root.querySelectorAll('.fj-tabs [data-k]').forEach(b => b.classList.toggle('btn--ghost', b.dataset.v !== T));
  $('#fj-body').innerHTML = T === 'f' ? drawForge() : drawBook();
  $('#fj-foot').innerHTML = T === 'f'
    ? `<button class="btn btn--ghost" data-k="sv">Salvar no caderno</button><button class="btn btn--ghost" data-k="cp">Copiar ficha</button>${O.onUse ? `<button class="btn btn--primary" data-k="use">${esc(O.useLabel || 'Usar esta arma')}</button>` : ''}`
    : '<button class="btn btn--ghost" data-x>Fechar</button>';
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copiado!', 'success'); }
  catch { toast('Não foi possível copiar automaticamente.', 'error'); }
}
const close = () => { root.hidden = true; };

function onClick(e) {
  if (e.target === root || e.target.closest('[data-x]')) return close();
  const b = e.target.closest('[data-k]');
  if (!b || b.disabled) return;
  const k = b.dataset.k, v = b.dataset.v;
  const entry = () => bookGet().find(x => x.id === v);
  if (k === 'tab') T = v;
  else if (k === 'rnd') {
    const ok = roll({ th: F.rt, mx: +F.rn, bd: +F.rb || 1e9, cc: '' });
    draw();
    if (!ok) $('#fj-ms').textContent = 'Nenhuma combinação cabe nesses limites.';
    return;
  } else if (k === 'cp') return copyText(txt());
  else if (k === 'sv') {
    const list = bookGet();
    if (!S.id) S.id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const s = snap(), i = list.findIndex(x => x.id === S.id);
    if (i >= 0) list[i] = s; else list.unshift(s);
    bookSet(list);
    return toast('Arma salva no caderno.', 'success');
  } else if (k === 'use') { const it = info().item; close(); return O.onUse?.(it); }
  else if (k === 'op') { const e2 = entry(); if (e2) { S = { ...blank(), ...e2.st, m: new Set(e2.st.m), id: e2.id }; T = 'f'; } }
  else if (k === 'cu') { const e2 = entry(); if (e2) { const it = withSt(e2.st, () => info().item); close(); return O.onUse?.(it); } }
  else if (k === 'cc') { const e2 = entry(); if (e2) return copyText(withSt(e2.st, txt)); }
  else if (k === 'dl') bookSet(bookGet().filter(x => x.id !== v));
  else if (k === 'cl') { if (v === 'peq') S.m.add('oc'); else if (S.cl === 'peq') S.m.delete('oc'); S.cl = v; }
  else if (k === 'md') { S.m.has(v) ? S.m.delete(v) : S.m.add(v); }
  else if (k !== 'mc') S[k] = v;
  draw();
}

/**
 * Abre a Forja.
 * @param {{mode?:'player'|'master', onUse?:(item:object)=>void, useLabel?:string, toast?:Function}} opts
 *   onUse recebe um item no formato do Arsenal: name, description, market (A|R|N/M), damage, range,
 *   modules, price, qty, weaponWeight, weaponAttr, weaponBonus.
 */
export function openForja(opts = {}) {
  mount();
  O = opts;
  S = blank();
  S.prof = opts.mode !== 'master';   // jogador: proficiência marcada; mestre: decide quem recebe
  S.id = '';
  T = 'f';
  draw();
  root.hidden = false;
}
