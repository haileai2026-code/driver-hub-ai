create table if not exists public.telegram_bot_state (
  id int primary key check (id = 1),
  update_offset bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.telegram_bot_state (id, update_offset)
values (1, 0)
on conflict (id) do nothing;

alter table public.telegram_bot_state enable row level security;

create policy "telegram_bot_state super_admin read"
on public.telegram_bot_state for select to authenticated
using (public.has_role(auth.uid(), 'super_admin'));
