// Router: #/ (reservar) · #/r/<token> (reserva) · #/rececao · #/torneio/<id> · #/tv · #/tv/torneio[/<id>]
import { paginaReservar, paginaReserva } from './hospede.js';
import { paginaRececao } from './rececao.js';
import { paginaTV, pararTV } from './tv.js';
import { paginaTorneio, paginaTVTorneio, pararTorneio } from './torneio.js';

const app = document.getElementById('app');
function rota() {
  document.getElementById('modal').innerHTML = '';
  const h = location.hash.replace(/^#\/?/, '');
  pararTV(); pararTorneio();
  if (h.startsWith('r/')) return paginaReserva(app, decodeURIComponent(h.slice(2)));
  if (h === 'rececao') return paginaRececao(app);
  if (h.startsWith('torneio/')) return paginaTorneio(app, decodeURIComponent(h.slice(8)));
  if (h === 'tv/torneio' || h.startsWith('tv/torneio/')) return paginaTVTorneio(app, decodeURIComponent(h.slice(11)) || null);
  if (h === 'tv') return paginaTV(app);
  return paginaReservar(app);
}
addEventListener('hashchange', rota);
rota();
