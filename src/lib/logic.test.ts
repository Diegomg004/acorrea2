import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toUsername, planStatus, turnTable, ranking, monthGrid, dayKey, safeUrl, linkify,
  type PlanCore,
} from './logic.ts';

const members = [
  { user_id: 'diego', joined_at: '2026-01-01T00:00:00Z' },
  { user_id: 'dani', joined_at: '2026-01-02T00:00:00Z' },
  { user_id: 'pedro', joined_at: '2026-01-03T00:00:00Z' },
];
const ids = members.map((m) => m.user_id);
const plan = (id: string, by: string, when: string, extra: Partial<PlanCore> = {}): PlanCore =>
  ({ id, created_by: by, starts_at: when, duration_minutes: 120, ...extra });

test('usuario a partir del nombre', () => {
  assert.equal(toUsername('  Dani Peña '), 'dani-pena');
  assert.equal(toUsername('Pedro!!'), 'pedro');
  assert.equal(toUsername('ÁLVARO_99'), 'alvaro-99');
  assert.equal(toUsername('🐶'), '');
});

test('estado del plan: todos los demás aprueban, un no lo tumba', () => {
  const p = plan('a', 'diego', '2026-05-01T18:00:00Z');
  assert.equal(planStatus(p, ids), 'pendiente');
  p.plan_votes = [{ user_id: 'dani', vote: 'approve' }];
  assert.equal(planStatus(p, ids), 'pendiente');
  p.plan_votes.push({ user_id: 'pedro', vote: 'approve' });
  assert.equal(planStatus(p, ids), 'aprobado');
  p.plan_votes[1] = { user_id: 'pedro', vote: 'reject' };
  assert.equal(planStatus(p, ids), 'rechazado');
});

test('turno: le toca a quien menos ha puesto (el ejemplo de Diego)', () => {
  // Diego pone, Dani pone, Pedro no, Diego vuelve a poner → le toca a Pedro.
  const plans = [
    plan('1', 'diego', '2026-01-10T18:00:00Z'),
    plan('2', 'dani', '2026-02-10T18:00:00Z'),
    plan('3', 'diego', '2026-03-10T18:00:00Z'),
  ];
  assert.equal(turnTable(members, plans)[0].userId, 'pedro');
});

test('turno: empate → quien lleva más sin proponer; rechazados no cuentan', () => {
  const plans = [
    plan('1', 'dani', '2026-01-10T18:00:00Z'),
    plan('2', 'diego', '2026-02-10T18:00:00Z'),
    plan('3', 'pedro', '2026-03-10T18:00:00Z'),
  ];
  assert.equal(turnTable(members, plans)[0].userId, 'dani');
  plans[0].plan_votes = [{ user_id: 'diego', vote: 'reject' }];
  assert.equal(turnTable(members, plans)[0].userId, 'dani'); // ahora con 0
  assert.equal(turnTable(members, [])[0].userId, 'diego'); // nadie ha puesto: el más antiguo
});

test('ranking: media de medias por plan, sin autovoto, ordenado', () => {
  const plans = [
    plan('1', 'dani', '2026-01-10T18:00:00Z', { plan_ratings: [
      { user_id: 'diego', score: 100, would_repeat: 'siempre' },
      { user_id: 'pedro', score: 100, would_repeat: 'siempre' },
    ] }),
    plan('2', 'diego', '2026-02-10T18:00:00Z', { plan_ratings: [
      { user_id: 'dani', score: 90, would_repeat: 'siempre' },
      { user_id: 'pedro', score: 90, would_repeat: 'otro_sitio' },
      { user_id: 'diego', score: 100, would_repeat: 'siempre' }, // autovoto: ignorado
    ] }),
    plan('3', 'pedro', '2026-03-10T18:00:00Z', { plan_ratings: [
      { user_id: 'dani', score: 70, would_repeat: 'no' },
    ] }),
  ];
  const r = ranking(plans);
  assert.deepEqual(r.map((x) => x.userId), ['dani', 'diego', 'pedro']);
  assert.equal(r[1].avg, 90);
  assert.equal(r[1].repeatPct, 50);
});

test('calendario: empieza en lunes y cubre el mes', () => {
  const g = monthGrid(2026, 9); // octubre 2026 empieza en jueves
  assert.equal(g.length % 7, 0);
  assert.equal(g[0].getDay(), 1);
  assert.equal(dayKey(g[3]), '2026-10-01');
  assert.ok(g.some((d) => dayKey(d) === '2026-10-31'));
});

test('enlaces: solo http(s), nada de javascript:', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hola'), null);
  assert.equal(safeUrl('https://motos.es/x'), 'https://motos.es/x');
  const parts = linkify('Mira https://motos.es/x, y javascript:alert(1) no.');
  assert.deepEqual(parts.filter((p) => p.href).map((p) => p.href), ['https://motos.es/x']);
  assert.equal(parts.map((p) => p.text).join(''), 'Mira https://motos.es/x, y javascript:alert(1) no.');
});
