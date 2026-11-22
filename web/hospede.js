// Páginas do hóspede: reservar (#/) e ver/cancelar reserva (#/r/<token>). PT/EN.
import { sb, $, esc, lisboa, hoje, addDias, min2hm, hora, dataLonga, dataCurta, diaDe, MODALIDADES, nomeMod, carregarBase, erroTexto, toast, confirmar, LOGO, autoAtualizar, ocupado } from './core.js?v=28';

const TXT = {
  pt: {
    titulo: 'Reservar espaço desportivo', sub: 'Exclusivo para hóspedes do Verdelago',
    mod: 'Modalidade', dia: 'Dia', dur: 'Duração', hora: 'Hora de início', campo: 'Campo',
    hojeL: 'Hoje', amanha: 'Amanhã', livres: n => n === 1 ? '1 livre' : `${n} livres`, semHoras: 'Não há horários livres neste dia para esta duração.',
    dados: 'Os seus dados', quarto: 'Quarto (ex.: A123, T045, V12)', apelido: 'Apelido (como no check-in)', nome: 'Nome', email: 'Email', tel: 'Telemóvel (opcional)',
    jog: 'N.º de jogadores', material: 'Preciso de material (raquetes, bolas…)', materialNota: 'Se a receção estiver fechada, deixamos o material num cacifo e o código aparece na sua reserva.',
    notas: 'Observações (opcional)', reservar: 'Confirmar reserva', aReservar: 'A reservar…',
    resumo: (e, d, h1, h2) => `${e} · ${d} · ${h1}–${h2}`,
    minhas: 'As minhas reservas', verRes: 'Ver',
    sua: 'A sua reserva', confirmada: 'Confirmada', cancelada: 'Cancelada',
    guardeLink: 'Guarde este link: é por aqui que vê o código do cacifo e pode cancelar.',
    copiar: 'Copiar link', copiado: 'Link copiado', cancelar: 'Cancelar reserva', cancelarQ: 'Cancelar esta reserva?', canceladaOk: 'Reserva cancelada',
    cacifo: 'Cacifo', codigo: 'Código', cacifoEspera: 'O material vai ser deixado num cacifo. O número e o código aparecem aqui quando a receção o preparar.',
    atualizar: 'Atualizar', naoEncontrada: 'Reserva não encontrada. Verifique o link.', nova: 'Nova reserva', voltar: '← Reservar',
    quartoL: 'Quarto', jogL: 'Jogadores', min: 'min', okReserva: 'Reserva confirmada!',
  },
  en: {
    titulo: 'Book a sports court', sub: 'For Verdelago guests only',
    mod: 'Sport', dia: 'Day', dur: 'Duration', hora: 'Start time', campo: 'Court',
    hojeL: 'Today', amanha: 'Tomorrow', livres: n => `${n} free`, semHoras: 'No free times on this day for this duration.',
    dados: 'Your details', quarto: 'Room (e.g. A123, T045, V12)', apelido: 'Surname (as at check-in)', nome: 'Name', email: 'Email', tel: 'Mobile (optional)',
    jog: 'Number of players', material: 'I need equipment (rackets, balls…)', materialNota: 'If reception is closed, we leave the equipment in a locker and the code shows on your booking.',
    notas: 'Notes (optional)', reservar: 'Confirm booking', aReservar: 'Booking…',
    resumo: (e, d, h1, h2) => `${e} · ${d} · ${h1}–${h2}`,
    minhas: 'My bookings', verRes: 'View',
    sua: 'Your booking', confirmada: 'Confirmed', cancelada: 'Cancelled',
    guardeLink: 'Keep this link: it shows your locker code and lets you cancel.',
    copiar: 'Copy link', copiado: 'Link copied', cancelar: 'Cancel booking', cancelarQ: 'Cancel this booking?', canceladaOk: 'Booking cancelled',
    cacifo: 'Locker', codigo: 'Code', cacifoEspera: 'Your equipment will be left in a locker. The number and code will show here once reception has prepared it.',
    atualizar: 'Refresh', naoEncontrada: 'Booking not found. Please check the link.', nova: 'New booking', voltar: '← Book',
    quartoL: 'Room', jogL: 'Players', min: 'min', okReserva: 'Booking confirmed!',
  },
};
const ERROS_EN = {
  'Esse horário já está ocupado.': 'That time is already taken.',
  'Este horário acabou de ser reservado. Escolha outro.': 'This time has just been booked. Please choose another.',
  'Indique o número do quarto e o apelido.': 'Please enter your room number and surname.',
  'Indique um email válido.': 'Please enter a valid email.',
  'Já não é possível reservar este horário.': 'This time can no longer be booked.',
  'Horário inválido para este espaço.': 'Invalid time for this court.',
  'Duração inválida para este espaço.': 'Invalid duration for this court.',
  'Esta reserva já não pode ser cancelada.': 'This booking can no longer be cancelled.',
};

let lang = (() => { try { return localStorage.getItem('vs-lang') || (navigator.language.startsWith('pt') ? 'pt' : 'en'); } catch { return 'pt'; } })();
const t = k => TXT[lang][k];
const erroL = e => {
  const m = erroTexto(e);
  if (lang !== 'en') return m;
  const q = m.match(/^Não encontrámos o quarto (\S+)/);
  if (q) return `We could not find room ${q[1]} staying on that day. Please check the number or contact reception.`;
  return ERROS_EN[m] || m;
};

/* tokens das reservas feitas neste telemóvel (só para conveniência) */
const lerMinhas = () => { try { return JSON.parse(localStorage.getItem('vs-minhas') || '[]'); } catch { return []; } };
const guardarMinha = r => { try { const l = lerMinhas().filter(x => x.token !== r.token); l.unshift(r); localStorage.setItem('vs-minhas', JSON.stringify(l.slice(0, 10))); } catch { } };

let B = null; // { espacos, config }
const S = { mod: null, dia: null, dur: 60, hora: null, espaco: null, ocup: [], aCarregar: false };

function cabecalho() {
  return `<header class="top"><div class="brand">${LOGO}<div><div class="eyebrow">Verdelago · Sports Center</div><div class="tname">${esc(t('titulo'))}</div></div></div>
  <div class="top-r"><div class="lang" role="group" aria-label="Idioma / Language">${['pt', 'en'].map(l => `<button class="${l === lang ? 'on' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div></div></header>`;
}
function ligarLang(rerender) {
  document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { lang = b.dataset.lang; try { localStorage.setItem('vs-lang', lang); } catch { } document.documentElement.lang = lang; rerender(); });
}

/* =================== reservar =================== */
export async function paginaReservar(app) {
  document.documentElement.lang = lang;
  app.innerHTML = cabecalho() + '<main><div class="card vazio">…</div></main>';
  try { B = await carregarBase(); } catch (e) { app.querySelector('main').innerHTML = `<div class="card vazio">${esc(erroL(e))}</div>`; return; }
  B.espacos = B.espacos.filter(e => e.reserva_online);
  const mods = modsOrdenadas();
  S.mod = S.mod && mods.includes(S.mod) ? S.mod : mods[0];
  S.dia = S.dia || hoje();
  await carregarOcupacao();
  desenhar(app);
  // Disponibilidade sempre fresca, sem estragar um formulário a meio.
  autoAtualizar(async () => { await carregarOcupacao(); desenhar(app); }, 60000,
    () => !ocupado() && ![...document.querySelectorAll('#app form input, #app form textarea')].some(i => i.type === 'checkbox' ? i.checked : i.value.trim()));
}
// modalidades por ordem fixa (Pádel primeiro), não pela ordem dos campos
const modsOrdenadas = () => { const o = Object.keys(MODALIDADES); return [...new Set(B.espacos.map(e => e.modalidade))].sort((a, b) => o.indexOf(a) - o.indexOf(b)); };
async function carregarOcupacao() {
  S.aCarregar = true;
  const { data, error } = await sb.rpc('ocupacao', { p_dia: S.dia });
  S.aCarregar = false;
  if (error) { toast(erroL(error), 'erro'); S.ocup = []; return; }
  S.ocup = data.map(o => ({ ...o, a: new Date(o.inicio).getTime(), b: new Date(o.fim).getTime() }));
}
const espacosMod = () => B.espacos.filter(e => e.modalidade === S.mod);
function livre(e, a, b) { return !S.ocup.some(o => o.espaco_id === e.id && a < o.b && b > o.a); }
function horarios() {
  const es = espacosMod(), passo = Math.min(...es.map(e => e.passo_min));
  const ini = Math.min(...es.map(e => e.abreMin)), fim = Math.max(...es.map(e => e.fechaMin));
  const limite = Date.now() + B.config.antecedencia_minima_min * 60000;
  const out = [];
  for (let m = ini; m + S.dur <= fim; m += passo) {
    const a = lisboa(S.dia, m).getTime(), b = a + S.dur * 60000;
    if (a < limite) continue;
    const livres = es.filter(e => m >= e.abreMin && m + S.dur <= e.fechaMin && (m - e.abreMin) % e.passo_min === 0 && S.dur <= e.max_duracao_min && livre(e, a, b));
    out.push({ m, livres });
  }
  return out;
}
function desenhar(app) {
  const es = espacosMod();
  const passo = Math.min(...es.map(e => e.passo_min)), maxDur = Math.max(...es.map(e => e.max_duracao_min));
  const durs = []; for (let d = passo; d <= maxDur; d += passo) durs.push(d);
  if (!durs.includes(S.dur)) S.dur = durs.includes(60) ? 60 : durs[0];
  const dias = []; for (let i = 0; i <= B.config.dias_antecedencia; i++) dias.push(addDias(hoje(), i));
  const hs = horarios();
  const sel = hs.find(h => h.m === S.hora);
  if (!sel || !sel.livres.length) { S.hora = null; S.espaco = null; }
  else if (!sel.livres.some(e => e.id === S.espaco)) S.espaco = sel.livres[0].id;
  const minhas = lerMinhas().filter(r => new Date(r.fim) > new Date());
  const chip = (attr, val, on, txt) => `<button class="chip-b ${on ? 'on' : ''}" ${attr}="${esc(val)}" aria-pressed="${on}">${txt}</button>`;
  const lblDia = d => d === hoje() ? t('hojeL') : d === addDias(hoje(), 1) ? t('amanha') : dataCurta(d, lang);
  const espSel = B.espacos.find(e => e.id === S.espaco);
  app.innerHTML = cabecalho() + `<main>
    <p class="muted" style="margin:0">${esc(t('sub'))}</p>
    ${minhas.length ? `<section class="card stack"><h2>${esc(t('minhas'))}</h2><ul class="lista">${minhas.map(r => `<li><span>${esc(r.resumo)}</span><a class="btn small ghost" href="#/r/${esc(r.token)}">${esc(t('verRes'))}</a></li>`).join('')}</ul></section>` : ''}
    <section class="card stack">
      <div class="passo"><h3>${esc(t('mod'))}</h3><div class="chips">${modsOrdenadas().map(m => chip('data-mod', m, m === S.mod, `${MODALIDADES[m]?.icon || ''} ${esc(nomeMod(m, lang))}`)).join('')}</div></div>
      <div class="passo"><h3>${esc(t('dia'))}</h3><div class="chips">${dias.map(d => chip('data-dia', d, d === S.dia, esc(lblDia(d)))).join('')}</div></div>
      <div class="passo"><h3>${esc(t('dur'))}</h3><div class="chips">${durs.map(d => chip('data-dur', d, d === S.dur, `${d} ${t('min')}`)).join('')}</div></div>
      <div class="passo"><h3>${esc(t('hora'))} <span class="muted small">· ${esc(dataLonga(S.dia, lang))}</span></h3>
        ${hs.some(h => h.livres.length) ? `<div class="horas">${hs.map(h => `<button class="hora-b ${h.m === S.hora ? 'on' : ''}" data-hora="${h.m}" ${h.livres.length ? '' : 'disabled'}><b>${min2hm(h.m)}</b>${es.length > 1 ? `<span>${h.livres.length ? esc(t('livres')(h.livres.length)) : '—'}</span>` : ''}</button>`).join('')}</div>` : `<p class="muted">${esc(t('semHoras'))}</p>`}
      </div>
      ${sel && es.length > 1 ? `<div class="passo"><h3>${esc(t('campo'))}</h3><div class="chips">${sel.livres.map(e => chip('data-esp', e.id, e.id === S.espaco, esc(e.nome))).join('')}</div></div>` : ''}
    </section>
    ${S.hora != null && espSel ? `<form class="card stack" id="f-reserva">
      <div class="resumo">${esc(t('resumo')(espSel.nome, dataLonga(S.dia, lang), min2hm(S.hora), min2hm(S.hora + S.dur)))}</div>
      <h2>${esc(t('dados'))}</h2>
      <div class="fgrid">
        <label class="f" for="r-quarto">${esc(t('quarto'))}<input id="r-quarto" name="quarto" required autocomplete="off" autocapitalize="characters" placeholder="A123"></label>
        <label class="f" for="r-apelido">${esc(t('apelido'))}<input id="r-apelido" name="apelido" required autocomplete="family-name"></label>
        <label class="f" for="r-nome">${esc(t('nome'))}<input id="r-nome" name="nome" autocomplete="name"></label>
        <label class="f" for="r-email">${esc(t('email'))}<input id="r-email" name="email" type="email" required autocomplete="email"></label>
        <label class="f" for="r-tel">${esc(t('tel'))}<input id="r-tel" name="tel" type="tel" autocomplete="tel"></label>
        <label class="f" for="r-jog">${esc(t('jog'))}<input id="r-jog" name="jog" type="number" min="1" max="30"></label>
        <label class="chk wide" for="r-mat"><input type="checkbox" id="r-mat" name="mat"><span>${esc(t('material'))}<small class="muted">${esc(t('materialNota'))}</small></span></label>
        <label class="f wide" for="r-notas">${esc(t('notas'))}<input id="r-notas" name="notas"></label>
      </div>
      <div class="row end"><button class="btn" id="b-reservar">${esc(t('reservar'))}</button></div>
    </form>` : ''}
  </main>`;
  ligarLang(() => desenhar(app));
  app.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => { S.mod = b.dataset.mod; S.hora = null; desenhar(app); });
  app.querySelectorAll('[data-dia]').forEach(b => b.onclick = async () => { S.dia = b.dataset.dia; S.hora = null; await carregarOcupacao(); desenhar(app); });
  app.querySelectorAll('[data-dur]').forEach(b => b.onclick = () => { S.dur = +b.dataset.dur; desenhar(app); });
  app.querySelectorAll('[data-hora]').forEach(b => b.onclick = () => { S.hora = +b.dataset.hora; desenhar(app); setTimeout(() => { const f = $('#f-reserva'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); });
  app.querySelectorAll('[data-esp]').forEach(b => b.onclick = () => { S.espaco = b.dataset.esp; desenhar(app); });
  const f = $('#f-reserva');
  if (f) f.onsubmit = async ev => {
    ev.preventDefault();
    const el = f.elements, btn = $('#b-reservar');
    btn.disabled = true; btn.textContent = t('aReservar');
    const inicio = lisboa(S.dia, S.hora);
    const { data: token, error } = await sb.rpc('criar_reserva', {
      p_espaco: S.espaco, p_inicio: inicio.toISOString(), p_duracao_min: S.dur,
      p_quarto: el.quarto.value, p_apelido: el.apelido.value, p_nome: el.nome.value, p_email: el.email.value,
      p_telefone: el.tel.value || null, p_jogadores: +el.jog.value || null, p_material: el.mat.checked, p_notas: el.notas.value || null,
    });
    if (error) {
      btn.disabled = false; btn.textContent = t('reservar'); toast(erroL(error), 'erro');
      await carregarOcupacao(); return;
    }
    guardarMinha({ token, fim: new Date(inicio.getTime() + S.dur * 60000).toISOString(), resumo: `${espSel.nome} · ${dataCurta(S.dia, lang)} · ${min2hm(S.hora)}` });
    S.hora = null;
    sessionStorage.setItem('vs-nova', '1');
    location.hash = '#/r/' + token;
  };
}

/* =================== ver reserva =================== */
export async function paginaReserva(app, token) {
  document.documentElement.lang = lang;
  app.innerHTML = cabecalho() + '<main><div class="card vazio">…</div></main>';
  ligarLang(() => paginaReserva(app, token));
  const { data: r, error } = await sb.rpc('ver_reserva', { p_token: token });
  const main = app.querySelector('main');
  if (error || !r) { main.innerHTML = `<div class="card vazio">${esc(error ? erroL(error) : t('naoEncontrada'))}</div><a class="btn ghost" href="#/">${esc(t('voltar'))}</a>`; return; }
  let nova = false; try { nova = sessionStorage.getItem('vs-nova') === '1'; sessionStorage.removeItem('vs-nova'); } catch { }
  const dia = diaDe(r.inicio), ativa = r.estado === 'confirmada';
  main.innerHTML = `
    ${nova ? `<div class="ok-banner">✓ ${esc(t('okReserva'))}</div>` : ''}
    <section class="card stack">
      <div class="row between"><h2>${esc(t('sua'))}</h2><span class="chip ${ativa ? 'ok' : 'bad'}">${esc(ativa ? t('confirmada') : t('cancelada'))}</span></div>
      <div class="res-big"><span>${MODALIDADES[r.modalidade]?.icon || ''} ${esc(r.espaco)}</span><b>${hora(r.inicio)}–${hora(r.fim)}</b><span>${esc(dataLonga(dia, lang))}</span></div>
      <dl class="dl"><dt>${esc(t('quartoL'))}</dt><dd>${esc(r.quarto)} · ${esc(r.apelido)}</dd>${r.jogadores ? `<dt>${esc(t('jogL'))}</dt><dd>${r.jogadores}</dd>` : ''}</dl>
      ${ativa && r.cacifo ? `<div class="cacifo-big"><div><span>${esc(t('cacifo'))}</span><b>${r.cacifo.numero}</b></div><div><span>${esc(t('codigo'))}</span><b>${esc(r.cacifo.codigo)}</b></div>${r.cacifo.material ? `<p>${esc(r.cacifo.material)}</p>` : ''}</div>`
      : ativa && r.precisa_material ? `<div class="prev">🔒 ${esc(t('cacifoEspera'))}</div>` : ''}
      ${ativa ? `<p class="small muted">${esc(t('guardeLink'))}</p>` : ''}
      <div class="row">
        <button class="btn ghost small" id="b-copiar">${esc(t('copiar'))}</button>
        <button class="btn ghost small" id="b-atual">${esc(t('atualizar'))}</button>
        ${r.pode_cancelar ? `<button class="btn ghost danger small" id="b-cancelar">${esc(t('cancelar'))}</button>` : ''}
      </div>
    </section>
    <a class="btn ghost" href="#/">${esc(t('nova'))}</a>`;
  $('#b-copiar').onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast(t('copiado')); } catch { prompt('', location.href); } };
  $('#b-atual').onclick = () => paginaReserva(app, token);
  const bc = $('#b-cancelar');
  if (bc) bc.onclick = async () => {
    if (!await confirmar(t('cancelarQ'), t('cancelar'), true, lang === 'en' ? 'Back' : 'Voltar')) return;
    const { error: e2 } = await sb.rpc('cancelar_reserva', { p_token: token });
    if (e2) { toast(erroL(e2), 'erro'); return; }
    toast(t('canceladaOk')); paginaReserva(app, token);
  };
}
