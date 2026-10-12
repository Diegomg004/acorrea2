import { motion } from 'motion/react';
import { Crown, Medal, Trophy } from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { average, planEnd, ranking, turnTable } from '../lib/logic.ts';
import { fmtShort } from '../lib/format.ts';
import { Avatar, Empty, rise, tint } from './ui.tsx';

export function RankingView() {
  const { plans, members, member, loading } = useApp();
  const rows = ranking(plans);
  const turns = turnTable(members, plans);
  const maxCount = Math.max(1, ...turns.map((t) => t.count));
  const past = plans.filter((p) => planEnd(p).getTime() <= Date.now()).reverse();
  const podium = [rows[1], rows[0], rows[2]]; // 2º · 1º · 3º

  return (
    <div className="stack">
      <motion.div className="page-head" {...rise(0)}>
        <div>
          <div className="eyebrow">Quién monta los mejores planes</div>
          <h1 className="title-xl">El <span className="hl">podio</span></h1>
        </div>
      </motion.div>

      <div className="home-grid">
        <div className="stack">
          <motion.section className="card" {...rise(1)} aria-label="Podio">
            {loading ? <div className="skeleton" style={{ height: 220 }} /> : rows.length === 0 ? (
              <Empty icon={<Trophy size={30} weight="fill" />} title="Aún no hay notas" color="var(--sun)">
                Cuando acabe el primer plan y lo puntuéis, aquí sale el podio.
              </Empty>
            ) : (
              <div className="podium">
                {podium.map((r, i) => {
                  if (!r) return <div key={i} />;
                  const pos = i === 1 ? 1 : i === 0 ? 2 : 3;
                  const p = member(r.userId)?.profile;
                  return (
                    <div key={r.userId} className="podium-col">
                      {pos === 1 && (
                        <motion.span className="crown" initial={{ y: -30, rotate: -30, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ delay: 0.9, type: 'spring' }}>
                          <Crown size={34} weight="fill" color="var(--sun)" style={{ filter: 'drop-shadow(2px 2px 0 var(--ink))' }} />
                        </motion.span>
                      )}
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + 0.12 * (3 - pos), type: 'spring' }}>
                        <Avatar p={p} size={pos === 1 ? 64 : 52} ring />
                      </motion.span>
                      <span className="podium-name">{p?.display_name ?? 'Ex-miembro'}</span>
                      <motion.div
                        className={`podium-block p${pos}`}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: 0.15 * (3 - pos), type: 'spring', damping: 14, stiffness: 120 }}
                      >
                        <span className="n">{pos}</span>
                        <span className="s">{r.avg}</span>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>

          {rows.length > 0 && (
            <motion.section className="card" {...rise(2)} aria-label="Clasificación">
              <div className="section-title"><h2>Clasificación</h2><span className="tiny bold muted">nota media de sus planes</span></div>
              <div className="stack-sm">
                {rows.map((r, i) => {
                  const p = member(r.userId)?.profile;
                  return (
                    <div key={r.userId} className="row">
                      <span className="title-md" style={{ width: 26 }}>{i + 1}</span>
                      <Avatar p={p} size={38} />
                      <div className="grow">
                        <div className="bold">{p?.display_name ?? 'Ex-miembro'}</div>
                        <div className="tiny bold muted">{r.plans} plan{r.plans === 1 ? '' : 'es'} · {r.repeatPct}% repetiría siempre</div>
                      </div>
                      <span className="score-pill">{r.avg}</span>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}
        </div>

        <div className="stack home-side">
          <motion.section className="card" {...rise(3)} aria-label="Turnos">
            <div className="section-title"><h2>Turnos</h2><span className="tiny bold muted">planes puestos</span></div>
            <div className="stack-sm">
              {turns.map((t, i) => {
                const p = member(t.userId)?.profile;
                return (
                  <div key={t.userId} className="row">
                    <Avatar p={p} size={34} />
                    <div className="grow">
                      <div className="row between">
                        <span className="bold small">{p?.display_name}</span>
                        {i === 0 ? <span className="badge badge-ink">Le toca</span> : <span className="tiny bold">{t.count}</span>}
                      </div>
                      <div className="bar" style={{ marginTop: 6, ...tint(p?.color) }}>
                        <motion.span initial={{ width: 0 }} animate={{ width: `${(t.count / maxCount) * 100}%` }} transition={{ delay: 0.3, duration: 0.6 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>

          <motion.section className="card" {...rise(4)} aria-label="Historial">
            <div className="section-title"><h2>Historial</h2></div>
            {past.length === 0 && <p className="muted small bold">Aún no ha pasado ningún plan.</p>}
            <div className="stack-sm">
              {past.map((p) => {
                const avg = average(p.plan_ratings.filter((r) => r.user_id !== p.created_by));
                return (
                  <a key={p.id} href={`#/plan/${p.id}`} className="row" style={{ textDecoration: 'none' }}>
                    <Avatar p={member(p.created_by)?.profile} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="bold ellipsis">{p.title}</div>
                      <div className="tiny bold muted">{fmtShort(p.starts_at)}</div>
                    </div>
                    {avg !== null ? <span className="score-pill">{avg}</span> : <span className="badge"><Medal size={13} weight="bold" /> Sin nota</span>}
                  </a>
                );
              })}
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
