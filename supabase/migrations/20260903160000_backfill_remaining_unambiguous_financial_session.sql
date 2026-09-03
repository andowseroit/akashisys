update public.sales
set session_id = 'a6df5e92-5b47-4670-8004-b9c19ace2621'
where id = 'ec95cb44-c646-464a-9cdd-9aec2fc33c74'
  and session_id is null;

update public.payments
set session_id = 'a6df5e92-5b47-4670-8004-b9c19ace2621'
where id = '54650005-68f7-44fb-85c6-ed8664ca023f'
  and session_id is null;
