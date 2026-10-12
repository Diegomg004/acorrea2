// Prueba de seguridad del esquema (RLS, privilegios, invitaciones) contra un
// Postgres LOCAL y desechable que imita lo justo de Supabase (auth.users,
// auth.uid(), roles anon/authenticated). Borra y recrea los esquemas.
//
//   TEST_DATABASE_URL=postgres://postgres@localhost:55499/postgres npm run test:db
//
// Se niega a correr contra cualquier host que no sea localhost.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('TEST_DATABASE_URL debe apuntar a un Postgres local desechable.');
  process.exit(1);
}

const db = new pg.Client({ connectionString: url });
await db.connect();
await db.query("set lc_messages to 'C'"); // mensajes en inglés para los asserts

await db.query(`
  drop schema if exists public cascade; drop schema if exists auth cascade;
  drop schema if exists extensions cascade; drop publication if exists supabase_realtime;
  create schema public; create schema auth;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique,
                           raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
  create publication supabase_realtime;
`);
await db.query(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await db.query('grant usage on schema extensions to anon, authenticated, service_role');

// ── helpers ──
async function signup(username, meta = {}) {
  const { rows } = await db.query(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [`${username}@acorrea2.app`, meta]);
  return rows[0].id;
}
async function as(userId, sql, params = []) {
  await db.query('begin');
  try {
    await db.query(userId ? 'set local role authenticated' : 'set local role anon');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId ?? '' })]);
    const res = await db.query(sql, params);
    await db.query('commit');
    return res;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
const fails = (p, re) => assert.rejects(p, re);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ── alta y bootstrap ──
const diego = await signup('diego', { display_name: 'Diego' });
ok(true, 'primera persona entra sin invitación');
await fails(signup('colado'), /invite_required/); checks++;
await fails(signup('colado2', { invite: 'deadbeef' }), /invite_invalid/); checks++;

const groupA = (await as(diego, "select public.create_group('Los Acorrea2') as id")).rows[0].id;
const token = (await as(diego, 'insert into public.invites (group_id) values ($1) returning token', [groupA])).rows[0].token;
ok(/^[0-9a-f]{32}$/.test(token), 'token de 128 bits');
await fails(as(diego, "insert into public.invites (group_id, token) values ($1, 'facil')", [groupA]), /permission denied/); checks++;

const preview = (await as(null, 'select public.invite_preview($1) as p', [token])).rows[0].p;
ok(preview.group_name === 'Los Acorrea2' && preview.members.length === 1, 'preview para anon con token válido');
ok((await as(null, "select public.invite_preview('x') as p")).rows[0].p === null, 'preview vacío con token falso');

const dani = await signup('dani', { display_name: 'Dani', invite: token });
const pedro = await signup('pedro', { display_name: 'Pedro', invite: token });
ok((await as(dani, 'select * from public.group_members where group_id = $1', [groupA])).rowCount === 3, 'tres en la manada');

// otro grupo, con un intruso que comparte grupo solo con Diego
const groupB = (await as(diego, "select public.create_group('Curro') as id")).rows[0].id;
const tokenB = (await as(diego, 'insert into public.invites (group_id) values ($1) returning token', [groupB])).rows[0].token;
const intruso = await signup('intruso', { invite: tokenB });

// join_group de alguien que ya está no gasta usos
const usesBefore = (await db.query('select uses from public.invites where token = $1', [token])).rows[0].uses;
await as(dani, 'select public.join_group($1)', [token]);
ok((await db.query('select uses from public.invites where token = $1', [token])).rows[0].uses === usesBefore, 'rejoin no gasta usos');

// invitación caducada
await db.query("update public.invites set expires_at = now() - interval '1 minute' where token = $1", [tokenB]);
await fails(signup('tarde', { invite: tokenB }), /invite_invalid/); checks++;

// ── anon y tablas internas ──
await fails(as(null, 'select * from public.plans'), /permission denied/); checks++;
await fails(as(dani, 'select * from public.notification_outbox'), /permission denied/); checks++;
await fails(as(dani, 'select public.queue_rating_reminders()'), /permission denied/); checks++;

// ── planes ──
const future = new Date(Date.now() + 7 * 864e5).toISOString();
const past = new Date(Date.now() - 5 * 3600e3).toISOString();
const planF = (await as(diego, `insert into public.plans (group_id, title, starts_at, link_url, photos)
  values ($1, 'Karts', $2, 'https://karts.example/', '{https://img.example/a.jpg}') returning id`, [groupA, future])).rows[0].id;
const planP = (await as(diego, `insert into public.plans (group_id, title, starts_at, duration_minutes)
  values ($1, 'Motos', $2, 60) returning id`, [groupA, past])).rows[0].id;

await fails(as(diego, "insert into public.plans (group_id, title, starts_at, link_url) values ($1, 'x', now(), 'javascript:alert(1)')", [groupA]), /check/); checks++;
await fails(as(diego, "insert into public.plans (group_id, title, starts_at, photos) values ($1, 'x', now(), '{http://inseguro/a.jpg}')", [groupA]), /check/); checks++;
await fails(as(intruso, "insert into public.plans (group_id, title, starts_at) values ($1, 'x', now())", [groupA]), /row-level security/); checks++;
await fails(as(dani, "insert into public.plans (group_id, title, starts_at, created_by) values ($1, 'x', now(), $2)", [groupA, diego]), /permission denied/); checks++;
ok((await as(intruso, 'select * from public.plans')).rowCount === 0, 'intruso no ve planes ajenos');
ok((await as(dani, 'select * from public.plans')).rowCount === 2, 'dani ve los planes de su grupo');
ok((await as(dani, "update public.plans set title = 'Hackeado' where id = $1", [planF])).rowCount === 0, 'solo el autor edita');
await fails(as(diego, 'update public.plans set rate_notified_at = now() where id = $1', [planF]), /permission denied/); checks++;

// perfiles: intruso ve a Diego (grupo B) pero no a Dani
ok((await as(intruso, 'select id from public.profiles where id = $1', [diego])).rowCount === 1, 'intruso ve a quien comparte grupo');
ok((await as(intruso, 'select id from public.profiles where id = $1', [dani])).rowCount === 0, 'intruso no ve a desconocidos');
await fails(as(dani, "update public.profiles set username = 'diego2' where id = $1", [dani]), /permission denied/); checks++;

// ── votos y puntuaciones ──
await as(dani, "insert into public.plan_votes (plan_id, vote) values ($1, 'approve')", [planF]);
await as(pedro, `insert into public.plan_votes (plan_id, vote) values ($1, 'reject')
  on conflict (plan_id, user_id) do update set plan_id = excluded.plan_id, vote = excluded.vote`, [planF]);
await as(pedro, `insert into public.plan_votes (plan_id, vote) values ($1, 'approve')
  on conflict (plan_id, user_id) do update set plan_id = excluded.plan_id, vote = excluded.vote`, [planF]);
ok((await as(diego, 'select * from public.plan_votes where plan_id = $1', [planF])).rowCount === 2, 'upsert de voto');
await fails(as(diego, "insert into public.plan_votes (plan_id, vote) values ($1, 'approve')", [planF]), /row-level security/); checks++;
await fails(as(intruso, "insert into public.plan_votes (plan_id, vote) values ($1, 'approve')", [planF]), /row-level security/); checks++;

await fails(as(dani, "insert into public.plan_ratings (plan_id, score, would_repeat) values ($1, 90, 'siempre')", [planF]), /row-level security/); checks++;
await as(dani, "insert into public.plan_ratings (plan_id, score, would_repeat) values ($1, 90, 'siempre')", [planP]);
await fails(as(diego, "insert into public.plan_ratings (plan_id, score, would_repeat) values ($1, 100, 'siempre')", [planP]), /row-level security/); checks++;
await fails(as(pedro, "insert into public.plan_ratings (plan_id, score, would_repeat) values ($1, 101, 'siempre')", [planP]), /check/); checks++;

// ── chat ──
await as(dani, "insert into public.messages (group_id, plan_id, body) values ($1, $2, '¿Por qué no?')", [groupA, planF]);
await fails(as(intruso, "insert into public.messages (group_id, body) values ($1, 'hola')", [groupA]), /row-level security/); checks++;
await fails(as(intruso, "insert into public.messages (group_id, plan_id, body) values ($1, $2, 'cuela')", [groupB, planF]), /row-level security/); checks++;

// inyección: el texto se guarda como texto
await as(diego, "select public.create_group($1)", ["x'); drop table public.plans; --"]);
ok((await db.query("select to_regclass('public.plans') as t")).rows[0].t !== null, 'inyección inofensiva');

// ── avisos encolados ──
const outbox = (await db.query('select user_id, tag from public.notification_outbox')).rows;
ok(outbox.filter((r) => r.tag === `plan-${planF}`).length === 2, 'plan nuevo avisa a los otros dos');
ok(outbox.filter((r) => r.tag === `vote-${planF}` && r.user_id === diego).length === 3, 'cada voto (y cada cambio) avisa al autor');
ok(outbox.filter((r) => r.tag === `chat-${planF}`).length === 2, 'mensaje avisa a los demás');
const queued = (await db.query('select public.queue_rating_reminders() as n')).rows[0].n;
ok(queued === 1, `recordatorio solo a quien no ha puntuado (pedro): ${queued}`);
ok((await db.query('select public.queue_rating_reminders() as n')).rows[0].n === 0, 'no repite recordatorio');

// ── salir y echar ──
await fails(as(dani, 'delete from public.group_members where group_id = $1 and user_id = $2 returning 1', [groupA, pedro]).then((r) => { if (r.rowCount === 0) throw new Error('row-level security: 0 filas'); }), /row-level security/); checks++;
ok((await as(diego, 'delete from public.group_members where group_id = $1 and user_id = $2', [groupA, pedro])).rowCount === 1, 'el owner echa');

await db.end();
console.log(`OK · ${checks} comprobaciones de seguridad en verde`);
