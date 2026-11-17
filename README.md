# Verdelago Sports Center

Reservas dos espaços desportivos para hóspedes, torneios (pádel) com ecrã TV e cacifos com código para levantar material quando a receção está fechada.

Base de dados: **Supabase** (`https://ncisfqhfxqumoadikupm.supabase.co`).

## Espaços

8 campos de pádel (90 min), 2 de ténis, futebol 7, beach volley e polidesportivo (60 min). Todos das 08:00 às 22:00. Horários e durações editáveis na tabela `espacos`.

## Como funciona

| Quem | O quê |
|---|---|
| Hóspede (sem conta) | Vê a ocupação, reserva com **n.º do quarto + apelido + email**, recebe um link privado da reserva, pode cancelar até à hora de início. |
| Receção (conta Supabase em `staff`) | Vê tudo, cria bloqueios e reservas, prepara cacifos (n.º + código), marca devoluções. |
| Ecrã TV / público | Ocupação do dia e torneios públicos. |

### Regras (tabela `config`)

- Reservar até **7 dias** à frente e até **30 min** antes do início.
- Máximo **2 reservas por quarto e por dia**.
- Os horários são alinhados com a abertura do espaço (ex.: pádel 08:00, 09:30, 11:00…).
- A base de dados impede reservas sobrepostas no mesmo espaço.

### Cacifos

Fechaduras de combinação reprogramável. A receção põe o material, define um código novo e regista-o na app (`cacifo_usos`). O hóspede vê o cacifo e o código na página da reserva (e por email). Ao devolver, a receção marca como devolvido e muda o código. Um cacifo só pode estar associado a uma reserva de cada vez.

## Base de dados

`supabase/migrations/0001_inicial.sql`: colar no Supabase em **SQL Editor › New query › Run** (só uma vez, num projeto vazio).

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

## Próximos passos

- [ ] App web: reservas (hóspedes), painel da receção, cacifos
- [ ] Emails (confirmação e código do cacifo)
- [ ] Torneios de pádel (a partir da app existente) a bloquear campos automaticamente
- [ ] Ecrã TV com ocupação e torneios
