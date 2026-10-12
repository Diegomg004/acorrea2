import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CaretLeft, CaretRight, Dog, HandWaving, Plus, Star, ThumbsUp } from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { dayKey, monthGrid, planEnd, planStatus, turnTable } from '../lib/logic.ts';
import { fmtDay, fmtMonth, fmtShort, fmtTime, fmtUntil } from '../lib/format.ts';
import { safeUrl } from '../lib/logic.ts';
import { go } from '../lib/route.ts';
import { Avatar, Empty, StatusBadge, rise, tint } from './ui.tsx';
import type { Plan } from '../types.ts';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function CalendarView() {
  const { me, plans, members, uid, loading } = useApp();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [dir, setDir] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const ids = members.map((m) => m.user_id);
  const now = Date.now();
  const todayKey = dayKey(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, Plan[]>();
    for (const p of plans) {
      const k = dayKey(new Date(p.starts_at));
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [plans]);

  const upcoming = plans.filter((p) => planEnd(p).getTime() > now);
  const toVote = upcoming.filter((p) => p.created_by !== uid && !p.plan_votes.some((v) => v.user_id === uid));
  const toRate = plans.filter((p) =>
    p.created_by !== uid && planEnd(p).getTime() <= now && now - Date.parse(p.starts_at) < 45 * 864e5 &&
    !p.plan_ratings.some((r) => r.user_id === uid));

  const move = (n: number) => {
    setDir(n);
    setSelected(null);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  };

  function pick(d: Date) {
    const k = dayKey(d);
    const list = byDay.get(k) ?? [];
    if (list.length === 1) go(`/plan/${list[0].id}`);
    else setSelected(selected === k ? null : k);
    if (d.getMonth() !== cursor.getMonth()) move(d < cursor ? -1 : 1);
  }

  const grid = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const selectedPlans = selected ? byDay.get(selected) ?? [] : [];
  const firstName = me?.display_name.split(' ')[0] ?? '';

  return (
    <div className="stack">
      <motion.div className="page-head" {...rise(0)}>
        <div>
          <div className="eyebrow">Hola, {firstName}</div>
          <h1 className="title-xl">Los <span className="hl">planes</span></h1>
        </div>
      </motion.div>

      <div className="home-grid">
        <div className="stack">
          <motion.section className="card" {...rise(1)} aria-label="Calendario">
            <div className="cal-head">
              <button className="icon-btn" onClick={() => move(-1)} aria-label="Mes anterior"><CaretLeft size={20} weight="bold" /></button>
              <div className="cal-month" aria-live="polite">{fmtMonth(cursor)}</div>
              <button className="icon-btn" onClick={() => move(1)} aria-label="Mes siguiente"><CaretRight size={20} weight="bold" /></button>
            </div>
            <div className="cal-grid" aria-hidden="true">
              {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                <motion.div
                  key={cursor.toISOString()}
                  className="cal-grid"
                  custom={dir}
                  initial={{ x: dir * 60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: dir * -60, opacity: 0 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.25}
                  onDragEnd={(_, i) => { if (i.offset.x < -60) move(1); else if (i.offset.x > 60) move(-1); }}
                >
                  {grid.map((d) => {
                    const k = dayKey(d);
                    const list = byDay.get(k) ?? [];
                    const first = list[0];
                    const color = first ? members.find((m) => m.user_id === first.created_by)?.profile.color : undefined;
                    const cls = [
                      'day',
                      d.getMonth() !== cursor.getMonth() && 'out',
                      k < todayKey && 'past',
                      k === todayKey && 'today',
                      list.length > 0 && 'has-plan',
                      selected === k && 'selected',
                    ].filter(Boolean).join(' ');
                    return (
                      <button
                        key={k}
                        className={cls}
                        style={tint(color)}
                        onClick={() => pick(d)}
                        aria-label={`${fmtDay(d)}${list.length ? `: ${list.map((p) => p.title).join(', ')}` : ''}`}
                      >
                        {d.getDate()}
                        {list.length > 0 && (
                          <>
                            <span className="day-dots">{list.slice(0, 3).map((p) => <span key={p.id} className="day-dot" />)}</span>
                            <span className="day-label">{list.map((p) => p.title).join(' · ')}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="stack-sm" style={{ paddingTop: 16 }}>
                    <div className="bold" style={{ textTransform: 'capitalize' }}>{fmtDay(selected + 'T12:00:00')}</div>
                    {selectedPlans.map((p) => <PlanCard key={p.id} plan={p} ids={ids} />)}
                    {selectedPlans.length === 0 && (
                      selected >= todayKey
                        ? <a className="btn btn-lime" href={`#/nuevo?fecha=${selected}`}><Plus size={18} weight="bold" /> Proponer un plan este día</a>
                        : <p className="muted small bold">Ese día no hubo plan.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </div>

        <div className="stack home-side">
          <motion.div {...rise(2)}><TurnCard /></motion.div>

          {(toVote.length > 0 || toRate.length > 0) && (
            <motion.div className="stack-sm" {...rise(3)}>
              {toVote.length > 0 && (
                <a className="banner" href={`#/plan/${toVote[0].id}`}>
                  <ThumbsUp size={26} weight="fill" />
                  <span className="grow">{toVote.length === 1 ? `«${toVote[0].title}» espera tu voto` : `${toVote.length} planes esperan tu voto`}</span>
                  <CaretRight size={18} weight="bold" />
                </a>
              )}
              {toRate.length > 0 && (
                <a className="banner pink" href={`#/plan/${toRate[0].id}/valorar`}>
                  <Star size={26} weight="fill" />
                  <span className="grow">{toRate.length === 1 ? `Puntúa «${toRate[0].title}»` : `Tienes ${toRate.length} planes por puntuar`}</span>
                  <CaretRight size={18} weight="bold" />
                </a>
              )}
            </motion.div>
          )}

          <motion.section className="stack-sm" {...rise(4)} aria-label="Próximos planes">
            <div className="section-title"><h2>Próximos planes</h2></div>
            {loading && <div className="skeleton" style={{ height: 102 }} />}
            {!loading && upcoming.length === 0 && (
              <div className="card card-flat">
                <Empty icon={<Dog size={30} weight="fill" />} title="Nada a la vista" color="var(--sky)">
                  Alguien tendrá que pedir permiso en casa…
                  <div style={{ marginTop: 14 }}><a className="btn btn-primary" href="#/nuevo"><Plus size={18} weight="bold" /> Proponer plan</a></div>
                </Empty>
              </div>
            )}
            {upcoming.map((p) => <PlanCard key={p.id} plan={p} ids={ids} />)}
          </motion.section>
        </div>
      </div>
    </div>
  );
}

export function PlanCard({ plan, ids }: { plan: Plan; ids: string[] }) {
  const { member } = useApp();
  const creator = member(plan.created_by)?.profile;
  const photo = safeUrl(plan.photos[0]);
  return (
    <motion.a className="plan-card" href={`#/plan/${plan.id}`} whileTap={{ scale: 0.97 }}>
      <span className="plan-thumb" style={tint(creator?.color)}>
        {photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <HandWaving size={34} weight="fill" />}
      </span>
      <span className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
        <span className="plan-when">{fmtShort(plan.starts_at)} · {fmtTime(plan.starts_at)}</span>
        <span className="plan-title ellipsis">{plan.title}</span>
        <span className="row" style={{ gap: 8 }}>
          <StatusBadge s={planStatus(plan, ids)} />
          <Avatar p={creator} size={24} />
          <span className="tiny bold muted">{fmtUntil(plan.starts_at)}</span>
        </span>
      </span>
    </motion.a>
  );
}

function TurnCard() {
  const { members, plans, uid } = useApp();
  if (!members.length) return <div className="skeleton" style={{ height: 150 }} />;
  const rows = turnTable(members, plans);
  const next = members.find((m) => m.user_id === rows[0].userId)!;
  const mine = next.user_id === uid;
  return (
    <div className="card turn">
      <div className="eyebrow" style={{ color: 'var(--ink-2)' }}>Siguiente turno</div>
      <div className="row" style={{ marginTop: 10, gap: 14 }}>
        <Avatar p={next.profile} size={60} ring />
        <div className="grow">
          <div className="turn-name">{mine ? '¡Te toca!' : `Le toca a ${next.profile.display_name}`}</div>
          <div className="small bold" style={{ marginTop: 4 }}>
            {mine ? 'Suelta la correa y propón el próximo plan.' : rows[0].count === 0 ? 'Aún no ha propuesto ninguno.' : 'Es quien menos planes ha puesto.'}
          </div>
        </div>
      </div>
      {mine && <a className="btn btn-dark btn-sm" href="#/nuevo" style={{ marginTop: 14 }}><Plus size={16} weight="bold" /> Proponer plan</a>}
      <Dog className="turn-deco" size={130} weight="fill" />
    </div>
  );
}
