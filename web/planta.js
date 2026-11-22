// Planta do Sports Center (vertical), desenhada a partir do mapa da sinalética.
// Coordenadas no sistema do mapa (x 30–340, y 30–800); no ecrã são percentagens,
// por isso a planta escala com o espaço disponível. Números = sinalética dos campos.
import { esc } from './core.js?v=23';

const OX = 30, OY = 30, VW = 310, VH = 770;
const pct = ([x0, y0, x1, y1]) =>
  `left:${((x0 - OX) / VW * 100).toFixed(2)}%;top:${((y0 - OY) / VH * 100).toFixed(2)}%;width:${((x1 - x0) / VW * 100).toFixed(2)}%;height:${((y1 - y0) / VH * 100).toFixed(2)}%`;

// zonas de piso (fundo), edifícios e campos (id do espaço → retângulo)
const ZONAS = [[98, 36, 224, 214], [86, 244, 240, 388], [256, 254, 336, 364], [60, 416, 314, 604], [30, 604, 322, 800]];
const EDIFICIOS = [['Receção', [282, 368, 332, 392]], ['Ginásio', [94, 392, 232, 416]]];
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

// Linhas de jogo de cada modalidade (medidas reais em metros; o desenho estica para o retângulo do campo)
const SVG = (vb, corpo) => `<svg class="pl" viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true">${corpo}</svg>`;
const LINHAS = {
  // pádel 10 × 20: rede ao meio, linhas de serviço a 6,95 m da rede, linha central de serviço
  padel: SVG('0 0 10 20', '<rect x="0" y="0" width="10" height="20"/><line class="rede" x1="0" y1="10" x2="10" y2="10"/><line x1="0" y1="3.05" x2="10" y2="3.05"/><line x1="0" y1="16.95" x2="10" y2="16.95"/><line x1="5" y1="3.05" x2="5" y2="16.95"/>'),
  // ténis 10,97 × 23,77: corredores de pares, rede, linhas de serviço a 6,40 m da rede
  tenis: SVG('0 0 10.97 23.77', '<rect x="0" y="0" width="10.97" height="23.77"/><line x1="1.37" y1="0" x2="1.37" y2="23.77"/><line x1="9.6" y1="0" x2="9.6" y2="23.77"/><line class="rede" x1="0" y1="11.885" x2="10.97" y2="11.885"/><line x1="1.37" y1="5.485" x2="9.6" y2="5.485"/><line x1="1.37" y1="18.285" x2="9.6" y2="18.285"/><line x1="5.485" y1="5.485" x2="5.485" y2="18.285"/>'),
  // voleibol de praia 8 × 16: rede ao meio
  'beach-volley': SVG('0 0 8 16', '<rect x="0" y="0" width="8" height="16"/><line class="rede" x1="0" y1="8" x2="8" y2="8"/>'),
  // polidesportivo (basquetebol 15 × 28): meio-campo, círculo central, garrafões, linhas de 3 pontos
  polidesportivo: SVG('0 0 15 28', '<rect x="0" y="0" width="15" height="28"/><line x1="0" y1="14" x2="15" y2="14"/><circle cx="7.5" cy="14" r="1.8"/><rect x="5.05" y="0" width="4.9" height="5.8"/><rect x="5.05" y="22.2" width="4.9" height="5.8"/><path d="M0.9 0V2.99A6.75 6.75 0 0 0 14.1 2.99V0"/><path d="M0.9 28V25.01A6.75 6.75 0 0 1 14.1 25.01V28"/>'),
  // futebol de 7 (≈ 60 × 40, na horizontal): meio-campo, círculo central, áreas e pequenas áreas, balizas
  futebol: SVG('0 0 60 40', '<rect x="0" y="0" width="60" height="40"/><line x1="30" y1="0" x2="30" y2="40"/><circle cx="30" cy="20" r="6"/><rect x="0" y="10" width="9" height="20"/><rect x="51" y="10" width="9" height="20"/><rect x="0" y="15.5" width="3" height="9"/><rect x="57" y="15.5" width="3" height="9"/><line class="rede" x1="0" y1="17" x2="0" y2="23"/><line class="rede" x1="60" y1="17" x2="60" y2="23"/>'),
};
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
      ${LINHAS[e.modalidade] || ''}<span class="pn">${e.numero ?? ''}</span>${e.modalidade === 'padel' ? '' : `<b>${esc(CURTO[e.modalidade] || e.nome)}</b>`}<small class="pt">${esc(st.txt)}</small>${st.sub ? `<small>${esc(st.sub)}</small>` : ''}${st.extra ? `<small>${esc(st.extra)}</small>` : ''}</button>`;
  }
  return h + '</div>';
}
export const numeroBadge = e => `<span class="pn grande">${e.numero ?? ''}</span>`;
