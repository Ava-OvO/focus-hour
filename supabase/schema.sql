create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  planned_date date not null,
  estimated_minutes integer not null check (estimated_minutes between 1 and 1440),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  estimated_minutes integer not null check (estimated_minutes between 1 and 60),
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on public.tasks(user_id, planned_date, position);
create index if not exists steps_user_task_idx on public.steps(user_id, task_id, position);

create or replace function public.check_step_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.tasks where id = new.task_id and user_id = new.user_id) then
    raise exception 'Step owner must match task owner';
  end if;
  return new;
end; $$;
drop trigger if exists steps_check_owner on public.steps;
create trigger steps_check_owner before insert or update of task_id, user_id on public.steps
for each row execute function public.check_step_owner();

alter table public.tasks enable row level security;
alter table public.steps enable row level security;
grant select, insert, update, delete on public.tasks, public.steps to authenticated;

drop policy if exists tasks_own on public.tasks;
create policy tasks_own on public.tasks for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists steps_own on public.steps;
create policy steps_own on public.steps for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
