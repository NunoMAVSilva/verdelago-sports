// Núcleo partilhado: cliente Supabase, horas em Lisboa, utilitários e grelha.
export const SB_URL = 'https://ncisfqhfxqumoadikupm.supabase.co';
// Chave pública ("publishable"): pode estar no código; a segurança está nas regras RLS.
export const SB_KEY = 'sb_publishable_waNo5245APdUQsax_Kmyrg_fRj4lrMs';
export const sb = window.supabase.createClient(SB_URL, SB_KEY);
export const TZ = 'Europe/Lisbon';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- horas (sempre em Lisboa, seja qual for o fuso do telemóvel) ---------- */
const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function offsetMin(ms) {
  const p = fmtParts.formatToParts(new Date(ms)), g = t => +p.find(x => x.type === t).value;
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms) / 60000;
}
/** Dia 'AAAA-MM-DD' + minutos desde a meia-noite (hora de Lisboa) → Date */
export function lisboa(dia, min) {
  const [y, m, d] = dia.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, min);
  let t = guess - offsetMin(guess) * 60000;
  const o2 = offsetMin(t);
  t = guess - o2 * 60000;
  return new Date(t);
}
export const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export function addDias(dia, n) {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const hm2min = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
export const min2hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const hora = d => new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));
export function dataLonga(dia, lang = 'pt') {
  const [y, m, d] = dia.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
}
export function dataCurta(dia, lang = 'pt') {
  const [y, m, d] = dia.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}
export const diaDe = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));

/* ---------- dados ---------- */
/** Quarto no formato do Opera/Beach OPS: A123, T045, V12 (null se não reconhecido) */
export function normQuarto(v) {
  const s = String(v || '').toUpperCase().replace(/[\s\-_.]/g, ''), m = s.match(/^([ATV])0*(\d{1,3})$/);
  if (!m) return null;
  const n = +m[2];
  if (m[1] === 'V') return n >= 1 && n <= 99 ? 'V' + n : null;
  return n >= 1 && n <= 999 ? m[1] + String(n).padStart(3, '0') : null;
}

export const MODALIDADES = {
  padel: { pt: 'Pádel', en: 'Padel', icon: '🎾' },
  tenis: { pt: 'Ténis', en: 'Tennis', icon: '🎾' },
  futebol: { pt: 'Futebol 7', en: '7-a-side football', icon: '⚽' },
  'beach-volley': { pt: 'Beach Volley', en: 'Beach volleyball', icon: '🏐' },
  polidesportivo: { pt: 'Polidesportivo', en: 'Multi-sport court', icon: '🏀' },
};
export const nomeMod = (m, lang = 'pt') => (MODALIDADES[m] || {})[lang] || m;

export async function carregarBase() {
  const [e, c] = await Promise.all([
    sb.from('espacos').select('*').eq('ativo', true).order('ordem'),
    sb.from('config').select('*').single(),
  ]);
  if (e.error) throw e.error;
  if (c.error) throw c.error;
  const espacos = e.data.map(x => ({ ...x, abreMin: hm2min(x.abre), fechaMin: hm2min(x.fecha) }));
  return { espacos, config: c.data };
}

export function erroTexto(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/exclusion|sem_sobreposicao|23P01/i.test(m) || (e && e.code === '23P01')) return 'Esse horário já está ocupado.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem ligação. Verifique a internet e tente de novo.';
  return m;
}

/* ---------- atualização automática ---------- */
// Corre fn de `ms` em `ms` e ao voltar ao separador, mas só quando podeAgora() (sem diálogo aberto,
// sem estar a escrever). Devolve uma função que pede uma atualização na próxima oportunidade.
let autos = [];
export const ocupado = () => !!document.getElementById('modal')?.innerHTML || !!document.activeElement?.matches('input,select,textarea');
export function autoAtualizar(fn, ms, podeAgora = () => !ocupado()) {
  let ultima = Date.now(), pedido = false, aCorrer = false;
  const tick = async () => {
    if (aCorrer || document.hidden || !(pedido || Date.now() - ultima >= ms) || !podeAgora()) return;
    aCorrer = true; pedido = false; ultima = Date.now();
    try { await fn(); } finally { aCorrer = false; }
  };
  const vis = () => { if (!document.hidden) { pedido = true; tick(); } };
  const id = setInterval(tick, Math.min(ms, 3000));
  document.addEventListener('visibilitychange', vis);
  autos.push(() => { clearInterval(id); document.removeEventListener('visibilitychange', vis); });
  return () => { pedido = true; tick(); };
}
export function pararAuto() { autos.forEach(f => f()); autos = []; }

/* ---------- interface ---------- */
export function toast(t, tipo = '') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = tipo; el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 4000);
}
export function dialogo(html, aoMontar) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim"><div class="dlg" role="dialog" aria-modal="true">${html}</div></div>`;
  const fechar = () => { m.innerHTML = ''; document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc_);
  m.querySelector('.scrim').addEventListener('click', e => { if (e.target.classList.contains('scrim') || e.target.closest('[data-fechar]')) fechar(); });
  if (aoMontar) aoMontar(m.querySelector('.dlg'), fechar);
  const f = m.querySelector('input,select,textarea,button:not([data-fechar])'); if (f) f.focus();
  return fechar;
}
export function confirmar(msg, okTxt = 'Confirmar', perigo = true, voltarTxt = 'Cancelar') {
  return new Promise(res => {
    dialogo(`<p class="dlg-msg">${esc(msg)}</p><div class="row end"><button class="btn ghost" data-fechar>${esc(voltarTxt)}</button><button class="btn ${perigo ? 'danger' : ''}" data-ok>${esc(okTxt)}</button></div>`,
      (dlg, fechar) => {
        dlg.querySelector('[data-ok]').onclick = () => { fechar(); res(true); };
        dlg.querySelector('[data-fechar]').addEventListener('click', () => res(false));
      });
  });
}
// Símbolo da marca Verdelago Sports Center (areia), para os cabeçalhos escuros
export const LOGO = '<img class="mark" src="img/simbolo-areia.png" alt="" width="46" height="38">';

/**
 * Grelha do dia: linhas = intervalos de passo (30 min), colunas = espaços.
 * itens: [{id, espaco_id, inicio, fim, tipo, label, extra}]
 */
export function grelha({ espacos, dia, itens, passo = 30, clicavel = false, agora = true }) {
  const ini = Math.min(...espacos.map(e => e.abreMin)), fim = Math.max(...espacos.map(e => e.fechaMin));
  const base = lisboa(dia, 0).getTime();
  const nowMin = dia === hoje() && agora ? Math.floor((Date.now() - base) / 60000) : null;
  const slots = []; for (let m = ini; m < fim; m += passo) slots.push(m);
  // por espaço: mapa slot → item que começa ali (ou que já vinha de trás, no 1.º slot)
  const porEsp = {};
  for (const e of espacos) {
    const its = itens.filter(i => i.espaco_id === e.id).map(i => ({
      ...i,
      a: Math.max(ini, Math.floor((new Date(i.inicio).getTime() - base) / 60000 / passo) * passo),
      b: Math.min(fim, Math.ceil((new Date(i.fim).getTime() - base) / 60000 / passo) * passo),
    })).filter(i => i.b > i.a);
    porEsp[e.id] = its;
  }
  const ocupado = {};
  let h = `<div class="grelha-wrap"><table class="grelha"><thead><tr><th class="hcol"></th>${espacos.map(e => `<th scope="col"><span class="gm">${MODALIDADES[e.modalidade]?.icon || ''}</span>${esc(e.nome)}</th>`).join('')}</tr></thead><tbody>`;
  for (const s of slots) {
    const atual = nowMin != null && nowMin >= s && nowMin < s + passo;
    h += `<tr class="${s % 60 === 0 ? 'hh' : ''} ${atual ? 'agora' : ''}"><th scope="row" class="hcol">${s % 60 === 0 || atual ? min2hm(s) : '<span class="meia">' + min2hm(s) + '</span>'}</th>`;
    for (const e of espacos) {
      if (ocupado[e.id + ':' + s]) continue;
      const fora = s < e.abreMin || s >= e.fechaMin;
      const it = porEsp[e.id].find(i => i.a === s);
      if (it) {
        const n = (it.b - it.a) / passo;
        for (let k = 1; k < n; k++) ocupado[e.id + ':' + (s + k * passo)] = 1;
        h += `<td rowspan="${n}" class="oc t-${it.tipo}"${clicavel ? ` data-item="${esc(it.id)}" tabindex="0" role="button"` : ''}><div class="oc-in"><b>${esc(it.label)}</b>${it.extra ? `<span>${it.extra}</span>` : ''}<small>${hora(it.inicio)}–${hora(it.fim)}</small></div></td>`;
      } else if (fora) {
        h += '<td class="fora"></td>';
      } else {
        const passado = nowMin != null && s + passo <= nowMin;
        h += `<td class="livre ${passado ? 'passado' : ''}"${clicavel && !passado ? ` data-livre="${e.id}" data-min="${s}" tabindex="0" role="button" aria-label="${esc(e.nome)} ${min2hm(s)} livre"` : ''}></td>`;
      }
    }
    h += '</tr>';
  }
  return h + '</tbody></table></div>';
}
