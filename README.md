# Verdelago Sports Center

Reservas dos espaços desportivos para hóspedes, torneios (pádel) com ecrã TV e cacifos com código para levantar material quando a receção está fechada.

Base de dados: **Supabase** (`https://ncisfqhfxqumoadikupm.supabase.co`).

## Espaços

8 campos de pádel, 2 de ténis, futebol 7, beach volley e polidesportivo. Todos das 08:00 às 22:00, em **intervalos de 30 min**; o hóspede escolhe a duração (30 a 120 min). Editável na tabela `espacos` (`abre`, `fecha`, `passo_min`, `max_duracao_min`).

## Como funciona

| Quem | O quê |
|---|---|
| Hóspede (sem conta) | Vê a ocupação, reserva com **n.º do quarto + apelido + email**, recebe um link privado da reserva, pode cancelar até à hora de início. |
| Receção (conta Supabase em `staff`) | Vê tudo, cria bloqueios e reservas, prepara cacifos (n.º + código), marca devoluções. |
| Ecrã TV / público | Ocupação do dia e torneios públicos. |

### Regras (tabela `config`)

- Reservar até **7 dias** à frente e até **30 min** antes do início.
- Sem limite de reservas por quarto (`max_reservas_quarto_dia` vazio; pôr um número para ativar).
- Horários de 30 em 30 minutos a partir da abertura.
- A base de dados impede reservas sobrepostas no mesmo espaço.

### Cacifos

Fechaduras de combinação reprogramável. A receção põe o material, define um código novo e regista-o na app (`cacifo_usos`). O hóspede vê o cacifo e o código na página da reserva (e por email). Ao devolver, a receção marca como devolvido e muda o código. Um cacifo só pode estar associado a uma reserva de cada vez.

## Base de dados

`supabase/migrations/`: aplicadas por ordem (0001 esquema inicial, 0002 slots de 30 min). Já estão aplicadas no projeto.

Os hóspedes não leem as tabelas diretamente (RLS). Só usam estas funções:

- `ocupacao(dia)`: ocupação de um dia, sem dados pessoais
- `criar_reserva(...)`: valida as regras e devolve o token da reserva
- `ver_reserva(token)`: detalhes da reserva, com cacifo e código quando preparado
- `cancelar_reserva(token)`

### Criar uma conta da receção

1. Supabase › **Authentication › Users › Add user** (email + password).
2. Copiar o *User UID* e, no SQL Editor:
   ```sql
   insert into public.staff (user_id, nome) values ('<UID>', 'Receção');
   ```

## App web (`web/`)

Site estático (HTML + JS, sem build). Uma só página com rotas:

| Endereço | O quê |
|---|---|
| `#/` | Reservar (hóspedes, PT/EN, pensado para telemóvel) |
| `#/r/<token>` | A reserva do hóspede: detalhes, cacifo e código, cancelar |
| `#/rececao` | Painel da receção (login): grelha do dia, reservas e bloqueios, cacifos e material por preparar, mensagem para o hóspede por WhatsApp/email |
| `#/tv` | Ecrã TV: ocupação do dia, atualiza a cada minuto |

Testar localmente: `cd web && python3 -m http.server 8765` e abrir `http://localhost:8765`.

## Próximos passos

- [x] App web: reservas (hóspedes), painel da receção, cacifos
- [ ] Publicar o site
- [ ] Validar quarto + apelido com a lista de hóspedes (GIH/Arrivals)
- [ ] Emails (confirmação e código do cacifo)
- [ ] Torneios de pádel (a partir da app existente) a bloquear campos automaticamente
- [ ] Ecrã TV com ocupação e torneios
