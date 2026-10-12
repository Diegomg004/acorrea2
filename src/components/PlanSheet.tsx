import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowSquareOut, CalendarDots, Car, ChatCircleDots, Clock, CurrencyEur, HandWaving, MapPin, NavigationArrow,
  PencilSimple, Star, ThumbsDown, ThumbsUp, Trash,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { supabase } from '../lib/supabase.ts';
import { average, planEnd, planStatus, safeUrl, type Repeat, type VoteValue } from '../lib/logic.ts';
import { fmtDay, fmtDuration, fmtMoney, fmtTime, fmtUntil } from '../lib/format.ts';
import { directionsUrl, searchUrl } from '../lib/geo.ts';
import { back, go } from '../lib/route.ts';
import { Avatar, Empty, Sheet, StatusBadge, rise, tint } from './ui.tsx';
import { ChatThread } from './ChatThread.tsx';
import { humanError, useToast } from './toast.tsx';
import type { Plan, Rating } from '../types.ts';

export const REPEAT_LABEL: Record<Repeat, string> = {
  siempre: 'Sí, siempre',
  otro_sitio: 'Sí, pero en otro sitio',
  no: 'No repetiría',
};

export function PlanSheet({ id, rate }: { id: string; rate: boolean }) {
  const { plans, loading } = useApp();
  const close = useCallback(() => back('/'), []);
  const plan = plans.find((p) => p.id === id);
  return (
    <Sheet onClose={close} label={plan?.title ?? 'Plan'}>
      {plan ? <PlanDetail plan={plan} rate={rate} /> : loading
        ? <div className="skeleton" style={{ height: 240, marginTop: 8 }} />
        : <Empty icon={<HandWaving size={30} weight="fill" />} title="Este plan ya no existe">Lo habrán borrado.</Empty>}
    </Sheet>
  );
}

function PlanDetail({ plan, rate }: { plan: Plan; rate: boolean }) {
  const { members, uid, group, member, reload } = useApp();
  const toast = useToast();
  const ratingRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ids = members.map((m) => m.user_id);
  const creator = member(plan.created_by)?.profile;
  const status = planStatus(plan, ids);
  const mine = plan.created_by === uid;
  const started = Date.parse(plan.starts_at) <= Date.now();
  const ended = planEnd(plan).getTime() <= Date.now();
  const myVote = plan.plan_votes.find((v) => v.user_id === uid)?.vote;
  const photos = plan.photos.map(safeUrl).filter((u): u is string => Boolean(u));
  const link = safeUrl(plan.link_url);
  const home = group ? { lat: group.home_lat, lon: group.home_lon } : null;
  const others = members.filter((m) => m.user_id !== plan.created_by);
  const avg = average(plan.plan_ratings);

  useEffect(() => {
    if (!rate) return;
    const t = setTimeout(() => ratingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    return () => clearTimeout(t);
  }, [rate]);

  async function vote(v: VoteValue) {
    setBusy(true);
    const { error } = await supabase.from('plan_votes').upsert({ plan_id: plan.id, vote: v }, { onConflict: 'plan_id,user_id' });
    setBusy(false);
    if (error) return toast(humanError(error), 'error');
    toast(v === 'approve' ? '¡Te apuntas!' : 'Rechazado. Cuéntale por qué en el chat.', v === 'approve' ? 'ok' : 'info');
    reload();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('plans').delete().eq('id', plan.id);
    setBusy(false);
    if (error) return toast(humanError(error), 'error');
    toast('Plan borrado', 'ok');
    await reload();
    location.replace('#/');
  }

  return (
    <div className="stack" style={{ paddingTop: 4 }}>
      <motion.div {...rise(0)}>
        {photos.length > 0 ? (
          <div className={`carousel ${photos.length > 1 ? 'multi' : ''}`}>
            {photos.map((src) => <img key={src} src={src} alt="" referrerPolicy="no-referrer" />)}
          </div>
        ) : (
          <div className="hero-empty" style={tint(creator?.color)}><HandWaving size={64} weight="fill" /></div>
        )}
      </motion.div>

      <motion.div className="stack-sm" {...rise(1)}>
        <div className="eyebrow" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
          {fmtDay(plan.starts_at)} · {fmtTime(plan.starts_at)}
        </div>
        <h2 className="title-lg" style={{ fontSize: 30 }}>{plan.title}</h2>
        <div className="row wrap">
          <Avatar p={creator} size={30} />
          <span className="bold small grow">Lo propone {mine ? 'tú' : creator?.display_name ?? 'alguien'}</span>
          <StatusBadge s={status} />
        </div>
      </motion.div>

      <motion.div className="tiles" {...rise(2)}>
        <div className="tile">
          <div className="tile-k"><CalendarDots size={15} weight="bold" /> Cuándo</div>
          <div className="tile-v" style={{ textTransform: 'capitalize' }}>{fmtUntil(plan.starts_at)}</div>
          <div className="tile-s">a las {fmtTime(plan.starts_at)}</div>
        </div>
        <div className="tile">
          <div className="tile-k"><Clock size={15} weight="bold" /> Dura</div>
          <div className="tile-v">{fmtDuration(plan.duration_minutes)}</div>
          <div className="tile-s">hasta las {fmtTime(planEnd(plan))}</div>
        </div>
        <div className="tile">
          <div className="tile-k"><CurrencyEur size={15} weight="bold" /> Por persona</div>
          <div className="tile-v">{fmtMoney(plan.price_per_person)}</div>
          {plan.price_note && <div className="tile-s">{plan.price_note}</div>}
        </div>
        <div className="tile">
          <div className="tile-k"><Car size={15} weight="bold" /> Desde casa</div>
          <div className="tile-v">{plan.drive_minutes !== null ? `${plan.drive_minutes} min` : '—'}</div>
          <div className="tile-s">{plan.drive_km !== null ? `${plan.drive_km} km en coche` : 'sin ubicación exacta'}</div>
        </div>
        {plan.location_name && (
          <div className="tile wide">
            <div className="tile-k"><MapPin size={15} weight="bold" /> Dónde</div>
            <div className="bold" style={{ margin: '4px 0 10px' }}>{plan.location_name}</div>
            <div className="row wrap">
              {home && plan.lat !== null && plan.lon !== null ? (
                <a className="btn btn-sm btn-lime" href={directionsUrl(home, { lat: plan.lat, lon: plan.lon })} target="_blank" rel="noopener noreferrer">
                  <NavigationArrow size={16} weight="fill" /> Cómo llegar
                </a>
              ) : (
                <a className="btn btn-sm" href={searchUrl(plan.location_name)} target="_blank" rel="noopener noreferrer">
                  <MapPin size={16} weight="fill" /> Ver en el mapa
                </a>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {link && (
        <motion.a {...rise(3)} className="btn btn-dark btn-block" href={link} target="_blank" rel="noopener noreferrer nofollow">
          <ArrowSquareOut size={20} weight="bold" /> Ver la web del plan
        </motion.a>
      )}

      {plan.description && (
        <motion.div className="card card-flat" {...rise(3)}>
          <p className="desc">{plan.description}</p>
        </motion.div>
      )}

      <motion.section className="card card-flat" {...rise(4)} aria-label="Votos">
        <div className="section-title">
          <h2>¿Quién se apunta?</h2>
          <span className="tiny bold muted">{plan.plan_votes.filter((v) => v.vote === 'approve').length}/{others.length} sí</span>
        </div>
        {others.length === 0 && <p className="muted small bold">Invita a alguien desde Grupo para poder votar.</p>}
        {others.map((m) => {
          const v = plan.plan_votes.find((x) => x.user_id === m.user_id)?.vote;
          return (
            <div key={m.user_id} className="vote-row">
              <Avatar p={m.profile} size={34} />
              <span className="bold grow">{m.user_id === uid ? 'Tú' : m.profile.display_name}</span>
              {v === 'approve' && <span className="badge badge-aprobado"><ThumbsUp size={14} weight="fill" /> Sí</span>}
              {v === 'reject' && <span className="badge badge-rechazado"><ThumbsDown size={14} weight="fill" /> No</span>}
              {!v && <span className="badge">Sin votar</span>}
            </div>
          );
        })}
        {!mine && !ended && (
          <div className="grid-2" style={{ marginTop: 14 }}>
            <button className="btn btn-lime" disabled={busy || myVote === 'approve'} onClick={() => vote('approve')}>
              <ThumbsUp size={20} weight="fill" /> {myVote === 'approve' ? 'Apuntado' : 'Aprobar'}
            </button>
            <button className="btn btn-pink" disabled={busy || myVote === 'reject'} onClick={() => vote('reject')}>
              <ThumbsDown size={20} weight="fill" /> {myVote === 'reject' ? 'Rechazado' : 'Rechazar'}
            </button>
          </div>
        )}
        {mine && plan.plan_votes.some((v) => v.vote === 'reject') && (
          <p className="small bold" style={{ marginTop: 10 }}>Alguien ha dicho que no: pregúntale en el chat de abajo.</p>
        )}
      </motion.section>

      {started && (
        <motion.section ref={ratingRef} className="card card-flat" {...rise(5)} aria-label="Puntuaciones" style={rate ? { boxShadow: 'var(--sh)' } : undefined}>
          <div className="section-title">
            <h2>¿Qué tal fue?</h2>
            {avg !== null && <span className="score-pill">{avg}</span>}
          </div>
          {!mine && <MyRating plan={plan} />}
          {mine && plan.plan_ratings.length === 0 && <p className="muted small bold">Aún nadie ha puntuado tu plan.</p>}
          <div style={{ marginTop: mine ? 0 : 14 }}>
            {plan.plan_ratings.filter((r) => r.user_id !== uid).map((r) => {
              const who = member(r.user_id)?.profile;
              return (
                <div key={r.user_id} className="rating-item">
                  <div className="row">
                    <Avatar p={who} size={32} />
                    <span className="bold grow">{who?.display_name ?? 'Ex-miembro'}</span>
                    <span className="score-pill">{r.score}</span>
                  </div>
                  <div className="small" style={{ marginTop: 8 }}>
                    <span className="badge">{REPEAT_LABEL[r.would_repeat]}</span>
                    {r.liked && <p style={{ marginTop: 8 }}><b>Le gustó:</b> {r.liked}</p>}
                    {r.improve && <p style={{ marginTop: 4 }}><b>A mejorar:</b> {r.improve}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      <motion.section className="card card-flat" {...rise(6)} aria-label="Chat del plan">
        <div className="section-title"><h2><ChatCircleDots size={22} weight="fill" style={{ verticalAlign: '-3px' }} /> Chat del plan</h2></div>
        <ChatThread planId={plan.id} emptyText="¿Dudas, otro sitio mejor, quejas? Dilo aquí." />
      </motion.section>

      {mine && (
        <motion.div className="grid-2" {...rise(7)}>
          <button className="btn" onClick={() => go(`/editar/${plan.id}`)}><PencilSimple size={18} weight="bold" /> Editar</button>
          {confirmDelete
            ? <button className="btn btn-pink" disabled={busy} onClick={remove}><Trash size={18} weight="bold" /> ¿Seguro? Borrar</button>
            : <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}><Trash size={18} weight="bold" /> Borrar</button>}
        </motion.div>
      )}
    </div>
  );
}

const SCORE_WORD = (s: number) =>
  s >= 90 ? 'Legendario' : s >= 75 ? 'Muy top' : s >= 55 ? 'Bien' : s >= 35 ? 'Meh' : 'Un drama';

function MyRating({ plan }: { plan: Plan }) {
  const { uid, reload } = useApp();
  const toast = useToast();
  const existing = plan.plan_ratings.find((r) => r.user_id === uid);
  const [editing, setEditing] = useState(!existing);
  const [score, setScore] = useState(existing?.score ?? 75);
  const [liked, setLiked] = useState(existing?.liked ?? '');
  const [improve, setImprove] = useState(existing?.improve ?? '');
  const [repeat, setRepeat] = useState<Repeat | null>(existing?.would_repeat ?? null);
  const [busy, setBusy] = useState(false);

  if (existing && !editing) return <RatingSummary r={existing} onEdit={() => setEditing(true)} />;

  async function save() {
    if (!repeat) return toast('Dinos si repetirías', 'error');
    setBusy(true);
    const { error } = await supabase.from('plan_ratings').upsert(
      { plan_id: plan.id, score, liked: liked.trim(), improve: improve.trim(), would_repeat: repeat },
      { onConflict: 'plan_id,user_id' });
    setBusy(false);
    if (error) return toast(humanError(error), 'error');
    toast('¡Nota guardada!', 'ok');
    setEditing(false);
    reload();
  }

  return (
    <div className="stack-sm">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <span className="score-big">{score}</span>
        <span className="bold" style={{ paddingBottom: 6 }}>/100 · {SCORE_WORD(score)}</span>
      </div>
      <input
        type="range" className="range" min={1} max={100} value={score}
        style={{ '--p': `${score}%` } as React.CSSProperties}
        onChange={(e) => setScore(Number(e.target.value))}
        aria-label="Nota del 1 al 100"
      />
      <div className="field">
        <label className="label" htmlFor="liked">¿Qué te ha gustado?</label>
        <textarea id="liked" className="textarea" maxLength={600} value={liked} onChange={(e) => setLiked(e.target.value)} placeholder="Lo mejor del plan…" />
      </div>
      <div className="field">
        <label className="label" htmlFor="improve">Puntos a mejorar</label>
        <textarea id="improve" className="textarea" maxLength={600} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Lo que cambiarías…" />
      </div>
      <div className="field">
        <span className="label">¿Volverías a repetir?</span>
        <div className="chips">
          {(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={repeat === k} onClick={() => setRepeat(k)}>{REPEAT_LABEL[k]}</button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={save}><Star size={20} weight="fill" /> Guardar nota</button>
    </div>
  );
}

function RatingSummary({ r, onEdit }: { r: Rating; onEdit: () => void }) {
  return (
    <div className="row" style={{ background: 'var(--bg)', borderRadius: 16, padding: 12, border: '2px solid var(--ink)' }}>
      <span className="score-pill">{r.score}</span>
      <span className="grow small bold">Tu nota · {REPEAT_LABEL[r.would_repeat]}</span>
      <button className="btn btn-sm" onClick={onEdit}><PencilSimple size={16} weight="bold" /> Cambiar</button>
    </div>
  );
}
