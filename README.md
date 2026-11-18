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

## Base de dados

`supabase/migrations/`: aplicadas por ordem (0001 esquema inicial, 0002 slots de 30 min, 0003 estadias e validação do quarto, 0004 torneios a bloquear campos). Já estão aplicadas no projeto.

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

No painel, aba **Torneios**: nome, dia (ou vários dias seguidos), horas e campos. Um trigger na base de dados (`torneio_sincronizar`) cria um bloqueio `tipo = 'torneio'` em `reservas` por campo e por dia, e acerta-os quando o torneio é editado; apagar o torneio liberta os campos. Se já houver reservas ou bloqueios nesse horário, o torneio não é gravado e o erro diz quais são. O quadro e os resultados ficam em `torneios.dados`. Torneios não públicos aparecem só como "Torneio" aos hóspedes e no ecrã TV.

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
| `#/rececao` | Painel da receção (login): grelha do dia, reservas e bloqueios, cacifos e material por preparar, mensagem para o hóspede por WhatsApp/email |
| `#/tv` | Ecrã TV: ocupação do dia, atualiza a cada minuto |

Publicado em **https://nunomavsilva.github.io/verdelago-sports/** (GitHub Pages; cada push para `main` que mexa em `web/` publica automaticamente).

Testar localmente: `cd web && python3 -m http.server 8765` e abrir `http://localhost:8765`.

## Próximos passos

- [x] App web: reservas (hóspedes), painel da receção, cacifos
- [x] Publicar o site
- [x] Validar o quarto com a lista de hóspedes do Opera (via Beach OPS)
- [ ] Emails (confirmação e código do cacifo)
- [x] Torneios a bloquear campos automaticamente
- [ ] Quadros e resultados dos torneios de pádel (a partir da app existente)
- [ ] Ecrã TV com ocupação e torneios
