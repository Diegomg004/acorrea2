import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Bone, Camera, LockKey, PawPrint, User } from '@phosphor-icons/react';
import { Logo } from './Logo.tsx';
import { Avatar, AvatarStack } from './ui.tsx';
import { humanError, useToast } from './toast.tsx';
import { supabase, setRemember } from '../lib/supabase.ts';
import { toUsername, usernameToEmail } from '../lib/logic.ts';
import { uploadImage } from '../lib/images.ts';
import { COLORS } from '../lib/colors.ts';

interface Invite { group_name: string; inviter: string | null; members: { display_name: string; avatar_url: string | null; color: string }[] }

export function AuthScreen({ inviteToken }: { inviteToken: string | null }) {
  const toast = useToast();
  const [invite, setInvite] = useState<Invite | null | 'invalid'>(null);
  const [mode, setMode] = useState<'login' | 'signup'>(inviteToken ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRememberState] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [color] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!inviteToken) return;
    supabase.rpc('invite_preview', { p_token: inviteToken }).then(({ data, error }) => {
      setInvite(error || !data ? 'invalid' : (data as Invite));
    });
  }, [inviteToken]);

  const username = toUsername(name);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (username.length < 2) return setError('Ese nombre no vale: usa al menos 2 letras o números.');
    if (password.length < 8) return setError('La contraseña necesita al menos 8 caracteres.');
    setBusy(true);
    setRemember(remember);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'Nombre o contraseña incorrectos.' : error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: usernameToEmail(username),
          password,
          options: { data: { display_name: name.trim().slice(0, 40), invite: inviteToken ?? '', color } },
        });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) throw new Error('Ese nombre ya está pillado. Si es tuyo, entra con tu contraseña.');
          if (/database error/i.test(error.message)) throw new Error('Para crear cuenta hace falta un enlace de invitación válido. Pídeselo a tu grupo.');
          if (/weak|pwned|password/i.test(error.message)) throw new Error('Esa contraseña es demasiado fácil. Prueba otra.');
          throw error;
        }
        if (!data.session) throw new Error('Cuenta creada, pero no se ha podido entrar. Prueba a entrar con tu nombre.');
        if (photo && data.user) {
          try {
            const url = await uploadImage('avatars', data.user.id, photo);
            await supabase.from('profiles').update({ avatar_url: url }).eq('id', data.user.id);
          } catch {
            toast('La foto no se ha podido subir. Cámbiala luego en Grupo.', 'error');
          }
        }
      }
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Stickers />
      <div className="auth-inner">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Logo animate />
        </motion.div>
        <motion.p className="tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          Libertad <span className="hl">condicional</span>, una vez al mes.
        </motion.p>

        {inviteToken && invite && (
          <motion.div className="card invite-card" style={{ marginBottom: 18 }} initial={{ scale: 0.9, rotate: -2, opacity: 0 }} animate={{ scale: 1, rotate: -1, opacity: 1 }} transition={{ type: 'spring', delay: 0.3 }}>
            {invite === 'invalid' ? (
              <p className="bold">Esta invitación ha caducado o ya no vale. Pide un enlace nuevo a tu grupo.</p>
            ) : (
              <div className="stack-sm" style={{ alignItems: 'center' }}>
                <AvatarStack people={invite.members} size={40} />
                <p className="bold">
                  {invite.inviter ?? 'Alguien'} te invita a <span className="hl">{invite.group_name}</span>
                </p>
                <p className="small">Únete a la manada: crea tu cuenta y entras directo.</p>
              </div>
            )}
          </motion.div>
        )}

        <motion.form
          className="card stack"
          onSubmit={submit}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 22, delay: 0.25 }}
        >
          <div className="tabs" role="group" aria-label="Acceso">
            <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>Entrar</button>
            <button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setError(''); }}>Soy nuevo</button>
          </div>

          {mode === 'signup' && (
            <label className="row" style={{ cursor: 'pointer', gap: 14 }}>
              <span style={{ position: 'relative' }}>
                <Avatar p={{ display_name: name || '?', avatar_url: preview, color }} size={64} ring />
                <span className="icon-btn" style={{ position: 'absolute', right: -8, bottom: -6, width: 30, height: 30 }}><Camera size={16} weight="bold" /></span>
              </span>
              <span className="small bold">{photo ? 'Foto lista. Toca para cambiarla.' : 'Pon tu foto de perfil (opcional)'}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}

          <div className="field">
            <label className="label" htmlFor="name">Tu nombre</label>
            <div className="input-icon">
              <User size={20} weight="bold" />
              <input id="name" className="input" autoComplete="username" autoCapitalize="words" maxLength={40}
                value={name} onChange={(e) => setName(e.target.value)} placeholder="Como te llame la manada" required />
            </div>
            {mode === 'signup' && username && <span className="hint">Entrarás como <b>{username}</b></span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="pass">Contraseña</label>
            <div className="input-icon">
              <LockKey size={20} weight="bold" />
              <input id="pass" className="input" type="password" minLength={8} maxLength={72}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRememberState(e.target.checked)} />
            Recordarme en este dispositivo
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Soltar la correa' : inviteToken ? 'Acorrearme oficialmente' : 'Crear cuenta'}
          </button>
          {mode === 'signup' && !inviteToken && (
            <p className="hint center">Solo se entra con el enlace de invitación de tu grupo.</p>
          )}
        </motion.form>
      </div>
    </div>
  );
}

function Stickers() {
  const items = [
    { Icon: PawPrint, style: { top: '7%', left: '6%', rotate: '-18deg' }, size: 64 },
    { Icon: Bone, style: { top: '3%', right: '8%', rotate: '24deg' }, size: 64 },
    { Icon: PawPrint, style: { bottom: '12%', left: '9%', rotate: '12deg' }, size: 52 },
    { Icon: Bone, style: { bottom: '6%', right: '10%', rotate: '-30deg' }, size: 60 },
    { Icon: PawPrint, style: { top: '48%', right: '3%', rotate: '40deg' }, size: 40 },
  ];
  return (
    <>
      {items.map(({ Icon, style, size }, i) => (
        <motion.span
          key={i}
          className="sticker"
          style={style}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon size={size} weight="fill" />
        </motion.span>
      ))}
    </>
  );
}
