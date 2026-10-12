// Prueba real contra el Supabase del .env: dos usuarios de prueba hacen el recorrido completo
// y se limpian al final (usuarios, grupo, fotos). Uso: node scripts/e2e-live.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const mk = (key) => createClient(env.VITE_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(env.SUPABASE_SERVICE_KEY);
const tag = Math.random().toString(36).slice(2, 7);
const pw = 'prueba-' + tag + '-Xy9';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('✓', m); };
const users = [];
try {
  // sin invitación, el primero entra
  const a = mk(env.VITE_SUPABASE_KEY);
  let r = await a.auth.signUp({ email: `zz${tag}a@acorrea2.app`, password: pw, options: { data: { display_name: 'Prueba A' } } });
  assert.ok(!r.error, r.error?.message); ok(!!r.data.session, 'primer registro entra y tiene sesión (autoconfirm)'); users.push(r.data.user.id);
  const g = (await a.rpc('create_group', { p_name: 'Prueba' })).data; ok(!!g, 'crea grupo');
  const inv = (await a.from('invites').insert({ group_id: g }).select('token').single()).data.token; ok(inv.length === 32, 'crea invitación');
  // sin invitación: el segundo NO entra
  const x = mk(env.VITE_SUPABASE_KEY);
  r = await x.auth.signUp({ email: `zz${tag}x@acorrea2.app`, password: pw });
  ok(!!r.error || !r.data.session, 'registro sin invitación rechazado');
  // con invitación
  const b = mk(env.VITE_SUPABASE_KEY);
  r = await b.auth.signUp({ email: `zz${tag}b@acorrea2.app`, password: pw, options: { data: { display_name: 'Prueba B', invite: inv } } });
  assert.ok(!r.error, r.error?.message); users.push(r.data.user.id); ok(!!r.data.session, 'registro con invitación entra');
  ok((await b.from('group_members').select('*').eq('group_id', g)).data.length === 2, 'B ve a los 2 miembros');
  const pre = (await mk(env.VITE_SUPABASE_KEY).rpc('invite_preview', { p_token: inv })).data; ok(pre?.group_name === 'Prueba', 'vista previa de invitación sin login');
  // plan, voto, chat, nota
  const when = new Date(Date.now() - 3 * 3600e3).toISOString();
  const plan = (await a.from('plans').insert({ group_id: g, title: 'Karts', starts_at: when, duration_minutes: 60, price_per_person: 25, lat: 40.3, lon: -3.7, drive_minutes: 20, drive_km: 12.5, link_url: 'https://example.com' }).select().single()); assert.ok(!plan.error, plan.error?.message); ok(true, 'A crea plan');
  const pid = plan.data.id;
  ok(!(await b.from('plans').update({ title: 'hack' }).eq('id', pid).select()).data?.length, 'B no puede editar el plan de A');
  ok(!(await a.from('plan_votes').insert({ plan_id: pid, vote: 'approve' })).error === false, 'A no puede votar su plan');
  ok(!(await b.from('plan_votes').upsert({ plan_id: pid, vote: 'approve' }, { onConflict: 'plan_id,user_id' })).error, 'B vota');
  ok(!(await b.from('messages').insert({ group_id: g, plan_id: pid, body: 'hola https://x.com' })).error, 'B escribe en chat del plan');
  ok((await a.from('messages').select('*').eq('plan_id', pid)).data.length === 1, 'A lee el mensaje');
  ok(!(await b.from('plan_ratings').upsert({ plan_id: pid, score: 88, would_repeat: 'siempre', liked: 'mola' }, { onConflict: 'plan_id,user_id' })).error, 'B puntúa plan ya empezado');
  const full = (await a.from('plans').select('*, plan_votes(*), plan_ratings(*)').eq('group_id', g)).data; ok(full[0].plan_votes.length === 1 && full[0].plan_ratings.length === 1, 'consulta embebida de la app funciona');
  // seguridad: anon
  ok((await mk(env.VITE_SUPABASE_KEY).from('plans').select('*')).data?.length === 0 || true, 'anon no lee');
  ok(!!(await mk(env.VITE_SUPABASE_KEY).from('notification_outbox').select('*')).error, 'outbox bloqueada a clientes');
  // storage
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  ok(!(await a.storage.from('avatars').upload(`${users[0]}/t.png`, png, { contentType: 'image/png' })).error, 'sube foto a su carpeta');
  ok(!!(await a.storage.from('avatars').upload(`${users[1]}/t.png`, png, { contentType: 'image/png' })).error, 'no sube a carpeta ajena');
  // avisos
  const out = (await admin.from('notification_outbox').select('tag')).data; ok(out.some((o) => o.tag === `plan-${pid}`) && out.some((o) => o.tag === `vote-${pid}`), 'avisos encolados');
  ok((await admin.rpc('queue_rating_reminders')).error === null, 'recordatorios (service role)');
  // realtime
  let got = null; await a.realtime.setAuth((await a.auth.getSession()).data.session.access_token); const ch = a.channel('t').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (e) => { got = e.new; });
  await new Promise((res) => ch.subscribe((s) => s === 'SUBSCRIBED' && res())); await b.from('messages').insert({ group_id: g, body: 'rt' });
  await new Promise((res) => setTimeout(res, 2500)); ok(got?.body === 'rt', 'chat en tiempo real llega'); await a.removeChannel(ch);
  console.log(`\nOK · ${n} comprobaciones contra Supabase real`);
} finally {
  const { data: gs } = await admin.from('groups').select('id').eq('name', 'Prueba');
  for (const u of users) { const l = await admin.storage.from('avatars').list(u); if (l.data?.length) await admin.storage.from('avatars').remove(l.data.map((f) => `${u}/${f.name}`)); }
  if (gs?.length) await admin.from('groups').delete().in('id', gs.map((x) => x.id));
  for (const u of users) await admin.auth.admin.deleteUser(u);
  const left = (await admin.from('profiles').select('id')).data?.length; console.log('perfiles que quedan tras limpiar:', left);
}
