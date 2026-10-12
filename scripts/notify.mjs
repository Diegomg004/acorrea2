// Cartero de Acorrea2. Lo ejecuta el cron de GitHub Actions (.github/workflows/notify.yml).
// 1) Encola los «puntúa el plan» de los planes que ya han acabado.
// 2) Envía por Web Push todo lo pendiente (planes nuevos, votos, mensajes…).
// 3) Limpia avisos viejos. De paso, mantiene despierta la base de datos gratuita.
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://github.com/Diegomg004/acorrea2';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.log('Supabase sin configurar: nada que hacer.');
  process.exit(0);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const queued = must(await db.rpc('queue_rating_reminders'), 'recordatorios');
const since = new Date(Date.now() - 864e5).toISOString();
const pending = must(
  await db.from('notification_outbox').select('*').is('sent_at', null).gt('created_at', since).order('id').limit(500),
  'cola');

let sent = 0, gone = 0, failed = 0;
if (pending.length && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const users = [...new Set(pending.map((r) => r.user_id))];
  const subs = must(await db.from('push_subscriptions').select('*').in('user_id', users), 'suscripciones');

  // Varios avisos del mismo hilo para la misma persona → uno solo (el último).
  const latest = new Map();
  for (const r of pending) {
    const key = `${r.user_id}|${r.tag ?? r.id}`;
    latest.set(key, { ...r, count: (latest.get(key)?.count ?? 0) + 1 });
  }

  for (const n of latest.values()) {
    const body = n.count > 1 && n.tag?.startsWith('chat-') ? `${n.body} (+${n.count - 1} más)` : n.body;
    const payload = JSON.stringify({ title: n.title, body, url: n.url, tag: n.tag });
    for (const s of subs.filter((x) => x.user_id === n.user_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 86400, urgency: 'normal' });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          gone++;
        } else {
          failed++;
          console.warn(`push ${e.statusCode ?? ''}: ${e.body ?? e.message}`);
        }
      }
    }
  }
} else if (pending.length) {
  console.log('Faltan las claves VAPID: los avisos se marcan como enviados sin mandarse.');
}

if (pending.length) {
  must(await db.from('notification_outbox').update({ sent_at: new Date().toISOString() }).in('id', pending.map((r) => r.id)), 'marcar');
}
must(await db.from('notification_outbox').delete().lt('created_at', new Date(Date.now() - 7 * 864e5).toISOString()), 'limpieza');

console.log(`recordatorios=${queued} pendientes=${pending.length} enviados=${sent} caducados=${gone} fallidos=${failed}`);
