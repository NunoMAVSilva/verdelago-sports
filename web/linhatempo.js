// Dia inteiro em linha do tempo: uma pista por campo, blocos com as marcações e linha vermelha na hora atual.
// Usada na Grelha do dia da receção (interativa) e no ecrã TV (só leitura).
import { esc, lisboa, hoje } from './core.js?v=24';
import { numeroBadge } from './planta.js?v=24';

export const limitesDia = espacos => ({ ini: Math.min(...espacos.map(e => e.abreMin)), fim: Math.max(...espacos.map(e => e.fechaMin)) });

/**
 * espacos, dia, itens: [{id, espaco_id, inicio, fim, tipo}]
 * rotulo(r) → título do bloco · detalhe(r) → linha de baixo · cls(r) → classes extra
 * interativo: blocos são botões (data-item) e as pistas aceitam toques (data-pista)
 */
export function linhaTempo({ espacos, dia, itens, rotulo, detalhe, cls = () => '', interativo = true, legenda = '' }) {
  const { ini, fim } = limitesDia(espacos), tot = fim - ini, base = lisboa(dia, 0).getTime();
  const pos = t => Math.max(0, Math.min(100, ((t - base) / 60000 - ini) / tot * 100));
  const agoraP = dia === hoje() ? pos(Date.now()) : dia < hoje() ? 100 : 0;
  const horas = []; for (let m = ini; m < fim; m += 60) horas.push(m);
  let h = `<div class="lt" role="region" aria-label="Marcações do dia por campo"><div class="lt-linha lt-horas"><span class="lt-nome"></span><div class="lt-pista">${horas.map(m => `<span style="left:${((m - ini) / tot * 100).toFixed(3)}%">${String(m / 60).padStart(2, '0')}</span>`).join('')}</div></div>`;
  for (const e of espacos) {
    const its = itens.filter(r => r.espaco_id === e.id);
    h += `<div class="lt-linha"><span class="lt-nome">${numeroBadge(e)}<span>${esc(e.nome)}</span></span><div class="lt-pista"${interativo ? ` data-pista="${esc(e.id)}" title="Toque num espaço livre para marcar"` : ''}>`;
    for (let m = ini; m < fim; m += 60) h += `<i class="lt-h" style="left:${((m - ini) / tot * 100).toFixed(3)}%"></i>`;
    if (e.abreMin > ini) h += `<i class="lt-fora" style="left:0;width:${((e.abreMin - ini) / tot * 100).toFixed(3)}%"></i>`;
    if (e.fechaMin < fim) h += `<i class="lt-fora" style="left:${((e.fechaMin - ini) / tot * 100).toFixed(3)}%;right:0"></i>`;
    if (agoraP > 0) h += `<i class="lt-passado" style="width:${agoraP.toFixed(3)}%"></i>`;
    for (const r of its) {
      const a = pos(new Date(r.inicio).getTime()), b = pos(new Date(r.fim).getTime()), d = detalhe(r), c = cls(r);
      const attrs = `class="lt-b t-${r.tipo}${c ? ' ' + c : ''}" style="left:${a.toFixed(3)}%;width:${(b - a).toFixed(3)}%" title="${esc(`${rotulo(r)} · ${d}`)}"`;
      const corpo = `<b>${esc(rotulo(r))}</b><small>${esc(d)}</small>`;
      h += interativo ? `<button type="button" ${attrs} data-item="${r.id}">${corpo}</button>` : `<div ${attrs}>${corpo}</div>`;
    }
    if (dia === hoje() && agoraP > 0 && agoraP < 100) h += `<i class="lt-agora" style="left:${agoraP.toFixed(3)}%"></i>`;
    h += '</div></div>';
  }
  return h + `</div>${legenda ? `<div class="legenda small">${legenda}</div>` : ''}`;
}
