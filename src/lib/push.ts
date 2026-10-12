import { supabase } from './supabase.ts';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushSupported = () =>
  Boolean(VAPID) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerSW() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }
}

const toBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string) =>
  Promise.race([p, new Promise<never>((_, ko) => setTimeout(() => ko(new Error(msg)), ms))]);

/** Nunca se queda colgado: ante cualquier duda, «no activados». */
export async function pushEnabled() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, 'sw');
    return Boolean(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Registro del service worker listo (lo registra si hace falta). */
async function swReady() {
  const reg = await navigator.serviceWorker.getRegistration()
    ?? await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  if (reg.active) return reg;
  return withTimeout(navigator.serviceWorker.ready, 10_000, 'El sistema de avisos no arranca. Recarga la app e inténtalo otra vez.');
}

export async function enablePush() {
  if (Notification.permission === 'denied') {
    throw new Error('Tienes los avisos bloqueados para esta web. Actívalos en Ajustes del navegador → Notificaciones.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Sin permiso para avisos. Pulsa «Permitir» cuando el móvil lo pregunte.');
  const reg = await swReady();
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID!) }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth,
  });
  if (error) throw error;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
