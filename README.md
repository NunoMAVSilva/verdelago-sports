# Verdelago Sports Center

Reservas dos espaços desportivos para hóspedes, torneios (pádel) com ecrã TV e cacifos com código para levantar material quando a receção está fechada.

Base de dados: **Supabase** (`https://ncisfqhfxqumoadikupm.supabase.co`).

## Espaços

8 campos de pádel, 2 de ténis, futebol 7, beach volley e polidesportivo. Todos das 08:00 às 22:00, em **intervalos de 30 min**; o hóspede escolhe a duração (30 a 120 min). Editável na tabela `espacos` (`abre`, `fecha`, `passo_min`, `max_duracao_min`).

## Como funciona

| Quem | O quê |
|---|---|
| Hóspede (sem conta) | Vê a ocupação, reserva com **n.º do quarto + apelido + email**, recebe um link privado da reserva, pode cancelar até à hora de início. |
| Receção (conta Supabase em `staff`) | Vê tudo, cria bloqueios, reservas e torneios, prepara cacifos (n.º + código), marca devoluções. |
| Ecrã TV / público | Ocupação do dia e torneios públicos. |

### Regras (tabela `config`)

- Reservar até **7 dias** à frente e até **30 min** antes do início.
- Sem limite de reservas por quarto (`max_reservas_quarto_dia` vazio; pôr um número para ativar).
- Horários de 30 em 30 minutos a partir da abertura.
- A base de dados impede reservas sobrepostas no mesmo espaço.

### Cacifos

Fechaduras de combinação reprogramável. A receção põe o material, define um código novo e regista-o na app (`cacifo_usos`). O hóspede vê o cacifo e o código na página da reserva (e por email). Ao devolver, a receção marca como devolvido e muda o código. Um cacifo só pode estar associado a uma reserva de cada vez.

**Material não devolvido:** no cacifo (ou no detalhe da reserva), "Não devolvido" regista o que falta e a receção do resort (`config.email_rececao`, hoje frontdesk@verdelago.com) recebe um email com o quarto, o nome e os contactos do hóspede para o contactar ou cobrar; responder ao email escreve ao hóspede. O cacifo fica livre. Os casos dos últimos 30 dias aparecem em Cacifos e material.

## Base de dados

`supabase/migrations/`: aplicadas por ordem (0001 esquema inicial, 0002 slots de 30 min, 0003 estadias e validação do quarto, 0004 torneios a bloquear campos, 0005 app dos torneios, 0006 Realtime, 0007 emails, 0008 material não devolvido, 0009 material desportivo). Já estão aplicadas no projeto.

Os hóspedes não leem as tabelas diretamente (RLS). Só usam estas funções:

- `ocupacao(dia)`: ocupação de um dia, sem dados pessoais
- `criar_reserva(...)`: valida as regras e devolve o token da reserva
- `ver_reserva(token)`: detalhes da reserva, com cacifo e código quando preparado
- `cancelar_reserva(token)`

### Criar uma conta da receção

1. Supabase › **Authentication › Users › Add user** (email + password, *Auto Confirm User*).
2. Dar acesso ao painel (pedir ao Claude ou, no SQL Editor):
   ```sql
   insert into public.staff (user_id, nome)
   select id, 'Nome' from auth.users where email = 'pessoa@verdelago.com';
   ```

### Torneios

No painel, aba **Torneios**: nome, dia (ou vários dias seguidos), horas e campos. Um trigger na base de dados (`torneio_sincronizar`) cria um bloqueio `tipo = 'torneio'` em `reservas` por campo e por dia, e acerta-os quando o torneio é editado; apagar o torneio liberta os campos. Se já houver reservas ou bloqueios nesse horário, o torneio não é gravado e o erro diz quais são. Torneios não públicos aparecem só como "Torneio" aos hóspedes e no ecrã TV.

**Gerir o torneio** (`#/torneio/<id>`, botão "Abrir torneio"; antes era um artefacto à parte): inscrições de duplas e individuais (com nível 1–6 e formação de duplas), grupos com cabeças de série ou sorteio, calendário pelos campos do torneio, resultados a tempo corrido com desempate, apuramento e quadro de eliminatórias, cronómetro. Tudo fica em `torneios.dados`; grava sozinho e, se outro aparelho alterou o torneio entretanto, recarrega em vez de apagar o que o outro gravou. Se os jogos acabarem depois do bloqueio, a página avisa e propõe prolongá-lo.

**Ecrã TV do torneio:** `#/tv/torneio` (o torneio público de hoje) ou `#/tv/torneio/<id>`: jogos em cada campo, a seguir, classificações e quadro, cronómetro. Usa `torneio_tv()`, que não devolve contactos nem jogadores sem par; a tabela `torneios` só é lida pelo staff.

## Material desportivo (`web/material/`)

App do balcão de material (empréstimos de raquetes, bolas, sapatilhas…), trazida da app do Spa (`verdelago-spa/material-desportivo`, Firebase) para o Supabase, sem mudar a forma de trabalhar. Endereço: https://nunomavsilva.github.io/verdelago-sports/material/

- **Fase 1 (atual):** Balcão (saída por quarto, raquetes numeradas, quem entrega, prazo), devoluções totais/parciais com danos e perdas, Material (estado de cada peça, fora de serviço), Histórico com Excel, Definições (só gestores). **Fase 2:** Análise e Relatório. **Fase 3:** taxas por atraso. A assinatura do hóspede também fica para depois.
- **Dados:** `emprestimos` (documento `doc` igual ao da app original) e `material_config` (`main` = definições/inventário, `avarias` = peças fora de serviço). Realtime entre postos.
- **Acesso por PIN:** cada posto é uma conta do Supabase com email interno e o PIN de 6 dígitos como palavra-passe (`sports@`, `spa@`, `frontdesk@posto.verdelago.com`), com linha em `staff` e `papel = 'posto'`. Gestores (`papel = 'gestor'`) entram com email e veem as Definições.
- **Horas:** em Lisboa (`lx`/`lxTs`), seja qual for o fuso do tablet.
- **Passar os dados da app antiga:** na app antiga, Definições → Cópia de segurança → Exportar; na nova, com conta de gestor, Definições → Importar dados de um ficheiro.

## Emails para os hóspedes (Brevo)

A função `supabase/functions/enviar-email` envia, a partir de **sports.center@verdelago.com**:
- a confirmação da reserva (com o link para ver ou cancelar), quando se cria uma reserva com email (online ou pela receção);
- o número e o código do cacifo, quando a receção prepara o cacifo.

A base de dados avisa a função com `pg_net` (migração 0007). A função lê os dados com a chave de serviço e envia uma só vez (`reservas.email_confirmacao_em`, `cacifo_usos.notificado_em`, visíveis no painel). O email é em PT e EN.

**Configuração (uma vez):** conta Brevo → autenticar o domínio `verdelago.com` (registos DNS DKIM/DMARC que o Brevo indica) → adicionar o remetente `sports.center@verdelago.com` → criar uma chave API → guardá-la no Supabase em *Edge Functions › Secrets* com o nome `BREVO_API_KEY`. Sem chave, a função não envia nada.

## Lista de hóspedes (Beach OPS)

Quando a equipa importa o **In House** ou o **Arrivals** do Opera no Beach OPS (`verdelago-beach-app`), a app chama a função `supabase/functions/sincronizar-quartos` com o login Firebase de quem importou. A função lê `inhouse/<dia>` diretamente do Firestore com esse login (se não houver acesso, nada muda) e substitui a tabela `estadias` (quarto, chegada, partida, n.º de pessoas; **sem nomes**).

Com `config.validar_quarto = true`, uma reserva online só é aceite se o quarto tiver estadia nesse dia. A validação só se aplica se houve importação nas últimas 48 h, para não bloquear reservas se a lista não for importada. Quartos no formato do Opera: `A123`, `T045`, `V12` (o hóspede pode escrever `a 12`).

Publicar a função: `POST /v1/projects/<ref>/functions/deploy?slug=sincronizar-quartos` (Management API) com `verify_jwt: false`.

## App web (`web/`)

Site estático (HTML + JS, sem build). Uma só página com rotas:

| Endereço | O quê |
|---|---|
| `#/` | Reservar (hóspedes, PT/EN, pensado para telemóvel) |
| `#/r/<token>` | A reserva do hóspede: detalhes, cacifo e código, cancelar |
| `#/rececao` | Painel da receção (login; atualiza sozinho via Supabase Realtime e de 30 em 30 s): grelha do dia, reservas e bloqueios, cacifos e material por preparar, mensagem para o hóspede por WhatsApp/email |
| `#/torneio/<id>` | Gerir um torneio (staff): inscrições, grupos, jogos, eliminatórias |
| `#/tv` | Ecrã TV: ocupação do dia, atualiza de 20 em 20 s |
| `#/tv/torneio` | Ecrã TV do torneio do dia (atualiza a cada 5 s) |

Publicado em **https://nunomavsilva.github.io/verdelago-sports/** (GitHub Pages; cada push para `main` que mexa em `web/` publica automaticamente).

Testar localmente: `cd web && python3 -m http.server 8765` e abrir `http://localhost:8765`.

## Próximos passos

- [x] App web: reservas (hóspedes), painel da receção, cacifos
- [x] Publicar o site
- [x] Validar o quarto com a lista de hóspedes do Opera (via Beach OPS)
- [x] Emails (confirmação e código do cacifo): falta a chave do Brevo
- [x] Torneios a bloquear campos automaticamente
- [x] Quadros e resultados dos torneios de pádel (vindos da app em artefacto)
- [x] Ecrã TV com ocupação e torneios
