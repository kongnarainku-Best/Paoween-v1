-- Run after the migrations in a disposable test database. All fixtures roll back.
begin;
insert into auth.users (id) values
  ('04850000-0000-4000-8000-000000000001'),
  ('04850000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '04850000-0000-4000-8000-000000000002';
insert into public.pockets (id, user_id, name, opening_balance_thb, opening_date)
values ('04850000-0000-4000-8000-000000000005', auth.uid(), 'เงินสด', 900000, '2026-11-21');

set local request.jwt.claim.sub = '04850000-0000-4000-8000-000000000001';
insert into public.pockets (id, user_id, name, opening_balance_thb, opening_date) values
  ('04850000-0000-4000-8000-000000000003', auth.uid(), 'กสิกร', 10000, '2026-11-21'),
  ('04850000-0000-4000-8000-000000000004', auth.uid(), 'เงินสด', 500, '2026-11-21');

insert into public.transactions (user_id, transaction_date, transaction_type, description, amount_thb, category, pocket_id, destination_pocket_id)
values
  (auth.uid(), '2026-11-21', 'transfer', 'ถอนเงินสด', 1000, 'Transfer money', '04850000-0000-4000-8000-000000000003', '04850000-0000-4000-8000-000000000004'),
  (auth.uid(), '2026-11-21', 'expense', 'ค่าข้าว', 80, 'Food/Beverage', '04850000-0000-4000-8000-000000000004', null),
  (auth.uid(), '2026-11-20', 'expense', 'ก่อนวันเริ่ม', 5, 'Other', '04850000-0000-4000-8000-000000000004', null),
  (auth.uid(), '2026-11-22', 'expense', 'หลังวันที่ดู', 10, 'Other', '04850000-0000-4000-8000-000000000004', null),
  (auth.uid(), '2026-11-21', 'expense', 'ข้อมูลเก่า', 20, 'Other', null, null);

do $$
declare
  bank constant uuid := '04850000-0000-4000-8000-000000000003';
  cash constant uuid := '04850000-0000-4000-8000-000000000004';
  other constant uuid := '04850000-0000-4000-8000-000000000005';
  as_of constant date := '2026-11-21';
begin
  assert (select count(*) from public.pocket_balances(as_of)) = 2, 'foreign pocket leaked';
  assert (select balance_thb from public.pocket_balances(as_of) where id = bank) = 9000, 'source debit';
  assert (select balance_thb from public.pocket_balances(as_of) where id = cash) = 1420, 'destination credit and expense';
  assert (select sum(balance_thb) from public.pocket_balances(as_of)) = 10420, 'net balance';
  assert (select count(balance_thb) from public.pocket_balances(as_of - 1)) = 0, 'before tracking starts';

  begin
    insert into public.transactions (user_id, transaction_date, transaction_type, description, amount_thb, category, pocket_id, destination_pocket_id)
    values (auth.uid(), as_of, 'transfer', 'ข้ามบัญชี', 1, 'Other', bank, other);
    raise exception 'accepted foreign pocket';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.transactions (user_id, transaction_date, transaction_type, description, amount_thb, category, pocket_id, destination_pocket_id)
    values (auth.uid(), as_of, 'transfer', 'ไปกระเป๋าเดิม', 1, 'Other', cash, cash);
    raise exception 'accepted same-pocket transfer';
  exception when check_violation then null;
  end;

  update public.transactions set amount_thb = 90.25 where description = 'ค่าข้าว';
  assert (select balance_thb from public.pocket_balances(as_of) where id = cash) = 1409.75, 'edit expense';
  delete from public.transactions where transaction_type = 'transfer';
  assert (select balance_thb from public.pocket_balances(as_of) where id = bank) = 10000, 'delete restores source';
  assert (select balance_thb from public.pocket_balances(as_of) where id = cash) = 409.75, 'delete restores destination';

  insert into public.transactions (user_id, transaction_date, transaction_type, description, amount_thb, category, pocket_id, investment_direction)
  values
    (auth.uid(), as_of, 'investment', 'ซื้อหุ้น', 100, 'Stocks', bank, 'buy'),
    (auth.uid(), as_of, 'investment', 'ขายหุ้น', 40, 'Stocks', bank, 'sell');
  assert (select balance_thb from public.pocket_balances(as_of) where id = bank) = 9940, 'investment signed effects';
end
$$;

set local request.jwt.claim.sub = '04850000-0000-4000-8000-000000000002';
do $$
begin
  assert (select count(*) from public.pockets) = 1, 'cross-account list';
  assert (select sum(balance_thb) from public.pocket_balances('2026-11-21')) = 900000, 'cross-account balance';
  assert (select count(*) from public.transactions) = 0, 'cross-account ledger';
end
$$;
reset role;
delete from auth.users where id = '04850000-0000-4000-8000-000000000001';
do $$
begin
  assert (
    select count(*) from public.pockets where user_id = '04850000-0000-4000-8000-000000000001'
  ) = 0, 'account deletion removes pockets';
  assert (
    select count(*) from public.transactions where user_id = '04850000-0000-4000-8000-000000000001'
  ) = 0, 'account deletion removes the linked ledger';
end
$$;
rollback;
