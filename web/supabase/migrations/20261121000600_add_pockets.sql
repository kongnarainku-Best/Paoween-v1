create table public.pockets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  opening_balance_thb numeric(14, 2) not null,
  opening_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

alter table public.pockets enable row level security;
create policy "Users can read their own pockets"
  on public.pockets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own pockets"
  on public.pockets for insert to authenticated
  with check ((select auth.uid()) = user_id);
grant select, insert on public.pockets to authenticated;

alter table public.transactions
  add column pocket_id uuid,
  add column destination_pocket_id uuid,
  add constraint transactions_pocket_owner_fk foreign key (user_id, pocket_id)
    references public.pockets (user_id, id),
  add constraint transactions_destination_pocket_owner_fk foreign key (user_id, destination_pocket_id)
    references public.pockets (user_id, id),
  add constraint transactions_pocket_shape check (
    case when transaction_type = 'transfer' then
      (pocket_id is null and destination_pocket_id is null)
      or (pocket_id is not null and destination_pocket_id is not null and pocket_id <> destination_pocket_id)
    else destination_pocket_id is null end
  ),
  add constraint transactions_pocket_investment_direction check (
    transaction_type <> 'investment' or pocket_id is null or investment_direction is not null
  );

create index transactions_pocket_date_idx on public.transactions (user_id, pocket_id, transaction_date)
  where pocket_id is not null;
create index transactions_destination_pocket_date_idx on public.transactions (user_id, destination_pocket_id, transaction_date)
  where destination_pocket_id is not null;

create function public.pocket_balances(p_as_of date)
returns table (
  id uuid,
  name text,
  opening_date date,
  opening_balance_thb numeric,
  balance_thb numeric
)
language sql stable security invoker
set search_path = ''
as $$
  select p.id, p.name, p.opening_date, p.opening_balance_thb,
    case when p.opening_date <= p_as_of then
      p.opening_balance_thb
      + coalesce((
        select sum(case
          when t.transaction_type = 'income' or t.investment_direction = 'sell' then t.amount_thb
          else -t.amount_thb end)
        from public.transactions as t
        where t.user_id = p.user_id and t.pocket_id = p.id
          and t.transaction_date between p.opening_date and p_as_of
      ), 0)
      + coalesce((
        select sum(t.amount_thb)
        from public.transactions as t
        where t.user_id = p.user_id and t.destination_pocket_id = p.id
          and t.transaction_date between p.opening_date and p_as_of
      ), 0)
    end
  from public.pockets as p
  where p.user_id = (select auth.uid())
$$;

revoke all on function public.pocket_balances(date) from public, anon;
grant execute on function public.pocket_balances(date) to authenticated;
