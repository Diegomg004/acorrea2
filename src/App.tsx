import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase.ts';
import { useRoute, type Route } from './lib/route.ts';
import { AppProvider, useApp } from './lib/store.tsx';
import { Logo } from './components/Logo.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { Shell } from './components/Shell.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { PlanSheet } from './components/PlanSheet.tsx';
import { PlanForm } from './components/PlanForm.tsx';
import { RankingView } from './components/RankingView.tsx';
import { ChatView } from './components/ChatView.tsx';
import { CreateGroup, GroupView } from './components/GroupView.tsx';

export function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Al tocar un aviso con la app abierta, el service worker nos dice adónde ir.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const on = (e: MessageEvent) => {
      const hash = (e.data as { type?: string; hash?: unknown })?.hash;
      if (e.data?.type === 'open' && typeof hash === 'string' && hash.startsWith('#/')) location.hash = hash;
    };
    sw.addEventListener('message', on);
    return () => sw.removeEventListener('message', on);
  }, []);

  if (!configured) {
    return (
      <div className="splash">
        <div className="card" style={{ maxWidth: 420, margin: 16 }}>
          <Logo />
          <p className="bold" style={{ marginTop: 12 }}>Falta conectar la base de datos (VITE_SUPABASE_URL y VITE_SUPABASE_KEY). Mira el README.</p>
        </div>
      </div>
    );
  }
  if (!ready) return <div className="splash"><div style={{ width: 260 }}><Logo animate /></div></div>;

  const invite = route.parts[0] === 'unirse' && /^[0-9a-f]{32}$/.test(route.parts[1] ?? '') ? route.parts[1] : null;
  if (!session) return <AuthScreen key={invite ?? 'login'} inviteToken={invite} />;
  return (
    <AppProvider key={session.user.id} session={session} joinToken={invite}>
      <Main route={route} />
    </AppProvider>
  );
}

function Main({ route }: { route: Route }) {
  const { groups } = useApp();
  if (groups === null) return <div className="splash"><div style={{ width: 260 }}><Logo animate /></div></div>;
  if (!groups.length) return <CreateGroup />;

  const [p0 = '', p1, p2] = route.parts;
  let view;
  switch (p0) {
    case 'ranking': view = <RankingView />; break;
    case 'chat': view = <ChatView thread={p1} />; break;
    case 'grupo': view = <GroupView />; break;
    case 'nuevo': view = <PlanForm key="nuevo" date={route.query.get('fecha')} />; break;
    case 'editar': view = <PlanForm key={p1} planId={p1} />; break;
    default: view = <CalendarView />;
  }

  return (
    <Shell active={p0}>
      {view}
      <AnimatePresence>
        {p0 === 'plan' && p1 && <PlanSheet key={p1} id={p1} rate={p2 === 'valorar'} />}
      </AnimatePresence>
    </Shell>
  );
}
