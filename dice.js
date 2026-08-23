/* ══════════════════════════════════════════════════════
   LIMIAR DA CORRUPÇÃO — dice.js  (v5 completo)
   ══════════════════════════════════════════════════════ */

import { getActiveAgent, calcSkillMod, pushRollHistory } from './state.js';
import { populateRollHistory } from './ui.js';
import { sendRoll } from './webhook.js';

const elSkill   = () => document.getElementById('roll-result-skill');
const elD1      = () => document.getElementById('roll-d1');
const elD2      = () => document.getElementById('roll-d2');
const elMod     = () => document.getElementById('roll-mod');
const elTotal   = () => document.getElementById('roll-total');
const elQuality = () => document.getElementById('roll-quality');
const elDice    = () => document.getElementById('roll-result-dice');

let _rolling = false;

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function qualityLabel(d1, d2, total) {
  if (d1 === 10 && d2 === 10) return { label: '✦ Axioma',  cls: 'axioma'  };
  if (d1 === 1  && d2 === 1)  return { label: '✖ Absurdo', cls: 'absurdo' };
  if (total % 2 === 0)        return { label: '~ Fluidez', cls: 'fluidez' };
  return                             { label: '~ Atrito',  cls: 'atrito'  };
}

function totalColor(t) {
  if (t <= 4)  return 'var(--red)';
  if (t <= 10) return 'var(--text-mid)';
  if (t <= 18) return 'var(--text-bright)';
  if (t <= 25) return 'var(--cyan)';
  return 'var(--gold)';
}

function getBonusValue() {
  return parseInt(document.getElementById('roll-bonus-input')?.value ?? '0', 10) || 0;
}

function showResult(skillLabel, d1, d2, modStr, total, diceHtml) {
  const q = qualityLabel(d1, d2, total);
  if (elSkill())   elSkill().textContent   = skillLabel.toUpperCase();
  if (elTotal())   { elTotal().textContent = total; elTotal().style.color = totalColor(total); }
  if (elQuality()) { elQuality().textContent = q.label; elQuality().className = `roll-result__quality ${q.cls}`; }
  if (elDice() && diceHtml) elDice().innerHTML = diceHtml;
  if (elMod())  elMod().textContent = modStr;
}

function buildModStr(mod, bonus) {
  if (bonus === 0) return mod >= 0 ? `+${mod}` : `${mod}`;
  const m = mod   >= 0 ? `+${mod}`   : `${mod}`;
  const b = bonus >= 0 ? `+${bonus}` : `${bonus}`;
  return `${m} ${b}`;
}

/* ══ ROLAGEM DE PERÍCIA ══ */
export function rollSkill(skillName, formula) {
  if (_rolling) return;
  _rolling = true;

  const agent  = getActiveAgent();
  const mod    = agent ? calcSkillMod(agent, formula) : 0;
  const bonus  = getBonusValue();
  const modStr = buildModStr(mod, bonus);

  if (elSkill())   elSkill().textContent   = skillName.toUpperCase();
  if (elQuality()) { elQuality().textContent = ''; elQuality().className = 'roll-result__quality'; }
  if (elTotal())   { elTotal().textContent = '?';  elTotal().style.color = ''; }

  const FRAMES = 10, MS = 55;
  let f = 0;
  const ticker = setInterval(() => {
    if (elD1()) elD1().textContent = rand(1, 10);
    if (elD2()) elD2().textContent = rand(1, 10);
    f++;
    if (f >= FRAMES) {
      clearInterval(ticker);
      const d1    = rand(1, 10);
      const d2    = rand(1, 10);
      const total = d1 + d2 + mod + bonus;

      const diceHtml = `
        <span class="roll-die">${d1}</span>
        <span class="roll-sep">+</span>
        <span class="roll-die">${d2}</span>
        <span class="roll-sep">+</span>
        <span class="roll-mod">${modStr}</span>`;

      showResult(skillName, d1, d2, modStr, total, diceHtml);

      const entry = { skill: skillName, d1, d2, mod, bonus, total, ts: Date.now() };
      pushRollHistory(entry);
      populateRollHistory(getActiveAgent());
      sendRoll(skillName, d1, d2, mod, bonus, total, false);

      _rolling = false;
    }
  }, MS);
}

/* ══ DADO LIVRE ══ */
function parseExpression(expr) {
  const cleaned = expr.replace(/\s/g, '').toLowerCase();
  if (!cleaned) return null;
  const tokens = cleaned.match(/[+-]?[^+-]+/g);
  if (!tokens) return null;
  const dice = [];
  let bonus = 0;
  for (const token of tokens) {
    const dm = token.match(/^([+-]?)(\d+)d(\d+)$/);
    if (dm) {
      const sign  = dm[1] === '-' ? -1 : 1;
      const count = parseInt(dm[2], 10);
      const sides = parseInt(dm[3], 10);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
      dice.push({ count, sides, sign });
    } else {
      const nm = token.match(/^([+-]?\d+)$/);
      if (!nm) return null;
      bonus += parseInt(nm[1], 10);
    }
  }
  if (dice.length === 0) return null;
  return { dice, bonus };
}

export function rollFree(expr) {
  if (_rolling) return { ok: false, error: 'Aguarde a rolagem anterior.' };
  const parsed = parseExpression(expr);
  if (!parsed) return { ok: false, error: 'Formato inválido. Ex: 4d6+2  /  3d8+1' };

  _rolling = true;
  const results = [];
  let total = 0;

  for (const { count, sides, sign } of parsed.dice) {
    for (let i = 0; i < count; i++) {
      const r = rand(1, sides);
      results.push({ value: r, sign, sides });
      total += r * sign;
    }
  }
  total += parsed.bonus;

  const diceLabel = parsed.dice.map(d =>
    `${d.sign < 0 ? '-' : ''}${d.count}d${d.sides}`
  ).join('+') + (parsed.bonus !== 0 ? (parsed.bonus > 0 ? `+${parsed.bonus}` : parsed.bonus) : '');

  let diceHtml = '';
  results.slice(0, 8).forEach((r, i) => {
    if (i > 0) diceHtml += '<span class="roll-sep">+</span>';
    diceHtml += `<span class="roll-die">${r.value}</span>`;
  });
  if (results.length > 8) diceHtml += '<span class="roll-sep">···</span>';
  if (parsed.bonus !== 0) {
    const b = parsed.bonus;
    diceHtml += `<span class="roll-sep">+</span><span class="roll-mod">${b > 0 ? '+'+b : b}</span>`;
  }

  const d1 = results[0]?.value ?? 1;
  const d2 = results[1]?.value ?? d1;

  showResult(diceLabel, d1, d2, '', total, diceHtml);

  const entry = { skill: diceLabel, free: true, total, ts: Date.now() };
  pushRollHistory(entry);
  populateRollHistory(getActiveAgent());

  // Pass full dice array so webhook shows individual results
  sendRoll(diceLabel, d1, d2, 0, parsed.bonus, total, true, results);

  _rolling = false;
  return { ok: true };
}

/* ══ ROLAGEM DE ARMA/ITEM ══ */
export function rollWeapon(itemName, damageExpr, attrValue, attrName, extraBonus) {
  if (_rolling) return;

  const parsed = parseExpression(damageExpr);
  if (!parsed) return;

  _rolling = true;

  const results = [];
  let total = 0;

  for (const { count, sides, sign } of parsed.dice) {
    for (let i = 0; i < count; i++) {
      const r = rand(1, sides);
      results.push({ value: r, sign, sides });
      total += r * sign;
    }
  }
  total += parsed.bonus + attrValue + extraBonus;

  const d1 = results[0]?.value ?? 1;
  const d2 = results[1]?.value ?? d1;

  // Build display label
  const diceLabel = parsed.dice.map(d =>
    `${d.sign < 0 ? '-' : ''}${d.count}d${d.sides}`
  ).join('+') +
    (parsed.bonus !== 0 ? (parsed.bonus > 0 ? `+${parsed.bonus}` : parsed.bonus) : '') +
    `+${attrName}(${attrValue})` +
    (extraBonus !== 0 ? (extraBonus > 0 ? `+${extraBonus}` : extraBonus) : '');

  let diceHtml = '';
  results.slice(0, 8).forEach((r, i) => {
    if (i > 0) diceHtml += '<span class="roll-sep">+</span>';
    diceHtml += `<span class="roll-die">${r.value}</span>`;
  });
  if (results.length > 8) diceHtml += '<span class="roll-sep">···</span>';
  diceHtml += `<span class="roll-sep">+</span><span class="roll-mod">${attrName} ${attrValue > 0 ? '+'+attrValue : attrValue}</span>`;
  if (extraBonus !== 0) diceHtml += `<span class="roll-sep">+</span><span class="roll-mod">${extraBonus > 0 ? '+'+extraBonus : extraBonus}</span>`;

  showResult(itemName, d1, d2, '', total, diceHtml);

  const entry = { skill: itemName, weapon: true, total, ts: Date.now() };
  pushRollHistory(entry);
  populateRollHistory(getActiveAgent());
  // Passa allDice e isWeapon=true para o webhook exibir apenas os dados reais
  sendRoll(itemName, d1, d2, attrValue, extraBonus, total, false, results, true);

  _rolling = false;
}
const SKILL_NAMES = {
  'atletismo':'Atletismo','forca':'Força','resistencia-fisica':'Resistência Física',
  'sobrevivencia':'Sobrevivência','intuicao':'Intuição','percepcao':'Percepção',
  'tecnologia':'Tecnologia','raciocinio':'Raciocínio','prestidigitacao':'Prestidigitação',
  'furtividade':'Furtividade','engano':'Engano','presenca-skill':'Presença',
  'redirecionamento':'Redirecionamento','medicina':'Medicina','confeccao':'Confecção e Reparo',
  'resistencia-mental':'Resistência Mental','concentracao':'Concentração',
  'agilidade':'Agilidade','investigacao':'Investigação','negociacao':'Negociação',
  'pilotagem':'Pilotagem',
};

export function bindSkillRolls() {
  document.querySelectorAll('.skill-row[data-skill]').forEach(row => {
    row.addEventListener('click', () =>
      rollSkill(SKILL_NAMES[row.dataset.skill] ?? row.dataset.skill, row.dataset.formula)
    );
  });

  const bonusInput = document.getElementById('roll-bonus-input');
  document.getElementById('roll-bonus-inc')?.addEventListener('click', () => {
    if (bonusInput) bonusInput.value = (parseInt(bonusInput.value || '0', 10) + 1).toString();
  });
  document.getElementById('roll-bonus-dec')?.addEventListener('click', () => {
    if (bonusInput) bonusInput.value = (parseInt(bonusInput.value || '0', 10) - 1).toString();
  });

  const freeInput = document.getElementById('roll-free-input');
  const freeError = document.getElementById('roll-free-error');
  const freeBtn   = document.getElementById('roll-free-btn');

  function triggerFree() {
    const expr = freeInput?.value.trim();
    if (!expr) return;
    const result = rollFree(expr);
    if (!result.ok) {
      if (freeError) { freeError.textContent = result.error; setTimeout(() => { freeError.textContent = ''; }, 3000); }
    } else {
      if (freeError) freeError.textContent = '';
    }
  }

  freeBtn?.addEventListener('click', triggerFree);
  freeInput?.addEventListener('keydown', e => { if (e.key === 'Enter') triggerFree(); });
}
