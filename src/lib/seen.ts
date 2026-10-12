import { useEffect, useState } from 'react';
import type { Message } from '../types.ts';

// Mensajes leídos por hilo, por dispositivo (para el globito del chat).
const KEY = 'acorrea2.seen';
type Seen = Record<string, number>;
const read = (): Seen => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Seen; } catch { return {}; } };

export const threadKey = (groupId: string, planId: string | null) => planId ?? `general-${groupId}`;

export function markSeen(thread: string, id: number) {
  const s = read();
  if ((s[thread] ?? 0) >= id) return;
  s[thread] = id;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin almacenamiento: no pasa nada */ }
  dispatchEvent(new Event('acorrea2-seen'));
}

export function useSeen() {
  const [s, setS] = useState(read);
  useEffect(() => {
    const on = () => setS(read());
    addEventListener('acorrea2-seen', on);
    return () => removeEventListener('acorrea2-seen', on);
  }, []);
  return s;
}

export const unread = (messages: Message[], uid: string, seen: Seen, groupId: string, planId?: string | null) =>
  messages.filter((m) =>
    m.user_id !== uid &&
    (planId === undefined || m.plan_id === planId) &&
    m.id > (seen[threadKey(groupId, m.plan_id)] ?? 0)).length;
