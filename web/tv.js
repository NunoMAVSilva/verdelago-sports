// Ecrã TV (#/tv): ocupação de hoje em todos os espaços, atualiza de 20 em 20 s.
import { sb, $, esc, hoje, dataLonga, carregarBase, grelha, erroTexto, LOGO, autoAtualizar } from './core.js?v=19';

let timers = [];
export function pararTV() { timers.forEach(clearInterval); timers = []; document.body.classList.remove('tv'); }

export async function paginaTV(app) {
  pararTV();
  document.body.classList.add('tv');
  let B;
  try { B = await carregarBase(); } catch (e) { app.innerHTML = `<p class="tvh">${esc(erroTexto(e))}</p>`; return; }
  const desenhar = async () => {
    const dia = hoje();
    const { data, error } = await sb.rpc('ocupacao', { p_dia: dia });
    if (error) return;
    app.innerHTML = `<div class="tvwrap"><header class="tvtop"><div class="brand">${LOGO}<div><div class="eyebrow">Verdelago · Sports Center</div><h1 class="cap">${esc(dataLonga(dia))}</h1></div></div><div class="tvclock" id="tvclock"></div></header>
      ${grelha({ espacos: B.espacos, dia, itens: data.map((o, i) => ({ ...o, id: 'o' + i, label: o.titulo })) })}
      <a class="tvsair" href="#/rececao">Sair</a></div>`;
    relogio();
    const agora = app.querySelector('tr.agora');
    if (agora) agora.scrollIntoView({ block: 'center' });
  };
  const relogio = () => { const el = $('#tvclock'); if (el) el.textContent = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); };
  await desenhar();
  autoAtualizar(desenhar, 20000, () => true);
  timers.push(setInterval(relogio, 1000));
}
