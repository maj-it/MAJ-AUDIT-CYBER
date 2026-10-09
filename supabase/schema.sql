-- MAJ Audit — schéma SaaS multi-organisations (à exécuter dans Supabase > SQL Editor)
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
create table if not exists public.members (
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','auditor','viewer')),
  primary key (org_id, user_id)
);
-- Toutes les données métier (company | audit | risk | scan) dans une table, isolées par org_id
create table if not exists public.records (
  id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('company','audit','risk','scan')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists records_org_kind on public.records(org_id, kind);

create or replace function public.is_member(o uuid, write boolean default false) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from members m where m.org_id = o and m.user_id = auth.uid()
    and (not write or m.role in ('owner','auditor')));
$$;

alter table public.orgs enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;

create policy orgs_read on public.orgs for select using (public.is_member(id));
create policy members_read on public.members for select using (user_id = auth.uid() or public.is_member(org_id));
create policy records_read on public.records for select using (public.is_member(org_id));
create policy records_insert on public.records for insert with check (public.is_member(org_id, true));
create policy records_update on public.records for update using (public.is_member(org_id, true)) with check (public.is_member(org_id, true));
create policy records_delete on public.records for delete using (public.is_member(org_id, true));

-- À l'inscription : création automatique de l'organisation et du membre « owner »
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  insert into orgs(name) values (coalesce(new.raw_user_meta_data->>'org_name', split_part(new.email,'@',1))) returning id into o;
  insert into members(org_id, user_id, role) values (o, new.id, 'owner');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
