import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';

type Kind = 'ok' | 'error' | 'info';
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ id: number; msg: string; kind: Kind } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((msg: string, kind: Kind = 'info') => {
    window.clearTimeout(timer.current);
    setT({ id: Date.now(), msg, kind });
    timer.current = window.setTimeout(() => setT(null), kind === 'error' ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <AnimatePresence>
        {t && (
          <motion.div
            key={t.id}
            className={`toast ${t.kind}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
            initial={{ y: -40, x: '-50%', opacity: 0 }}
            animate={{ y: 0, x: '-50%', opacity: 1 }}
            exit={{ y: -30, x: '-50%', opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 340 }}
            onClick={() => setT(null)}
          >
            {t.kind === 'error' ? <WarningCircle size={22} weight="bold" /> : <CheckCircle size={22} weight="bold" />}
            {t.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/** Errores de Supabase o de red, en cristiano. */
export function humanError(e: unknown): string {
  const msg = e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión. Prueba otra vez en un momento.';
  if (/invite_invalid|invite_required/.test(msg)) return 'Esa invitación no vale (caducada o ya usada). Pide otra.';
  if (/JWT|session|not_authenticated/i.test(msg)) return 'Tu sesión ha caducado. Vuelve a entrar.';
  if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para hacer eso.';
  if (/check constraint/i.test(msg)) return 'Algún dato no es válido (¿demasiado largo o un enlace raro?).';
  return msg || 'Algo ha fallado.';
}
