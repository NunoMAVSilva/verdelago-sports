# Verdelago Sports Center

Reservas dos espaços desportivos para hóspedes, painel da receção, cacifos com código e ecrã TV.
Responder ao utilizador em **português de Portugal**. A interface da receção é só em PT; as páginas dos hóspedes são PT/EN.

## Projetos relacionados

- **`NunoMAVSilva/verdelago-beach-app`** (Beach OPS, Firebase): importa as listas do Opera (In House/GIH e Arrivals) e avisa este projeto. Ver "Lista de hóspedes" abaixo. Trabalhar nos dois na mesma sessão, no ambiente cloud **"Verdelago"**.
- `orc-scoring` (vela) **não** faz parte deste projeto.

## Arquitetura

| Parte | Onde |
|---|---|
| Base de dados, login da receção, função | Supabase, projeto `ncisfqhfxqumoadikupm` (eu-west-1) |
| Site (estático, sem build) | `web/` → GitHub Pages: https://nunomavsilva.github.io/verdelago-sports/ |
| Esquema | `supabase/migrations/NNNN_*.sql` (aplicadas por ordem) |
| Função de sincronização | `supabase/functions/sincronizar-quartos/index.ts` |

Rotas do site: `#/` (reservar), `#/r/<token>` (reserva do hóspede), `#/rececao` (painel, login Supabase), `#/tv`.
Ficheiros: `core.js` (cliente Supabase, horas em Lisboa, grelha, diálogos), `hospede.js`, `rececao.js`, `tv.js`, `main.js` (router), `style.css`, `vendor/supabase-2.118.0.js`.

## Regras do domínio

- 13 espaços: Pádel 1–8, Ténis 1–2, Futebol 7, Beach Volley, Polidesportivo. 08:00–22:00, **intervalos de 30 min**, duração 30–120 min (`espacos.passo_min`, `max_duracao_min`).
- Sem pagamentos. Clientes = hóspedes (e proprietários, que contam como hóspedes).
- Reservas, bloqueios e torneios estão todos na tabela `reservas` (`tipo`). Uma restrição de exclusão impede sobreposições.
- Sem limite por quarto (`config.max_reservas_quarto_dia` = null).
- **Cacifos:** fechaduras de combinação baratas. A receção põe o material, define o código e regista-o (`cacifo_usos`). O hóspede vê o código no link da reserva. Ao devolver, muda-se o código.
- **Horas:** usar sempre os utilitários de `core.js` (`lisboa()`, `hora()`, `hoje()`) com fuso `Europe/Lisbon`, nunca o fuso do aparelho.
- **Quartos** no formato do Opera: `A123`, `T045`, `V12` (`norm_quarto` em SQL, `normQuarto` em JS, igual ao `normRoom` do Beach OPS).

## Segurança

- Os hóspedes não leem tabelas (RLS). Só usam as funções `ocupacao`, `criar_reserva`, `ver_reserva` e `cancelar_reserva`. Staff = linha em `staff` (`e_staff()`).
- A chave em `core.js` é a **publishable**, que é pública. Nunca usar nem pôr no código a chave secreta/service_role.
- O registo público de contas está desligado. Para dar acesso a alguém da receção: o utilizador cria a conta no painel do Supabase (Authentication → Users → Add user, *Auto Confirm*), e depois
  `insert into public.staff (user_id, nome) select id, 'Nome' from auth.users where email = '...';`
- Sem dados pessoais de hóspedes vindos do Opera: só quarto, datas e n.º de pessoas.

## Lista de hóspedes (Beach OPS)

Depois de importar o In House ou o Arrivals, o Beach OPS chama `functions/v1/sincronizar-quartos` com o cabeçalho `x-firebase-token` (login Firebase de quem importou) e `{dia}`. A função lê `inhouse/<dia>` do Firestore **com esse token** (não confia no corpo do pedido) e chama `substituir_estadias` (que só a chave de serviço pode chamar). Isso substitui a tabela `estadias` e regista a importação em `importacoes`.
`criar_reserva` valida o quarto se `config.validar_quarto` estiver ligado e tiver havido importação nas últimas 48 h.

## Como trabalhar

- **SQL no projeto:** usar a Management API. O token é injetado pelo proxy do ambiente "Verdelago"; nunca o pedir no chat.
  ```bash
  python3 -c 'import json,sys;print(json.dumps({"query":sys.stdin.read()}))' < ficheiro.sql \
    | curl -sS -X POST https://api.supabase.com/v1/projects/ncisfqhfxqumoadikupm/database/query -H 'Content-Type: application/json' --data-binary @-
  ```
  Cada pedido é uma transação separada. Testar com `begin; …; rollback;` num só pedido e não deixar dados de teste.
- **Alterar o esquema:** criar uma nova `supabase/migrations/NNNN_descricao.sql`, aplicá-la com o comando acima e fazer commit. Ao recriar uma função com outra assinatura, refazer os `revoke`/`grant`.
- **Publicar a função:**
  ```bash
  cd supabase/functions/sincronizar-quartos && curl -sS -X POST "https://api.supabase.com/v1/projects/ncisfqhfxqumoadikupm/functions/deploy?slug=sincronizar-quartos" \
    -F 'metadata={"entrypoint_path":"index.ts","name":"sincronizar-quartos","verify_jwt":false};type=application/json' -F "file=@index.ts;type=application/typescript"
  ```
- **Site:** depois de mexer em `web/`, subir o `?v=` em `web/index.html`. Testar localmente com `cd web && python3 -m http.server 8765` e o Playwright (por exemplo iPhone 13, com um `timezoneId` diferente para apanhar erros de fuso). Apagar as reservas de teste no fim.
- **Publicar:** um merge para `main` que mexa em `web/` publica sozinho no GitHub Pages (`.github/workflows/pages.yml`).
- Desenvolver num ramo `claude/...` e abrir um PR para `main`. O utilizador prefere autonomia: perguntar só o que é mesmo decisão dele ou o que só a conta dele pode fazer.
