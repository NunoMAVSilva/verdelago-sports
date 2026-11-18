// Emails para os hóspedes (Brevo): confirmação da reserva e código do cacifo.
//
// Chamada pela base de dados (pg_net, migração 0007) depois de:
//   - criar uma reserva com email  → {tipo: 'confirmacao', id: <reserva>}
//   - preparar um cacifo           → {tipo: 'cacifo',      id: <cacifo_uso>}
//   - material não devolvido       → {tipo: 'nao_devolvido', id: <cacifo_uso>}  (vai para config.email_rececao)
// Não confia no pedido: lê a reserva com a chave de serviço e só envia uma vez
// (reservas.email_confirmacao_em / cacifo_usos.notificado_em / cacifo_usos.aviso_rececao_em). Quem chamar com um id
// qualquer, no máximo provoca o email que já era devido a essa reserva.
//
// Segredos da função (Supabase › Edge Functions › Secrets): BREVO_API_KEY.
// Sem chave, não faz nada (responde 503) e a reserva fica por avisar.

import { conteudo, conteudoRececao, type Dados } from './modelo.ts';

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
  if (!['confirmacao', 'cacifo', 'nao_devolvido'].includes(tipo) || !uuid.test(id || '')) return json({ erro: 'Pedido inválido' }, 400);
  if (!BREVO) return json({ erro: 'Envio de emails ainda não configurado (BREVO_API_KEY).' }, 503);

  // 1) Reservar o envio (só um pedido ganha) e ler os dados
  const agora = new Date().toISOString();
  let reserva: Record<string, unknown> | undefined, uso: Record<string, unknown> | undefined, desfazer: () => Promise<unknown>;
  const campos = 'id,token,inicio,fim,quarto,apelido,nome,email,telefone,estado,tipo,espacos(nome)';

  if (tipo === 'nao_devolvido') {
    const cfg = (await (await rest('config?select=email_rececao')).json())[0];
    const para = String(cfg?.email_rececao || '').trim();
    if (!para) return json({ ok: true, enviado: false, motivo: 'config.email_rececao vazio' });
    const r = await rest(`cacifo_usos?id=eq.${id}&estado=eq.nao_devolvido&aviso_rececao_em=is.null&select=id,cacifo_id,material,falta,nao_devolvido_em,marcado_por,reservas(${campos})`,
      { method: 'PATCH', body: JSON.stringify({ aviso_rececao_em: agora }) });
    const u = (await r.json())[0];
    if (!u?.reservas) return json({ ok: true, enviado: false, motivo: 'nada a enviar' });
    const st = u.marcado_por ? (await (await rest(`staff?user_id=eq.${u.marcado_por}&select=nome`)).json())[0] : null;
    const rv = u.reservas;
    const c = conteudoRececao({
      espaco: rv.espacos?.nome || '', inicio: rv.inicio, fim: rv.fim, quarto: rv.quarto || '', apelido: rv.apelido || '', nome: rv.nome || '',
      email: rv.email || '', telefone: rv.telefone || '', cacifo: u.cacifo_id, material: u.material || '', falta: u.falta || '',
      quando: u.nao_devolvido_em || agora, por: st?.nome || '',
    });
    const ok = await brevo({ to: [{ email: para }], subject: c.assunto, htmlContent: c.html, textContent: c.texto, tags: ['sports', tipo],
      ...(rv.email ? { replyTo: { email: rv.email, name: rv.nome || rv.apelido || undefined } } : {}) });
    if (!ok.ok) { await rest(`cacifo_usos?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ aviso_rececao_em: null }) }); return json({ erro: 'Falhou o envio', estado: ok.estado }, 502); }
    return json({ ok: true, enviado: true });
  }
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
  const envio = await brevo({ to: [{ email: reserva.email, name: d.nome || undefined }], subject: c.assunto, htmlContent: c.html, textContent: c.texto, tags: ['sports', tipo] });
  if (!envio.ok) { await desfazer(); return json({ erro: 'Falhou o envio', estado: envio.estado }, 502); }
  return json({ ok: true, enviado: true });
});

async function brevo(msg: Record<string, unknown>) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: REMETENTE, ...msg }),
  });
  if (!r.ok) console.error('Brevo', r.status, await r.text());
  return { ok: r.ok, estado: r.status };
}
