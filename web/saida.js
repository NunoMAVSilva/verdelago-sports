// "Nova saída" de material desportivo, aberta no painel da receção (Home → Material em utilização).
// Grava na tabela `emprestimos` com o mesmo formato de `doc` da página Material (material/index.html),
// por isso o balcão, o histórico e as devoluções continuam a funcionar igual.
// Guest/Proprietário vem da lista de hóspedes (estadias); quem entrega é a pessoa com sessão iniciada.
import { sb, $, esc, hora, lisboa, hoje, normQuarto, dialogo, toast, erroTexto } from './core.js?v=23';

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
const PRAZOS = [['30', '30 minutos'], ['60', '1 hora'], ['90', '1h30'], ['120', '2h00'], ['outro', 'Outro…']];

// o que ainda está fora num empréstimo (descontando devoluções parciais), como pending() da página Material
function pendente(l) {
  return (l.itens || []).map(i => {
    const r = (l.res && l.res[i.id]) || { qtd: 0, nums: [] };
    const nums = (i.nums || []).filter(n => !r.nums.includes(n));
    const sem = Math.max(0, (i.qtd - (i.nums || []).length) - (r.qtd - r.nums.length));
    return { id: i.id, nome: i.nome, mod: i.mod, nums, qtd: nums.length + sem };
  }).filter(p => p.qtd > 0);
}
const diaLx = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(t));
const minDoDia = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

export async function novaSaida({ entregou = '', depois = () => {} } = {}) {
  const [c, f] = await Promise.all([
    sb.from('material_config').select('chave, valor'),
    sb.from('emprestimos').select('id, doc').eq('estado', 'fora'),
  ]);
  if (c.error || f.error) { toast(erroTexto(c.error || f.error), 'erro'); return; }
  const main = c.data.find(x => x.chave === 'main')?.valor, av = c.data.find(x => x.chave === 'avarias')?.valor?.mapa || {};
  const cfg = { ...PADRAO, ...(main || {}) };
  const item = id => cfg.itens.find(i => i.id === id);
  const fora = f.data.map(d => ({ id: d.id, ...d.doc }));
  const foraNum = {}, foraQtd = {};
  fora.forEach(l => pendente(l).forEach(p => { foraQtd[p.id] = (foraQtd[p.id] || 0) + p.qtd; p.nums.forEach(n => { foraNum[p.id + ':' + n] = l; }); }));
  const avariados = id => Object.keys(av).filter(k => k.startsWith(id + ':')).length;

  const F = { quarto: '', tipo: null, abertas: [], cesto: {}, prazo: '90', outro: '' };
  const qtd = x => x.nums.length + x.sem;

  dialogo(`<div class="row between"><h3>Nova saída de material</h3><button type="button" class="btn ghost small" data-fechar>Fechar</button></div>
    <form class="stack" id="f-saida" autocomplete="off">
      <div class="sd-quarto"><label class="f" for="sd-q">Quarto<input id="sd-q" maxlength="8" placeholder="A111" autocapitalize="characters" required></label><div id="sd-tipo" class="sd-tipo" aria-live="polite"></div></div>
      <div id="sd-aviso" hidden></div>
      <div><div class="sd-lbl">Modalidades · pode abrir várias</div><div class="sd-mods" id="sd-mods"></div></div>
      <div id="sd-itens" class="sd-itens"></div>
      <div id="sd-cesto" class="sd-cesto" hidden></div>
      <div class="fgrid">
        <label class="f" for="sd-prazo">Devolver até<select id="sd-prazo">${PRAZOS.map(([k, t]) => `<option value="${k}" ${k === F.prazo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f" for="sd-hora" id="sd-hora-l" hidden>Hora de devolução<input type="time" id="sd-hora" step="300"></label>
        <div class="sd-ate" id="sd-ate"></div>
      </div>
      <input id="sd-obs" aria-label="Observações" placeholder="Observações (opcional): campo 2, raquete com grip gasto…">
      <p class="small muted" style="margin:0">Entregue por <b>${esc(entregou || '—')}</b></p>
      <div class="err" id="sd-err" role="alert"></div>
      <div class="row end"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="sd-ok">Registar saída</button></div>
    </form>`, (d, fechar) => {
    d.classList.add('dlg-largo');
    const err = t => { $('#sd-err').textContent = t || ''; };

    // quarto: normaliza como no Opera e procura na lista de hóspedes (Guest / Proprietário)
    let tq = null;
    const verQuarto = async () => {
      const q = normQuarto($('#sd-q').value);
      if (q !== F.quarto) { F.quarto = q; F.tipo = null; }
      const el = $('#sd-tipo');
      if (!q || q.length < 2) { el.innerHTML = ''; avisos(); return; }
      el.innerHTML = '<span class="muted small">A procurar…</span>';
      const h = hoje();
      const { data } = await sb.from('estadias').select('proprietario, chegada, partida').eq('quarto', q).lte('chegada', h).gte('partida', h).limit(1);
      if (q !== F.quarto) return;
      const e = (data || [])[0];
      F.tipo = e?.proprietario ? 'Proprietário' : 'Guest';
      el.innerHTML = `<span class="sd-badge ${e?.proprietario ? 'prop' : ''}">${F.tipo}</span>${e ? '' : '<span class="muted small">Não está na lista de hóspedes de hoje</span>'}`;
      avisos();
    };
    $('#sd-q').addEventListener('input', e => { const v = e.target.value.toUpperCase().replace(/\s/g, ''); if (v !== e.target.value) e.target.value = v; clearTimeout(tq); tq = setTimeout(verQuarto, 350); });
    $('#sd-q').addEventListener('blur', e => { e.target.value = normQuarto(e.target.value); clearTimeout(tq); verQuarto(); });

    // aviso: este quarto já tem material fora
    const avisos = () => {
      const el = $('#sd-aviso'), ls = F.quarto ? fora.filter(l => normQuarto(l.quarto) === F.quarto) : [];
      el.hidden = !ls.length; el.className = 'sd-aviso';
      el.innerHTML = ls.map(l => `<b>${esc(F.quarto)} já tem material fora</b> desde as ${hora(l.saida)}: ${esc(pendente(l).map(p => `${p.qtd}× ${p.nome}${p.nums.length ? ' (nº ' + p.nums.join(', ') + ')' : ''}`).join('; '))}${Date.now() > l.prevista ? ' · <b>em atraso</b>' : ''}`).join('<br>');
    };

    const porMod = () => { const m = {}; Object.keys(F.cesto).forEach(id => { const i = item(id); if (i) m[i.mod] = (m[i.mod] || 0) + qtd(F.cesto[id]); }); return m; };
    const mods = () => { const n = porMod(); $('#sd-mods').innerHTML = MODS.map(m => `<button type="button" data-mod="${esc(m)}" aria-pressed="${F.abertas.includes(m)}">${esc(CURTO[m] || m)}${n[m] ? `<span class="dot">${n[m]}</span>` : ''}</button>`).join(''); };
    const itens = () => {
      if (!F.abertas.length) { $('#sd-itens').innerHTML = '<p class="muted small" style="margin:0">Toque numa ou mais modalidades para escolher o material.</p>'; return; }
      $('#sd-itens').innerHTML = F.abertas.map(m => {
        const lista = cfg.itens.filter(i => i.mod === m);
        const corpo = lista.length ? lista.map(i => {
          const x = F.cesto[i.id] || { nums: [], sem: 0 }, disp = Math.max(0, i.total - (foraQtd[i.id] || 0) - avariados(i.id));
          const passo = `<div class="sd-step"><button type="button" data-sem="${i.id}" data-d="-1" aria-label="Menos">−</button><output>${x.sem}</output><button type="button" data-sem="${i.id}" data-d="1" aria-label="Mais">+</button></div>`;
          let nums = '';
          if (i.num) { const sel = new Set(x.nums); for (let n = 1; n <= i.total; n++) { const k = i.id + ':' + n, o = foraNum[k], off = av[k]; nums += `<button type="button" class="sd-num${off ? ' off' : ''}" data-pick="${i.id}" data-n="${n}" aria-pressed="${sel.has(n)}" ${o || off ? 'disabled' : ''} title="${o ? 'Fora: ' + esc(o.quarto) : off ? 'Fora de serviço' : 'Disponível'}">${n}</button>`; } }
          return `<div class="sd-it"><div class="row between"><span><b>${esc(i.nome)}</b> <small class="muted">${disp}/${i.total} disp.</small></span>${i.num ? `<span class="small muted row" style="gap:6px">Sem nº ${passo}</span>` : passo}</div>${nums ? `<div class="sd-nums">${nums}</div>` : ''}</div>`;
        }).join('') : '<p class="muted small" style="margin:0">Sem material nesta modalidade.</p>';
        return (F.abertas.length > 1 ? `<div class="sd-lbl">${esc(m)}</div>` : '') + corpo;
      }).join('');
    };
    const cesto = () => {
      const ids = Object.keys(F.cesto), el = $('#sd-cesto'); el.hidden = !ids.length; if (!ids.length) return;
      el.innerHTML = '<div class="sd-lbl">A levar</div>' + ids.map(id => { const i = item(id), x = F.cesto[id]; return `<div class="row between"><span><b>${qtd(x)}×</b> ${esc(CURTO[i.mod] || i.mod)} · ${esc(i.nome)}${x.nums.length ? ` <span class="nb">${x.nums.map(n => `<span>${n}</span>`).join('')}</span>` : ''}</span><button type="button" class="btn ghost small" data-rm="${id}" aria-label="Remover">×</button></div>`; }).join('');
    };
    // hora prevista de devolução: os prazos fixos não passam da hora de fecho do material
    const fecho = () => lisboa(hoje(), minDoDia(cfg.fecho || '20:00')).getTime();
    const prevista = () => {
      const agora = Date.now();
      if (F.prazo === 'outro') { if (!F.outro) return null; let t = lisboa(hoje(), minDoDia(F.outro)).getTime(); return t > agora ? t : null; }
      const t = agora + +F.prazo * 60000, f = fecho(); return f > agora && t > f ? f : t;
    };
    const ate = () => { const p = prevista(), f = fecho(); $('#sd-ate').innerHTML = p ? `<span class="sd-lbl">Devolve até</span><b>${hora(p)}</b>${F.prazo !== 'outro' && p === f ? ' <span class="muted small">(fecho)</span>' : ''}` : '<span class="muted small">Indique a hora</span>'; };
    const tudo = () => { mods(); itens(); cesto(); ate(); };

    $('#sd-mods').addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (!b) return; const m = b.dataset.mod, i = F.abertas.indexOf(m); if (i >= 0) F.abertas.splice(i, 1); else F.abertas.push(m); F.abertas.sort((a, b) => MODS.indexOf(a) - MODS.indexOf(b)); mods(); itens(); });
    $('#sd-itens').addEventListener('click', e => {
      const p = e.target.closest('[data-pick]'), s = e.target.closest('[data-sem]'); if (!p && !s) return;
      const id = (p || s).dataset.pick || s.dataset.sem, x = F.cesto[id] || (F.cesto[id] = { nums: [], sem: 0 });
      if (p) { const n = +p.dataset.n, i = x.nums.indexOf(n); if (i >= 0) x.nums.splice(i, 1); else { x.nums.push(n); x.nums.sort((a, b) => a - b); } }
      else x.sem = Math.max(0, x.sem + +s.dataset.d);
      if (!qtd(x)) delete F.cesto[id];
      err(); mods(); itens(); cesto();
    });
    $('#sd-cesto').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; delete F.cesto[b.dataset.rm]; tudo(); });
    $('#sd-prazo').addEventListener('change', e => { F.prazo = e.target.value; const o = F.prazo === 'outro'; $('#sd-hora-l').hidden = !o; if (o) $('#sd-hora').focus(); ate(); });
    $('#sd-hora').addEventListener('input', e => { F.outro = e.target.value; ate(); });
    const relogio = setInterval(() => { if (!d.isConnected) return clearInterval(relogio); ate(); }, 30000);

    $('#f-saida').addEventListener('submit', async e => {
      e.preventDefault(); err();
      F.quarto = normQuarto($('#sd-q').value);
      const ids = Object.keys(F.cesto);
      if (!F.quarto) { err('Falta o n.º do quarto.'); $('#sd-q').focus(); return; }
      if (!ids.length) { err('Escolha o material que vai levar.'); return; }
      const prev = prevista();
      if (!prev) { err(F.prazo === 'outro' ? 'Indique uma hora de devolução depois de agora.' : 'Falta a hora de devolução.'); return; }
      for (const id of ids) for (const n of F.cesto[id].nums) if (foraNum[id + ':' + n]) { err(`A raquete n.º ${n} (${item(id).nome}) já está fora com o quarto ${foraNum[id + ':' + n].quarto}.`); return; }
      if (!F.tipo) await verQuarto();
      const agora = Date.now();
      const doc = { dia: diaLx(agora), saida: agora, quarto: F.quarto, tipo: F.tipo || 'Guest', modalidades: [...new Set(ids.map(id => item(id).mod))],
        itens: ids.map(id => { const i = item(id), x = F.cesto[id]; return { id, nome: i.nome, mod: i.mod, qtd: qtd(x), nums: x.nums.slice() }; }),
        prevista: prev, colabEntregou: entregou, posto: entregou, obs: $('#sd-obs').value.trim(), estado: 'fora', devolvido: null, colabRecebeu: '', incidentes: [], res: {}, devolucoes: [] };
      const b = $('#sd-ok'); b.disabled = true;
      const id = crypto.randomUUID ? crypto.randomUUID() : 'l' + agora.toString(36) + Math.random().toString(36).slice(2);
      const { error } = await sb.from('emprestimos').insert({ id, doc });
      b.disabled = false;
      if (error) { err(erroTexto(error)); return; }
      fechar(); toast(`Saída registada · ${doc.quarto} até ${hora(prev)}`); depois();
    });
    tudo();
  });
}
