// Router: #/ (reservar) · #/r/<token> (reserva) · #/rececao · #/torneio/<id> · #/tv · #/tv/torneio[/<id>]
import { paginaReservar, paginaReserva } from './hospede.js?v=24';
import { paginaRececao } from './rececao.js?v=24';
import { paginaTV, pararTV } from './tv.js?v=24';
import { paginaTorneio, paginaTVTorneio, pararTorneio } from './torneio.js?v=24';
import { pararAuto, ocupado } from './core.js?v=24';
import { pararRececao } from './rececao.js?v=24';

const app = document.getElementById('app');
function rota() {
  document.getElementById('modal').innerHTML = '';
  const h = location.hash.replace(/^#\/?/, '');
  pararTV(); pararTorneio(); pararAuto(); pararRececao();
  if (h.startsWith('r/')) return paginaReserva(app, decodeURIComponent(h.slice(2)));
  if (h === 'rececao') return paginaRececao(app);
  if (h.startsWith('torneio/')) return paginaTorneio(app, decodeURIComponent(h.slice(8)));
  if (h === 'tv/torneio' || h.startsWith('tv/torneio/')) return paginaTVTorneio(app, decodeURIComponent(h.slice(11)) || null);
  if (h === 'tv') return paginaTV(app);
  return paginaReservar(app);
}
addEventListener('hashchange', rota);
rota();

// Versão nova publicada? Os painéis ficam abertos o dia todo (e o Safari guarda o index.html em cache),
// por isso de 5 em 5 min (e ao voltar à página) compara o ?v= publicado com o desta página e recarrega.
const VERSAO = new URL(import.meta.url).searchParams.get('v');
let novaVersao = false;
async function verVersao() {
  try {
    if (!novaVersao) {
      const html = await (await fetch('index.html', { cache: 'no-store' })).text();
      const v = (html.match(/main\.js\?v=(\d+)/) || [])[1];
      novaVersao = !!(v && VERSAO && v !== VERSAO);
    }
    if (novaVersao && !document.hidden && !ocupado()) location.reload();
  } catch { /* sem rede: tenta mais tarde */ }
}
setInterval(verVersao, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) verVersao(); });
