// Emails para os hóspedes (Brevo): confirmação da reserva e código do cacifo.
//
// Chamada pela base de dados (pg_net, migração 0007) depois de:
//   - criar uma reserva com email  → {tipo: 'confirmacao', id: <reserva>}
//   - preparar um cacifo           → {tipo: 'cacifo',      id: <cacifo_uso>}
// Não confia no pedido: lê a reserva com a chave de serviço e só envia uma vez
// (reservas.email_confirmacao_em / cacifo_usos.notificado_em). Quem chamar com um id
// qualquer, no máximo provoca o email que já era devido a essa reserva.
//
// Segredos da função (Supabase › Edge Functions › Secrets): BREVO_API_KEY.
// Sem chave, não faz nada (responde 503) e a reserva fica por avisar.

import { conteudo, type Dados } from './modelo.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO = Deno.env.get('BREVO_API_KEY') || '';
const REMETENTE = { name: 'Verdelago Sports Center', email: 'sports.center@verdelago.com' };
const SITE = 'https://nunomavsilva.github.io/verdelago-sports/';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const rest = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
});
const uuid = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);
  let tipo = '', id = '';
  try { ({ tipo, id } = await req.json()); } catch { return json({ erro: 'Pedido inválido' }, 400); }
  if (!['confirmacao', 'cacifo'].includes(tipo) || !uuid.test(id || '')) return json({ erro: 'Pedido inválido' }, 400);
  if (!BREVO) return json({ erro: 'Envio de emails ainda não configurado (BREVO_API_KEY).' }, 503);

  // 1) Reservar o envio (só um pedido ganha) e ler os dados
  const agora = new Date().toISOString();
  let reserva: Record<string, unknown> | undefined, uso: Record<string, unknown> | undefined, desfazer: () => Promise<unknown>;
  const campos = 'id,token,inicio,fim,quarto,apelido,nome,email,estado,tipo,espacos(nome)';
  if (tipo === 'confirmacao') {
    const r = await rest(`reservas?id=eq.${id}&tipo=eq.reserva&estado=eq.confirmada&email=not.is.null&email_confirmacao_em=is.null&select=${campos}`,
      { method: 'PATCH', body: JSON.stringify({ email_confirmacao_em: agora }) });
    reserva = (await r.json())[0];
    if (!reserva) return json({ ok: true, enviado: false, motivo: 'nada a enviar' });
    desfazer = () => rest(`reservas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ email_confirmacao_em: null }) });
  } else {
    const r = await rest(`cacifo_usos?id=eq.${id}&estado=eq.preparado&notificado_em=is.null&select=id,cacifo_id,codigo,material,reservas(${campos})`,
      { method: 'PATCH', body: JSON.stringify({ notificado_em: agora }) });
    uso = (await r.json())[0];
    reserva = uso?.reservas as Record<string, unknown> | undefined;
    if (!uso || !reserva?.email || reserva.estado !== 'confirmada') {
      if (uso) await rest(`cacifo_usos?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ notificado_em: null }) });
      return json({ ok: true, enviado: false, motivo: 'nada a enviar' });
    }
    desfazer = () => rest(`cacifo_usos?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ notificado_em: null }) });
  }

  // 2) Montar e enviar
  const d: Dados = {
    tipo: tipo as Dados['tipo'],
    espaco: (reserva.espacos as { nome: string } | null)?.nome || '',
    inicio: String(reserva.inicio), fim: String(reserva.fim),
    quarto: String(reserva.quarto || ''), nome: String(reserva.nome || reserva.apelido || ''),
    link: `${SITE}#/r/${reserva.token}`,
    cacifo: uso ? { numero: Number(uso.cacifo_id), codigo: String(uso.codigo), material: (uso.material as string) || '' } : undefined,
  };
  const c = conteudo(d);
  const envio = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: REMETENTE, to: [{ email: reserva.email, name: d.nome || undefined }], subject: c.assunto, htmlContent: c.html, textContent: c.texto, tags: ['sports', tipo] }),
  });
  if (!envio.ok) {
    await desfazer();
    const erro = await envio.text();
    console.error('Brevo', envio.status, erro);
    return json({ erro: 'Falhou o envio', estado: envio.status }, 502);
  }
  return json({ ok: true, enviado: true });
});
