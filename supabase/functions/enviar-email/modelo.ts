// Texto dos emails (PT e EN no mesmo email: não sabemos a língua do hóspede). Horas em Lisboa.

export type Dados = {
  tipo: 'confirmacao' | 'cacifo';
  espaco: string; inicio: string; fim: string; quarto: string; nome: string; link: string;
  cacifo?: { numero: number; codigo: string; material: string };
};

const TZ = 'Europe/Lisbon';
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const horaDe = (d: string) => new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));
const diaDe = (d: string, l: string) => new Intl.DateTimeFormat(l === 'en' ? 'en-GB' : 'pt-PT', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));

export function conteudo(d: Dados) {
  const quando = (l: string) => `${diaDe(d.inicio, l)}, ${horaDe(d.inicio)}–${horaDe(d.fim)}`;
  const ola = { pt: d.nome ? `Olá ${d.nome},` : 'Olá,', en: d.nome ? `Hello ${d.nome},` : 'Hello,' };
  const cx = d.cacifo;
  const pt = d.tipo === 'confirmacao'
    ? [ola.pt, `A sua reserva está confirmada: ${d.espaco}, ${quando('pt')}.`, `Pode ver ou cancelar a reserva aqui:`]
    : [ola.pt, `O material para a sua reserva (${d.espaco}, ${quando('pt')}) está no cacifo ${cx!.numero}.`, `Código do cacifo: ${cx!.codigo}`, ...(cx!.material ? [`Material: ${cx!.material}`] : []), 'Ao devolver, deixe o material no mesmo cacifo e feche-o. Detalhes da reserva:'];
  const en = d.tipo === 'confirmacao'
    ? [ola.en, `Your booking is confirmed: ${d.espaco}, ${quando('en')}.`, `You can view or cancel it here:`]
    : [ola.en, `The equipment for your booking (${d.espaco}, ${quando('en')}) is in locker ${cx!.numero}.`, `Locker code: ${cx!.codigo}`, ...(cx!.material ? [`Equipment: ${cx!.material}`] : []), 'When you return it, put everything back in the same locker and close it. Booking details:'];
  const assunto = d.tipo === 'confirmacao'
    ? `Reserva confirmada · Booking confirmed — ${d.espaco}, ${horaDe(d.inicio)}`
    : `Cacifo ${cx!.numero} · Locker ${cx!.numero} — ${d.espaco}, ${horaDe(d.inicio)}`;
  const bloco = (ls: string[]) => ls.map((l, i) => `<p style="margin:0 0 10px${cx && /^(Código|Locker code)/.test(l) ? ';font-size:20px;font-weight:700' : ''}">${esc(l)}</p>`).join('');
  const botao = (t: string) => `<p style="margin:14px 0 22px"><a href="${esc(d.link)}" style="background:#0d6b52;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${esc(t)}</a></p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#edf1ec;font-family:Arial,Helvetica,sans-serif;color:#13231d">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#0d6b52;color:#fff;border-radius:12px 12px 0 0;padding:16px 20px;font-weight:700;font-size:18px">Verdelago Sports Center</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:20px;font-size:15px;line-height:1.5">
${bloco(pt)}${botao('Ver a reserva')}
<hr style="border:none;border-top:1px solid #d6dfd8;margin:6px 0 18px">
${bloco(en)}${botao('View booking')}
<p style="margin:0;color:#5a6a63;font-size:13px">Quarto · Room ${esc(d.quarto)}</p>
</div></div></body></html>`;
  const texto = [...pt, d.link, '', ...en, d.link, '', `Quarto · Room ${d.quarto}`, 'Verdelago Sports Center'].join('\n');
  return { assunto, html, texto };
}
