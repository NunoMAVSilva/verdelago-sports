// Sincroniza a lista de estadias (In House + Arrivals do Opera) a partir do Beach OPS.
//
// O Beach OPS chama esta função depois de importar a lista, com o login Firebase de quem importou
// (cabeçalho x-firebase-token) e o dia. A função NÃO confia em dados enviados: lê o documento
// inhouse/<dia> diretamente do Firestore com esse login. Se a pessoa não tiver acesso no Beach OPS,
// o Firestore recusa e nada é alterado. Só passam quarto, datas e n.º de pessoas (sem nomes).

const FIREBASE_PROJECT = 'verdelago-beach-app';
const ORIGENS = ['https://verdelago-beach-app.web.app', 'https://verdelago-beach-app.firebaseapp.com'];

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(origin) ? origin : ORIGENS[0],
    'Access-Control-Allow-Headers': 'content-type, x-firebase-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json' } });

// Valores tipados da API REST do Firestore → JS
// deno-lint-ignore no-explicit-any
function val(v: any): any {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)]));
  return null;
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin') || '');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405, h);

  const token = req.headers.get('x-firebase-token') || '';
  let body: { dia?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const dia = String(body.dia || '');
  if (!token || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return json({ erro: 'Pedido inválido' }, 400, h);

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/inhouse/${dia}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) return json({ erro: 'Sem acesso à lista In House' }, 403, h);
  if (r.status === 404) return json({ erro: 'Lista In House desse dia não encontrada' }, 404, h);
  if (!r.ok) return json({ erro: `Firestore respondeu ${r.status}` }, 502, h);

  const doc = await r.json();
  const f = val({ mapValue: { fields: doc.fields || {} } });
  // deno-lint-ignore no-explicit-any
  const quartos = (Array.isArray(f.rooms) ? f.rooms : []).map((x: any) => ({
    quarto: x.room, chegada: x.arr || null, partida: x.dep || null,
    adultos: x.ad ?? null, criancas: x.ch ?? null, proprietario: !!x.owner,
  }));

  const sbUrl = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rpc = await fetch(`${sbUrl}/rest/v1/rpc/substituir_estadias`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dia: f.date || dia, p_rooms: quartos, p_origem: 'beach-ops', p_por: f.by || null }),
  });
  if (!rpc.ok) return json({ erro: 'Erro ao guardar', detalhe: await rpc.text() }, 500, h);
  return json({ ok: true, quartos: await rpc.json() }, 200, h);
});
