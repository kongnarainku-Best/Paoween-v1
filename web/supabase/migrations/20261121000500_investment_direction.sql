alter table public.transactions
  add column investment_direction text,
  add constraint transactions_investment_direction_check check (
    investment_direction is null
    or (transaction_type = 'investment' and investment_direction in ('buy', 'sell'))
  );

update public.transactions
set investment_direction = lower(regexp_replace(action, '^\s+|\s+$', '', 'g'))
where transaction_type = 'investment'
  and lower(regexp_replace(action, '^\s+|\s+$', '', 'g')) in ('buy', 'sell');
