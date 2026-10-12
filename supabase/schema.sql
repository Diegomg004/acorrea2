-- Acorrea2 · esquema de base de datos (Supabase / Postgres 15+).
--
-- Seguridad, en una frase: toda tabla tiene RLS, los clientes solo pueden
-- escribir las columnas que necesitan (privilegios por columna) y lo que toca
-- varias tablas a la vez va por funciones SECURITY DEFINER con search_path vacío.
-- Nada de SQL dinámico: no hay dónde inyectar.
--
-- Es re-ejecutable: tablas con IF NOT EXISTS, funciones con OR REPLACE y
-- políticas/triggers con DROP IF EXISTS antes de crearlos.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── Utilidades puras (las usan los CHECK) ─────────────────────────────────────

create or replace function public.all_https(arr text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(u ~ '^https://[^[:space:]]+$' and char_length(u) <= 1000), true)
  from unnest(arr) as u;
$$;

-- ── Tablas ────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (char_length(username) between 2 and 24 and username ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://[^[:space:]]+$' and char_length(avatar_url) <= 1000)),
  color text not null default '#FF5C39' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  home_label text not null default 'Calle del Peso Hispano 14, Madrid'
    check (char_length(btrim(home_label)) between 1 and 160),
  home_lat double precision not null default 40.3669522 check (home_lat between -90 and 90),
  home_lon double precision not null default -3.7453309 check (home_lon between -180 and 180),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.invites (
  token text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses int not null default 10 check (max_uses between 1 and 50),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  link_url text check (link_url is null or (link_url ~* '^https?://[^[:space:]]+$' and char_length(link_url) <= 2000)),
  photos text[] not null default '{}' check (cardinality(photos) <= 8 and public.all_https(photos)),
  starts_at timestamptz not null,
  duration_minutes int not null default 120 check (duration_minutes between 15 and 4320),
  price_per_person numeric(8, 2) check (price_per_person is null or price_per_person between 0 and 100000),
  price_note text not null default '' check (char_length(price_note) <= 120),
  location_name text not null default '' check (char_length(location_name) <= 200),
  lat double precision check (lat is null or lat between -90 and 90),
  lon double precision check (lon is null or lon between -180 and 180),
  drive_minutes int check (drive_minutes is null or drive_minutes between 0 and 6000),
  drive_km numeric(7, 1) check (drive_km is null or drive_km between 0 and 20000),
  rate_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_group_idx on public.plans (group_id, starts_at);

create table if not exists public.plan_votes (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('approve', 'reject')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table if not exists public.plan_ratings (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  score int not null check (score between 1 and 100),
  liked text not null default '' check (char_length(liked) <= 600),
  improve text not null default '' check (char_length(improve) <= 600),
  would_repeat text not null check (would_repeat in ('siempre', 'otro_sitio', 'no')),
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  plan_id uuid references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_group_idx on public.messages (group_id, created_at desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

-- Cola de avisos push. La rellenan los triggers y la vacía el cron de GitHub
-- Actions (scripts/notify.mjs) con la clave de servicio. Ningún cliente la ve.
create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '#/',
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbox_pending_idx on public.notification_outbox (created_at) where sent_at is null;

-- ── Funciones de permiso (SECURITY DEFINER: evitan recursión en RLS) ─────────

create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = g and m.user_id = auth.uid());
$$;

create or replace function public.is_owner(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m
                 where m.group_id = g and m.user_id = auth.uid() and m.role = 'owner');
$$;

create or replace function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select other = auth.uid() or exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

create or replace function public.plan_member(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plans pl
                 join public.group_members m on m.group_id = pl.group_id
                 where pl.id = p and m.user_id = auth.uid());
$$;

-- Vota quien es del grupo y no es el autor del plan.
create or replace function public.can_vote(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plans pl
                 join public.group_members m on m.group_id = pl.group_id
                 where pl.id = p and m.user_id = auth.uid() and pl.created_by <> auth.uid());
$$;

-- Puntúa lo mismo, y solo cuando el plan ya ha empezado.
create or replace function public.can_rate(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plans pl
                 join public.group_members m on m.group_id = pl.group_id
                 where pl.id = p and m.user_id = auth.uid() and pl.created_by <> auth.uid()
                   and pl.starts_at <= now());
$$;

create or replace function public.plan_in_group(p uuid, g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plans pl where pl.id = p and pl.group_id = g);
$$;

-- ── Invitaciones y alta ──────────────────────────────────────────────────────

create or replace function public._redeem_invite(p_token text, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_group uuid;
begin
  select group_id into v_group from public.invites where token = p_token;
  if v_group is not null and exists (select 1 from public.group_members
                                     where group_id = v_group and user_id = p_user) then
    return v_group; -- ya estaba dentro: no gasta usos
  end if;
  update public.invites set uses = uses + 1
   where token = p_token and expires_at > now() and uses < max_uses
   returning group_id into v_group;
  if v_group is null then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  insert into public.group_members (group_id, user_id) values (v_group, p_user)
  on conflict do nothing;
  return v_group;
end $$;

-- Alta: el usuario sale del email (<usuario>@…). Sin invitación válida solo
-- puede registrarse la primera persona (la que crea la manada).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(split_part(new.email, '@', 1));
  v_display text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_invite text := coalesce(new.raw_user_meta_data ->> 'invite', '');
  v_color text := coalesce(new.raw_user_meta_data ->> 'color', '#FF5C39');
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('acorrea2_signup'));
  v_first := not exists (select 1 from public.profiles);
  if not v_first and v_invite = '' then
    raise exception 'invite_required' using errcode = 'P0001';
  end if;
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then v_color := '#FF5C39'; end if;
  if char_length(v_display) not between 1 and 40 then v_display := v_username; end if;
  insert into public.profiles (id, username, display_name, color)
  values (new.id, v_username, v_display, v_color);
  if not v_first then
    perform public._redeem_invite(v_invite, new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.join_group(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  return public._redeem_invite(p_token, auth.uid());
end $$;

create or replace function public.invite_preview(p_token text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'group_name', g.name,
    'inviter', (select p.display_name from public.profiles p where p.id = i.created_by),
    'members', (select coalesce(json_agg(json_build_object(
                    'display_name', p.display_name, 'avatar_url', p.avatar_url, 'color', p.color)
                  order by m.joined_at), '[]'::json)
                from public.group_members m join public.profiles p on p.id = m.user_id
                where m.group_id = g.id))
  from public.invites i join public.groups g on g.id = i.group_id
  where i.token = p_token and i.expires_at > now() and i.uses < i.max_uses;
$$;

create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select count(*) from public.group_members where user_id = auth.uid()) >= 10 then
    raise exception 'too_many_groups' using errcode = 'P0001';
  end if;
  insert into public.groups (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- ── Triggers de mantenimiento ────────────────────────────────────────────────

create or replace function public.plans_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  -- Si cambia cuándo acaba, el aviso de «puntúa» se vuelve a programar.
  if new.starts_at is distinct from old.starts_at
     or new.duration_minutes is distinct from old.duration_minutes then
    new.rate_notified_at := null;
  end if;
  return new;
end $$;
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
  for each row execute function public.plans_touch();

create or replace function public.votes_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists votes_touch on public.plan_votes;
create trigger votes_touch before update on public.plan_votes
  for each row execute function public.votes_touch();

-- ── Triggers que encolan avisos ──────────────────────────────────────────────

create or replace function public.outbox_on_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox (user_id, title, body, url, tag)
  select m.user_id,
         coalesce((select p.display_name from public.profiles p where p.id = new.created_by), 'Alguien')
           || ' propone un plan',
         '«' || new.title || '». Entra y vota.',
         '#/plan/' || new.id, 'plan-' || new.id
  from public.group_members m
  where m.group_id = new.group_id and m.user_id <> new.created_by;
  return new;
end $$;
drop trigger if exists plans_outbox on public.plans;
create trigger plans_outbox after insert on public.plans
  for each row execute function public.outbox_on_plan();

create or replace function public.outbox_on_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_owner uuid; v_name text;
begin
  if tg_op = 'UPDATE' and new.vote = old.vote then return new; end if;
  select title, created_by into v_title, v_owner from public.plans where id = new.plan_id;
  select display_name into v_name from public.profiles where id = new.user_id;
  insert into public.notification_outbox (user_id, title, body, url, tag)
  values (v_owner,
          coalesce(v_name, 'Alguien') || case when new.vote = 'approve' then ' se apunta' else ' ha rechazado tu plan' end,
          '«' || v_title || '»' || case when new.vote = 'reject' then '. Pregúntale por qué en el chat.' else '.' end,
          '#/plan/' || new.plan_id, 'vote-' || new.plan_id);
  return new;
end $$;
drop trigger if exists votes_outbox on public.plan_votes;
create trigger votes_outbox after insert or update on public.plan_votes
  for each row execute function public.outbox_on_vote();

create or replace function public.outbox_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox (user_id, title, body, url, tag)
  select m.user_id,
         coalesce((select p.display_name from public.profiles p where p.id = new.user_id), 'Alguien') || ' en '
           || case when new.plan_id is null
                   then (select g.name from public.groups g where g.id = new.group_id)
                   else '«' || (select pl.title from public.plans pl where pl.id = new.plan_id) || '»' end,
         left(new.body, 140),
         case when new.plan_id is null then '#/chat/general' else '#/plan/' || new.plan_id end,
         'chat-' || coalesce(new.plan_id::text, new.group_id::text)
  from public.group_members m
  where m.group_id = new.group_id and m.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists messages_outbox on public.messages;
create trigger messages_outbox after insert on public.messages
  for each row execute function public.outbox_on_message();

-- Recordatorio de «puntúa el plan» cuando acaba (lo llama el cron).
create or replace function public.queue_rating_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    update public.plans p set rate_notified_at = now()
     where p.rate_notified_at is null
       and p.starts_at + make_interval(mins => p.duration_minutes) <= now()
       and p.starts_at > now() - interval '3 days'
    returning p.id, p.group_id, p.created_by, p.title)
  insert into public.notification_outbox (user_id, title, body, url, tag)
  select m.user_id, '¿Qué tal «' || d.title || '»?',
         'Puntúa el plan del 1 al 100 y di si repetirías.',
         '#/plan/' || d.id || '/valorar', 'rate-' || d.id
  from due d join public.group_members m on m.group_id = d.group_id
  where m.user_id <> d.created_by
    and not exists (select 1 from public.plan_ratings r where r.plan_id = d.id and r.user_id = m.user_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invites enable row level security;
alter table public.plans enable row level security;
alter table public.plan_votes enable row level security;
alter table public.plan_ratings enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.shares_group(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_member(id));
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select to authenticated
  using (public.is_member(group_id));
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(group_id));

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (public.is_member(group_id));
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_member(group_id) and created_by = auth.uid());
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_member(group_id));

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated
  using (public.is_member(group_id));
drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans for insert to authenticated
  with check (public.is_member(group_id) and created_by = auth.uid());
drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid() and public.is_member(group_id));
drop policy if exists plans_delete on public.plans;
create policy plans_delete on public.plans for delete to authenticated
  using (created_by = auth.uid());

drop policy if exists votes_select on public.plan_votes;
create policy votes_select on public.plan_votes for select to authenticated
  using (public.plan_member(plan_id));
drop policy if exists votes_insert on public.plan_votes;
create policy votes_insert on public.plan_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_vote(plan_id));
drop policy if exists votes_update on public.plan_votes;
create policy votes_update on public.plan_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_vote(plan_id));
drop policy if exists votes_delete on public.plan_votes;
create policy votes_delete on public.plan_votes for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists ratings_select on public.plan_ratings;
create policy ratings_select on public.plan_ratings for select to authenticated
  using (public.plan_member(plan_id));
drop policy if exists ratings_insert on public.plan_ratings;
create policy ratings_insert on public.plan_ratings for insert to authenticated
  with check (user_id = auth.uid() and public.can_rate(plan_id));
drop policy if exists ratings_update on public.plan_ratings;
create policy ratings_update on public.plan_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_rate(plan_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(group_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(group_id)
              and (plan_id is null or public.plan_in_group(plan_id, group_id)));

drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
-- notification_outbox: RLS sin políticas = invisible para clientes.

-- ── Privilegios: lo mínimo, columna a columna ────────────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.groups, public.group_members, public.invites,
  public.plans, public.plan_votes, public.plan_ratings, public.messages,
  public.push_subscriptions to authenticated;

grant update (display_name, avatar_url, color) on public.profiles to authenticated;
grant update (name, home_label, home_lat, home_lon) on public.groups to authenticated;
grant delete on public.group_members to authenticated;
grant insert (group_id) on public.invites to authenticated;
grant delete on public.invites to authenticated;
grant insert (group_id, title, description, link_url, photos, starts_at, duration_minutes,
  price_per_person, price_note, location_name, lat, lon, drive_minutes, drive_km)
  on public.plans to authenticated;
grant update (title, description, link_url, photos, starts_at, duration_minutes,
  price_per_person, price_note, location_name, lat, lon, drive_minutes, drive_km)
  on public.plans to authenticated;
grant delete on public.plans to authenticated;
grant insert (plan_id, vote), update (plan_id, vote) on public.plan_votes to authenticated;
grant delete on public.plan_votes to authenticated;
grant insert (plan_id, score, liked, improve, would_repeat),
  update (plan_id, score, liked, improve, would_repeat) on public.plan_ratings to authenticated;
grant insert (group_id, plan_id, body) on public.messages to authenticated;
grant delete on public.push_subscriptions to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.all_https(text[]), public.is_member(uuid), public.is_owner(uuid), public.shares_group(uuid),
  public.plan_member(uuid), public.can_vote(uuid), public.can_rate(uuid), public.plan_in_group(uuid, uuid),
  public.join_group(text), public.create_group(text), public.save_push_subscription(text, text, text),
  public.invite_preview(text)
  to authenticated;
grant execute on function public.invite_preview(text) to anon;
grant execute on function public.queue_rating_reminders() to service_role;

-- ── Realtime (chat y votos en vivo) ──────────────────────────────────────────

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'plans', 'plan_votes', 'plan_ratings'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
