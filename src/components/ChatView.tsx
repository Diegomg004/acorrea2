import { motion } from 'motion/react';
import { ArrowSquareOut, CaretLeft, ChatsCircle, UsersThree } from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { unread, useSeen } from '../lib/seen.ts';
import { fmtAgo } from '../lib/format.ts';
import { useMedia } from '../lib/route.ts';
import { ChatThread } from './ChatThread.tsx';
import { AvatarStack, rise } from './ui.tsx';

export function ChatView({ thread }: { thread?: string }) {
  const { group, plans, messages, members, uid, member } = useApp();
  const seen = useSeen();
  const desktop = useMedia('(min-width: 960px)');
  if (!group) return null;

  const general = messages.filter((m) => m.plan_id === null);
  const planThreads = plans
    .map((p) => ({ plan: p, msgs: messages.filter((m) => m.plan_id === p.id) }))
    .filter((t) => t.msgs.length > 0)
    .sort((a, b) => b.msgs.at(-1)!.id - a.msgs.at(-1)!.id);

  const active = thread ?? (desktop ? 'general' : undefined);
  const activePlan = active && active !== 'general' ? plans.find((p) => p.id === active) : undefined;
  const preview = (body?: string, who?: string) =>
    body ? `${who === uid ? 'Tú' : member(who ?? '')?.profile.display_name ?? '?'}: ${body}` : 'Sin mensajes todavía';

  const list = (
    <div className="threads">
      <a href="#/chat/general" className="thread" aria-current={active === 'general'}>
        <span className="plan-thumb" style={{ width: 52, height: 52, background: 'var(--sky)' }}><UsersThree size={26} weight="fill" /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="bold" style={{ display: 'block' }}>{group.name}</span>
          <span className="tiny bold muted ellipsis" style={{ display: 'block' }}>{preview(general.at(-1)?.body, general.at(-1)?.user_id)}</span>
        </span>
        {unread(messages, uid, seen, group.id, null) > 0 && <span className="tab-badge" style={{ position: 'static' }}>{unread(messages, uid, seen, group.id, null)}</span>}
      </a>
      {planThreads.map(({ plan, msgs }) => {
        const n = unread(messages, uid, seen, group.id, plan.id);
        const last = msgs.at(-1)!;
        return (
          <a key={plan.id} href={`#/chat/${plan.id}`} className="thread" aria-current={active === plan.id}>
            <span className="plan-thumb" style={{ width: 52, height: 52, background: member(plan.created_by)?.profile.color }}>
              <ChatsCircle size={26} weight="fill" />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="bold ellipsis" style={{ display: 'block' }}>{plan.title}</span>
              <span className="tiny bold muted ellipsis" style={{ display: 'block' }}>{preview(last.body, last.user_id)} · {fmtAgo(last.created_at)}</span>
            </span>
            {n > 0 && <span className="tab-badge" style={{ position: 'static' }}>{n}</span>}
          </a>
        );
      })}
      {planThreads.length === 0 && <p className="tiny bold muted center">Los chats de cada plan aparecen aquí en cuanto alguien escribe en su ficha.</p>}
    </div>
  );

  const panel = active && (
    <section className="card chat-panel" aria-label="Conversación">
      <div className="row" style={{ marginBottom: 12 }}>
        {!desktop && <a href="#/chat" className="icon-btn" aria-label="Volver"><CaretLeft size={20} weight="bold" /></a>}
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="title-md ellipsis">{activePlan ? activePlan.title : group.name}</h2>
          <span className="tiny bold muted">{activePlan ? 'Chat del plan' : 'Chat de la manada'}</span>
        </div>
        {activePlan
          ? <a className="btn btn-sm" href={`#/plan/${activePlan.id}`}><ArrowSquareOut size={16} weight="bold" /> Ficha</a>
          : <AvatarStack people={members.map((m) => m.profile)} size={28} />}
      </div>
      <ChatThread
        key={active}
        planId={activePlan ? activePlan.id : null}
        emptyText={activePlan ? 'Nadie ha escrito aún sobre este plan.' : 'Silencio en la manada. Rompe el hielo.'}
      />
    </section>
  );

  return (
    <div className="stack">
      {(desktop || !active) && (
        <motion.div className="page-head" {...rise(0)}>
          <div>
            <div className="eyebrow">Hablad, que para eso estáis</div>
            <h1 className="title-xl"><span className="hl">Chat</span></h1>
          </div>
        </motion.div>
      )}
      <div className="chat-layout">
        {(desktop || !active) && <motion.div {...rise(1)}>{list}</motion.div>}
        {panel && <motion.div {...rise(desktop ? 2 : 0)}>{panel}</motion.div>}
      </div>
    </div>
  );
}
