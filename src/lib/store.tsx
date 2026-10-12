import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { go } from './route.ts';
import { useToast, humanError } from '../components/toast.tsx';
import type { Group, Member, Message, Plan, Profile } from '../types.ts';

interface AppState {
  uid: string;
  me: Profile | null;
  groups: Group[] | null;
  group: Group | null;
  members: Member[];
  plans: Plan[];
  messages: Message[];
  loading: boolean;
  setGroupId: (id: string) => void;
  reloadMe: () => Promise<void>;
  reloadGroups: () => Promise<Group[]>;
  reload: () => Promise<void>;
  addMessage: (m: Message) => void;
  member: (id: string) => Member | undefined;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera de AppProvider');
  return v;
};

const GROUP_KEY = 'acorrea2.group';
const readGroup = () => { try { return localStorage.getItem(GROUP_KEY); } catch { return null; } };

export function AppProvider({ session, joinToken, children }: { session: Session; joinToken: string | null; children: ReactNode }) {
  const uid = session.user.id;
  const toast = useToast();
  const [me, setMe] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [groupId, setGroupIdState] = useState<string | null>(readGroup);
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const group = groups?.find((g) => g.id === groupId) ?? groups?.[0] ?? null;

  const setGroupId = useCallback((id: string) => {
    setGroupIdState(id);
    try { localStorage.setItem(GROUP_KEY, id); } catch { /* modo privado */ }
  }, []);

  const reloadMe = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (error) toast(humanError(error), 'error');
    else setMe(data as Profile);
  }, [uid, toast]);

  const reloadGroups = useCallback(async () => {
    const { data, error } = await supabase.from('group_members').select('joined_at, group:groups(*)').eq('user_id', uid)
      .order('joined_at');
    if (error) { toast(humanError(error), 'error'); return []; }
    const gs = (data as unknown as { group: Group | null }[]).map((r) => r.group).filter((g): g is Group => Boolean(g));
    setGroups(gs);
    return gs;
  }, [uid, toast]);

  const reload = useCallback(async () => {
    if (!group) return;
    const [m, p, msg] = await Promise.all([
      supabase.from('group_members').select('user_id, role, joined_at, profile:profiles(*)').eq('group_id', group.id).order('joined_at'),
      supabase.from('plans').select('*, plan_votes(*), plan_ratings(*)').eq('group_id', group.id).order('starts_at'),
      supabase.from('messages').select('*').eq('group_id', group.id).order('created_at', { ascending: false }).limit(500),
    ]);
    const err = m.error ?? p.error ?? msg.error;
    if (err) toast(humanError(err), 'error');
    else {
      setMembers((m.data as unknown as Member[]).filter((x) => x.profile));
      setPlans(p.data as Plan[]);
      setMessages((msg.data as Message[]).reverse());
    }
    setLoading(false);
  }, [group?.id, toast]);

  const addMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Arranque: perfil + grupos, y si se viene de un enlace de invitación, unirse.
  const joined = useRef(false);
  useEffect(() => {
    (async () => {
      await reloadMe();
      if (joinToken && !joined.current) {
        joined.current = true;
        const { data, error } = await supabase.rpc('join_group', { p_token: joinToken });
        if (error) toast(humanError(error), 'error');
        else { setGroupId(data as string); toast('¡Ya estás acorreado oficialmente!', 'ok'); }
        go('/');
      }
      const gs = await reloadGroups();
      if (!gs.length) setLoading(false);
    })();
  }, [reloadMe, reloadGroups, joinToken, setGroupId, toast]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  // Tiempo real: chat al instante; planes, votos y notas se recargan (con calma).
  useEffect(() => {
    if (!group) return;
    let t: number | undefined;
    const soon = () => { window.clearTimeout(t); t = window.setTimeout(reload, 400); };
    const ch = supabase
      .channel(`grupo-${group.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${group.id}` },
        (e) => addMessage(e.new as Message))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `group_id=eq.${group.id}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_votes' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_ratings' }, soon)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') soon(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(ch);
    };
  }, [group?.id, reload, addMessage]);

  const value = useMemo<AppState>(() => ({
    uid, me, groups, group, members, plans, messages, loading,
    setGroupId, reloadMe, reloadGroups, reload, addMessage,
    member: (id) => members.find((m) => m.user_id === id),
  }), [uid, me, groups, group, members, plans, messages, loading, setGroupId, reloadMe, reloadGroups, reload, addMessage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
