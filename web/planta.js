// Planta do Sports Center (vertical), desenhada a partir do mapa da sinalética.
// Coordenadas no sistema do mapa (x 30–340, y 30–800); no ecrã são percentagens,
// por isso a planta escala com o espaço disponível. Números = sinalética dos campos.
import { esc } from './core.js?v=18';

const OX = 30, OY = 30, VW = 310, VH = 770;
const pct = ([x0, y0, x1, y1]) =>
  `left:${((x0 - OX) / VW * 100).toFixed(2)}%;top:${((y0 - OY) / VH * 100).toFixed(2)}%;width:${((x1 - x0) / VW * 100).toFixed(2)}%;height:${((y1 - y0) / VH * 100).toFixed(2)}%`;

// zonas de piso (fundo), edifícios e campos (id do espaço → retângulo)
const ZONAS = [[98, 36, 224, 214], [86, 244, 240, 388], [256, 254, 336, 364], [60, 416, 314, 604], [30, 604, 322, 800]];
const EDIFICIOS = [['Receção', [282, 368, 332, 392]], ['Ginásio', [146, 392, 222, 416]]];
const CAMPOS = {
  polidesportivo: [106, 44, 216, 206],
  'tenis-1': [94, 252, 160, 380],
  'tenis-2': [166, 252, 232, 380],
  'beach-volley': [262, 260, 330, 358],
  'futebol-7': [40, 612, 312, 790],
};
// pádel como na placa: em cima 11 · 9 · 7 · 5, em baixo 12 · 10 · 8 · 6 (padel-N = campo N+4)
[[7, 5, 3, 1], [8, 6, 4, 2]].forEach((fila, r) => fila.forEach((n, c) => {
  const x = [66, 128, 190, 252][c], y = [[424, 510], [516, 598]][r];
  CAMPOS['padel-' + n] = [x, y[0], x + 56, y[1]];
}));
const CURTO = { padel: 'Pádel', tenis: 'Ténis', futebol: 'Futebol 7', 'beach-volley': 'Beach Volley', polidesportivo: 'Polidesportivo' };

/**
 * espacos: [{id, numero, modalidade, nome}]
 * estado(e) → { cls: 'livre'|'uso'|'tor'|'blq'|'atraso', txt, sub? }
 * sel: id do campo selecionado
 */
export function planta(espacos, estado, sel) {
  let h = '<div class="planta" role="group" aria-label="Planta do Sports Center">';
  ZONAS.forEach(z => { h += `<i class="pz" style="${pct(z)}"></i>`; });
  EDIFICIOS.forEach(([nome, r]) => { h += `<span class="ped" style="${pct(r)}">${nome}</span>`; });
  for (const e of espacos) {
    const r = CAMPOS[e.id]; if (!r) continue;
    const st = estado(e);
    h += `<button type="button" class="pc ${st.cls}${sel === e.id ? ' sel' : ''}" data-campo="${esc(e.id)}" style="${pct(r)}" aria-label="${esc(e.nome)}: ${esc([st.txt, st.sub].filter(Boolean).join(', '))}" aria-pressed="${sel === e.id}">
      <span class="pn">${e.numero ?? ''}</span>${e.modalidade === 'padel' ? '' : `<b>${esc(CURTO[e.modalidade] || e.nome)}</b>`}<small class="pt">${esc(st.txt)}</small>${st.sub ? `<small>${esc(st.sub)}</small>` : ''}${st.extra ? `<small>${esc(st.extra)}</small>` : ''}</button>`;
  }
  return h + '</div>';
}
export const numeroBadge = e => `<span class="pn grande">${e.numero ?? ''}</span>`;
