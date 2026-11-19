// Torneios de pádel: inscrições, grupos, calendário, resultados, eliminatórias e ecrã TV.
// Vem da app "Torneios de Pádel Verdelago" (artefacto). O estado fica em torneios.dados;
// nome, dias, hora de início e campos são os do torneio (que bloqueia os campos na grelha).
// #/torneio/<id> (staff) · #/tv/torneio[/<id>] (público, via torneio_tv)
import { sb, $, esc, hora, dataLonga, carregarBase, erroTexto, toast, confirmar, LOGO } from './core.js?v=16';

const uid = () => Math.random().toString(36).slice(2, 10);
const LETRAS = 'ABCDEFGHIJKLMNOP';
const DEF = () => ({ duracao: 12, troca: 3, pts: { v: 3, e: 1, d: 0 }, quadro: 'auto', duplas: [], individuais: [], grupos: [], jogos: [], relogio: null });

/* ---------- estado ---------- */
let B = null, R = null, T = null, app = null, aba = 'torneio', mostrarFeitos = false, timers = [];
let aGuardar = false, pendente_ = false, tGuardar = null, estadoLig = 'ok';

function montar(row) {
  R = row;
  const d = { ...DEF(), ...(row.dados || {}) };
  d.pts = { ...DEF().pts, ...(d.pts || {}) };
  const ordem = id => B.espacos.findIndex(e => e.id === id);
  T = { ...d, nome: row.nome, data: row.data, inicio: String(row.hora_inicio || '09:00').slice(0, 5), fimBloq: String(row.hora_fim || '').slice(0, 5),
    campos: [...(row.espacos || [])].sort((a, b) => ordem(a) - ordem(b)) };
}
const dadosDe = t => ({ duracao: t.duracao, troca: t.troca, pts: t.pts, quadro: t.quadro, duplas: t.duplas, individuais: t.individuais, grupos: t.grupos, jogos: t.jogos, relogio: t.relogio });

/* ---------- utilidades ---------- */
function baralhar(a, r = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const hm2min = s => { const [h, m] = String(s || '09:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const min2hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const passo = t => (+t.duracao || 0) + (+t.troca || 0);
const horaSlot = (t, s) => min2hm(hm2min(t.inicio) + s * passo(t));
const dupla = (t, id) => t.duplas.find(d => d.id === id);
const nomeD = (t, id) => { const d = dupla(t, id); return d ? `${d.j1} / ${d.j2}` : '—'; };
const jogo = id => T.jogos.find(m => m.id === id);
const forca = d => (+d.n1 || 4) + (+d.n2 || 4);
const nomeCampo = id => B.espacos.find(e => e.id === id)?.nome || String(id);
const ordCampo = id => { const i = T.campos.indexOf(id); return i < 0 ? 99 : i; };
const porCampo = (a, b) => ordCampo(a.campo) - ordCampo(b.campo);
const fimPrevisto = t => { const gj = t.jogos.filter(m => m.slot != null); if (!gj.length) return null; const last = Math.max(...gj.map(m => m.slot)); return hm2min(t.inicio) + (last + 1) * passo(t) - (+t.troca || 0); };

/* ---------- grupos e calendário ---------- */
function roundRobin(ids) {
  const t = [...ids]; if (t.length % 2) t.push(null);
  const n = t.length, rondas = [];
  for (let r = 0; r < n - 1; r++) { const ms = []; for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) ms.push([a, b]); } rondas.push(ms); t.splice(1, 0, t.pop()); }
  return rondas;
}
function agendar(ms, campos, inicioSlot) {
  let resto = [...ms].sort((x, y) => x.r - y.r || String(x.grupo).localeCompare(String(y.grupo)));
  let slot = inicioSlot, ant = new Set();
  const nc = Math.max(1, campos.length);
  while (resto.length) {
    const usados = new Set(), esc_ = [];
    for (const pass of [0, 1]) for (const m of resto) {
      if (esc_.length >= nc) break;
      if (esc_.includes(m) || usados.has(m.a) || usados.has(m.b)) continue;
      if (pass === 0 && (ant.has(m.a) || ant.has(m.b))) continue;
      esc_.push(m); usados.add(m.a); usados.add(m.b);
    }
    esc_.sort((x, y) => String(x.grupo).localeCompare(String(y.grupo)));
    esc_.forEach((m, i) => { m.slot = slot; m.campo = campos[i] ?? (i + 1); });
    resto = resto.filter(m => !esc_.includes(m)); ant = usados; slot++;
  }
  return slot;
}
function distribuir(ds, n) {
  const gs = Array.from({ length: n }, (_, i) => ({ id: LETRAS[i], duplas: [] }));
  ds.forEach((d, i) => { const row = Math.floor(i / n), col = i % n; gs[row % 2 === 0 ? col : n - 1 - col].duplas.push(d.id); });
  return gs;
}
function gerarGrupos(t, n, modo) {
  const ds = [...t.duplas];
  if (modo === 'sorteio' || !ds.some(d => d.n1 || d.n2)) baralhar(ds); else ds.sort((a, b) => forca(a) - forca(b));
  n = Math.max(1, Math.min(n, Math.floor(ds.length / 2) || 1, 16));
  const gs = distribuir(ds, n), ms = [];
  gs.forEach(g => roundRobin(g.duplas).forEach((rd, ri) => rd.forEach(([a, b]) => ms.push({ id: uid(), fase: 'grupo', grupo: g.id, r: ri, a, b, ga: null, gb: null }))));
  agendar(ms, t.campos, 0);
  ms.sort((x, y) => x.slot - y.slot || porCampo(x, y));
  t.grupos = gs; t.jogos = ms; t.relogio = null;
}
function simular(t, n) {
  const N = t.duplas.length; n = Math.max(1, Math.min(n, Math.floor(N / 2) || 1, 16));
  const fake = Array.from({ length: N }, (_, i) => ({ id: 'd' + i }));
  const gs = distribuir(fake, n), ms = [];
  gs.forEach(g => roundRobin(g.duplas).forEach((rd, ri) => rd.forEach(([a, b]) => ms.push({ grupo: g.id, r: ri, a, b }))));
  const slots = agendar(ms, t.campos.length ? t.campos : [1], 0);
  return { n, tam: gs.map(g => g.duplas.length), jogos: ms.length, slots };
}

/* ---------- classificação ---------- */
function jogado(m) { return m.ga != null && m.gb != null && !(m.fase === 'ko' && m.ga === m.gb && !m.desempate); }
function classif(t, g) {
  const rows = g.duplas.map(id => ({ id, J: 0, V: 0, E: 0, D: 0, JG: 0, JP: 0, P: 0 })), by = Object.fromEntries(rows.map(r => [r.id, r]));
  const ms = t.jogos.filter(m => m.fase === 'grupo' && m.grupo === g.id && m.ga != null && m.gb != null);
  for (const m of ms) {
    const A = by[m.a], Bq = by[m.b]; if (!A || !Bq) continue;
    A.J++; Bq.J++; A.JG += m.ga; A.JP += m.gb; Bq.JG += m.gb; Bq.JP += m.ga;
    if (m.ga > m.gb) { A.V++; Bq.D++; A.P += +t.pts.v; Bq.P += +t.pts.d; }
    else if (m.gb > m.ga) { Bq.V++; A.D++; Bq.P += +t.pts.v; A.P += +t.pts.d; }
    else { A.E++; Bq.E++; A.P += +t.pts.e; Bq.P += +t.pts.e; }
  }
  const h2h = (a, b) => { const m = ms.find(x => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id)); if (!m || m.ga === m.gb) return 0; const wa = (m.a === a.id) === (m.ga > m.gb); return wa ? -1 : 1; };
  rows.sort((a, b) => b.P - a.P || (b.JG - b.JP) - (a.JG - a.JP) || b.JG - a.JG || h2h(a, b) || nomeD(t, a.id).localeCompare(nomeD(t, b.id)));
  return rows;
}
function folgas(t, s) {
  const out = [];
  for (const g of t.grupos) {
    const js = t.jogos.filter(m => m.fase === 'grupo' && m.grupo === g.id && m.slot === s);
    if (!js.length) continue;
    const jogam = new Set(js.flatMap(m => [m.a, m.b]));
    g.duplas.filter(id => !jogam.has(id)).forEach(id => out.push(id));
  }
  return out;
}
const pow2floor = n => { let s = 1; while (s * 2 <= n) s *= 2; return s; };
const pow2ceil = n => { let s = 1; while (s < n) s *= 2; return s; };
function tamanhoQuadro(t) {
  const nq = t.duplas.length;
  const s = t.quadro === 'auto' ? Math.max(2, pow2floor(Math.max(2, t.grupos.length * 2))) : +t.quadro;
  return Math.max(2, Math.min(s, pow2ceil(Math.max(2, nq))));
}
function qualificados(t, size) {
  const tabs = t.grupos.map(g => ({ g, rows: classif(t, g) }));
  const max = Math.max(0, ...tabs.map(x => x.rows.length)), out = [];
  const pj = (r, k) => r[k] / (r.J || 1);
  for (let p = 0; p < max && out.length < size; p++) {
    const lvl = tabs.filter(x => x.rows[p]).map(x => ({ ...x.rows[p], grupo: x.g.id, pos: p + 1 }));
    lvl.sort((a, b) => pj(b, 'P') - pj(a, 'P') || ((b.JG - b.JP) / (b.J || 1)) - ((a.JG - a.JP) / (a.J || 1)) || pj(b, 'JG') - pj(a, 'JG'));
    for (const q of lvl) if (out.length < size) out.push(q);
  }
  return out;
}
function seedOrder(n) { let o = [1]; while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap(x => [x, m - x]); } return o; }
const NOME_RONDA = { 1: 'Final', 2: 'Meias-finais', 4: 'Quartos de final', 8: 'Oitavos de final', 16: '16 avos de final' };
const COD_RONDA = { 1: 'F', 2: 'MF', 4: 'QF', 8: 'OF', 16: 'R' };
function gerarKO(t) {
  let size = tamanhoQuadro(t);
  let q = qualificados(t, size);
  size = Math.max(2, Math.min(size, pow2ceil(q.length))); q = q.slice(0, size);
  const ord = seedOrder(size), pares = [];
  for (let i = 0; i < size; i += 2) pares.push([q[ord[i] - 1] || null, q[ord[i + 1] - 1] || null]);
  for (let i = 0; i < pares.length; i++) {
    const [a, b] = pares[i];
    if (a && b && a.grupo === b.grupo) {
      for (let j = pares.length - 1; j >= 0; j--) {
        if (j === i) continue; const x = pares[j][1];
        if (x && x.grupo !== a.grupo && (!pares[j][0] || pares[j][0].grupo !== b.grupo)) { pares[i][1] = x; pares[j][1] = b; break; }
      }
    }
  }
  t.jogos = t.jogos.filter(m => m.fase !== 'ko');
  let slot = Math.max(-1, ...t.jogos.map(m => m.slot ?? -1)) + 1;
  const campos = t.campos.length ? t.campos : [1];
  let ant = [];
  for (let r = 0; 2 ** r < size; r++) {
    const nm = size / 2 ** (r + 1), cur = [];
    for (let i = 0; i < nm; i++) {
      const m = { id: uid(), fase: 'ko', ronda: r, nm, idx: i, ga: null, gb: null, desempate: null, slot: null, campo: null };
      if (r === 0) { const [a, b] = pares[i]; m.a = a ? a.id : null; m.b = b ? b.id : null; m.semA = a ? `${a.pos}º ${a.grupo}` : ''; m.semB = b ? `${b.pos}º ${b.grupo}` : ''; m.bye = !m.a || !m.b; }
      else { m.srcA = ant[2 * i].id; m.srcB = ant[2 * i + 1].id; }
      cur.push(m);
    }
    const jog = cur.filter(m => !m.bye);
    for (let k = 0; k < jog.length; k += campos.length) { jog.slice(k, k + campos.length).forEach((m, j) => { m.slot = slot; m.campo = campos[j]; }); slot++; }
    t.jogos.push(...cur); ant = cur;
  }
  t.relogio = null;
}
function lado(m, s) {
  if (m.fase !== 'ko' || m.ronda === 0) return m[s] || null;
  const src = T.jogos.find(x => x.id === m[s === 'a' ? 'srcA' : 'srcB']); return src ? vencedor(src) : null;
}
const equipas = m => [lado(m, 'a'), lado(m, 'b')];
function vencedor(m) {
  const [A, Bq] = equipas(m);
  if (m.fase === 'ko' && m.bye) return A || Bq;
  if (!A || !Bq || m.ga == null || m.gb == null) return null;
  if (m.ga > m.gb) return A; if (m.gb > m.ga) return Bq;
  return m.desempate === 'a' ? A : m.desempate === 'b' ? Bq : null;
}
const codKO = m => COD_RONDA[m.nm] === 'F' ? 'Final' : (COD_RONDA[m.nm] || 'R') + (m.idx + 1);
function pendente(m, s) {
  if (m.fase === 'ko' && m.ronda > 0) { const src = T.jogos.find(x => x.id === m[s === 'a' ? 'srcA' : 'srcB']); return src ? 'Vencedor ' + codKO(src) : 'A definir'; }
  return 'A definir';
}
const faseGruposFeita = () => T.jogos.filter(m => m.fase === 'grupo').every(jogado);
const temKO = () => T.jogos.some(m => m.fase === 'ko');
function campeao() { const f = T.jogos.find(m => m.fase === 'ko' && m.nm === 1); return f ? vencedor(f) : null; }
function slotAtual() {
  if (T.relogio) return T.relogio.slot;
  const p = T.jogos.filter(m => m.slot != null && !jogado(m)).map(m => m.slot); return p.length ? Math.min(...p) : null;
}
function proxSlot(s) { const p = T.jogos.filter(m => m.slot != null && m.slot > s && !jogado(m)).map(m => m.slot); return p.length ? Math.min(...p) : null; }
const relogioAtivo = slot => T.relogio && T.relogio.slot === slot;

/* =====================================================================
   Página do staff
   ===================================================================== */
export async function paginaTorneio(el, id) {
  app = el; pararTorneio();
  document.documentElement.lang = 'pt';
  const { data: { session } } = await sb.auth.getSession();
  const { data: ok } = session ? await sb.rpc('e_staff') : { data: false };
  if (!ok) { location.hash = '#/rececao'; return; }
  try { B = B || await carregarBase(); } catch (e) { toast(erroTexto(e), 'erro'); return; }
  aba = 'torneio';
  if (!await carregar(id)) return;
  render();
  // Outros aparelhos podem estar a lançar resultados: atualiza quando não há nada por gravar.
  timers.push(setInterval(atualizarCrono, 1000));
  timers.push(setInterval(async () => {
    if (aGuardar || pendente_ || document.activeElement?.matches('input,select,textarea') || $('#modal').innerHTML) return;
    const { data } = await sb.from('torneios').select('atualizado_em').eq('id', R.id).maybeSingle();
    if (data && data.atualizado_em !== R.atualizado_em && await carregar(R.id)) render();
  }, 15000));
}
export function pararTorneio() { timers.forEach(clearInterval); timers = []; }

async function carregar(id) {
  const { data, error } = await sb.from('torneios').select('*').eq('id', id).maybeSingle();
  if (error || !data) { app.innerHTML = `<main><div class="card vazio stack"><p>${esc(error ? erroTexto(error) : 'Torneio não encontrado.')}</p><div><a class="btn ghost" href="#/rececao">Voltar à receção</a></div></div></main>`; return false; }
  montar(data); return true;
}

function commit() {
  render();
  pendente_ = true; estadoLig = 'a-guardar'; renderLig();
  clearTimeout(tGuardar); tGuardar = setTimeout(guardar, 500);
}
async function guardar() {
  if (aGuardar) { tGuardar = setTimeout(guardar, 300); return; }
  aGuardar = true; pendente_ = false;
  // Só grava se ninguém mudou o torneio entretanto (atualizado_em igual ao que lemos).
  const { data, error } = await sb.from('torneios').update({ dados: dadosDe(T) }).eq('id', R.id).eq('atualizado_em', R.atualizado_em).select('atualizado_em');
  aGuardar = false;
  if (error) { estadoLig = 'erro'; renderLig(); toast('Não foi possível guardar: ' + erroTexto(error), 'erro'); return; }
  if (!data.length) {
    estadoLig = 'ok'; toast('O torneio foi alterado noutro aparelho. Recarreguei: confirme a última alteração.', 'erro');
    if (await carregar(R.id)) render(); return;
  }
  R.atualizado_em = data[0].atualizado_em; R.dados = dadosDe(T);
  estadoLig = pendente_ ? 'a-guardar' : 'ok'; renderLig();
}
const pillLig = () => `<span class="pill">${{ ok: 'Guardado', 'a-guardar': 'A guardar…', erro: 'Erro ao guardar' }[estadoLig]}</span>`;
function renderLig() { const el = $('#estado-lig'); if (el) el.innerHTML = pillLig(); }

const VIEWS = { torneio: vTorneio, inscricoes: vInscricoes, grupos: vGrupos, jogos: vJogos, quadro: vQuadro };
function render() {
  const tabs = [['torneio', 'Torneio'], ['inscricoes', 'Inscrições'], ['grupos', 'Grupos'], ['jogos', 'Jogos'], ['quadro', 'Eliminatórias']];
  const y = scrollY;
  app.innerHTML = `<header class="top"><div class="brand">${LOGO}<div><div class="eyebrow">Verdelago · Pádel</div><div class="tname">${esc(T.nome)}</div></div></div>
    <div class="top-r"><span class="pill crono" id="bo-crono" hidden></span><span id="estado-lig">${pillLig()}</span><a class="btn small on-dark" href="#/rececao">Receção</a></div></header>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/torneio/${R.id}" data-aba="${k}" class="${k === aba ? 'on' : ''}">${l}</a>`).join('')}<a class="tvlink" href="#/tv/torneio/${R.id}" target="_blank" rel="noopener">Ecrã TV ↗</a></nav>
    ${avisos()}<main>${VIEWS[aba]()}</main>`;
  app.querySelectorAll('[data-aba]').forEach(a => a.onclick = e => { e.preventDefault(); aba = a.dataset.aba; render(); scrollTo(0, 0); });
  atualizarCrono();
  scrollTo(0, y);
}
function avisos() {
  const a = [];
  if (!T.campos.length) a.push(['av-warn', 'Este torneio não tem campos. Escolha-os em Torneio › Dias, horas e campos.']);
  if (T.jogos.some(m => m.campo != null && !T.campos.includes(m.campo))) a.push(['av-warn', 'Os campos do torneio mudaram depois de gerar os jogos. Volte a gerar os grupos (ou o quadro) para usar os campos novos.']);
  const f = fimPrevisto(T);
  if (f != null && T.fimBloq && f > hm2min(T.fimBloq)) a.push(['av-warn', `Os jogos acabam às ${min2hm(f)}, mas os campos só estão bloqueados até às ${T.fimBloq}. <button class="btn small" data-act="estenderBloq">Bloquear até às ${min2hm(Math.ceil(f / 30) * 30)}</button>`]);
  return a.length ? `<div class="aviso stack">${a.map(([c, t]) => `<div class="${c}">${t}</div>`).join('')}</div>` : '';
}
const vazio = t => `<div class="card vazio">${t}</div>`;
const optNivel = (sel, id, lbl) => `<label class="f" for="${id}">${lbl}<select id="${id}" name="${id.split('-').pop()}"><option value="">—</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${+sel === n ? 'selected' : ''}>Nível ${n}</option>`).join('')}</select></label>`;
const nv = n => n ? `<span class="nv" title="Nível ${n}">N${n}</span>` : '';

function vTorneio() {
  const gj = T.jogos.filter(m => m.slot != null), feitos = gj.filter(jogado).length;
  const f = fimPrevisto(T), c = campeao();
  const dias = T.data ? (R.data_fim && R.data_fim !== R.data ? `${dataLonga(R.data)} a ${dataLonga(R.data_fim)}` : dataLonga(T.data)) : 'Sem data';
  return `${c ? `<div class="campeao"><span class="eyebrow">Vencedores</span><b>${esc(nomeD(T, c))}</b></div>` : ''}
  <div class="tiles">
    <div class="tile"><b>${T.duplas.length}</b><span>duplas inscritas${T.individuais.length ? ` · ${T.individuais.length} sem par` : ''}</span></div>
    <div class="tile"><b>${T.grupos.length || '—'}</b><span>grupos</span></div>
    <div class="tile"><b>${feitos}/${gj.length}</b><span>jogos com resultado</span></div>
    <div class="tile"><b>${f != null ? min2hm(f) : '—'}</b><span>fim previsto</span></div>
  </div>
  <section class="card stack"><div class="row between"><h2>Dias, horas e campos</h2><button class="btn ghost small" data-act="editarBloq">Alterar</button></div>
    <p style="margin:0"><span class="cap">${esc(dias)}</span> · primeiro jogo às <b>${esc(T.inicio)}</b> · campos bloqueados até às <b>${esc(T.fimBloq)}</b></p>
    <p style="margin:0">${T.campos.length ? T.campos.map(c => `<span class="chip">${esc(nomeCampo(c))}</span>`).join(' ') : '<span class="chip warn">sem campos</span>'}</p>
    <p class="small muted" style="margin:0">Estes campos ficam bloqueados na grelha da receção e os hóspedes não os podem reservar.${R.publico ? '' : ' Torneio privado: o ecrã TV público não o mostra.'}</p>
  </section>
  <section class="card stack"><h2>Regras</h2>
    <div class="fgrid">
      <label class="f" for="c-dur">Duração do jogo (min)<input type="number" min="5" max="60" id="c-dur" data-cfg="duracao" value="${T.duracao}"></label>
      <label class="f" for="c-troca">Troca entre jogos (min)<input type="number" min="0" max="30" id="c-troca" data-cfg="troca" value="${T.troca}"></label>
      <label class="f" for="c-pv">Pontos por vitória<input type="number" min="0" id="c-pv" data-cfg="pts.v" value="${T.pts.v}"></label>
      <label class="f" for="c-pe">Pontos por empate<input type="number" min="0" id="c-pe" data-cfg="pts.e" value="${T.pts.e}"></label>
      <label class="f" for="c-pd">Pontos por derrota<input type="number" min="0" id="c-pd" data-cfg="pts.d" value="${T.pts.d}"></label>
      <label class="f" for="c-quadro">Quadro de eliminatórias<select id="c-quadro" data-cfg="quadro">${[['auto', 'Automático'], ['2', 'Final direta (2)'], ['4', '4 duplas'], ['8', '8 duplas'], ['16', '16 duplas']].map(([v, l]) => `<option value="${v}" ${String(T.quadro) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <p class="small muted">Jogos a tempo corrido: ganha quem tiver mais jogos quando o tempo acaba. Os horários atualizam-se sozinhos se mudar a hora de início, a duração ou a troca. Se mudar os campos, volte a gerar os grupos.</p>
  </section>`;
}

function vInscricoes() {
  return `${T.grupos.length ? '<div class="aviso" style="padding:0;margin:0"><div class="av-warn">Os grupos já foram gerados. Novas duplas só entram depois de voltar a gerar os grupos.</div></div>' : ''}
  <div class="grid2">
  <form class="card stack" data-act="addDupla"><h2>Inscrever dupla</h2>
    <div class="fgrid">
      <label class="f" for="d-j1">Jogador 1<input type="text" id="d-j1" name="j1" required></label>${optNivel('', 'd-n1', 'Nível')}
      <label class="f" for="d-j2">Jogador 2<input type="text" id="d-j2" name="j2" required></label>${optNivel('', 'd-n2', 'Nível')}
      <label class="f wide" for="d-tel">Contacto (opcional)<input type="text" id="d-tel" name="tel" inputmode="tel"></label>
    </div><div class="row end"><button class="btn">Inscrever dupla</button></div>
  </form>
  <form class="card stack" data-act="addInd"><h2>Inscrição individual</h2>
    <div class="fgrid">
      <label class="f" for="i-nome">Jogador<input type="text" id="i-nome" name="nome" required></label>${optNivel('', 'i-nivel', 'Nível')}
      <label class="f wide" for="i-tel">Contacto (opcional)<input type="text" id="i-tel" name="tel" inputmode="tel"></label>
    </div><div class="row end"><button class="btn">Inscrever jogador</button></div>
  </form></div>
  <p class="small muted" style="margin:0">Nível de 1 (mais forte) a 6, como nos escalões M1–M6 / F1–F6. Serve para equilibrar duplas e grupos. Os contactos só são vistos pela receção.</p>
  ${vSemPar()}
  <section class="card stack"><div class="row between"><h2>Duplas inscritas (${T.duplas.length})</h2>${T.duplas.some(d => d.formada) ? '<button class="btn ghost small" data-act="desfazer">Desfazer duplas formadas</button>' : ''}</div>
    ${T.duplas.length ? `<ul class="lista">${T.duplas.map((d, i) => `<li><span><span class="num">${i + 1}</span>${esc(d.j1)}${nv(d.n1)} / ${esc(d.j2)}${nv(d.n2)}${d.formada ? ' <span class="chip">formada</span>' : ''}${d.tel ? ` <span class="muted small">· ${esc(d.tel)}</span>` : ''}</span><button class="x" data-act="delDupla" data-id="${d.id}" aria-label="Remover dupla">×</button></li>`).join('')}</ul>` : '<p class="muted">Ainda não há duplas.</p>'}
  </section>`;
}

// Inscrições individuais: validar cada jogador (presença, nível) e só depois gerar as duplas.
function vSemPar() {
  const ps = T.individuais, val = ps.filter(p => p.validado).length, falta = ps.length - val;
  const temNivel = ps.filter(p => p.nivel).length >= ps.length / 2; // sorteio, a não ser que a maioria tenha nível
  const nF = ps.filter(p => p.sexo === 'F').length, nM = ps.filter(p => p.sexo === 'M').length;
  const misto = nF > 0 && nM > 0 && nF + nM === ps.length; // todos com F/M e há dos dois: sugerir duplas mistas
  const pode = ps.length >= 2 && !falta;
  const optS = p => `<select data-sexo="${p.id}" aria-label="${esc(p.nome)}: F ou M" style="min-height:36px"><option value="">F/M</option><option value="F" ${p.sexo === 'F' ? 'selected' : ''}>F</option><option value="M" ${p.sexo === 'M' ? 'selected' : ''}>M</option></select>`;
  const optN = p => `<select data-nivel="${p.id}" aria-label="Nível de ${esc(p.nome)}" style="min-height:36px"><option value="">Nível —</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${+p.nivel === n ? 'selected' : ''}>Nível ${n}</option>`).join('')}</select>`;
  return `<section class="card stack"><div class="row between"><h2>Inscrições individuais (${ps.length})</h2>
    ${ps.length ? `<span class="chip ${falta ? 'warn' : 'ok'}">${falta ? `${val} de ${ps.length} validadas` : 'Todas validadas'}</span>` : ''}</div>
    ${ps.length ? `<p class="small muted" style="margin:0">Confirme cada inscrição (o jogador está presente e quer jogar), indique F/M para as duplas mistas e, se souber, o nível.${nF + nM ? ` ${nF} F · ${nM} M.` : ''} Quem não vier, remova com ×. Quando todas estiverem validadas, gere as duplas.</p>
    <ul class="lista">${ps.map((p, i) => `<li><label class="row nowrap" style="gap:10px;cursor:pointer;flex:1;min-width:0"><input type="checkbox" data-valida="${p.id}" ${p.validado ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent);flex:none"><span class="num">${i + 1}</span><span style="min-width:0">${esc(p.nome)}${p.tel ? ` <span class="muted small">· ${esc(p.tel)}</span>` : ''}</span></label>
      <span class="row nowrap">${optS(p)}${optN(p)}<button class="x" data-act="delInd" data-id="${p.id}" aria-label="Remover ${esc(p.nome)}">×</button></span></li>`).join('')}</ul>
    <div class="row between">
      <button class="btn ghost small" data-act="validarTodas" ${falta ? '' : 'disabled'}>Validar todas</button>
      <div class="row"><select id="modo-formar" aria-label="Como formar duplas"><option value="misto" ${misto ? 'selected' : ''}>Mistas: uma rapariga + um rapaz</option><option value="sorteio" ${!misto && !temNivel ? 'selected' : ''}>Sorteio</option><option value="equilibrado" ${!misto && temNivel ? 'selected' : ''}>Equilibradas por nível (forte + menos forte)</option><option value="semelhante">Nível semelhante</option></select>
      <button class="btn" data-act="formar" ${pode ? '' : 'disabled'}>Gerar duplas</button></div>
    </div>
    ${!pode ? `<p class="small muted" style="margin:0;text-align:right">${ps.length < 2 ? 'São precisos pelo menos 2 jogadores.' : `Falta${falta > 1 ? 'm' : ''} validar ${falta} inscriç${falta > 1 ? 'ões' : 'ão'}.`}</p>` : ps.length % 2 ? '<p class="small muted" style="margin:0;text-align:right">Número ímpar: 1 jogador fica à espera de par.</p>' : ''}`
    : '<p class="muted">Ninguém à espera de par.</p>'}
  </section>`;
}

function tabela(g, quals) {
  const rows = classif(T, g);
  return `<table class="cl"><thead><tr><th>#</th><th>Dupla</th><th>J</th><th>V</th><th>E</th><th>D</th><th>Jogos</th><th>Dif</th><th>Pts</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr class="${quals.has(r.id) ? 'q' : ''}"><td>${i + 1}</td><td>${esc(nomeD(T, r.id))}</td><td>${r.J}</td><td>${r.V}</td><td>${r.E}</td><td>${r.D}</td><td>${r.JG}-${r.JP}</td><td>${r.JG - r.JP > 0 ? '+' : ''}${r.JG - r.JP}</td><td class="pts">${r.P}</td></tr>`).join('')}</tbody></table>`;
}
function prevGrupos(n) {
  if (T.duplas.length < 2) return 'São precisas pelo menos 2 duplas.';
  if (!T.campos.length) return 'O torneio ainda não tem campos.';
  const s = simular(T, n), fim = min2hm(hm2min(T.inicio) + s.slots * passo(T) - (+T.troca || 0));
  return `${T.duplas.length} duplas em <b>${s.n} grupo${s.n > 1 ? 's' : ''}</b> (${s.tam.join(', ')}) · <b>${s.jogos} jogos</b> em ${s.slots} rondas nos ${T.campos.length} campos · fase de grupos das ${esc(T.inicio)} às ${fim}`;
}
function vGrupos() {
  const N = T.duplas.length, sug = Math.max(1, Math.round(N / 4));
  const n = T.grupos.length || sug;
  const quals = new Set(T.grupos.length ? qualificados(T, tamanhoQuadro(T)).map(q => q.id) : []);
  return `<section class="card stack"><h2>Gerar grupos</h2>
    <div class="row">
      <label class="f" for="n-grupos">N.º de grupos<input type="number" id="n-grupos" min="1" max="16" value="${n}" style="width:90px"></label>
      <label class="f" for="modo-grupos">Distribuição<select id="modo-grupos"><option value="nivel">Cabeças de série por nível</option><option value="sorteio">Sorteio</option></select></label>
      <button class="btn" data-act="gerarGrupos" style="align-self:flex-end" ${N < 2 || !T.campos.length ? 'disabled' : ''}>${T.grupos.length ? 'Voltar a gerar grupos' : 'Gerar grupos e calendário'}</button>
    </div>
    <div class="prev" id="prev-grupos">${prevGrupos(n)}</div>
    <p class="small muted" style="margin:0">Sugestão: grupos de 4 (${sug} para ${N} duplas). Todos jogam contra todos no grupo; o calendário evita que uma dupla jogue duas rondas seguidas sempre que possível.</p>
  </section>
  ${T.grupos.length ? destaqueFolgas() : ''}
  ${T.grupos.length ? `<p class="small muted" style="margin:0">A barra verde marca quem está, neste momento, nos lugares de apuramento para um quadro de ${tamanhoQuadro(T)}.</p>
  <div class="grid2">${T.grupos.map(g => `<section class="card gcard stack"><h3>Grupo ${g.id}<span class="small muted">${T.jogos.filter(m => m.grupo === g.id && jogado(m)).length}/${T.jogos.filter(m => m.grupo === g.id).length} jogos</span></h3>${tabela(g, quals)}</section>`).join('')}</div>` : vazio('Ainda não há grupos.')}`;
}

function cardJogo(m) {
  const [A, Bq] = equipas(m), ko = m.fase === 'ko', feito = jogado(m), w = vencedor(m);
  const live = relogioAtivo(m.slot) && !feito;
  const dis = (!A || !Bq) ? 'disabled' : '';
  const nA = A ? esc(nomeD(T, A)) : `<span class="pend">${esc(pendente(m, 'a'))}</span>`;
  const nB = Bq ? esc(nomeD(T, Bq)) : `<span class="pend">${esc(pendente(m, 'b'))}</span>`;
  const empate = ko && m.ga != null && m.ga === m.gb;
  const chip = feito ? '<span class="chip ok">Terminado</span>' : empate ? '<span class="chip warn">Falta desempate</span>' : live ? '<span class="chip live">Em jogo</span>' : '';
  return `<article class="jogo ${feito ? 'feito' : live ? 'live' : ''}">
    <div class="jmeta"><span class="chip">${ko ? codKO(m) : 'Grupo ' + m.grupo}</span><span>${m.slot != null ? `${esc(nomeCampo(m.campo))} · ${horaSlot(T, m.slot)}` : ''}</span>${chip}</div>
    <form class="placar" data-act="res" data-id="${m.id}">
      <div class="lado ${w && w === A ? 'ganha' : ''}"><span class="nome">${nA}${ko && m.semA ? ` <span class="muted small">${m.semA}</span>` : ''}</span><input type="number" min="0" max="99" inputmode="numeric" name="ga" aria-label="Jogos ganhos, primeira dupla" value="${m.ga ?? ''}" ${dis}></div>
      <div class="lado ${w && w === Bq ? 'ganha' : ''}"><span class="nome">${nB}${ko && m.semB ? ` <span class="muted small">${m.semB}</span>` : ''}</span><input type="number" min="0" max="99" inputmode="numeric" name="gb" aria-label="Jogos ganhos, segunda dupla" value="${m.gb ?? ''}" ${dis}></div>
      <div class="acoes"><button class="btn small" ${dis}>Guardar resultado</button></div>
    </form>
    ${empate && A && Bq ? `<div class="desempate"><span>Empatado no fim do tempo. Quem ganhou o ponto decisivo?</span><div class="row"><button class="btn small ${m.desempate === 'a' ? 'on' : 'ghost'}" data-act="desempate" data-id="${m.id}" data-lado="a">${esc(dupla(T, A).j1)}…</button><button class="btn small ${m.desempate === 'b' ? 'on' : 'ghost'}" data-act="desempate" data-id="${m.id}" data-lado="b">${esc(dupla(T, Bq).j1)}…</button></div></div>` : ''}
  </article>`;
}
const nomesFolga = s => folgas(T, s).map(id => `<b>${esc(nomeD(T, id))}</b>`).join(' · ');
function destaqueFolgas() {
  const s = slotAtual(); if (s == null) return '';
  const p = proxSlot(s), lin = [];
  const titulo = x => { const m = T.jogos.find(j => j.slot === x); return m && m.fase === 'ko' ? (NOME_RONDA[m.nm] || 'Eliminatória') : 'Ronda ' + (x + 1); };
  const f1 = nomesFolga(s), f2 = p != null ? nomesFolga(p) : '';
  if (f1) lin.push(`<div><span class="muted">${titulo(s)} (agora) · folga${folgas(T, s).length > 1 ? 'm' : ''}:</span> ${f1}</div>`);
  if (f2) lin.push(`<div><span class="muted">${titulo(p)} (a seguir) · folga${folgas(T, p).length > 1 ? 'm' : ''}:</span> ${f2}</div>`);
  return lin.length ? `<div class="folga-box">${lin.join('')}</div>` : '';
}
function vJogos() {
  const ms = T.jogos.filter(m => m.slot != null);
  if (!ms.length) return vazio('Ainda não há jogos. Gere os grupos no separador Grupos.');
  const slots = [...new Set(ms.map(m => m.slot))].sort((a, b) => a - b);
  const feitos = ms.filter(jogado).length;
  let html = `<div class="row between"><h2>Calendário · ${feitos}/${ms.length} jogos</h2><label class="row small" for="mostrar-feitos"><input type="checkbox" id="mostrar-feitos" ${mostrarFeitos ? 'checked' : ''}> Mostrar rondas terminadas</label></div>`;
  html += destaqueFolgas();
  let escondidas = 0;
  for (const s of slots) {
    const js = ms.filter(m => m.slot === s).sort(porCampo);
    if (!mostrarFeitos && js.every(jogado)) { escondidas++; continue; }
    const ko = js[0].fase === 'ko';
    html += `<section><div class="slothead"><h3>${ko ? esc(NOME_RONDA[js[0].nm] || 'Eliminatória') : 'Ronda ' + (s + 1)}<span>${horaSlot(T, s)}</span></h3>
      ${relogioAtivo(s) ? '<span class="row"><b class="crono-grande" data-crono></b><button class="btn small on" data-act="pararRelogio">Parar cronómetro</button></span>' : `<button class="btn small ghost" data-act="relogio" data-slot="${s}">Iniciar cronómetro (${T.duracao} min)</button>`}</div>
      ${(f => f.length ? `<p class="folga"><span>Folga${f.length > 1 ? 'm' : ''}:</span> ${f.map(id => `<b>${esc(nomeD(T, id))}</b>`).join(' · ')}</p>` : '')(folgas(T, s))}
      <div class="jogos">${js.map(cardJogo).join('')}</div></section>`;
  }
  if (escondidas) html += `<p class="small muted">${escondidas} ronda${escondidas > 1 ? 's' : ''} terminada${escondidas > 1 ? 's' : ''} escondida${escondidas > 1 ? 's' : ''}.</p>`;
  return html;
}
function vQuadro() {
  if (!T.grupos.length) return vazio('Primeiro gere os grupos.');
  const size = tamanhoQuadro(T);
  if (!temKO()) {
    const q = qualificados(T, size);
    const falta = T.jogos.filter(m => m.fase === 'grupo' && !jogado(m)).length;
    return `<section class="card stack"><h2>Eliminatórias</h2>
      <p>Quadro de <b>${Math.min(size, pow2ceil(q.length))} duplas</b>. Passam primeiro os 1.º classificados, depois os melhores 2.º, e assim por diante. Entre grupos de tamanhos diferentes compara-se a média de pontos por jogo, depois a diferença de jogos.</p>
      ${falta ? `<div class="prev">Ainda faltam ${falta} jogos da fase de grupos. A lista abaixo é provisória.</div>` : ''}
      <ul class="lista">${q.map((x, i) => `<li><span><span class="num">${i + 1}</span>${esc(nomeD(T, x.id))}</span><span class="chip">${x.pos}º Grupo ${x.grupo}</span></li>`).join('')}</ul>
      <div class="row end"><button class="btn" data-act="gerarKO">Gerar quadro de eliminatórias</button></div></section>`;
  }
  const ko = T.jogos.filter(m => m.fase === 'ko');
  const rondas = [...new Set(ko.map(m => m.ronda))].sort((a, b) => a - b);
  const c = campeao();
  return `${c ? `<div class="campeao"><span class="eyebrow">Vencedores</span><b>${esc(nomeD(T, c))}</b></div>` : ''}
  <div class="row between"><h2>Quadro final</h2><button class="btn ghost small" data-act="refazerKO">Refazer quadro</button></div>
  <div class="bracket">${rondas.map(r => {
    const js = ko.filter(m => m.ronda === r).sort((a, b) => a.idx - b.idx);
    return `<div class="bcol"><h3>${esc(NOME_RONDA[js[0].nm] || '')}</h3>${js.map(m => m.bye ? `<div class="bye">${esc(nomeD(T, m.a || m.b))} <span class="chip">${esc(m.semA || m.semB)}</span><br>Passa diretamente (isento)</div>` : cardJogo(m)).join('')}</div>`;
  }).join('')}</div>`;
}

/* ---------- ações (staff) ---------- */
const ACTS = {
  async editarBloq() {
    const { editarTorneio } = await import('./rececao.js?v=16');
    editarTorneio(R, B, async () => { if (await carregar(R.id)) render(); });
  },
  async estenderBloq() {
    const f = fimPrevisto(T); if (f == null) return;
    const fim = Math.min(Math.ceil(f / 30) * 30, Math.max(...B.espacos.map(e => e.fechaMin)));
    const { error } = await sb.from('torneios').update({ hora_fim: min2hm(fim) }).eq('id', R.id);
    if (error) { toast(erroTexto(error), 'erro'); return; }
    toast(`Campos bloqueados até às ${min2hm(fim)}.`);
    if (await carregar(R.id)) render();
  },
  addDupla(f) {
    const e = f.elements, j1 = e.j1.value.trim(), j2 = e.j2.value.trim(); if (!j1 || !j2) { toast('Indique os dois jogadores.'); return; }
    T.duplas.push({ id: uid(), j1, j2, n1: +e.n1.value || null, n2: +e.n2.value || null, tel: e.tel.value.trim() }); commit(); setTimeout(() => $('#d-j1')?.focus(), 0);
  },
  addInd(f) {
    const e = f.elements, nome = e.nome.value.trim(); if (!nome) { toast('Indique o nome do jogador.'); return; }
    T.individuais.push({ id: uid(), nome, nivel: +e.nivel.value || null, tel: e.tel.value.trim(), validado: false }); commit(); setTimeout(() => $('#i-nome')?.focus(), 0);
  },
  delInd(b) { T.individuais = T.individuais.filter(p => p.id !== b.dataset.id); commit(); },
  async delDupla(b) {
    const id = b.dataset.id;
    if (T.grupos.some(g => g.duplas.includes(id))) {
      if (!await confirmar('Esta dupla já está nos grupos. Removê-la apaga os grupos e os jogos gerados.', 'Remover e apagar grupos')) return;
      T.grupos = []; T.jogos = []; T.relogio = null;
    }
    T.duplas = T.duplas.filter(d => d.id !== id); commit();
  },
  formar() {
    if (T.individuais.some(p => !p.validado)) { toast('Valide primeiro todas as inscrições.'); return; }
    const modo = $('#modo-formar').value; let ps = [...T.individuais];
    const pares = [];
    if (modo === 'misto') {
      if (ps.some(p => !p.sexo)) { toast('Para duplas mistas, indique F ou M em todos os jogadores.'); return; }
      // raparigas e rapazes sorteados à parte; com níveis, a mais forte joga com o menos forte
      const porNivel = ps.some(p => p.nivel);
      const fs = baralhar(ps.filter(p => p.sexo === 'F')), ms = baralhar(ps.filter(p => p.sexo === 'M'));
      if (porNivel) { fs.sort((a, b) => (a.nivel || 4) - (b.nivel || 4)); ms.sort((a, b) => (b.nivel || 4) - (a.nivel || 4)); }
      while (fs.length && ms.length) pares.push([fs.shift(), ms.shift()]);
      ps = baralhar([...fs, ...ms]); // quem sobra joga com alguém do mesmo grupo
      while (ps.length >= 2) pares.push([ps.shift(), ps.shift()]);
    } else {
      if (modo === 'sorteio') baralhar(ps); else ps.sort((a, b) => (a.nivel || 4) - (b.nivel || 4));
      if (modo === 'equilibrado') while (ps.length >= 2) pares.push([ps.shift(), ps.pop()]); else while (ps.length >= 2) pares.push([ps.shift(), ps.shift()]);
    }
    pares.forEach(([a, b]) => T.duplas.push({ id: uid(), j1: a.nome, j2: b.nome, n1: a.nivel, n2: b.nivel, tel: [a.tel, b.tel].filter(Boolean).join(' / '), formada: true, origem: [a, b] }));
    T.individuais = ps; toast(`${pares.length} dupla${pares.length !== 1 ? 's' : ''} formada${pares.length !== 1 ? 's' : ''}.${ps.length ? ' Fica 1 jogador à espera de par.' : ''}`); commit();
  },
  validarTodas() { T.individuais.forEach(p => { p.validado = true; }); commit(); },
  async desfazer() {
    const fs = T.duplas.filter(d => d.formada);
    if (!fs.length) return;
    const nosGrupos = fs.some(d => T.grupos.some(g => g.duplas.includes(d.id)));
    if (!await confirmar(`Desfazer ${fs.length} dupla${fs.length > 1 ? 's' : ''} formada${fs.length > 1 ? 's' : ''}? Os jogadores voltam às inscrições individuais (já validados).${nosGrupos ? ' Os grupos e os jogos gerados são apagados.' : ''}`, 'Desfazer duplas')) return;
    if (nosGrupos) { T.grupos = []; T.jogos = []; T.relogio = null; }
    const volta = fs.flatMap(d => d.origem || [{ id: uid(), nome: d.j1, nivel: d.n1 || null, tel: '' }, { id: uid(), nome: d.j2, nivel: d.n2 || null, tel: '' }]);
    T.individuais = [...T.individuais, ...volta.map(p => ({ ...p, validado: true }))].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    T.duplas = T.duplas.filter(d => !d.formada); commit();
  },
  async gerarGrupos() {
    const n = +$('#n-grupos').value || 1, modo = $('#modo-grupos').value;
    if (T.jogos.some(m => m.ga != null) && !await confirmar('Voltar a gerar os grupos apaga todos os resultados já registados.', 'Gerar de novo')) return;
    gerarGrupos(T, n, modo); commit();
  },
  res(f) {
    const m = jogo(f.dataset.id); if (!m) return; const a = f.elements.ga.value.trim(), b = f.elements.gb.value.trim();
    if (a === '' && b === '') { m.ga = m.gb = null; m.desempate = null; }
    else { const x = parseInt(a, 10), y = parseInt(b, 10); if (isNaN(x) || isNaN(y) || x < 0 || y < 0) { toast('Indique os jogos ganhos por cada dupla.'); return; } m.ga = x; m.gb = y; if (x !== y) m.desempate = null; }
    if (T.relogio && T.relogio.slot === m.slot && T.jogos.filter(j => j.slot === m.slot).every(jogado)) T.relogio = null;
    commit();
  },
  desempate(b) { const m = jogo(b.dataset.id); if (m) { m.desempate = b.dataset.lado; commit(); } },
  relogio(b) { T.relogio = { slot: +b.dataset.slot, inicio: Date.now(), dur: (+T.duracao || 12) * 60 }; commit(); },
  pararRelogio() { T.relogio = null; commit(); },
  async gerarKO() {
    const falta = T.jogos.filter(m => m.fase === 'grupo' && !jogado(m)).length;
    if (falta && !await confirmar(`Ainda faltam ${falta} jogos da fase de grupos. Gerar o quadro com a classificação atual?`, 'Gerar quadro')) return;
    gerarKO(T); commit();
  },
  async refazerKO() {
    if (!await confirmar('Refazer o quadro apaga os resultados das eliminatórias.', 'Refazer')) return;
    T.jogos = T.jogos.filter(m => m.fase !== 'ko'); T.relogio = null; commit();
  },
};
const naPagina = e => T && R && location.hash.startsWith('#/torneio/') && app && app.contains(e.target);
document.addEventListener('click', e => {
  if (!naPagina(e)) return;
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM' || b.disabled) return;
  e.preventDefault(); ACTS[b.dataset.act]?.(b, e);
});
document.addEventListener('submit', e => {
  if (!naPagina(e)) return;
  const f = e.target; if (!f.dataset.act || !ACTS[f.dataset.act]) return;
  e.preventDefault(); ACTS[f.dataset.act](f, e);
});
document.addEventListener('change', e => {
  if (!naPagina(e)) return;
  const el = e.target;
  if (el.id === 'mostrar-feitos') { mostrarFeitos = el.checked; render(); return; }
  if (el.dataset.valida) { const p = T.individuais.find(x => x.id === el.dataset.valida); if (p) { p.validado = el.checked; commit(); } return; }
  if (el.dataset.sexo) { const p = T.individuais.find(x => x.id === el.dataset.sexo); if (p) { p.sexo = el.value || null; commit(); } return; }
  if (el.dataset.nivel) { const p = T.individuais.find(x => x.id === el.dataset.nivel); if (p) { p.nivel = +el.value || null; commit(); } return; }
  const k = el.dataset.cfg; if (!k) return;
  if (k.startsWith('pts.')) T.pts[k.slice(4)] = +el.value || 0;
  else if (k === 'duracao' || k === 'troca') T[k] = Math.max(0, +el.value || 0);
  else T[k] = el.value;
  commit();
});
document.addEventListener('input', e => { if (naPagina(e) && e.target.id === 'n-grupos') { const p = $('#prev-grupos'); if (p) p.innerHTML = prevGrupos(+e.target.value || 1); } });

/* =====================================================================
   Ecrã TV público: #/tv/torneio (o torneio público de hoje) ou #/tv/torneio/<id>
   ===================================================================== */
// Três ecrãs a rodar, cada um a ocupar a largura toda (letra grande, legível ao longe):
// Ronda atual (jogos em cada campo) · Classificação (grupos ou quadro) · A seguir.
const ROTACAO_MS = 20000;
let tvIdx = 0, tvDesde = 0, tvSlideAtual = '';
export async function paginaTVTorneio(el, id) {
  app = el; pararTorneio();
  document.body.classList.add('tv');
  try { B = B || await carregarBase(); } catch (e) { el.innerHTML = `<p class="tvh">${esc(erroTexto(e))}</p>`; return; }
  let ultimo = null;
  const ler = async () => {
    const { data, error } = await sb.rpc('torneio_tv', { p_id: id || null });
    if (error) return;
    if (!data) { R = null; T = null; ultimo = null; el.innerHTML = `<div class="tvwrap"><header class="tvtop"><div class="brand">${LOGO}<div><div class="eyebrow">Verdelago · Pádel</div><h1>Sem torneio hoje</h1></div></div><div class="tvclock" id="tvclock"></div></header><a class="tvsair" href="#/tv">Ocupação dos campos</a></div>`; tvRelogio(); return; }
    if (data.atualizado_em === ultimo && T) return;
    ultimo = data.atualizado_em; montar(data); desenharTV(false);
  };
  tvIdx = 0; tvDesde = Date.now();
  await ler();
  timers.push(setInterval(ler, 5000), setInterval(tvRelogio, 1000), setInterval(tvBarra, 250),
    setInterval(() => { if (!T) return; tvIdx++; tvDesde = Date.now(); desenharTV(true); }, ROTACAO_MS));
}

// Lista de ecrãs com conteúdo neste momento (os vazios saltam-se).
function slidesTV() {
  const out = [], c = campeao();
  if (c) out.push({ id: 'campeao', nome: 'Vencedores', html: `<div class="tvs-campeao"><span>Vencedores do torneio</span><b>${esc(nomeD(T, c))}</b></div>` });
  else {
    const s = slotAtual();
    if (s != null) out.push({ id: 'ronda', nome: 'A decorrer', html: tvRonda(s) });
  }
  if (T.grupos.length && !(temKO() && faseGruposFeita())) {
    const quals = new Set(qualificados(T, tamanhoQuadro(T)).map(q => q.id));
    // 2 grupos por ecrã, um por baixo do outro (toda a largura para os nomes); a letra cresce até encher a altura
    const linhasDe = gs => gs.reduce((t, g) => t + g.duplas.length + 2.6, 0);
    const porEcra = T.grupos.length > 1 && 72 / (linhasDe(T.grupos.slice(0, 2)) * 2) >= 2.6 ? 2 : 1; // 2 por ecrã se a letra ficar ≥ ~28 px
    for (let i = 0; i < T.grupos.length; i += porEcra) {
      const gs = T.grupos.slice(i, i + porEcra), linhas = linhasDe(gs);
      out.push({ id: 'class' + i, nome: gs.length === T.grupos.length ? 'Classificação' : 'Classificação · Grupo' + (gs.length > 1 ? 's ' : ' ') + gs.map(g => g.id).join(', '),
        html: `<div class="tvs-grupos" style="grid-template-columns:minmax(0,1fr);${fsTV(3.2, 72 / (linhas * 2))}">${gs.map(g => `<div class="tvs-painel"><p class="tvs-sub">Grupo ${g.id}</p>${tabela(g, quals)}</div>`).join('')}</div>` });
    }
  }
  if (temKO()) out.push({ id: 'quadro', nome: 'Eliminatórias', html: tvQuadro() });
  if (!c) {
    const s = slotAtual(), p = s == null ? null : proxSlot(s);
    if (p != null) out.push({ id: 'seguir', nome: 'A seguir', html: tvSeguir(p) });
  }
  return out.length ? out : [{ id: 'vazio', nome: '', html: '<p class="tvs-sub">Sem jogos marcados</p>' }];
}
// Letra adaptativa: o maior tamanho que cabe na largura (por coluna) e na altura (por linhas de texto).
const fsTV = (vw, vh) => `--fs:min(${vw.toFixed(2)}vw,${vh.toFixed(2)}vh)`;
// cartões de jogos (ronda atual e "a seguir" com muitos jogos): colunas e letra conforme o número de campos
function grelhaCartoes(n) {
  const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : n <= 6 ? 3 : 4, filas = Math.ceil(n / cols);
  // largura: um nome comprido (~18 letras) cabe numa linha do cartão; altura: cada cartão tem
  // ~7,4 linhas de texto (campo, 4 nomes, "vs", margens) e há ~58% do ecrã para os cartões
  return { cols, estilo: `grid-template-columns:repeat(${cols},minmax(0,1fr));` + fsTV((92 / cols - 3.6) / 9.6, 58 / (filas * 7.4)) };
}
// Dupla em duas linhas (um jogador por linha): no ecrã TV os nomes não se partem a meio
const par = id => { const d = dupla(T, id); return d ? `<span class="par"><span>${esc(d.j1)}</span><span>${esc(d.j2)}</span></span>` : '—'; };
function tvRonda(s) {
  const js = T.jogos.filter(m => m.slot === s);
  const ko = js[0] && js[0].fase === 'ko';
  const titulo = ko ? (NOME_RONDA[js[0].nm] || 'Eliminatória') : 'Ronda ' + (s + 1);
  const nome = id => id ? par(id) : 'A definir';
  const usados = T.campos.filter(cn => js.some(x => x.campo === cn));
  const g = grelhaCartoes(usados.length);
  return `<p class="tvs-sub">${titulo} · ${horaSlot(T, s)}</p>${tvFolgas(s)}<div class="tvs-campos" style="${g.estilo}">${usados.map(cn => {
    const m = js.find(x => x.campo === cn);
    if (!m) return `<div class="tvs-campo livre"><div class="cn">${esc(nomeCampo(cn))}</div><div class="eq">Livre</div></div>`;
    const [A, Bq] = equipas(m);
    return `<div class="tvs-campo"><div class="cn"><span>${esc(nomeCampo(cn))}</span><span>${ko ? codKO(m) : 'Grupo ' + m.grupo}</span></div><div class="eq"><span>${nome(A)}</span><b>${m.ga ?? ''}</b></div><div class="vs">vs</div><div class="eq"><span>${nome(Bq)}</span><b>${m.gb ?? ''}</b></div></div>`;
  }).join('')}</div>`;
}
function tvSeguir(p) {
  const nx = T.jogos.filter(m => m.slot === p).sort(porCampo);
  const ko = nx[0] && nx[0].fase === 'ko';
  const titulo = ko ? (NOME_RONDA[nx[0].nm] || 'Eliminatória') : 'Ronda ' + (p + 1);
  const n = (m, s, id) => id ? par(id) : esc(pendente(m, s));
  const cab = `<p class="tvs-sub">${titulo} · ${horaSlot(T, p)}</p>${tvFolgas(p)}`;
  // até 4 jogos: uma linha por jogo; mais: cartões em grelha (como a ronda atual), para caber no ecrã
  if (nx.length <= 4) return cab + `<div class="tvs-lista" style="${fsTV(2.6, 56 / (Math.max(2, nx.length) * 3.7))}">${nx.map(m => { const [A, Bq] = equipas(m);
    return `<div class="tvs-linha"><b class="cn">${esc(nomeCampo(m.campo))}</b><span>${n(m, 'a', A)}</span><i>vs</i><span>${n(m, 'b', Bq)}</span><small>${ko ? codKO(m) : 'Grupo ' + m.grupo}</small></div>`; }).join('')}</div>`;
  const g = grelhaCartoes(nx.length);
  return cab + `<div class="tvs-campos" style="${g.estilo}">${nx.map(m => { const [A, Bq] = equipas(m);
    return `<div class="tvs-campo"><div class="cn"><span>${esc(nomeCampo(m.campo))}</span><span>${ko ? codKO(m) : 'Grupo ' + m.grupo}</span></div><div class="eq"><span>${n(m, 'a', A)}</span></div><div class="vs">vs</div><div class="eq"><span>${n(m, 'b', Bq)}</span></div></div>`; }).join('')}</div>`;
}
function tvFolgas(s) { const f = folgas(T, s); return f.length ? `<p class="tvs-folga">Folga${f.length > 1 ? 'm' : ''}: ${f.map(id => esc(nomeD(T, id))).join(' · ')}</p>` : ''; }
function tvQuadro() {
  const ko = T.jogos.filter(m => m.fase === 'ko' && !m.bye);
  const rondas = [...new Set(ko.map(m => m.ronda))].sort((a, b) => a - b);
  return `<div class="tvs-quadro" style="grid-template-columns:repeat(${Math.max(1, rondas.length)},minmax(0,1fr))">${rondas.map(r => {
    const js = ko.filter(m => m.ronda === r).sort((a, b) => a.idx - b.idx);
    return `<div class="tvs-painel"><p class="tvs-sub">${NOME_RONDA[js[0].nm] || ''}</p><div class="tvs-ko">${js.map(m => {
      const [A, Bq] = equipas(m), w = vencedor(m);
      const nm = (id, s) => id ? esc(nomeD(T, id)) : esc(pendente(m, s));
      return `<div><span class="${w && w === A ? 'w' : ''}">${nm(A, 'a')}</span><b>${m.ga ?? ''}${m.ga != null ? '–' : ''}${m.gb ?? ''}</b><span class="${w && w === Bq ? 'w' : ''}">${nm(Bq, 'b')}</span></div>`;
    }).join('')}</div></div>`;
  }).join('')}</div>`;
}
function desenharTV(animar) {
  const ss = slidesTV(), sl = ss[tvIdx % ss.length];
  // se os ecrãs mudaram (ex.: acabou a ronda), manter o mesmo tipo de ecrã quando ainda existe
  if (!animar && tvSlideAtual && sl.id !== tvSlideAtual) { const i = ss.findIndex(x => x.id === tvSlideAtual); if (i >= 0) tvIdx = i; }
  const atual = ss[tvIdx % ss.length]; tvSlideAtual = atual.id;
  app.innerHTML = `<div class="tvwrap tvs"><header class="tvtop"><div class="brand">${LOGO}<div><div class="eyebrow">Verdelago · Pádel · ${esc(T.nome)}</div><h1>${esc(atual.nome)}</h1></div></div><div class="tvclock" id="tvclock"></div></header>
  <section class="tvs-slide${animar ? ' entra' : ''}">${atual.html}</section>
  ${ss.length > 1 ? `<footer class="tvs-pe">${ss.map((x, i) => `<span class="${i === tvIdx % ss.length ? 'on' : ''}">${esc(x.nome)}</span>`).join('')}<i class="tvs-barra"><i id="tvbarra"></i></i></footer>` : ''}
  <a class="tvsair" href="#/tv">Ocupação dos campos</a></div>`;
  tvRelogio(); tvBarra();
}
function tvBarra() { const b = $('#tvbarra'); if (b) b.style.width = Math.min(100, (Date.now() - tvDesde) / ROTACAO_MS * 100) + '%'; }
// Tempo que falta no cronómetro da ronda (null se parado)
function contagem() {
  if (!T || !T.relogio) return null;
  const rest = Math.round((T.relogio.inicio + T.relogio.dur * 1000 - Date.now()) / 1000);
  return { rest, txt: rest <= 0 ? 'TEMPO' : String(Math.floor(rest / 60)).padStart(2, '0') + ':' + String(rest % 60).padStart(2, '0'), cls: rest <= 0 ? 'tempo' : rest <= 60 ? 'fim' : '' };
}
function atualizarCrono() {
  const c = contagem(), p = $('#bo-crono');
  if (p) { p.hidden = !c; if (c) { p.textContent = `Ronda ${T.relogio.slot + 1} · ${c.txt}`; p.className = 'pill crono ' + c.cls; } }
  document.querySelectorAll('[data-crono]').forEach(el => { el.textContent = c ? c.txt : ''; el.className = 'crono-grande ' + (c ? c.cls : ''); });
}
function tvRelogio() {
  const el = $('#tvclock'); if (!el) return;
  if (T && T.relogio) {
    const rest = Math.round((T.relogio.inicio + T.relogio.dur * 1000 - Date.now()) / 1000);
    el.className = 'tvclock' + (rest <= 0 ? ' tempo' : rest <= 60 ? ' fim' : '');
    el.innerHTML = `<small>Tempo de jogo</small>${rest <= 0 ? 'TEMPO' : String(Math.floor(rest / 60)).padStart(2, '0') + ':' + String(rest % 60).padStart(2, '0')}`;
  } else { el.className = 'tvclock'; el.innerHTML = `<small>Hora</small>${hora(new Date())}`; }
}
