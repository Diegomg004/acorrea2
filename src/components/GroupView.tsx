import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell, Camera, Copy, DeviceMobile, Export, House, Link as LinkIcon, PlusSquare, ShareNetwork, SignOut, UserMinus, UsersThree,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { supabase } from '../lib/supabase.ts';
import { uploadImage } from '../lib/images.ts';
import { COLORS } from '../lib/colors.ts';
import { disablePush, enablePush, isIOS, isStandalone, pushEnabled, pushSupported } from '../lib/push.ts';
import { canPromptInstall, promptInstall } from '../lib/install.ts';
import { PlaceSearch } from './PlaceSearch.tsx';
import { Avatar, rise, tint } from './ui.tsx';
import { humanError, useToast } from './toast.tsx';

export function GroupView() {
  return (
    <div className="stack">
      <motion.div className="page-head" {...rise(0)}>
        <div>
          <div className="eyebrow">La manada y tú</div>
          <h1 className="title-xl"><span className="hl">Grupo</span></h1>
        </div>
      </motion.div>
      <div className="home-grid">
        <div className="stack">
          <motion.div {...rise(1)}><InviteCard /></motion.div>
          <motion.div {...rise(2)}><GroupCard /></motion.div>
          <motion.div {...rise(3)}><GroupsCard /></motion.div>
        </div>
        <div className="stack home-side">
          <motion.div {...rise(2)}><ProfileCard /></motion.div>
          <motion.div {...rise(3)}><DeviceCard /></motion.div>
          <motion.div {...rise(4)}>
            <button className="btn btn-ghost btn-block" onClick={async () => { await disablePush().catch(() => {}); await supabase.auth.signOut(); }}>
              <SignOut size={20} weight="bold" /> Volver a casa (cerrar sesión)
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function InviteCard() {
  const { group } = useApp();
  const toast = useToast();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!group) return;
    setBusy(true);
    const { data, error } = await supabase.from('invites').insert({ group_id: group.id }).select('token').single();
    setBusy(false);
    if (error) return toast(humanError(error), 'error');
    setLink(`${location.origin}${location.pathname}#/unirse/${(data as { token: string }).token}`);
  }

  async function share() {
    const text = `Acorréate oficialmente: únete a «${group?.name}» en Acorrea2 🐶`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Acorrea2', text, url: link }); } catch { /* cancelado */ }
    } else copy();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); toast('Enlace copiado', 'ok'); }
    catch { toast('No se pudo copiar: mantén pulsado el enlace', 'error'); }
  }

  return (
    <section className="card card-tint" style={tint('var(--sun)')} aria-label="Invitar">
      <h2 className="title-lg">Acorréate oficialmente</h2>
      <p className="bold" style={{ margin: '6px 0 14px' }}>Crea un enlace y pásaselo a quien quieras meter en la manada.</p>
      {!link ? (
        <button className="btn btn-dark" disabled={busy} onClick={create}><LinkIcon size={18} weight="bold" /> {busy ? 'Creando…' : 'Crear enlace de invitación'}</button>
      ) : (
        <div className="stack-sm">
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Enlace de invitación" />
          <div className="row wrap">
            <button className="btn btn-dark" onClick={share}><ShareNetwork size={18} weight="bold" /> Compartir</button>
            <button className="btn" onClick={copy}><Copy size={18} weight="bold" /> Copiar</button>
          </div>
          <span className="tiny bold">Vale 14 días y hasta 10 personas. Sin enlace no entra nadie.</span>
        </div>
      )}
    </section>
  );
}

function GroupCard() {
  const { group, members, uid, reloadGroups, reload } = useApp();
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? '');
  const [home, setHome] = useState({ label: group?.home_label ?? '', lat: group?.home_lat ?? 0, lon: group?.home_lon ?? 0 });
  const [kick, setKick] = useState<string | null>(null);
  const amOwner = members.find((m) => m.user_id === uid)?.role === 'owner';
  if (!group) return null;
  const dirty = name.trim() !== group.name || home.label !== group.home_label;

  async function save() {
    if (!group) return;
    const { error } = await supabase.from('groups')
      .update({ name: name.trim(), home_label: home.label.trim(), home_lat: home.lat, home_lon: home.lon })
      .eq('id', group.id);
    if (error) return toast(humanError(error), 'error');
    toast('Grupo guardado', 'ok');
    reloadGroups();
  }

  async function removeMember(userId: string) {
    if (!group) return;
    const { error } = await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', userId);
    if (error) return toast(humanError(error), 'error');
    setKick(null);
    toast(userId === uid ? 'Has salido del grupo' : 'Fuera de la manada', 'ok');
    if (userId === uid) { try { localStorage.removeItem('acorrea2.group'); } catch { /* nada */ } await reloadGroups(); }
    reload();
  }

  return (
    <section className="card stack" aria-label="Ajustes del grupo">
      <div className="section-title" style={{ marginBottom: 0 }}><h2><UsersThree size={22} weight="fill" style={{ verticalAlign: '-3px' }} /> La manada</h2></div>
      <div className="field">
        <label className="label" htmlFor="gname">Nombre del grupo</label>
        <input id="gname" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="home"><House size={15} weight="fill" /> Casa (punto de salida para el tiempo en coche)</label>
        <PlaceSearch
          id="home"
          value={home.label}
          near={{ lat: group.home_lat, lon: group.home_lon }}
          placeholder="Calle y número"
          onText={(t) => setHome((h) => ({ ...h, label: t }))}
          onPick={(p) => setHome({ label: p.label.slice(0, 160), lat: p.lat, lon: p.lon })}
        />
      </div>
      {dirty && <button className="btn btn-primary" onClick={save} disabled={!name.trim() || !home.label.trim()}>Guardar cambios</button>}

      <div className="stack-sm">
        {members.map((m) => (
          <div key={m.user_id} className="row">
            <Avatar p={m.profile} size={40} />
            <div className="grow">
              <div className="bold">{m.profile.display_name}{m.user_id === uid && ' (tú)'}</div>
              <div className="tiny bold muted">@{m.profile.username}{m.role === 'owner' && ' · fundador'}</div>
            </div>
            {(amOwner && m.user_id !== uid) || m.user_id === uid ? (
              kick === m.user_id
                ? <button className="btn btn-sm btn-pink" onClick={() => removeMember(m.user_id)}>¿Seguro?</button>
                : <button className="btn btn-sm btn-ghost" onClick={() => setKick(m.user_id)} aria-label={m.user_id === uid ? 'Salir del grupo' : `Echar a ${m.profile.display_name}`}>
                    <UserMinus size={18} weight="bold" /> {m.user_id === uid ? 'Salir' : 'Echar'}
                  </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupsCard() {
  const { groups, group, setGroupId, reloadGroups } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  async function create() {
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim() });
    if (error) return toast(humanError(error), 'error');
    setName('');
    setGroupId(data as string);
    await reloadGroups();
    toast('Grupo creado. Invita a la gente.', 'ok');
  }
  return (
    <section className="card stack-sm" aria-label="Tus grupos">
      <div className="section-title" style={{ marginBottom: 4 }}><h2>Tus grupos</h2></div>
      {(groups ?? []).length > 1 && (
        <div className="chips">
          {groups!.map((g) => <button key={g.id} className="chip" aria-pressed={g.id === group?.id} onClick={() => setGroupId(g.id)}>{g.name}</button>)}
        </div>
      )}
      <div className="row">
        <input className="input grow" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del grupo nuevo" aria-label="Nombre del grupo nuevo" />
        <button className="btn" disabled={!name.trim()} onClick={create}>Crear</button>
      </div>
    </section>
  );
}

function ProfileCard() {
  const { me, uid, reloadMe, reload } = useApp();
  const toast = useToast();
  const [name, setName] = useState(me?.display_name ?? '');
  const [uploading, setUploading] = useState(false);
  if (!me) return null;

  async function update(patch: { display_name?: string; avatar_url?: string; color?: string }) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
    if (error) return toast(humanError(error), 'error');
    await reloadMe();
    reload();
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    setUploading(true);
    try { await update({ avatar_url: await uploadImage('avatars', uid, file) }); toast('Foto cambiada', 'ok'); }
    catch (e) { toast(humanError(e), 'error'); }
    setUploading(false);
  }

  return (
    <section className="card stack" aria-label="Tu perfil">
      <div className="stack-sm" style={{ alignItems: 'center', textAlign: 'center' }}>
        <label style={{ position: 'relative', cursor: 'pointer' }} aria-label="Cambiar foto">
          <Avatar p={me} size={104} ring />
          <span className="icon-btn" style={{ position: 'absolute', right: -2, bottom: 0, width: 36, height: 36 }}><Camera size={18} weight="bold" /></span>
          <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        <div>
          <div className="title-md">{me.display_name}</div>
          <div className="tiny bold muted">Entras como @{me.username}{uploading && ' · subiendo foto…'}</div>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="dname">Cómo te ve la manada</label>
        <div className="row">
          <input id="dname" className="input grow" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          {name.trim() && name.trim() !== me.display_name && <button className="btn" onClick={() => update({ display_name: name.trim() })}>Guardar</button>}
        </div>
      </div>
      <div className="field">
        <span className="label">Tu color</span>
        <div className="swatches">
          {COLORS.map((c) => (
            <button key={c} className="swatch" style={tint(c)} aria-pressed={me.color.toLowerCase() === c.toLowerCase()} aria-label={`Color ${c}`} onClick={() => update({ color: c })} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DeviceCard() {
  const toast = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(canPromptInstall);
  const standalone = isStandalone();
  const ios = isIOS();

  useEffect(() => { pushEnabled().then(setOn, () => setOn(false)); }, []);
  useEffect(() => {
    const onReady = () => setInstallable(true);
    addEventListener('acorrea2-installable', onReady);
    return () => removeEventListener('acorrea2-installable', onReady);
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); toast('Avisos desactivados en este dispositivo'); }
      else { await enablePush(); setOn(true); toast('¡Avisos activados!', 'ok'); }
    } catch (e) { toast(humanError(e), 'error'); }
    setBusy(false);
  }

  return (
    <section className="card stack-sm" aria-label="Este dispositivo">
      <div className="section-title" style={{ marginBottom: 4 }}><h2><DeviceMobile size={22} weight="fill" style={{ verticalAlign: '-3px' }} /> Este móvil</h2></div>

      {!standalone && ios && (
        <div className="banner" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
          <span>Instálala en el iPhone (sin App Store):</span>
          <span className="small">1. Ábrela en <b>Safari</b>. 2. Pulsa <Export size={16} weight="bold" style={{ verticalAlign: '-3px' }} /> <b>Compartir</b>. 3. <PlusSquare size={16} weight="bold" style={{ verticalAlign: '-3px' }} /> <b>Añadir a pantalla de inicio</b>. 4. Ábrela desde el icono.</span>
        </div>
      )}
      {!standalone && !ios && !installable && (
        <div className="banner" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
          <span>Instálala en el móvil:</span>
          <span className="small">Ábrela en <b>Chrome</b> → menú <b>⋮</b> → <b>Instalar app</b> (o «Añadir a pantalla de inicio»). Luego ábrela desde el icono.</span>
        </div>
      )}
      {!standalone && !ios && installable && (
        <button className="btn btn-lime" onClick={() => promptInstall().then(() => setInstallable(false))}><DeviceMobile size={18} weight="bold" /> Instalar la app</button>
      )}

      {pushSupported() ? (
        <button className={`btn ${on ? '' : 'btn-primary'}`} disabled={busy} onClick={toggle}>
          <Bell size={18} weight={on ? 'regular' : 'fill'} /> {on ? 'Desactivar avisos' : 'Activar avisos'}
        </button>
      ) : (
        <p className="small bold muted">
          {ios && !standalone ? 'En iPhone los avisos funcionan cuando la app está instalada en la pantalla de inicio.' : 'Este navegador no admite avisos.'}
        </p>
      )}
      <span className="tiny bold muted">Te avisamos de planes nuevos, votos, mensajes y de puntuar cuando acaba un plan.</span>
    </section>
  );
}

export function CreateGroup() {
  const { reloadGroups, setGroupId, me } = useApp();
  const toast = useToast();
  const [name, setName] = useState('Los Acorrea2');
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim() });
    setBusy(false);
    if (error) return toast(humanError(error), 'error');
    setGroupId(data as string);
    await reloadGroups();
  }
  return (
    <div className="auth">
      <div className="auth-inner stack">
        <motion.div className="card stack" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <div className="eyebrow">Hola, {me?.display_name}</div>
          <h1 className="title-lg">Crea tu manada</h1>
          <p className="bold muted">Luego invitas al resto con un enlace. Si te han invitado a ti, abre el enlace que te pasaron.</p>
          <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del grupo" />
          <button className="btn btn-primary btn-lg" disabled={busy || !name.trim()} onClick={create}>Crear la manada</button>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}><SignOut size={18} weight="bold" /> Salir</button>
        </motion.div>
      </div>
    </div>
  );
}
