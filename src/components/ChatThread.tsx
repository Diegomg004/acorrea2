import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { supabase } from '../lib/supabase.ts';
import { linkify } from '../lib/logic.ts';
import { fmtAgo } from '../lib/format.ts';
import { markSeen, threadKey } from '../lib/seen.ts';
import { Avatar } from './ui.tsx';
import { humanError, useToast } from './toast.tsx';
import type { Message } from '../types.ts';

/** Mini chat: el general del grupo (planId = null) o el de un plan. */
export function ChatThread({ planId, emptyText }: { planId: string | null; emptyText: string }) {
  const { messages, group, uid, member, addMessage } = useApp();
  const toast = useToast();
  const list = messages.filter((m) => m.plan_id === planId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = list.at(-1)?.id ?? 0;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  useEffect(() => {
    if (group && lastId) markSeen(threadKey(group.id, planId), lastId);
  }, [group, planId, lastId]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !group || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('messages')
      .insert({ group_id: group.id, plan_id: planId, body: body.slice(0, 1000) })
      .select().single();
    setBusy(false);
    if (error) return toast(humanError(error), 'error');
    addMessage(data as Message);
    setText('');
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  // Agrupa mensajes seguidos de la misma persona (menos de 5 min entre ellos).
  const groups: { user: string; items: Message[] }[] = [];
  for (const m of list) {
    const g = groups.at(-1);
    const prev = g?.items.at(-1);
    if (g && g.user === m.user_id && prev && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000) g.items.push(m);
    else groups.push({ user: m.user_id, items: [m] });
  }

  return (
    <div>
      <div className="chat-scroll" ref={scroller}>
        {list.length === 0 ? (
          <div className="chat-empty">{emptyText}</div>
        ) : (
          <div className="chat">
            {groups.map((g) => {
              const mine = g.user === uid;
              const who = member(g.user)?.profile;
              return (
                <div key={g.items[0].id} className={`msg-group ${mine ? 'me' : 'them'}`}>
                  <div className="msg-meta">
                    {!mine && <Avatar p={who} size={20} />}
                    {mine ? 'Tú' : who?.display_name ?? 'Ex-miembro'} · {fmtAgo(g.items[0].created_at)}
                  </div>
                  {g.items.map((m) => (
                    <motion.div key={m.id} className="msg" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      style={{ transformOrigin: mine ? 'bottom right' : 'bottom left' }}>
                      {linkify(m.body).map((p, i) => (
                        <Fragment key={i}>
                          {p.href ? <a href={p.href} target="_blank" rel="noopener noreferrer nofollow">{p.text}</a> : p.text}
                        </Fragment>
                      ))}
                    </motion.div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <form className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor={`chat-${planId ?? 'general'}`}>Mensaje</label>
        <textarea
          id={`chat-${planId ?? 'general'}`}
          className="textarea"
          rows={1}
          maxLength={1000}
          placeholder="Escribe… (puedes pegar enlaces)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="icon-btn" style={{ width: 50, height: 50, background: 'var(--coral)' }} disabled={busy || !text.trim()} aria-label="Enviar">
          <PaperPlaneRight size={22} weight="fill" />
        </button>
      </form>
    </div>
  );
}
