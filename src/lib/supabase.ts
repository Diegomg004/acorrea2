import { createClient } from '@supabase/supabase-js';

// En Actions, una variable sin definir llega como cadena vacía: vacío = sin configurar.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || undefined;
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) || undefined;
export const configured = Boolean(url && key);

// «Recordarme»: con la casilla marcada la sesión vive en localStorage (sobrevive
// a cerrar la app); sin marcar, en sessionStorage (muere al cerrarla).
const REMEMBER = 'acorrea2.remember';
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
export const setRemember = (on: boolean) => safe(() => localStorage.setItem(REMEMBER, on ? '1' : '0'), undefined);
const target = () => safe(() => (localStorage.getItem(REMEMBER) === '0' ? sessionStorage : localStorage), null);

export const supabase = createClient(url ?? 'https://sin-configurar.supabase.co', key ?? 'sin-configurar', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'acorrea2.auth',
    storage: {
      getItem: (k) => safe(() => localStorage.getItem(k) ?? sessionStorage.getItem(k), null),
      setItem: (k, v) => safe(() => target()?.setItem(k, v), undefined),
      removeItem: (k) => safe(() => { localStorage.removeItem(k); sessionStorage.removeItem(k); }, undefined),
    },
  },
});
