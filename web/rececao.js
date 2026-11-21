// Painel da receção (#/rececao): login, grelha do dia, reservas/bloqueios, torneios, cacifos.
import { planta, numeroBadge } from './planta.js?v=20';
import { sb, $, $$, esc, autoAtualizar, normQuarto, lisboa, hoje, addDias, min2hm, hora, dataLonga, dataCurta, diaDe, carregarBase, erroTexto, toast, dialogo, confirmar, grelha, LOGO } from './core.js?v=20';

let ultImport = null, B = null, dia = hoje(), aba = 'campos', selCampo = null, materialFora = [], itens = [], cacifos = [], usosAtivos = [], porPreparar = [], naoDevolvidos = [], torneios = [], app = null, staffNome = '';

export async function paginaRececao(el) {
  app = el;
  document.documentElement.lang = 'pt';
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return login();
  const { data: ok, error } = await sb.rpc('e_staff');
  if (error || !ok) {
    app.innerHTML = topo() + `<main><div class="card vazio stack"><p>Esta conta não tem acesso ao painel da receção.</p><div><button class="btn ghost" id="b-sair">Sair</button></div></div></main>`;
    $('#b-sair').onclick = sair; return;
  }
  const { data: st } = await sb.from('staff').select('nome').eq('user_id', session.user.id).maybeSingle();
  staffNome = st?.nome || session.user.email;
  try { B = await carregarBase(); } catch (e) { toast(erroTexto(e), 'erro'); return; }
  await recarregar();
  // Atualiza sozinho: na hora (Realtime) e, por segurança, de 30 em 30 s.
  const pedir = autoAtualizar(() => recarregar(true), 30000);
  pararRececao();
  canal = sb.channel('rececao')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, pedir)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cacifo_usos' }, pedir)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'torneios' }, pedir)
    .subscribe();
}
let canal = null;
export function pararRececao() { if (canal) { sb.removeChannel(canal); canal = null; } }
function topo(extra = '') {
  return `<header class="top"><div class="brand">${LOGO}<div><div class="eyebrow">Verdelago · Sports Center</div><div class="tname">Receção</div></div></div><div class="top-r">${extra}</div></header>`;
}
function login() {
  app.innerHTML = topo() + `<main><form class="card stack login" id="f-login"><h2>Entrar</h2>
    <label class="f" for="l-email">Email<input id="l-email" name="email" type="email" required autocomplete="username"></label>
    <label class="f" for="l-pass">Palavra-passe<input id="l-pass" name="pass" type="password" required autocomplete="current-password"></label>
    <div class="row end"><button class="btn">Entrar</button></div></form></main>`;
  $('#f-login').onsubmit = async e => {
    e.preventDefault();
    const f = e.target.elements;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pass.value });
    if (error) { toast(/invalid/i.test(error.message) ? 'Email ou palavra-passe errados.' : erroTexto(error), 'erro'); return; }
    paginaRececao(app);
  };
}
async function sair() { pararRececao(); await sb.auth.signOut(); location.reload(); }

async function recarregar(manter = false) {
  const ini = lisboa(dia, 0).toISOString(), fim = lisboa(addDias(dia, 1), 0).toISOString();
  const agora = new Date().toISOString(), ate = lisboa(addDias(hoje(), 2), 0).toISOString();
  const [r, c, u, p, imp, t, mf, nd] = await Promise.all([
    sb.from('reservas').select('*, cacifo_usos(*)').eq('estado', 'confirmada').lt('inicio', fim).gt('fim', ini).order('inicio'),
    sb.from('cacifos').select('*').order('id'),
    sb.from('cacifo_usos').select('*, reservas(id, espaco_id, inicio, fim, quarto, apelido, nome, telefone, token)').eq('estado', 'preparado').order('cacifo_id'),
    sb.from('reservas').select('*, cacifo_usos(id, estado)').eq('estado', 'confirmada').eq('precisa_material', true).gt('fim', agora).lt('inicio', ate).order('inicio'),
    sb.from('importacoes').select('em, quartos, por').order('em', { ascending: false }).limit(1).maybeSingle(),
    sb.from('torneios').select('*').or(`data.is.null,data.gte.${addDias(hoje(), -14)}`).order('data', { nullsFirst: true }).order('hora_inicio'),
    sb.from('emprestimos').select('id, doc').eq('estado', 'fora'),
    sb.from('cacifo_usos').select('*, reservas(id, espaco_id, inicio, quarto, apelido, nome, telefone, email)').eq('estado', 'nao_devolvido').gt('nao_devolvido_em', lisboa(addDias(hoje(), -30), 0).toISOString()).order('nao_devolvido_em', { ascending: false }),
  ]);
  ultImport = imp.data || null;
  materialFora = mf.error ? [] : mf.data; // empréstimos do balcão de material (página Material desportivo)
  const err = r.error || c.error || u.error || p.error || t.error || nd.error;
  if (err) { toast(erroTexto(err), 'erro'); return; }
  itens = r.data; cacifos = c.data; usosAtivos = u.data; torneios = t.data; naoDevolvidos = nd.data;
  porPreparar = p.data.filter(x => !x.cacifo_usos.some(k => k.estado === 'preparado'));
  if (!manter) return desenhar();
  // atualização automática: manter a posição na página e na grelha
  const w = $('.lt'), y = scrollY, gt = w?.scrollTop, gl = w?.scrollLeft;
  desenhar();
  scrollTo(0, y); const w2 = $('.lt'); if (w2 && w) { w2.scrollTop = gt; w2.scrollLeft = gl; }
}
const nomeEsp = id => B.espacos.find(e => e.id === id)?.nome || id;
const usoAtivo = r => (r.cacifo_usos || []).find(u => u.estado === 'preparado');
function rotulo(r) {
  if (r.tipo === 'reserva') return `${r.quarto} ${r.apelido}`;
  if (r.tipo === 'torneio') return r.motivo || 'Torneio';
  return r.motivo || 'Bloqueado';
}
function extra(r) {
  const u = usoAtivo(r);
  if (u) return `🔒 Cacifo ${u.cacifo_id}`;
  if (r.precisa_material) return '🎒 Material por preparar';
  return r.origem === 'rececao' && r.tipo === 'reserva' ? 'pela receção' : '';
}

function desenhar() {
  const tabs = [['campos', 'Campos'], ['grelha', 'Grelha do dia'], ['torneios', 'Torneios'], ['cacifos', `Cacifos e material${porPreparar.length ? ` (${porPreparar.length})` : ''}`]];
  app.innerHTML = topo(`<span class="pill">${esc(staffNome)}</span><button class="btn small on-dark" id="b-sair">Sair</button>`) +
    `<nav class="tabs">${tabs.map(([k, l]) => `<a href="#/rececao" data-aba="${k}" class="${k === aba ? 'on' : ''}">${esc(l)}</a>`).join('')}<a class="tvlink" href="material/">Material desportivo ↗</a><a href="#/tv" target="_blank" rel="noopener">Ecrã TV ↗</a><a href="#/" target="_blank" rel="noopener">Página dos hóspedes ↗</a></nav>
    <main class="largo">${aba === 'campos' ? vCampos() : aba === 'grelha' ? vGrelha() : aba === 'torneios' ? vTorneios() : vCacifos()}</main>`;
  $('#b-sair').onclick = sair;
  $$('[data-aba]').forEach(a => a.onclick = e => { e.preventDefault(); aba = a.dataset.aba; if (aba === 'campos' && dia !== hoje()) { dia = hoje(); recarregar(); } else desenhar(); });
  if (aba === 'campos') ligarCampos(); else if (aba === 'grelha') ligarGrelha(); else if (aba === 'torneios') ligarTorneios(); else ligarCacifos();
}

/* ---------- campos: planta do Sports Center (agora) ---------- */
const agoraD = () => new Date();
function estadoCampo(e, agora = agoraD()) {
  const its = itens.filter(r => r.espaco_id === e.id).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const cur = its.find(r => new Date(r.inicio) <= agora && agora < new Date(r.fim));
  const prox = its.find(r => new Date(r.inicio) > agora);
  if (cur) {
    const ate = 'até ' + hora(cur.fim);
    if (cur.tipo === 'torneio') return { cls: 'tor', txt: 'Torneio', sub: ate, item: cur };
    if (cur.tipo === 'bloqueio') return { cls: 'blq', txt: cur.motivo || 'Bloqueado', sub: ate, item: cur };
    const u = usoAtivo(cur);
    return { cls: 'uso', txt: cur.quarto, sub: ate, extra: u ? `cacifo ${u.cacifo_id}` : '', item: cur };
  }
  // reserva deste campo já acabada com material ainda no cacifo: por devolver
  const atr = its.filter(r => r.tipo === 'reserva' && new Date(r.fim) <= agora && usoAtivo(r)).pop();
  if (atr) return { cls: 'atraso', txt: atr.quarto, sub: 'material', item: atr };
  return { cls: 'livre', txt: 'Livre', sub: prox ? `até ${hora(prox.inicio)}` : '', item: null };
}
const resumoMat = d => (d.itens || []).map(i => `${i.qtd}× ${i.nome}${(i.nums || []).length ? ' nº ' + i.nums.join(', ') : ''}`).join(' · ');
// Material fora (cacifos e balcão) em post-its, como na app do Spa: atrasos primeiro
const minutos = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
function postits(agora) {
  const t = agora.getTime(), fora = [];
  usosAtivos.forEach(u => { const r = u.reservas; if (!r) return;
    fora.push({ tipo: 'cacifo', id: u.id, quarto: r.quarto, ate: new Date(r.fim).getTime(), desde: new Date(r.inicio).getTime(),
      linhas: [esc(u.material || 'Material no cacifo')], meta: `${esc(nomeEsp(r.espaco_id))} · cacifo ${u.cacifo_id} · código ${esc(u.codigo)}` }); });
  materialFora.forEach(x => { const d = x.doc;
    fora.push({ tipo: 'balcao', id: x.id, quarto: d.quarto, ate: d.prevista, desde: d.saida,
      linhas: (d.itens || []).map(i => `<b>${i.qtd}×</b> ${esc(i.nome)}${(i.nums || []).length ? ` <span class="nb">${i.nums.map(n => `<span>${n}</span>`).join('')}</span>` : ''}`),
      meta: `Balcão · saiu ${hora(d.saida)}${d.colabEntregou ? ' · ' + esc(d.colabEntregou.split(' ')[0]) : ''}` }); });
  if (!fora.length) return '';
  const sev = f => !f.ate ? 'ok' : t > f.ate ? 'bad' : f.ate - t < 30 * 60e3 ? 'warn' : 'ok';
  const ordem = { bad: 0, warn: 1, ok: 2 };
  fora.sort((a, b) => ordem[sev(a)] - ordem[sev(b)] || (a.ate || 0) - (b.ate || 0));
  const nAtr = fora.filter(f => sev(f) === 'bad').length;
  return `<section class="card stack"><div class="row between"><h2>Material fora</h2><span class="row"><span class="chip">${fora.length} registo${fora.length > 1 ? 's' : ''}</span>${nAtr ? `<span class="chip est-atraso">${nAtr} em atraso</span>` : ''}</span></div>
    <div class="postits">${fora.map(f => { const s = sev(f);
      const pill = s === 'bad' ? `Atraso ${minutos(t - f.ate)}` : s === 'warn' ? `Faltam ${minutos(f.ate - t)}` : f.ate ? `Até ${hora(f.ate)}` : '';
      return `<article class="postit ${s}"><div class="r1"><span class="room">${esc(f.quarto)}</span>${pill ? `<span class="pill ${s}">${pill}</span>` : ''}</div>
        <div class="mat">${f.linhas.map(l => `<div>${l}</div>`).join('')}</div><div class="meta">${f.meta}</div>
        <div class="acts">${f.tipo === 'cacifo' ? `<button class="btn small" data-dev-cac="${f.id}">Devolvido</button><button class="btn ghost danger small" data-nd-cac="${f.id}">Não devolvido</button>` : '<a class="btn small" href="material/">Devolver no balcão</a>'}</div></article>`; }).join('')}</div></section>`;
}
function vCampos() {
  const agora = agoraD(), sel = B.espacos.find(e => e.id === selCampo);
  const est = B.espacos.map(e => estadoCampo(e, agora));
  const n = k => est.filter(x => x.cls === k).length;
  const seguir = itens.filter(r => new Date(r.inicio) > agora && new Date(r.inicio) - agora <= 2 * 3600e3).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  let lado = '';
  if (sel) {
    const st = estadoCampo(sel, agora), its = itens.filter(r => r.espaco_id === sel.id).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    lado += `<section class="card stack"><div class="row between"><h2 class="row" style="gap:10px">${numeroBadge(sel)}${esc(sel.nome)}</h2><span class="chip est-${st.cls}">${esc([st.txt, st.sub, st.extra].filter(Boolean).join(' · '))}</span></div>
      ${its.length ? `<ul class="lista">${its.map(r => `<li class="${new Date(r.fim) <= agora ? 'passado' : ''}"><span><b>${hora(r.inicio)}–${hora(r.fim)}</b> ${esc(rotulo(r))}${extra(r) ? ` <span class="muted small">· ${esc(extra(r))}</span>` : ''}</span><button class="btn ghost small" data-item="${r.id}">Abrir</button></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Sem marcações hoje.</p>'}
      <div class="row"><button class="btn small" data-novo="${esc(sel.id)}">+ Reserva / bloqueio</button><button class="btn ghost small" data-fechar-campo>Fechar</button></div></section>`;
  } else {
    lado += `<section class="card stack"><h2>Campos agora</h2>
      <div class="row"><span class="chip est-uso">${n('uso')} em uso</span><span class="chip est-livre">${n('livre')} livres</span>${n('tor') ? `<span class="chip est-tor">${n('tor')} em torneio</span>` : ''}${n('blq') ? `<span class="chip est-blq">${n('blq')} bloqueados</span>` : ''}${n('atraso') ? `<span class="chip est-atraso">${n('atraso')} com material por devolver</span>` : ''}</div>
      <p class="muted small" style="margin:0">Toque num campo para ver o dia dele, abrir uma reserva ou marcar uma nova.</p></section>`;
  }
  lado += `<section class="card stack"><h2>A seguir <span class="muted small">· próximas 2 h</span></h2>
    ${seguir.length ? `<ul class="lista">${seguir.map(r => `<li><span><b>${hora(r.inicio)}</b> ${esc(nomeEsp(r.espaco_id))} · ${esc(rotulo(r))}${r.tipo === 'reserva' && r.precisa_material && !usoAtivo(r) ? ' <span class="chip warn">preparar material</span>' : ''}</span><button class="btn ghost small" data-item="${r.id}">Abrir</button></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Nada nas próximas 2 horas.</p>'}</section>`;
  lado += postits(agora);
  return `<div class="campos-vista"><div class="campos-planta">${planta(B.espacos, e => estadoCampo(e, agora), selCampo)}
    <div class="legenda small"><span><i class="lg livre"></i>Livre</span><span><i class="lg uso"></i>Em uso</span><span><i class="lg tor"></i>Torneio</span><span><i class="lg blq"></i>Bloqueado</span><span><i class="lg atraso"></i>Material por devolver</span></div></div>
    <div class="campos-lado stack">${lado}</div></div>`;
}
function ligarCampos() {
  $$('[data-campo]').forEach(b => b.onclick = () => { selCampo = selCampo === b.dataset.campo ? null : b.dataset.campo; desenhar(); });
  $$('.campos-lado [data-item]').forEach(b => b.onclick = () => detalhe(itens.find(r => r.id === b.dataset.item)));
  const f = $('[data-fechar-campo]'); if (f) f.onclick = () => { selCampo = null; desenhar(); };
  $$('[data-dev-cac]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('cacifo_usos').update({ estado: 'devolvido', devolvido_em: new Date().toISOString() }).eq('id', b.dataset.devCac);
    if (error) { toast(erroTexto(error), 'erro'); return; }
    toast('Material devolvido. Mude o código do cacifo.'); recarregar();
  });
  $$('[data-nd-cac]').forEach(b => b.onclick = () => { const u = usosAtivos.find(x => x.id === b.dataset.ndCac); if (u) naoDevolvido(u, u.reservas); });
  const nv = $('[data-novo]');
  if (nv) nv.onclick = () => {
    const e = B.espacos.find(x => x.id === nv.dataset.novo), agoraMin = Math.floor((Date.now() - lisboa(hoje(), 0).getTime()) / 60000);
    const m = Math.max(e.abreMin, Math.ceil(agoraMin / e.passo_min) * e.passo_min);
    novo(e.id, m < e.fechaMin ? m : null);
  };
}

/* ---------- grelha ---------- */
function vGrelha() {
  const n = itens.filter(r => r.tipo === 'reserva').length;
  return `<div class="row between">
      <div class="row"><button class="btn ghost small" data-dia="-1" aria-label="Dia anterior">◀</button><button class="btn ghost small" data-dia="0">Hoje</button><button class="btn ghost small" data-dia="1" aria-label="Dia seguinte">▶</button>
      <input type="date" id="g-dia" value="${dia}" aria-label="Dia"><h2 class="cap">${esc(dataLonga(dia))}</h2></div>
      <div class="row"><span class="muted small">${n} reserva${n === 1 ? '' : 's'}</span><button class="btn small" id="b-novo">+ Reserva / bloqueio</button><button class="btn ghost small" id="b-rec">Atualizar</button></div>
    </div>
    <p class="small muted" style="margin:0">${ultImport ? `Lista de hóspedes (Beach OPS): ${ultImport.quartos} estadias, importada ${esc(dataCurta(diaDe(ultImport.em)))} às ${hora(ultImport.em)}${ultImport.por ? ' por ' + esc(ultImport.por) : ''}. ` : 'Lista de hóspedes ainda não importada no Beach OPS: os quartos não são validados. '}Toque num espaço vazio de um campo para reservar ou bloquear; toque numa marcação para ver detalhes, cancelar ou preparar cacifo.</p>
    ${linhaTempo()}`;
}
function ligarGrelha() {
  $$('[data-dia]').forEach(b => b.onclick = () => { const d = +b.dataset.dia; dia = d === 0 ? hoje() : addDias(dia, d); recarregar(); });
  $('#g-dia').onchange = e => { if (e.target.value) { dia = e.target.value; recarregar(); } };
  $('#b-rec').onclick = recarregar;
  $('#b-novo').onclick = () => novo(B.espacos[0].id, null);
  $$('.lt [data-item]').forEach(b => b.onclick = ev => { ev.stopPropagation(); detalhe(itens.find(r => r.id === b.dataset.item)); });
  // tocar num espaço vazio da pista: nova marcação nesse campo, à meia hora tocada
  $$('.lt-pista').forEach(p => p.onclick = ev => {
    if (ev.target.closest('[data-item]')) return;
    const e = B.espacos.find(x => x.id === p.dataset.pista), r = p.getBoundingClientRect();
    const { ini, fim } = limitesDia(), m = ini + (ev.clientX - r.left) / r.width * (fim - ini);
    novo(e.id, Math.min(e.fechaMin - e.passo_min, Math.max(e.abreMin, Math.floor(m / e.passo_min) * e.passo_min)));
  });
}
const limitesDia = () => ({ ini: Math.min(...B.espacos.map(e => e.abreMin)), fim: Math.max(...B.espacos.map(e => e.fechaMin)) });
// Dia inteiro em linha do tempo: uma pista por campo, blocos com as marcações, linha vermelha na hora atual
function linhaTempo() {
  const { ini, fim } = limitesDia(), tot = fim - ini, base = lisboa(dia, 0).getTime();
  const pos = t => Math.max(0, Math.min(100, ((t - base) / 60000 - ini) / tot * 100));
  const agoraP = dia === hoje() ? pos(Date.now()) : dia < hoje() ? 100 : 0;
  const horas = []; for (let m = ini; m < fim; m += 60) horas.push(m);
  let h = `<div class="lt" role="region" aria-label="Marcações do dia por campo"><div class="lt-linha lt-horas"><span class="lt-nome"></span><div class="lt-pista">${horas.map(m => `<span style="left:${((m - ini) / tot * 100).toFixed(3)}%">${String(m / 60).padStart(2, '0')}</span>`).join('')}</div></div>`;
  for (const e of B.espacos) {
    const its = itens.filter(r => r.espaco_id === e.id);
    h += `<div class="lt-linha"><span class="lt-nome">${numeroBadge(e)}<span>${esc(e.nome)}</span></span><div class="lt-pista" data-pista="${esc(e.id)}" title="Toque num espaço livre para marcar">`;
    for (let m = ini; m < fim; m += 60) h += `<i class="lt-h" style="left:${((m - ini) / tot * 100).toFixed(3)}%"></i>`;
    if (e.abreMin > ini) h += `<i class="lt-fora" style="left:0;width:${((e.abreMin - ini) / tot * 100).toFixed(3)}%"></i>`;
    if (e.fechaMin < fim) h += `<i class="lt-fora" style="left:${((e.fechaMin - ini) / tot * 100).toFixed(3)}%;right:0"></i>`;
    if (agoraP > 0) h += `<i class="lt-passado" style="width:${agoraP.toFixed(3)}%"></i>`;
    for (const r of its) {
      const a = pos(new Date(r.inicio).getTime()), b = pos(new Date(r.fim).getTime()), x = extra(r);
      h += `<button type="button" class="lt-b t-${r.tipo}${usoAtivo(r) && new Date(r.fim) <= Date.now() ? ' atraso' : ''}" data-item="${r.id}" style="left:${a.toFixed(3)}%;width:${(b - a).toFixed(3)}%" title="${esc(`${hora(r.inicio)}–${hora(r.fim)} · ${rotulo(r)}${x ? ' · ' + x : ''}`)}"><b>${esc(rotulo(r))}</b><small>${hora(r.inicio)}–${hora(r.fim)}${x ? ' · ' + esc(x) : ''}</small></button>`;
    }
    if (dia === hoje() && agoraP > 0 && agoraP < 100) h += `<i class="lt-agora" style="left:${agoraP.toFixed(3)}%"></i>`;
    h += '</div></div>';
  }
  return h + `</div><div class="legenda small"><span><i class="lg uso"></i>Reserva</span><span><i class="lg tor"></i>Torneio</span><span><i class="lg blq"></i>Bloqueio</span><span><i class="lg atraso"></i>Material por devolver</span><span><i class="lt-agora-lg"></i>Agora</span></div>`;
}

/* ---------- nova reserva / bloqueio ---------- */
function novo(espId, min) {
  const opEsp = B.espacos.map(e => `<option value="${e.id}" ${e.id === espId ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');
  dialogo(`<h3>Nova marcação · ${esc(dataCurta(dia))}</h3>
    <form class="stack" id="f-novo">
      <div class="seg" role="radiogroup" aria-label="Tipo"><label><input type="radio" name="tipo" value="reserva" checked> Reserva de hóspede</label><label><input type="radio" name="tipo" value="bloqueio"> Bloqueio</label></div>
      <div class="fgrid">
        <label class="f" for="n-esp">Espaço<select id="n-esp" name="esp">${opEsp}</select></label>
        <label class="f" for="n-ini">Início<select id="n-ini" name="ini"></select></label>
        <label class="f" for="n-dur">Duração<select id="n-dur" name="dur"></select></label>
      </div>
      <div class="fgrid so-res">
        <label class="f" for="n-quarto">Quarto<input id="n-quarto" name="quarto" placeholder="A123" autocapitalize="characters"></label>
        <label class="f" for="n-apelido">Apelido<input id="n-apelido" name="apelido"></label>
        <label class="f" for="n-nome">Nome<input id="n-nome" name="nome"></label>
        <label class="f" for="n-tel">Telemóvel<input id="n-tel" name="tel" type="tel"></label>
        <label class="f wide" for="n-email">Email<input id="n-email" name="email" type="email"></label>
        <label class="chk wide" for="n-mat"><input type="checkbox" id="n-mat" name="mat"><span>Precisa de material</span></label>
      </div>
      <label class="f so-blq" for="n-motivo" hidden>Motivo<input id="n-motivo" name="motivo" placeholder="Ex.: manutenção, aula, evento"></label>
      <label class="f" for="n-notas">Notas<input id="n-notas" name="notas"></label>
      <div class="row end"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button class="btn">Guardar</button></div>
    </form>`, (dlg, fechar) => {
    const f = dlg.querySelector('form'), el = f.elements;
    const blq = () => el.tipo.value === 'bloqueio';
    const opcoes = () => {
      const e = B.espacos.find(x => x.id === el.esp.value);
      const ocup = itens.filter(r => r.espaco_id === e.id).map(r => [new Date(r.inicio).getTime(), new Date(r.fim).getTime()]);
      const livreEm = (a, b) => !ocup.some(([x, y]) => a < y && b > x);
      const iniAtual = el.ini.value !== '' ? +el.ini.value : min;
      let h = '';
      for (let m = e.abreMin; m < e.fechaMin; m += e.passo_min) {
        const a = lisboa(dia, m).getTime();
        const ok = livreEm(a, a + e.passo_min * 60000);
        h += `<option value="${m}" ${m === iniAtual ? 'selected' : ''} ${ok ? '' : 'disabled'}>${min2hm(m)}${ok ? '' : ' (ocupado)'}</option>`;
      }
      el.ini.innerHTML = h;
      if (el.ini.selectedOptions[0]?.disabled) { const o = [...el.ini.options].find(o => !o.disabled); if (o) el.ini.value = o.value; }
      const m0 = +el.ini.value, a0 = lisboa(dia, m0).getTime();
      const maxD = blq() ? e.fechaMin - m0 : Math.min(e.max_duracao_min, e.fechaMin - m0);
      const durAtual = +el.dur.value || 60;
      let d = '';
      for (let x = e.passo_min; x <= maxD; x += e.passo_min) {
        if (!livreEm(a0, a0 + x * 60000)) break;
        d += `<option value="${x}" ${x === durAtual ? 'selected' : ''}>${x >= 60 ? `${Math.floor(x / 60)}h${x % 60 ? String(x % 60).padStart(2, '0') : ''}` : x + ' min'} (até ${min2hm(m0 + x)})</option>`;
      }
      el.dur.innerHTML = d || '<option value="">—</option>';
    };
    const tipo = () => { dlg.querySelector('.so-res').hidden = blq(); dlg.querySelector('.so-blq').hidden = !blq(); el.quarto.required = el.apelido.required = !blq(); opcoes(); };
    f.querySelectorAll('[name=tipo]').forEach(r => r.onchange = tipo);
    el.esp.onchange = opcoes; el.ini.onchange = opcoes;
    tipo();
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (!el.dur.value) { toast('Não há duração possível nesse horário.', 'erro'); return; }
      const inicio = lisboa(dia, +el.ini.value), fimD = new Date(inicio.getTime() + +el.dur.value * 60000);
      const reg = { espaco_id: el.esp.value, tipo: el.tipo.value, inicio: inicio.toISOString(), fim: fimD.toISOString(), origem: 'rececao', notas: el.notas.value.trim() || null };
      if (blq()) reg.motivo = el.motivo.value.trim() || null;
      else Object.assign(reg, { quarto: normQuarto(el.quarto.value) || el.quarto.value.trim().toUpperCase(), apelido: el.apelido.value.trim(), nome: el.nome.value.trim() || null, telefone: el.tel.value.trim() || null, email: el.email.value.trim().toLowerCase() || null, precisa_material: el.mat.checked });
      const { error } = await sb.from('reservas').insert(reg);
      if (error) { toast(erroTexto(error), 'erro'); return; }
      fechar(); toast(blq() ? 'Bloqueio criado' : 'Reserva criada'); recarregar();
    };
  });
}

/* ---------- detalhe ---------- */
const linkReserva = r => `${location.origin}${location.pathname}#/r/${r.token}`;
function msgHospede(r, u) {
  const base = `Verdelago Sports Center: ${nomeEsp(r.espaco_id)}, ${dataCurta(diaDe(r.inicio))} ${hora(r.inicio)}–${hora(r.fim)}.`;
  return (u ? `${base} Material no cacifo ${u.cacifo_id}, código ${u.codigo}.` : base) + ` ${linkReserva(r)}`;
}
const waLink = (tel, txt) => `https://wa.me/${String(tel || '').replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`;
function cacifosLivres() { const ocup = new Set(usosAtivos.map(u => u.cacifo_id)); return cacifos.filter(c => c.ativo && !ocup.has(c.id)); }

function detalhe(r) {
  if (!r) return;
  const u = usoAtivo(r), res = r.tipo === 'reserva';
  const livres = cacifosLivres();
  dialogo(`<div class="row between"><h3>${esc(nomeEsp(r.espaco_id))} · ${hora(r.inicio)}–${hora(r.fim)}</h3><button class="x" data-fechar aria-label="Fechar">×</button></div>
    <dl class="dl">${res ? `<dt>Quarto</dt><dd>${esc(r.quarto)} · ${esc(r.apelido)}${r.nome ? ` (${esc(r.nome)})` : ''}</dd>
      ${r.email ? `<dt>Email</dt><dd>${esc(r.email)}<br><span class="small muted">${r.email_confirmacao_em ? `Confirmação enviada ${esc(dataCurta(diaDe(r.email_confirmacao_em)))} às ${hora(r.email_confirmacao_em)}` : 'Confirmação por email ainda não enviada'}</span></dd>` : ''}${r.telefone ? `<dt>Telemóvel</dt><dd>${esc(r.telefone)}</dd>` : ''}
      ${r.jogadores ? `<dt>Jogadores</dt><dd>${r.jogadores}</dd>` : ''}<dt>Origem</dt><dd>${r.origem === 'online' ? 'Online' : 'Receção'}</dd>`
      : `<dt>Tipo</dt><dd>${r.tipo === 'torneio' ? 'Torneio' : 'Bloqueio'}</dd>${r.motivo ? `<dt>Motivo</dt><dd>${esc(r.motivo)}</dd>` : ''}`}
      ${r.notas ? `<dt>Notas</dt><dd>${esc(r.notas)}</dd>` : ''}</dl>
    ${res ? `<section class="stack cx">
      <h3>Cacifo</h3>
      ${u ? `<div class="cacifo-big small"><div><span>Cacifo</span><b>${u.cacifo_id}</b></div><div><span>Código</span><b>${esc(u.codigo)}</b></div>${u.material ? `<p>${esc(u.material)}</p>` : ''}</div>
        <p class="small muted" style="margin:0">${u.notificado_em ? `Código enviado por email às ${hora(u.notificado_em)}.` : r.email ? 'Código ainda não enviado por email.' : 'Sem email: envie o código por WhatsApp ou mensagem.'}</p>
        <div class="row"><button class="btn small" data-acao="devolvido">Material devolvido</button><button class="btn ghost danger small" data-acao="nao_devolvido">Não devolvido</button><button class="btn ghost small" data-acao="retirar">Retirar do cacifo</button></div>`
      : `<form class="stack" id="f-cacifo">
          ${r.precisa_material ? '<p class="small">🎒 O hóspede pediu material.</p>' : ''}
          <div class="fgrid">
            <label class="f" for="c-num">Cacifo<select id="c-num" name="num" required>${livres.map(c => `<option value="${c.id}">${c.id}${c.tamanho === 'grande' ? ' (grande)' : ''}</option>`).join('') || '<option value="">Nenhum livre</option>'}</select></label>
            <label class="f" for="c-cod">Código definido<div class="row nowrap"><input id="c-cod" name="cod" required pattern="[0-9]{3,8}" inputmode="numeric" maxlength="8" style="width:100%"><button type="button" class="btn ghost small" id="c-gerar" title="Sugerir código">🎲</button></div></label>
            <label class="f wide" for="c-mat">Material deixado<input id="c-mat" name="mat" placeholder="Ex.: 4 raquetes + 1 tubo de bolas"></label>
          </div>
          <div class="row end"><button class="btn small" ${livres.length ? '' : 'disabled'}>Guardar cacifo</button></div>
        </form>`}
      <div class="row">
        <button class="btn ghost small" data-acao="copiar">Copiar mensagem para o hóspede</button>
        ${r.telefone ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(waLink(r.telefone, msgHospede(r, u)))}">Enviar por WhatsApp</a>` : ''}
        ${r.email ? `<a class="btn ghost small" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Reserva Verdelago Sports Center')}&body=${encodeURIComponent(msgHospede(r, u))}">Enviar por email</a>` : ''}
      </div></section>` : ''}
    ${r.tipo === 'torneio' ? '<p class="small muted">Bloqueio automático do torneio. Para mudar campos ou horas, edite o torneio.</p>' : ''}
    <div class="row between">${r.tipo === 'torneio' ? '<button class="btn small" data-acao="torneio">Editar torneio</button>' : `<button class="btn ghost danger small" data-acao="cancelar">${res ? 'Cancelar reserva' : 'Remover bloqueio'}</button>`}<button class="btn ghost small" data-fechar>Fechar</button></div>`,
    (dlg, fechar) => {
      const acao = async (k) => {
        if (k === 'torneio') { fechar(); editarTorneio(torneios.find(t => t.id === r.torneio_id) || (await sb.from('torneios').select('*').eq('id', r.torneio_id).single()).data); return; }
        if (k === 'copiar') { try { await navigator.clipboard.writeText(msgHospede(r, u)); toast('Mensagem copiada'); } catch { prompt('', msgHospede(r, u)); } return; }
        if (k === 'cancelar') {
          if (!await confirmar(res ? `Cancelar a reserva do quarto ${r.quarto}?` : 'Remover este bloqueio?', res ? 'Cancelar reserva' : 'Remover', true)) return;
          const { error } = await sb.from('reservas').update({ estado: 'cancelada', cancelado_em: new Date().toISOString() }).eq('id', r.id);
          if (!error && u) await sb.from('cacifo_usos').update({ estado: 'cancelado' }).eq('id', u.id);
          if (error) { toast(erroTexto(error), 'erro'); return; }
          toast(res ? 'Reserva cancelada' : 'Bloqueio removido'); recarregar(); return;
        }
        if (k === 'nao_devolvido') { fechar(); naoDevolvido(u, r); return; }
        if (k === 'devolvido' || k === 'retirar') {
          const upd = k === 'devolvido' ? { estado: 'devolvido', devolvido_em: new Date().toISOString() } : { estado: 'cancelado' };
          const { error } = await sb.from('cacifo_usos').update(upd).eq('id', u.id);
          if (error) { toast(erroTexto(error), 'erro'); return; }
          fechar(); toast(k === 'devolvido' ? `Cacifo ${u.cacifo_id} livre. Lembre-se de mudar o código.` : 'Cacifo libertado'); recarregar();
        }
      };
      dlg.querySelectorAll('[data-acao]').forEach(b => b.onclick = () => acao(b.dataset.acao));
      const fc = dlg.querySelector('#f-cacifo');
      if (fc) {
        dlg.querySelector('#c-gerar').onclick = () => { fc.elements.cod.value = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); };
        fc.onsubmit = async ev => {
          ev.preventDefault();
          const el = fc.elements;
          const { data: { user } } = await sb.auth.getUser();
          const { error } = await sb.from('cacifo_usos').insert({ cacifo_id: +el.num.value, reserva_id: r.id, codigo: el.cod.value.trim(), material: el.mat.value.trim() || null, preparado_por: user?.id || null });
          if (error) { toast(/cacifo_ocupado/.test(error.message) ? 'Esse cacifo já está ocupado.' : erroTexto(error), 'erro'); return; }
          toast(`Cacifo ${el.num.value} associado. O hóspede já vê o código na reserva.`);
          await recarregar();
          detalhe(itens.find(x => x.id === r.id) || porPreparar.find(x => x.id === r.id) || r);
        };
      }
    });
}

/* ---------- torneios (bloqueiam os campos automaticamente) ---------- */
const hm = t => String(t || '').slice(0, 5);
function diasTorneio(t) {
  if (!t.data) return 'Sem data';
  return t.data_fim && t.data_fim !== t.data ? `${dataCurta(t.data)} a ${dataCurta(t.data_fim)}` : dataLonga(t.data);
}
function vTorneios() {
  const passou = t => t.data && (t.data_fim || t.data) < hoje();
  const lista = ts => ts.length ? `<ul class="lista card">${ts.map(t => `<li><span><b class="cap">${esc(t.nome)}</b><br><span class="small"><span class="cap">${esc(diasTorneio(t))}</span> · ${hm(t.hora_inicio)}–${hm(t.hora_fim)} · ${t.espacos.length ? esc(t.espacos.map(nomeEsp).join(', ')) : '<span class="chip warn">sem campos</span>'}${t.publico ? '' : ' · <span class="chip">privado</span>'}</span></span>
      <span class="row">${t.data ? `<button class="btn ghost small" data-ver="${t.id}">Ver na grelha</button>` : ''}<button class="btn ghost small" data-tor="${t.id}">Dias e campos</button><a class="btn small" href="#/torneio/${t.id}">Abrir torneio</a></span></li>`).join('')}</ul>` : '<p class="muted">Nenhum.</p>';
  const prox = torneios.filter(t => !passou(t)), ant = torneios.filter(passou).reverse();
  return `<section class="stack"><div class="row between"><h2>Próximos torneios</h2><button class="btn small" id="b-tor">+ Torneio</button></div>
    <p class="small muted" style="margin:0">Em "Abrir torneio": inscrições, grupos, jogos, resultados, eliminatórias e ecrã TV (<a href="#/tv/torneio" target="_blank" rel="noopener">#/tv/torneio</a> mostra o torneio público do dia). Os campos escolhidos ficam bloqueados automaticamente nos dias e horas do torneio, e os hóspedes deixam de os poder reservar. Se já houver reservas nesse horário, o torneio não é gravado e aparece a lista para as resolver.</p>
    ${lista(prox)}</section>
    ${ant.length ? `<section class="stack"><h2>Últimas duas semanas</h2>${lista(ant)}</section>` : ''}`;
}
function ligarTorneios() {
  $('#b-tor').onclick = () => editarTorneio(null);
  $$('[data-tor]').forEach(b => b.onclick = () => editarTorneio(torneios.find(t => t.id === b.dataset.tor)));
  $$('[data-ver]').forEach(b => b.onclick = () => { const t = torneios.find(x => x.id === b.dataset.ver); dia = t.data; aba = 'grelha'; recarregar(); });
}
// Também usado na página do torneio (torneio.js), com a base e o "depois" de lá.
export function editarTorneio(t, Bx = B, depois = recarregar) {
  const novoT = !t;
  t = t || { nome: '', data: dia >= hoje() ? dia : hoje(), data_fim: null, hora_inicio: '09:00', hora_fim: '13:00', espacos: Bx.espacos.filter(e => e.modalidade === 'padel').map(e => e.id), publico: true, notas: '' };
  const ini = Math.min(...Bx.espacos.map(e => e.abreMin)), fim = Math.max(...Bx.espacos.map(e => e.fechaMin));
  const opH = (sel, de, ate) => { let h = ''; for (let m = de; m <= ate; m += 30) h += `<option value="${min2hm(m)}" ${min2hm(m) === hm(sel) ? 'selected' : ''}>${min2hm(m)}</option>`; return h; };
  const padel = Bx.espacos.filter(e => e.modalidade === 'padel'), outros = Bx.espacos.filter(e => e.modalidade !== 'padel');
  const chk = e => `<label><input type="checkbox" name="esp" value="${e.id}" ${t.espacos.includes(e.id) ? 'checked' : ''}> ${esc(e.nome)}</label>`;
  dialogo(`<div class="row between"><h3>${novoT ? 'Novo torneio' : 'Editar torneio'}</h3><button class="x" data-fechar aria-label="Fechar">×</button></div>
    <form class="stack" id="f-tor">
      <label class="f" for="t-nome">Nome<input id="t-nome" name="nome" required maxlength="80" value="${esc(t.nome)}" placeholder="Ex.: Torneio de pádel de sábado"></label>
      <div class="fgrid">
        <label class="f" for="t-data">Dia<input id="t-data" name="data" type="date" required value="${esc(t.data || '')}"></label>
        <label class="f" for="t-fim-d">Último dia (se for mais de um)<input id="t-fim-d" name="data_fim" type="date" value="${esc(t.data_fim || '')}"></label>
        <label class="f" for="t-hi">Das<select id="t-hi" name="hi">${opH(t.hora_inicio, ini, fim - 30)}</select></label>
        <label class="f" for="t-hf">Às<select id="t-hf" name="hf">${opH(t.hora_fim, ini + 30, fim)}</select></label>
      </div>
      <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="f" style="font-weight:600;margin-bottom:6px">Campos a bloquear</legend>
        <div class="seg">${padel.map(chk).join('')}</div>
        <div class="row"><button type="button" class="btn ghost small" data-todos="padel">Todos os de pádel</button><button type="button" class="btn ghost small" data-todos="">Nenhum</button></div>
        ${outros.length ? `<div class="seg">${outros.map(chk).join('')}</div>` : ''}
      </fieldset>
      <label class="chk" for="t-pub"><input type="checkbox" id="t-pub" name="publico" ${t.publico ? 'checked' : ''}><span>Mostrar o nome do torneio aos hóspedes e no ecrã TV<small class="muted">Sem esta opção, os hóspedes e o ecrã TV veem só “Torneio”.</small></span></label>
      <label class="f" for="t-notas">Notas<input id="t-notas" name="notas" value="${esc(t.notas || '')}"></label>
      <p class="small erro-tor" role="alert" hidden style="color:var(--bad)"></p>
      <div class="row between">${novoT ? '<span></span>' : '<button type="button" class="btn ghost danger small" id="t-apagar">Apagar torneio</button>'}<span class="row"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button class="btn">Guardar</button></span></div>
    </form>`, (dlg, fechar) => {
    const f = dlg.querySelector('form'), el = f.elements, erro = dlg.querySelector('.erro-tor');
    dlg.querySelectorAll('[data-todos]').forEach(b => b.onclick = () => {
      dlg.querySelectorAll('[name=esp]').forEach(c => { c.checked = !!b.dataset.todos && Bx.espacos.find(e => e.id === c.value)?.modalidade === b.dataset.todos; });
    });
    f.onsubmit = async ev => {
      ev.preventDefault(); erro.hidden = true;
      const reg = {
        nome: el.nome.value.trim(), data: el.data.value, data_fim: el.data_fim.value && el.data_fim.value !== el.data.value ? el.data_fim.value : null,
        hora_inicio: el.hi.value, hora_fim: el.hf.value, espacos: $$('[name=esp]:checked', dlg).map(c => c.value),
        publico: el.publico.checked, notas: el.notas.value.trim() || null,
      };
      const msg = !reg.nome ? 'Indique o nome.' : reg.hora_fim <= reg.hora_inicio ? 'A hora de fim tem de ser depois da de início.'
        : reg.data_fim && reg.data_fim < reg.data ? 'O último dia tem de ser depois do primeiro.' : !reg.espacos.length ? 'Escolha pelo menos um campo.' : '';
      if (msg) { erro.textContent = msg; erro.hidden = false; return; }
      const q = novoT ? sb.from('torneios').insert(reg).select('id').single() : sb.from('torneios').update(reg).eq('id', t.id);
      const { data: novo, error } = await q;
      if (error) { erro.textContent = /torneios_datas_ck/.test(error.message) ? 'Um torneio pode ter no máximo 15 dias.' : erroTexto(error); erro.hidden = false; return; }
      fechar(); toast(`Torneio guardado: ${reg.espacos.length} campo${reg.espacos.length === 1 ? '' : 's'} bloqueado${reg.espacos.length === 1 ? '' : 's'}.`);
      if (novoT && novo) location.hash = `#/torneio/${novo.id}`; else depois();
    };
    const ap = dlg.querySelector('#t-apagar');
    if (ap) ap.onclick = async () => {
      if (!await confirmar(`Apagar o torneio "${t.nome}"? Os campos ficam livres para reserva.`, 'Apagar', true)) return;
      const { error } = await sb.from('torneios').delete().eq('id', t.id);
      if (error) { toast(erroTexto(error), 'erro'); return; }
      toast('Torneio apagado. Campos livres.');
      if (location.hash.startsWith('#/torneio/')) location.hash = '#/rececao'; else depois();
    };
  });
}

/* ---------- cacifos e material ---------- */
function vCacifos() {
  const usoDe = id => usosAtivos.find(u => u.cacifo_id === id);
  return `<section class="stack"><h2>Material por preparar</h2>
    ${porPreparar.length ? `<ul class="lista card">${porPreparar.map(r => `<li><span><b>${esc(dataCurta(diaDe(r.inicio)))} ${hora(r.inicio)}</b> · ${esc(nomeEsp(r.espaco_id))} · ${esc(r.quarto)} ${esc(r.apelido)}${r.notas ? ` <span class="muted small">· ${esc(r.notas)}</span>` : ''}</span><button class="btn small" data-prep="${r.id}">Preparar cacifo</button></li>`).join('')}</ul>`
      : '<p class="muted">Nada por preparar hoje e amanhã.</p>'}</section>
    <section class="stack"><h2>Cacifos</h2><div class="cacifos">${cacifos.map(c => {
      const u = usoDe(c.id), r = u?.reservas;
      return `<div class="cacifo ${u ? 'ocup' : ''} ${c.ativo ? '' : 'inativo'}"><div class="row between"><b class="cn">${c.id}</b><span class="chip ${u ? 'warn' : 'ok'}">${!c.ativo ? 'Inativo' : u ? 'Ocupado' : 'Livre'}</span></div>
        <span class="small muted">${c.tamanho === 'grande' ? 'Grande' : 'Médio'}</span>
        ${u && r ? `<div class="small">${esc(r.quarto)} ${esc(r.apelido)} · ${esc(nomeEsp(r.espaco_id))}<br>${esc(dataCurta(diaDe(r.inicio)))} ${hora(r.inicio)} · código <b>${esc(u.codigo)}</b>${u.material ? `<br>${esc(u.material)}` : ''}</div>
          <div class="row"><button class="btn small" data-dev="${u.id}">Devolvido</button><button class="btn ghost danger small" data-nd="${u.id}">Não devolvido</button></div>` : ''}</div>`;
    }).join('')}</div>
    <p class="small muted">Depois de cada devolução, mude o código da fechadura antes de voltar a usar o cacifo. Se o material não for devolvido, use "Não devolvido": a receção do resort recebe um email com os dados do hóspede.</p></section>
    <section class="stack"><h2>Material não devolvido (30 dias)</h2>
    ${naoDevolvidos.length ? `<ul class="lista card">${naoDevolvidos.map(x => { const r = x.reservas || {};
      return `<li><span><b>${esc(r.quarto)} ${esc(r.apelido)}</b> · cacifo ${x.cacifo_id} · ${esc(dataCurta(diaDe(x.nao_devolvido_em)))} ${hora(x.nao_devolvido_em)}<br><span class="small">${esc(x.falta || x.material || '')}</span>
        <span class="small muted">· ${x.aviso_rececao_em ? `receção avisada às ${hora(x.aviso_rececao_em)}` : 'aviso por enviar'}</span></span>
        <button class="btn ghost small" data-afinal="${x.id}">Afinal foi devolvido</button></li>`; }).join('')}</ul>` : '<p class="muted">Nenhum caso.</p>'}</section>`;
}
function ligarCacifos() {
  $$('[data-prep]').forEach(b => b.onclick = () => detalhe(porPreparar.find(r => r.id === b.dataset.prep)));
  $$('[data-nd]').forEach(b => b.onclick = () => { const u = usosAtivos.find(x => x.id === b.dataset.nd); if (u) naoDevolvido(u, u.reservas); });
  $$('[data-afinal]').forEach(b => b.onclick = async () => {
    if (!await confirmar('Marcar como devolvido? Avise também a receção do resort de que já não há nada a cobrar.', 'Foi devolvido', false)) return;
    const { error } = await sb.from('cacifo_usos').update({ estado: 'devolvido', devolvido_em: new Date().toISOString() }).eq('id', b.dataset.afinal);
    if (error) { toast(erroTexto(error), 'erro'); return; }
    toast('Marcado como devolvido.'); recarregar();
  });
  $$('[data-dev]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('cacifo_usos').update({ estado: 'devolvido', devolvido_em: new Date().toISOString() }).eq('id', b.dataset.dev);
    if (error) { toast(erroTexto(error), 'erro'); return; }
    toast('Cacifo livre. Lembre-se de mudar o código.'); recarregar();
  });
}

/* ---------- material não devolvido: avisa a receção do resort por email ---------- */
function naoDevolvido(u, r) {
  dialogo(`<div class="row between"><h3>Material não devolvido · cacifo ${u.cacifo_id}</h3><button class="x" data-fechar aria-label="Fechar">×</button></div>
    <p style="margin:0">Quarto <b>${esc(r?.quarto || '')}</b> · ${esc(r?.apelido || '')}${r?.nome ? ` (${esc(r.nome)})` : ''}${r ? ` · ${esc(nomeEsp(r.espaco_id))}, ${esc(dataCurta(diaDe(r.inicio)))} ${hora(r.inicio)}` : ''}</p>
    <form class="stack" id="f-nd">
      <label class="f" for="nd-falta">O que não foi devolvido<textarea id="nd-falta" name="falta" rows="3" required>${esc(u.material || '')}</textarea></label>
      <p class="small muted" style="margin:0">A receção do resort recebe um email com o quarto, o nome e os contactos do hóspede, para o contactar ou efetuar a cobrança. O cacifo fica livre: mude o código da fechadura.</p>
      <div class="row end"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button class="btn danger">Registar e avisar a receção</button></div>
    </form>`, (dlg, fechar) => {
    const f = dlg.querySelector('form');
    f.onsubmit = async ev => {
      ev.preventDefault();
      const falta = f.elements.falta.value.trim();
      if (!falta) { toast('Indique o que não foi devolvido.', 'erro'); return; }
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from('cacifo_usos').update({ estado: 'nao_devolvido', nao_devolvido_em: new Date().toISOString(), falta, marcado_por: user?.id || null }).eq('id', u.id).eq('estado', 'preparado');
      if (error) { toast(erroTexto(error), 'erro'); return; }
      fechar(); toast(`Registado. A receção do resort vai receber o aviso. Cacifo ${u.cacifo_id} livre: mude o código.`); recarregar();
    };
  });
}
