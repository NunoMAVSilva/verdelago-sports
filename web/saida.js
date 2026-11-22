// Material desportivo no painel da receção (Home → Material em utilização):
//   novaSaida()  — registo da saída + termo de responsabilidade (email e assinatura do hóspede)
//   alterarSaida — corrigir/acrescentar equipamento (sem mudar quarto nem modalidades), fica registado quem alterou
//   devolverSaida — devolução (total ou parcial), com danos e perdas
// Grava na tabela `emprestimos` com o mesmo formato de `doc` da página Material (material/index.html).
// Guest/Proprietário e o check-out previsto vêm da lista de hóspedes (estadias); quem entrega/recebe/altera
// é a pessoa com sessão iniciada. O email e a assinatura são apagados depois do check-out se a devolução
// correu bem (função limpar_termos_material, migração 0011).
import { sb, $, esc, hora, lisboa, hoje, addDias, dataCurta, normQuarto, dialogo, toast, erroTexto, carregarBase } from './core.js?v=25';
import { numeroBadge } from './planta.js?v=25';

// Igual ao DEFAULT_CFG da página Material (usado enquanto não houver "main" em material_config)
const MODS = ['Padel', 'Ténis', 'Futebol', 'Futsal', 'Basquetebol', 'Voleibol', 'Material Diverso'];
const CURTO = { 'Material Diverso': 'Diverso' };
const PADRAO = {
  fecho: '20:00',
  itens: [
    { id: 'pad-ad', mod: 'Padel', nome: 'Raquetes Adulto', total: 46, num: true },
    { id: 'pad-cr', mod: 'Padel', nome: 'Raquetes Criança', total: 8, num: true },
    { id: 'pad-bol', mod: 'Padel', nome: 'Tubos de Bolas (3un)', total: 28, num: false },
    { id: 'ten-ad', mod: 'Ténis', nome: 'Raquetes Adulto', total: 16, num: true },
    { id: 'ten-cr', mod: 'Ténis', nome: 'Raquetes Criança', total: 5, num: true },
    { id: 'ten-bol', mod: 'Ténis', nome: 'Tubos de Bolas (4un)', total: 11, num: false },
    { id: 'fut-bola', mod: 'Futebol', nome: 'Bola', total: 5, num: false },
    { id: 'fts-3', mod: 'Futsal', nome: 'Bola tamanho 3', total: 0, num: false },
    { id: 'fts-4', mod: 'Futsal', nome: 'Bola tamanho 4', total: 2, num: false },
    { id: 'bsk-bola', mod: 'Basquetebol', nome: 'Bola', total: 3, num: false },
    { id: 'vol-bola', mod: 'Voleibol', nome: 'Bola', total: 5, num: false },
    { id: 'div-sap-ad', mod: 'Material Diverso', nome: 'Sapatilhas Adultos', total: 10, num: false },
    { id: 'div-sap-cr', mod: 'Material Diverso', nome: 'Sapatilhas Crianças', total: 1, num: false },
    { id: 'div-press', mod: 'Material Diverso', nome: 'Pressurizador Bolas', total: 1, num: false },
    { id: 'div-cone-lj', mod: 'Material Diverso', nome: 'Cones Laranja (grande)', total: 6, num: false },
    { id: 'div-cone-vm', mod: 'Material Diverso', nome: 'Cones Vermelhos', total: 4, num: false },
    { id: 'div-col-lj', mod: 'Material Diverso', nome: 'Coletes Laranja', total: 15, num: false },
    { id: 'div-col-am', mod: 'Material Diverso', nome: 'Coletes Amarelos', total: 12, num: false },
  ],
};
// Termo de responsabilidade provisório (o texto final será definido pelo Sports Center)
const TERMO = {
  pt: 'Ao levantar este material, o hóspede fica responsável pelo mesmo até à sua devolução no Sports Center.\n• Devolução até às {hora} de hoje.\n• O material perdido, danificado ou não devolvido até ao check-out poderá ser debitado na unidade {quarto}.',
  en: 'By collecting this equipment, the guest is responsible for it until it is returned to the Sports Center.\n• Please return it by {hora} today.\n• Equipment that is lost, damaged or not returned by check-out may be charged to unit {quarto}.',
};
const TX = {
  titulo: { pt: 'Termo de responsabilidade', en: 'Liability form' },
  ate: { pt: 'Devolver até', en: 'Return by' },
  mail: { pt: 'Email para receber o termo (opcional)', en: 'Email to receive a copy (optional)' },
  ass: { pt: 'Assinatura', en: 'Signature' },
  aqui: { pt: 'Assine aqui', en: 'Sign here' },
  aceita: { pt: 'Ao assinar, aceita o termo de responsabilidade acima.', en: 'By signing, you accept the terms above.' },
};
const PRAZOS = [['30', '30 minutos'], ['60', '1 hora'], ['90', '1h30'], ['120', '2h00'], ['outro', 'Outro…']];

const diaLx = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(t));
const minDoDia = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const novoId = () => crypto.randomUUID ? crypto.randomUUID() : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2);
const qtd = x => x.nums.length + x.sem;

// o que ainda está fora num empréstimo (descontando devoluções parciais), como pending() da página Material
export function pendente(l) {
  return (l.itens || []).map(i => {
    const r = (l.res && l.res[i.id]) || { qtd: 0, nums: [] };
    const nums = (i.nums || []).filter(n => !r.nums.includes(n));
    const sem = Math.max(0, (i.qtd - (i.nums || []).length) - (r.qtd - r.nums.length));
    return { id: i.id, nome: i.nome, mod: i.mod, nums, sem, qtd: nums.length + sem };
  }).filter(p => p.qtd > 0);
}

// Estadia atual (ou a próxima/última) de um quarto: tipo e data de check-out
export async function estadiaDe(quarto) {
  const { data } = await sb.from('estadias').select('proprietario, chegada, partida').eq('quarto', quarto).gte('partida', addDias(hoje(), -1)).order('chegada').limit(3);
  const h = hoje();
  return (data || []).find(e => e.chegada <= h && e.partida >= h) || (data || [])[0] || null;
}
// Texto e gravidade do check-out face ao material ainda fora
const diaMes = dia => { const [y, m, d] = dia.split('-').map(Number); return new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d))); };
export function avisoCheckout(checkout) {
  if (!checkout) return null;
  const h = hoje();
  if (checkout < h) return { cls: 'bad', txt: `Check-out já feito (${diaMes(checkout)})` };
  if (checkout === h) return { cls: 'bad', txt: 'Check-out hoje' };
  if (checkout === addDias(h, 1)) return { cls: 'warn', txt: 'Check-out amanhã' };
  return { cls: 'ok', txt: `Check-out a ${diaMes(checkout)}` };
}

async function carregar() {
  const [c, f] = await Promise.all([sb.from('material_config').select('chave, valor'), sb.from('emprestimos').select('id, doc').eq('estado', 'fora')]);
  if (c.error || f.error) throw (c.error || f.error);
  const main = c.data.find(x => x.chave === 'main')?.valor, av = c.data.find(x => x.chave === 'avarias')?.valor?.mapa || {};
  const cfg = { ...PADRAO, ...(main || {}) };
  const fora = f.data.map(d => ({ id: d.id, ...d.doc }));
  const foraNum = {}, foraQtd = {};
  fora.forEach(l => pendente(l).forEach(p => { foraQtd[p.id] = (foraQtd[p.id] || 0) + p.qtd; p.nums.forEach(n => { foraNum[p.id + ':' + n] = l; }); }));
  return { cfg, av, fora, foraNum, foraQtd, item: id => cfg.itens.find(i => i.id === id), avariados: id => Object.keys(av).filter(k => k.startsWith(id + ':')).length };
}

// Escolha de material (modalidades, raquetes numeradas e quantidades). ignorar = empréstimo a alterar (as peças dele contam como livres)
function seletor(d, M, F, { mods = MODS, ignorar = null, aoMudar = () => {} } = {}) {
  const fora = id => ignorar?.id === id;
  const ocupada = k => { const l = M.foraNum[k]; return l && !fora(l.id) ? l : null; };
  const emUso = id => { let n = M.foraQtd[id] || 0; if (ignorar) pendente(ignorar).forEach(p => { if (p.id === id) n -= p.qtd; }); return n; };
  const porMod = () => { const m = {}; Object.keys(F.cesto).forEach(id => { const i = M.item(id); if (i) m[i.mod] = (m[i.mod] || 0) + qtd(F.cesto[id]); }); return m; };
  const desMods = () => { const n = porMod(); $('#sd-mods').innerHTML = mods.map(m => `<button type="button" data-mod="${esc(m)}" aria-pressed="${F.abertas.includes(m)}">${esc(CURTO[m] || m)}${n[m] ? `<span class="dot">${n[m]}</span>` : ''}</button>`).join(''); };
  const desItens = () => {
    if (!F.abertas.length) { $('#sd-itens').innerHTML = '<p class="muted small" style="margin:0">Toque numa ou mais modalidades para escolher o material.</p>'; return; }
    $('#sd-itens').innerHTML = F.abertas.map(m => {
      const lista = M.cfg.itens.filter(i => i.mod === m);
      const corpo = lista.length ? lista.map(i => {
        const x = F.cesto[i.id] || { nums: [], sem: 0 }, disp = Math.max(0, i.total - emUso(i.id) - M.avariados(i.id));
        const passo = `<div class="sd-step"><button type="button" data-sem="${i.id}" data-d="-1" aria-label="Menos">−</button><output>${x.sem}</output><button type="button" data-sem="${i.id}" data-d="1" aria-label="Mais">+</button></div>`;
        let nums = '';
        if (i.num) { const sel = new Set(x.nums); for (let n = 1; n <= i.total; n++) { const k = i.id + ':' + n, o = ocupada(k), off = M.av[k]; nums += `<button type="button" class="sd-num${off ? ' off' : ''}" data-pick="${i.id}" data-n="${n}" aria-pressed="${sel.has(n)}" ${(o || off) && !sel.has(n) ? 'disabled' : ''} title="${o ? 'Fora: ' + esc(o.quarto) : off ? 'Fora de serviço' : 'Disponível'}">${n}</button>`; } }
        return `<div class="sd-it"><div class="row between"><span><b>${esc(i.nome)}</b> <small class="muted">${disp}/${i.total} disp.</small></span>${i.num ? `<span class="small muted row" style="gap:6px">Sem nº ${passo}</span>` : passo}</div>${nums ? `<div class="sd-nums">${nums}</div>` : ''}</div>`;
      }).join('') : '<p class="muted small" style="margin:0">Sem material nesta modalidade.</p>';
      return (F.abertas.length > 1 ? `<div class="sd-lbl">${esc(m)}</div>` : '') + corpo;
    }).join('');
  };
  const desCesto = () => {
    const ids = Object.keys(F.cesto), el = $('#sd-cesto'); el.hidden = !ids.length; if (!ids.length) return;
    el.innerHTML = '<div class="sd-lbl">A levar</div>' + ids.map(id => { const i = M.item(id) || { mod: '', nome: id }, x = F.cesto[id]; return `<div class="row between"><span><b>${qtd(x)}×</b> ${esc(CURTO[i.mod] || i.mod)} · ${esc(i.nome)}${x.nums.length ? ` <span class="nb">${x.nums.map(n => `<span>${n}</span>`).join('')}</span>` : ''}</span><button type="button" class="btn ghost small" data-rm="${id}" aria-label="Remover">×</button></div>`; }).join('');
  };
  const tudo = () => { desMods(); desItens(); desCesto(); aoMudar(); };
  $('#sd-mods').addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (!b) return; const m = b.dataset.mod, i = F.abertas.indexOf(m); if (i >= 0) F.abertas.splice(i, 1); else F.abertas.push(m); F.abertas.sort((a, b) => MODS.indexOf(a) - MODS.indexOf(b)); desMods(); desItens(); });
  $('#sd-itens').addEventListener('click', e => {
    const p = e.target.closest('[data-pick]'), s = e.target.closest('[data-sem]'); if (!p && !s) return;
    const id = p ? p.dataset.pick : s.dataset.sem, x = F.cesto[id] || (F.cesto[id] = { nums: [], sem: 0 });
    if (p) { const n = +p.dataset.n, i = x.nums.indexOf(n); if (i >= 0) x.nums.splice(i, 1); else { x.nums.push(n); x.nums.sort((a, b) => a - b); } }
    else x.sem = Math.max(0, x.sem + +s.dataset.d);
    if (!qtd(x)) delete F.cesto[id];
    tudo();
  });
  $('#sd-cesto').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; delete F.cesto[b.dataset.rm]; tudo(); });
  tudo();
  return { conflito: () => { for (const id of Object.keys(F.cesto)) for (const n of F.cesto[id].nums) { const o = ocupada(id + ':' + n); if (o) return `A raquete n.º ${n} (${M.item(id).nome}) já está fora com o quarto ${o.quarto}.`; } return ''; } };
}
const itensDoc = (M, F) => Object.keys(F.cesto).map(id => { const i = M.item(id) || { nome: id, mod: '' }, x = F.cesto[id]; return { id, nome: i.nome, mod: i.mod, qtd: qtd(x), nums: x.nums.slice() }; });
const htmlSeletor = `<div><div class="sd-lbl">Modalidades · pode abrir várias</div><div class="sd-mods" id="sd-mods"></div></div><div id="sd-itens" class="sd-itens"></div><div id="sd-cesto" class="sd-cesto" hidden></div>`;

/* ---------------- nova saída ---------------- */
export async function novaSaida({ entregou = '', depois = () => {} } = {}) {
  let M; try { M = await carregar(); } catch (e) { toast(erroTexto(e), 'erro'); return; }
  const F = { quarto: '', tipo: null, checkout: null, abertas: [], cesto: {}, prazo: '90', outro: '' };

  dialogo(`<div class="row between"><h3>Nova saída de material</h3><span class="row"><span class="small muted">Passo 1 de 3</span><button type="button" class="btn ghost small" data-fechar>Fechar</button></span></div>
    <form class="stack" id="f-saida" autocomplete="off">
      <div class="sd-quarto"><label class="f" for="sd-q">Quarto<input id="sd-q" maxlength="8" placeholder="A111" autocapitalize="characters" required></label><div id="sd-tipo" class="sd-tipo" aria-live="polite"></div></div>
      <div id="sd-aviso" hidden></div>
      ${htmlSeletor}
      <div class="fgrid">
        <label class="f" for="sd-prazo">Devolver até<select id="sd-prazo">${PRAZOS.map(([k, t]) => `<option value="${k}" ${k === F.prazo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f" for="sd-hora" id="sd-hora-l" hidden>Hora de devolução<input type="time" id="sd-hora" step="300"></label>
        <div class="sd-ate" id="sd-ate"></div>
      </div>
      <input id="sd-obs" aria-label="Observações" placeholder="Observações (opcional): campo 2, raquete com grip gasto…">
      <p class="small muted" style="margin:0">Entregue por <b>${esc(entregou || '—')}</b></p>
      <div class="err" id="sd-err" role="alert"></div>
      <div class="row end"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="sd-ok">Continuar para o termo →</button></div>
    </form>`, (d, fechar) => {
    d.classList.add('dlg-largo');
    const err = t => { $('#sd-err').textContent = t || ''; };

    // quarto: normaliza como no Opera e procura na lista de hóspedes (Guest / Proprietário e check-out)
    let tq = null;
    const verQuarto = async () => {
      const q = normQuarto($('#sd-q').value);
      if (q !== F.quarto) { F.quarto = q; F.tipo = null; F.checkout = null; }
      const el = $('#sd-tipo');
      if (!q || q.length < 2) { el.innerHTML = ''; avisos(); return; }
      el.innerHTML = '<span class="muted small">A procurar…</span>';
      const e = await estadiaDe(q);
      if (q !== F.quarto) return;
      F.tipo = e?.proprietario ? 'Proprietário' : 'Guest'; F.checkout = e?.partida || null;
      const co = avisoCheckout(F.checkout);
      el.innerHTML = `<span class="sd-badge ${e?.proprietario ? 'prop' : ''}">${F.tipo}</span>${co ? `<span class="chip ${co.cls === 'ok' ? '' : 'est-atraso'}">${esc(co.txt)}</span>` : '<span class="muted small">Não está na lista de hóspedes</span>'}`;
      avisos();
    };
    $('#sd-q').addEventListener('input', e => { const v = e.target.value.toUpperCase().replace(/\s/g, ''); if (v !== e.target.value) e.target.value = v; clearTimeout(tq); tq = setTimeout(verQuarto, 350); });
    $('#sd-q').addEventListener('blur', e => { e.target.value = normQuarto(e.target.value); clearTimeout(tq); verQuarto(); });
    const avisos = () => {
      const el = $('#sd-aviso'), ls = F.quarto ? M.fora.filter(l => normQuarto(l.quarto) === F.quarto) : [];
      el.hidden = !ls.length; el.className = 'sd-aviso';
      el.innerHTML = ls.map(l => `<b>${esc(F.quarto)} já tem material fora</b> desde as ${hora(l.saida)}: ${esc(pendente(l).map(p => `${p.qtd}× ${p.nome}${p.nums.length ? ' (nº ' + p.nums.join(', ') + ')' : ''}`).join('; '))}${Date.now() > l.prevista ? ' · <b>em atraso</b>' : ''}`).join('<br>');
    };

    // hora prevista de devolução: os prazos fixos não passam da hora de fecho do material
    const fecho = () => lisboa(hoje(), minDoDia(M.cfg.fecho || '20:00')).getTime();
    const prevista = () => {
      const agora = Date.now();
      if (F.prazo === 'outro') { if (!F.outro) return null; const t = lisboa(hoje(), minDoDia(F.outro)).getTime(); return t > agora ? t : null; }
      const t = agora + +F.prazo * 60000, f = fecho(); return f > agora && t > f ? f : t;
    };
    const ate = () => { const p = prevista(), f = fecho(); $('#sd-ate').innerHTML = p ? `<span class="sd-lbl">Devolve até</span><b>${hora(p)}</b>${F.prazo !== 'outro' && p === f ? ' <span class="muted small">(fecho)</span>' : ''}` : '<span class="muted small">Indique a hora</span>'; };
    const sel = seletor(d, M, F, { aoMudar: () => err() });
    $('#sd-prazo').addEventListener('change', e => { F.prazo = e.target.value; const o = F.prazo === 'outro'; $('#sd-hora-l').hidden = !o; if (o) $('#sd-hora').focus(); ate(); });
    $('#sd-hora').addEventListener('input', e => { F.outro = e.target.value; ate(); });
    const relogio = setInterval(() => { if (!d.isConnected) return clearInterval(relogio); ate(); }, 30000);
    ate();

    $('#f-saida').addEventListener('submit', async e => {
      e.preventDefault(); err();
      F.quarto = normQuarto($('#sd-q').value);
      if (!F.quarto) { err('Falta o n.º do quarto.'); $('#sd-q').focus(); return; }
      if (!Object.keys(F.cesto).length) { err('Escolha o material que vai levar.'); return; }
      const prev = prevista();
      if (!prev) { err(F.prazo === 'outro' ? 'Indique uma hora de devolução depois de agora.' : 'Falta a hora de devolução.'); return; }
      const c = sel.conflito(); if (c) { err(c); return; }
      if (!F.tipo) await verQuarto();
      const agora = Date.now(), itens = itensDoc(M, F);
      const doc = { dia: diaLx(agora), saida: agora, quarto: F.quarto, tipo: F.tipo || 'Guest', checkout: F.checkout, modalidades: [...new Set(itens.map(i => i.mod))], itens,
        prevista: prev, colabEntregou: entregou, posto: entregou, obs: $('#sd-obs').value.trim(), estado: 'fora', devolvido: null, colabRecebeu: '', incidentes: [], res: {}, devolucoes: [], alteracoes: [] };
      termo(d, fechar, doc, depois);
    });
  });
}

// Passo 2: o hóspede escreve o email (opcional) e assina o termo; ou recusa assinar
function termo(d, fechar, doc, depois) {
  const lg = 'en'; let tinta = false; // o termo aparece sempre em português e inglês
  const txt = k => TX[k].pt + (lg === 'pt' ? '' : ' · ' + TX[k][lg]);
  const termoTxt = l => TERMO[l].replace(/\{hora\}/g, hora(doc.prevista)).replace(/\{quarto\}/g, doc.quarto);
  d.innerHTML = `<div class="row between"><h3 id="tm-tit"></h3><span class="small muted">Passo 2 de 3</span></div>
    <div class="tm-res"><b>${esc(doc.quarto)}</b> <span class="sd-badge ${doc.tipo === 'Proprietário' ? 'prop' : ''} small">${esc(doc.tipo)}</span><div>${esc(doc.itens.map(i => `${i.qtd}× ${CURTO[i.mod] || i.mod} · ${i.nome}${i.nums.length ? ' (nº ' + i.nums.join(', ') + ')' : ''}`).join('; '))}</div><div><span id="tm-ate"></span> <b>${hora(doc.prevista)}</b></div></div>
    <div class="tm-texto" id="tm-texto"></div>
    <label class="f" for="tm-mail"><span id="tm-mail-l"></span><input type="email" id="tm-mail" inputmode="email" autocomplete="off" placeholder="nome@exemplo.com"></label>
    <div><div class="row between"><span class="sd-lbl" id="tm-ass-l"></span><button type="button" class="btn ghost small" id="tm-limpar">Apagar assinatura</button></div>
      <div class="tm-pad"><canvas id="tm-cv"></canvas><span class="tm-ph" id="tm-ph"></span></div></div>
    <p class="small" style="margin:0;font-weight:600" id="tm-aceita"></p>
    <div class="err" id="tm-err" role="alert"></div>
    <div class="row between"><button type="button" class="btn ghost" id="tm-recusa">Hóspede não quis assinar</button><span class="row"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="button" class="btn" id="tm-ok">Assinar e continuar →</button></span></div>`;
  const idioma = () => { $('#tm-tit').textContent = txt('titulo'); $('#tm-ate').textContent = txt('ate'); $('#tm-mail-l').textContent = txt('mail'); $('#tm-ass-l').textContent = txt('ass'); $('#tm-ph').textContent = txt('aqui'); $('#tm-aceita').textContent = txt('aceita');
    $('#tm-texto').innerHTML = [...new Set(['pt', lg])].map(k => `<div>${esc(termoTxt(k)).replace(/\n/g, '<br>')}</div>`).join(''); };
  idioma();
  // quadro da assinatura
  const cv = $('#tm-cv'), dpr = devicePixelRatio || 1; cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  const ctx = cv.getContext('2d');
  const branco = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); tinta = false; $('#tm-ph').hidden = false; };
  branco(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4 * dpr;
  let em = false, lx = 0, ly = 0;
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  cv.addEventListener('pointerdown', e => { em = true; cv.setPointerCapture(e.pointerId); [lx, ly] = pt(e); ctx.beginPath(); ctx.arc(lx, ly, ctx.lineWidth / 2, 0, 7); ctx.fillStyle = '#111'; ctx.fill(); tinta = true; $('#tm-ph').hidden = true; $('#tm-err').textContent = ''; });
  cv.addEventListener('pointermove', e => { if (!em) return; const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, () => { em = false; }));
  $('#tm-limpar').onclick = branco;
  const err = t => { $('#tm-err').textContent = t || ''; };
  const gravar = extra => campo(d, fechar, { ...doc, ...extra, lang: 'pt+en' }, depois);
  $('#tm-ok').onclick = () => {
    const mail = $('#tm-mail').value.trim();
    if (!tinta) { err('Falta a assinatura. Peça ao hóspede para assinar no quadro branco.'); return; }
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { err('O email não parece válido. Corrija ou deixe em branco.'); return; }
    const w = Math.min(520, cv.width), h = Math.round(cv.height * w / cv.width), c2 = document.createElement('canvas'); c2.width = w; c2.height = h; c2.getContext('2d').drawImage(cv, 0, 0, w, h);
    gravar({ assinatura: c2.toDataURL('image/png'), assinadoEm: Date.now(), aceitouCondicoes: true, condicoesTexto: [...new Set(['pt', lg])].map(termoTxt).join('\n\n'), email: mail, emailEstado: mail ? 'por enviar' : '' });
  };
  $('#tm-recusa').onclick = () => gravar({ assinaturaRecusada: true, email: $('#tm-mail').value.trim(), emailEstado: $('#tm-mail').value.trim() ? 'por enviar' : '' });
}

/* ---------------- passo 3: associar campo ---------------- */
// Campos de cada modalidade de material (null = todos)
const MOD_ESP = { Padel: ['padel'], 'Ténis': ['tenis'], Futebol: ['futebol', 'polidesportivo'], Futsal: ['polidesportivo', 'futebol'], Basquetebol: ['polidesportivo'], Voleibol: ['beach-volley'], 'Material Diverso': null };
async function campo(d, fechar, doc, depois) {
  let B = null; try { B = await carregarBase(); } catch { /* sem campos: só "Não associar" */ }
  const tipos = new Set(); let todos = false;
  (doc.modalidades || []).forEach(m => { const t = MOD_ESP[m]; if (!t) todos = true; else t.forEach(x => tipos.add(x)); });
  const esps = (B?.espacos || []).filter(e => todos || tipos.has(e.modalidade));
  const ini = new Date(), fim = new Date(doc.prevista);
  let ocup = [];
  if (esps.length) {
    const { data } = await sb.from('reservas').select('espaco_id, inicio, fim').eq('estado', 'confirmada').in('espaco_id', esps.map(e => e.id)).lt('inicio', fim.toISOString()).gt('fim', ini.toISOString()).order('inicio');
    ocup = data || [];
  }
  let sel = null;
  d.innerHTML = `<div class="row between"><h3>Associar campo</h3><span class="small muted">Passo 3 de 3</span></div>
    <p class="small muted" style="margin:0">${esc(doc.quarto)} · das ${hora(ini)} às ${hora(fim)}. O campo fica ocupado enquanto o material estiver fora e é libertado quando for devolvido.</p>
    ${esps.length ? `<div class="cp-grelha">${esps.map(e => { const o = ocup.filter(r => r.espaco_id === e.id);
      return `<button type="button" class="cp" data-cp="${esc(e.id)}" ${o.length ? 'disabled' : ''}>${numeroBadge(e)}<span><b>${esc(e.nome)}</b><small>${o.length ? 'Ocupado ' + o.map(r => `${hora(r.inicio)}–${hora(r.fim)}`).join(', ') : 'Livre'}</small></span></button>`; }).join('')}</div>`
      : '<p class="muted">Não há campos para estas modalidades.</p>'}
    <div class="err" id="cp-err" role="alert"></div>
    <div class="row between"><button type="button" class="btn ghost" data-fechar>Cancelar</button><span class="row"><button type="button" class="btn ghost" id="cp-nao">Não associar campo</button><button type="button" class="btn" id="cp-ok" disabled>Associar e registar</button></span></div>`;
  d.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => {
    sel = b.dataset.cp; d.querySelectorAll('[data-cp]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const ok = $('#cp-ok'); ok.disabled = false; ok.textContent = `Associar ${esps.find(e => e.id === sel).nome} e registar`;
  });
  const err = t => { $('#cp-err').textContent = t || ''; };
  const registar = async espId => {
    const bs = [$('#cp-ok'), $('#cp-nao')]; bs.forEach(b => { b.disabled = true; });
    const id = novoId(); let res = null;
    if (espId) {
      const r = await sb.from('reservas').insert({ espaco_id: espId, tipo: 'reserva', inicio: new Date().toISOString(), fim: fim.toISOString(), quarto: doc.quarto, apelido: 'Material',
        origem: 'rececao', notas: 'Material do balcão: ' + doc.itens.map(i => `${i.qtd}× ${i.nome}`).join(', ') }).select('id').single();
      if (r.error) { bs.forEach(b => { b.disabled = false; }); err(erroTexto(r.error)); return; }
      res = r.data.id;
    }
    const nome = espId ? esps.find(e => e.id === espId).nome : '';
    const { error } = await sb.from('emprestimos').insert({ id, doc: { ...doc, ...(espId ? { campo: { espaco_id: espId, nome, reserva_id: res } } : {}) } });
    if (error) { if (res) await sb.from('reservas').delete().eq('id', res); bs.forEach(b => { b.disabled = false; }); err(erroTexto(error)); return; }
    fechar(); toast(`Saída registada · ${doc.quarto} até ${hora(doc.prevista)}${nome ? ' · ' + nome : ''}${doc.assinatura ? ' · assinada' : ''}`); depois();
  };
  $('#cp-ok').onclick = () => { if (sel) registar(sel); };
  $('#cp-nao').onclick = () => registar(null);
}
// Ao devolver tudo, o campo associado fica livre a partir de agora
async function libertarCampo(doc) {
  const id = doc.campo?.reserva_id; if (!id) return;
  const { data: r } = await sb.from('reservas').select('inicio, fim, estado').eq('id', id).maybeSingle();
  if (!r || r.estado !== 'confirmada') return;
  const agora = new Date();
  if (agora >= new Date(r.fim)) return;
  const q = agora <= new Date(r.inicio)
    ? sb.from('reservas').update({ estado: 'cancelada', cancelado_em: agora.toISOString() }).eq('id', id)
    : sb.from('reservas').update({ fim: agora.toISOString() }).eq('id', id);
  const { error } = await q;
  if (error) toast('Material devolvido, mas o campo não foi libertado: ' + erroTexto(error), 'erro');
}

/* ---------------- alterar (corrigir ou acrescentar equipamento) ---------------- */
export async function alterarSaida(id, { por = '', depois = () => {} } = {}) {
  let M; try { M = await carregar(); } catch (e) { toast(erroTexto(e), 'erro'); return; }
  const l = M.fora.find(x => x.id === id); if (!l) { toast('Este registo já não está em utilização.', 'erro'); return; }
  if ((l.devolucoes || []).length) { toast('Este registo já tem devoluções parciais: corrija-o no separador Material.', 'erro'); return; }
  const mods = l.modalidades?.length ? l.modalidades : [...new Set((l.itens || []).map(i => i.mod))];
  const F = { abertas: mods.slice(), cesto: {} };
  (l.itens || []).forEach(i => { F.cesto[i.id] = { nums: (i.nums || []).slice(), sem: i.qtd - (i.nums || []).length }; });
  dialogo(`<div class="row between"><h3>Alterar saída · ${esc(l.quarto)}</h3><button type="button" class="btn ghost small" data-fechar>Fechar</button></div>
    <p class="small muted" style="margin:0">Saiu às ${hora(l.saida)}${l.colabEntregou ? ' · entregue por ' + esc(l.colabEntregou) : ''}. Pode corrigir ou acrescentar equipamento destas modalidades; o quarto e as modalidades não mudam.</p>
    ${htmlSeletor}
    ${(l.alteracoes || []).length ? `<details class="small"><summary>Alterações anteriores (${l.alteracoes.length})</summary>${l.alteracoes.map(a => `<div>${esc(dataCurta(diaLx(a.ts)))} ${hora(a.ts)} · ${esc(a.por || '—')}</div>`).join('')}</details>` : ''}
    <p class="small muted" style="margin:0">Alterado por <b>${esc(por || '—')}</b></p>
    <div class="err" id="sd-err" role="alert"></div>
    <div class="row end"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="button" class="btn" id="al-ok">Guardar alteração</button></div>`, (d, fechar) => {
    d.classList.add('dlg-largo');
    const sel = seletor(d, M, F, { mods, ignorar: l, aoMudar: () => { $('#sd-err').textContent = ''; } });
    $('#al-ok').onclick = async () => {
      const err = t => { $('#sd-err').textContent = t; };
      if (!Object.keys(F.cesto).length) { err('O registo tem de ficar com algum material. Se foi tudo devolvido, use "Devolvido".'); return; }
      const c = sel.conflito(); if (c) { err(c); return; }
      const itens = itensDoc(M, F);
      if (JSON.stringify(itens) === JSON.stringify(l.itens)) { fechar(); return; }
      const { id: _, ...base } = l;
      const doc = { ...base, itens, alteracoes: [...(l.alteracoes || []), { ts: Date.now(), por, antes: l.itens }] };
      $('#al-ok').disabled = true;
      const { error } = await sb.from('emprestimos').update({ doc }).eq('id', l.id);
      $('#al-ok').disabled = false;
      if (error) { err(erroTexto(error)); return; }
      fechar(); toast(`Saída alterada · ${l.quarto}`); depois();
    };
  });
}

/* ---------------- devolução ---------------- */
const CICLO = { Devolvida: 'Danificada', Danificada: 'Perdida', Perdida: 'Fora', Fora: 'Devolvida' };
const ROT = { Devolvida: 'Devolvida', Danificada: 'Danificada', Perdida: 'Perdida', Fora: 'Fica fora' };
export async function devolverSaida(id, { por = '', depois = () => {} } = {}) {
  let M; try { M = await carregar(); } catch (e) { toast(erroTexto(e), 'erro'); return; }
  const l = M.fora.find(x => x.id === id); if (!l) { toast('Este registo já foi devolvido.', 'erro'); return; }
  const pend = pendente(l), st = {}, q = {}, notasG = {};
  pend.forEach(p => { q[p.id] = { dev: p.sem, dan: 0, per: 0 }; });
  dialogo(`<div class="row between"><h3>Devolução · ${esc(l.quarto)}</h3><button type="button" class="btn ghost small" data-fechar>Fechar</button></div><div class="stack" id="dv"></div>`, (d, fechar) => {
    d.classList.add('dlg-largo');
    const desenhar = () => {
      d.querySelectorAll('[data-nota]').forEach(i => { notasG[i.dataset.nota] = i.value; });
      const atraso = Date.now() - l.prevista;
      $('#dv').innerHTML = `<p class="small muted" style="margin:0">Saiu às ${hora(l.saida)} · ${atraso > 0 ? `<b style="color:var(--bad)">devolução com atraso</b>` : 'dentro do prazo'}. Por defeito está tudo devolvido. Raquetes: toque para mudar (devolvida → danificada → perdida → fica fora).</p>
        ${pend.map(p => { const x = q[p.id];
          return `<div class="sd-it"><div class="row between"><b>${esc(p.nome)}</b><span class="small muted">${p.qtd} por devolver</span></div>
          ${p.nums.length ? `<div class="sd-nums">${p.nums.map(n => { const v = st[p.id + ':' + n] || 'Devolvida'; return `<button type="button" class="dv-num ${v}" data-cic="${p.id}:${n}">nº ${n}<small>${ROT[v]}</small></button>`; }).join('')}</div>` : ''}
          ${p.sem ? `<div class="row" style="gap:14px;flex-wrap:wrap"><span class="small muted">${p.sem} ${p.nums.length ? 'sem nº' : 'por devolver'}</span>
            ${[['dev', 'Devolvidas'], ['dan', 'dessas, danificadas'], ['per', 'Perdidas']].map(([f, t]) => `<span class="small row" style="gap:6px">${t}<span class="sd-step"><button type="button" data-q="${p.id}" data-f="${f}" data-d="-1">−</button><output>${x[f]}</output><button type="button" data-q="${p.id}" data-f="${f}" data-d="1">+</button></span></span>`).join('')}
            ${p.sem - x.dev - x.per > 0 ? `<span class="chip warn">${p.sem - x.dev - x.per} fica fora</span>` : ''}</div>` : ''}
          <input data-nota="${p.id}" placeholder="Nota de danos ou estado (opcional)" value="${esc(notasG[p.id] || '')}"></div>`; }).join('')}
        <p class="small muted" style="margin:0">Recebido por <b>${esc(por || '—')}</b></p>
        <div class="err" id="dv-err" role="alert"></div>
        <div class="row end"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="button" class="btn" id="dv-ok">Confirmar devolução</button></div>`;
    };
    desenhar();
    d.addEventListener('click', e => {
      const c = e.target.closest('[data-cic]'), b = e.target.closest('[data-q]');
      if (c) { st[c.dataset.cic] = CICLO[st[c.dataset.cic] || 'Devolvida']; desenhar(); }
      else if (b) {
        const p = pend.find(x => x.id === b.dataset.q), x = q[p.id], f = b.dataset.f;
        x[f] = Math.max(0, x[f] + +b.dataset.d);
        if (f === 'per') { x.per = Math.min(x.per, p.sem); x.dev = Math.min(x.dev, p.sem - x.per); }
        if (f === 'dev') x.dev = Math.min(x.dev, p.sem - x.per);
        x.dan = Math.min(x.dan, x.dev); desenhar();
      } else if (e.target.id === 'dv-ok') confirmar();
    });
    const confirmar = async () => {
      const notas = {}; d.querySelectorAll('[data-nota]').forEach(i => { notas[i.dataset.nota] = i.value.trim(); });
      const ts = Date.now(), { id: _, ...o } = JSON.parse(JSON.stringify(l));
      o.res = o.res || {}; o.incidentes = o.incidentes || []; o.devolucoes = o.devolucoes || [];
      const ev = { ts, colab: por, posto: por, itens: [], obs: '' }, novasAv = {};
      let algum = false;
      pend.forEach(p => {
        const r = o.res[p.id] || (o.res[p.id] = { qtd: 0, nums: [] }); let n = 0; const evNums = []; let inc = false;
        p.nums.forEach(num => { const v = st[p.id + ':' + num] || 'Devolvida'; if (v === 'Fora') return; r.nums.push(num); r.qtd++; n++; evNums.push(num);
          if (v !== 'Devolvida') { inc = true; const tipo = v === 'Danificada' ? 'Danificado' : 'Perdido'; o.incidentes.push({ id: p.id, nome: p.nome, num, qtd: 1, tipo, nota: notas[p.id] || '', ts, quarto: l.quarto }); novasAv[p.id + ':' + num] = { tipo, quarto: l.quarto, data: ts, nota: notas[p.id] || '' }; } });
        const x = q[p.id];
        if (p.sem) { const k = x.dev + x.per; if (k) { r.qtd += k; n += k; }
          if (x.dan) { inc = true; o.incidentes.push({ id: p.id, nome: p.nome, num: null, qtd: x.dan, tipo: 'Danificado', nota: notas[p.id] || '', ts, quarto: l.quarto }); }
          if (x.per) { inc = true; o.incidentes.push({ id: p.id, nome: p.nome, num: null, qtd: x.per, tipo: 'Perdido', nota: notas[p.id] || '', ts, quarto: l.quarto }); } }
        if (notas[p.id] && !inc) o.incidentes.push({ id: p.id, nome: p.nome, num: null, qtd: 0, tipo: 'Nota', nota: notas[p.id], ts, quarto: l.quarto });
        if (n) { algum = true; ev.itens.push({ id: p.id, nome: p.nome, mod: p.mod, qtd: n, nums: evNums }); }
      });
      if (!algum) { $('#dv-err').textContent = 'Nada marcado como devolvido. Ajuste as quantidades ou cancele.'; return; }
      o.devolucoes.push(ev); o.colabRecebeu = por;
      const ainda = pendente(o).length;
      if (!ainda) { o.estado = 'devolvido'; o.devolvido = ts; }
      $('#dv-ok').disabled = true;
      const { error } = await sb.from('emprestimos').update({ doc: o }).eq('id', l.id);
      if (!error && Object.keys(novasAv).length) {
        const { error: e2 } = await sb.from('material_config').upsert({ chave: 'avarias', valor: { mapa: { ...M.av, ...novasAv } } });
        if (e2) toast('Devolução gravada, mas as avarias não: registe-as no separador Material.', 'erro');
      }
      if (error) { $('#dv-ok').disabled = false; $('#dv-err').textContent = erroTexto(error); return; }
      if (!ainda) await libertarCampo(o);
      fechar(); toast(ainda ? `Devolução parcial · ${l.quarto} ainda tem material fora` : `Devolução registada · ${l.quarto}`); depois();
    };
  });
}
