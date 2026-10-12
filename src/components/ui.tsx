import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls } from 'motion/react';
import { X } from '@phosphor-icons/react';
import type { Profile } from '../types.ts';
import type { PlanStatus } from '../lib/logic.ts';
import { initials } from '../lib/format.ts';
import { useMedia } from '../lib/route.ts';

export const tint = (c?: string | null) => ({ '--c': c ?? undefined }) as CSSProperties;

type AvatarProfile = Pick<Profile, 'display_name' | 'avatar_url' | 'color'>;

export function Avatar({ p, size = 40, ring }: { p?: AvatarProfile | null; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="avatar"
      style={{ ...tint(p?.color), width: size, height: size, fontSize: size * 0.4, boxShadow: ring ? 'var(--sh-sm)' : undefined }}
      title={p?.display_name}
    >
      {p?.avatar_url && !broken
        ? <img src={p.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : initials(p?.display_name ?? '?')}
    </span>
  );
}

export function AvatarStack({ people, size = 32, max = 5 }: { people: AvatarProfile[]; size?: number; max?: number }) {
  return (
    <span className="avatars">
      {people.slice(0, max).map((p, i) => <Avatar key={i} p={p} size={size} />)}
    </span>
  );
}

const STATUS_LABEL: Record<PlanStatus, string> = { aprobado: 'Aprobado', pendiente: 'Pendiente', rechazado: 'Rechazado' };
export const StatusBadge = ({ s }: { s: PlanStatus }) => <span className={`badge badge-${s}`}>{STATUS_LABEL[s]}</span>;

export function Empty({ icon, title, children, color }: { icon: ReactNode; title: string; children?: ReactNode; color?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon" style={tint(color)}>{icon}</div>
      <h3 className="title-md">{title}</h3>
      {children && <div className="muted" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

/** Hoja inferior en móvil (se arrastra hacia abajo para cerrar) y modal centrado en escritorio. */
export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const desktop = useMedia('(min-width: 960px)');
  const drag = useDragControls();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <>
      <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <div className="sheet-wrap">
        <motion.div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={desktop ? { opacity: 0, scale: 0.9, y: 40 } : { y: '100%' }}
          animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
          exit={desktop ? { opacity: 0, scale: 0.94, y: 24 } : { y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 330, mass: 0.9 }}
          drag={desktop ? false : 'y'}
          dragControls={drag}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) onClose(); }}
        >
          <div className="sheet-grab" onPointerDown={(e) => drag.start(e)}><div className="sheet-handle" /></div>
          <button className="icon-btn sheet-close" onClick={onClose} aria-label="Cerrar"><X size={20} weight="bold" /></button>
          <div className="sheet-body">{children}</div>
        </motion.div>
      </div>
    </>,
    document.body,
  );
}

/** Aparición escalonada de secciones. */
export const rise = (i: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.06 * i, type: 'spring' as const, damping: 24, stiffness: 260 },
});
