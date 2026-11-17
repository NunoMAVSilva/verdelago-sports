// Router: #/ (reservar) · #/r/<token> (reserva) · #/rececao · #/tv
import { paginaReservar, paginaReserva } from './hospede.js';
import { paginaRececao } from './rececao.js';
import { paginaTV, pararTV } from './tv.js';

const app = document.getElementById('app');
function rota() {
  document.getElementById('modal').innerHTML = '';
  const h = location.hash.replace(/^#\/?/, '');
  if (h !== 'tv') pararTV();
  if (h.startsWith('r/')) return paginaReserva(app, decodeURIComponent(h.slice(2)));
  if (h === 'rececao') return paginaRececao(app);
  if (h === 'tv') return paginaTV(app);
  return paginaReservar(app);
}
addEventListener('hashchange', rota);
rota();
