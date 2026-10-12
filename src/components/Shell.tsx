import type { ReactNode } from 'react';
import { CalendarDots, ChatsCircle, Plus, Trophy, UsersThree } from '@phosphor-icons/react';
import { Logo } from './Logo.tsx';
import { Avatar, AvatarStack } from './ui.tsx';
import { useApp } from '../lib/store.tsx';
import { unread, useSeen } from '../lib/seen.ts';

const NAV = [
  { href: '#/', key: '', label: 'Calendario', Icon: CalendarDots },
  { href: '#/ranking', key: 'ranking', label: 'Ranking', Icon: Trophy },
  { href: '#/chat', key: 'chat', label: 'Chat', Icon: ChatsCircle },
  { href: '#/grupo', key: 'grupo', label: 'Grupo', Icon: UsersThree },
];

export function Shell({ active, children }: { active: string; children: ReactNode }) {
  const { me, group, members, messages, uid } = useApp();
  const seen = useSeen();
  const current = ['plan', 'nuevo', 'editar'].includes(active) ? '' : active;
  const unreadCount = group ? unread(messages, uid, seen, group.id) : 0;
  const badge = (key: string) =>
    key === 'chat' && unreadCount > 0 ? <span className="tab-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null;

  return (
    <div className="app">
      <aside className="sidebar">
        <a href="#/" aria-label="Inicio"><Logo /></a>
        {NAV.map(({ href, key, label, Icon }) => (
          <a key={key} href={href} className="side-link" aria-current={current === key ? 'page' : undefined}>
            <Icon size={22} weight={current === key ? 'fill' : 'bold'} /> {label} {badge(key)}
          </a>
        ))}
        <a href="#/nuevo" className="btn btn-primary side-cta"><Plus size={20} weight="bold" /> Proponer plan</a>
        <div className="side-foot stack-sm">
          <div className="row">
            <AvatarStack people={members.map((m) => m.profile)} size={30} />
            <span className="small bold ellipsis">{group?.name}</span>
          </div>
          <a href="#/grupo" className="row" style={{ textDecoration: 'none' }}>
            <Avatar p={me} size={36} />
            <span className="bold ellipsis">{me?.display_name}</span>
          </a>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <a href="#/" aria-label="Inicio"><Logo className="logo-mini" /></a>
          <a href="#/grupo" className="row" style={{ textDecoration: 'none' }} aria-label="Tu grupo y perfil">
            <AvatarStack people={members.filter((m) => m.user_id !== uid).map((m) => m.profile)} size={30} max={3} />
            <Avatar p={me} size={38} ring />
          </a>
        </header>
        {children}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        {NAV.slice(0, 2).map(({ href, key, label, Icon }) => (
          <a key={key} href={href} className="tab" aria-current={current === key ? 'page' : undefined}>
            <span className="tab-icon"><Icon size={22} weight={current === key ? 'fill' : 'bold'} /></span>{label}{badge(key)}
          </a>
        ))}
        <a href="#/nuevo" className="fab" aria-label="Proponer plan"><Plus size={28} weight="bold" /></a>
        {NAV.slice(2).map(({ href, key, label, Icon }) => (
          <a key={key} href={href} className="tab" aria-current={current === key ? 'page' : undefined}>
            <span className="tab-icon"><Icon size={22} weight={current === key ? 'fill' : 'bold'} /></span>{label}{badge(key)}
          </a>
        ))}
      </nav>
    </div>
  );
}
