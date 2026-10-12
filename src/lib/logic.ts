// Lógica pura de Acorrea2 (sin React ni red): turnos, estados, ranking,
// calendario y enlaces seguros. La prueba vive en logic.test.ts.

export type VoteValue = 'approve' | 'reject';
export type Repeat = 'siempre' | 'otro_sitio' | 'no';
export type PlanStatus = 'aprobado' | 'pendiente' | 'rechazado';

export interface VoteCore { user_id: string; vote: VoteValue }
export interface RatingCore { user_id: string; score: number; would_repeat: Repeat }
export interface PlanCore {
  id: string;
  created_by: string;
  starts_at: string;
  duration_minutes: number;
  plan_votes?: VoteCore[];
  plan_ratings?: RatingCore[];
}
export interface MemberCore { user_id: string; joined_at: string }

export const EMAIL_DOMAIN = 'acorrea2.app';

/** «Dani Peña» → «dani-pena». Es el usuario con el que se entra. */
export function toUsername(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

export const usernameToEmail = (username: string) => `${username}@${EMAIL_DOMAIN}`;

/** Aprobado = todos los demás miembros han dicho que sí. Un «no» lo tumba. */
export function planStatus(plan: PlanCore, memberIds: string[]): PlanStatus {
  const others = memberIds.filter((id) => id !== plan.created_by);
  const votes = (plan.plan_votes ?? []).filter((v) => others.includes(v.user_id));
  if (votes.some((v) => v.vote === 'reject')) return 'rechazado';
  return others.every((id) => votes.some((v) => v.user_id === id && v.vote === 'approve'))
    ? 'aprobado'
    : 'pendiente';
}

export const planEnd = (p: Pick<PlanCore, 'starts_at' | 'duration_minutes'>) =>
  new Date(Date.parse(p.starts_at) + p.duration_minutes * 60_000);

export interface TurnRow { userId: string; count: number; last: number | null }

/**
 * A quién le toca proponer. Primero quien menos planes (no rechazados) ha
 * puesto; si empatan, quien lleva más tiempo sin poner uno; luego, quien
 * entró antes. El primero de la lista es el siguiente.
 */
export function turnTable(members: MemberCore[], plans: PlanCore[]): TurnRow[] {
  const ids = members.map((m) => m.user_id);
  return members
    .map((m) => {
      const mine = plans.filter((p) => p.created_by === m.user_id && planStatus(p, ids) !== 'rechazado');
      return {
        userId: m.user_id,
        count: mine.length,
        last: mine.length ? Math.max(...mine.map((p) => Date.parse(p.starts_at))) : null,
        joined: Date.parse(m.joined_at),
      };
    })
    .sort((a, b) =>
      a.count - b.count ||
      (a.last ?? -Infinity) - (b.last ?? -Infinity) ||
      a.joined - b.joined)
    .map(({ userId, count, last }) => ({ userId, count, last }));
}

export interface RankRow { userId: string; avg: number; plans: number; ratings: number; repeatPct: number }

/**
 * Ranking de quién monta mejores planes: media de las medias de cada plan
 * (cada plan pesa igual), con las notas de los demás, nunca la propia.
 */
export function ranking(plans: PlanCore[]): RankRow[] {
  const by = new Map<string, { means: number[]; ratings: number; siempre: number }>();
  for (const p of plans) {
    const rs = (p.plan_ratings ?? []).filter((r) => r.user_id !== p.created_by);
    if (!rs.length) continue;
    const e = by.get(p.created_by) ?? { means: [], ratings: 0, siempre: 0 };
    e.means.push(rs.reduce((s, r) => s + r.score, 0) / rs.length);
    e.ratings += rs.length;
    e.siempre += rs.filter((r) => r.would_repeat === 'siempre').length;
    by.set(p.created_by, e);
  }
  return [...by]
    .map(([userId, e]) => ({
      userId,
      avg: Math.round((e.means.reduce((s, x) => s + x, 0) / e.means.length) * 10) / 10,
      plans: e.means.length,
      ratings: e.ratings,
      repeatPct: Math.round((100 * e.siempre) / e.ratings),
    }))
    .sort((a, b) => b.avg - a.avg || b.ratings - a.ratings);
}

export const average = (rs: { score: number }[]) =>
  rs.length ? Math.round((rs.reduce((s, r) => s + r.score, 0) / rs.length) * 10) / 10 : null;

/** Semanas del mes empezando en lunes (5 o 6 filas). */
export function monthGrid(year: number, month: number): Date[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(year, month, 1 - offset + i));
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Solo http(s). Cualquier otra cosa (javascript:, data:…) no se pinta como enlace. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export type TextPart = { text: string; href?: string };

/** Trocea un mensaje en texto y enlaces http(s) para pintarlo sin HTML. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    let url = m[0];
    const trail = url.match(/[).,;:!?]+$/);
    if (trail) url = url.slice(0, -trail[0].length);
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    const href = safeUrl(url);
    parts.push(href ? { text: url, href } : { text: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
