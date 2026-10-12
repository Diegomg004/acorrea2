import { useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Car, ImageSquare, Link as LinkIcon, Plus, UploadSimple, X } from '@phosphor-icons/react';
import { useApp } from '../lib/store.tsx';
import { supabase } from '../lib/supabase.ts';
import { safeUrl } from '../lib/logic.ts';
import { driveTime } from '../lib/geo.ts';
import { uploadImage } from '../lib/images.ts';
import { fmtDuration } from '../lib/format.ts';
import { back } from '../lib/route.ts';
import { PlaceSearch } from './PlaceSearch.tsx';
import { Empty, rise } from './ui.tsx';
import { humanError, useToast } from './toast.tsx';
import type { Plan } from '../types.ts';

const DURATIONS = [60, 90, 120, 180, 240, 360, 720];
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return localDate(d);
}

export function PlanForm({ planId, date }: { planId?: string; date?: string | null }) {
  const { plans, uid, loading } = useApp();
  if (planId) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return loading ? <div className="skeleton" style={{ height: 400 }} /> : <Empty icon={<X size={30} />} title="Ese plan ya no existe" />;
    if (plan.created_by !== uid) return <Empty icon={<X size={30} />} title="Solo quien lo propuso puede editarlo" />;
    return <Form plan={plan} />;
  }
  return <Form initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined} />;
}

function Form({ plan, initialDate }: { plan?: Plan; initialDate?: string }) {
  const { group, uid, reload } = useApp();
  const toast = useToast();
  const start = plan ? new Date(plan.starts_at) : null;
  const [title, setTitle] = useState(plan?.title ?? '');
  const [day, setDay] = useState(start ? localDate(start) : initialDate ?? nextSaturday());
  const [time, setTime] = useState(start ? localTime(start) : '18:00');
  const [duration, setDuration] = useState(plan?.duration_minutes ?? 120);
  const [price, setPrice] = useState(plan?.price_per_person?.toString() ?? '');
  const [priceNote, setPriceNote] = useState(plan?.price_note ?? '');
  const [place, setPlace] = useState({ name: plan?.location_name ?? '', lat: plan?.lat ?? null, lon: plan?.lon ?? null });
  const [drive, setDrive] = useState(plan && plan.drive_minutes !== null ? { minutes: plan.drive_minutes, km: plan.drive_km ?? 0 } : null);
  const [routing, setRouting] = useState(false);
  const [link, setLink] = useState(plan?.link_url ?? '');
  const [photos, setPhotos] = useState<string[]>(plan?.photos ?? []);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(0);
  const [description, setDescription] = useState(plan?.description ?? '');
  const [busy, setBusy] = useState(false);
  const home = useMemo(() => ({ lat: group?.home_lat ?? 40.4168, lon: group?.home_lon ?? -3.7038 }), [group?.home_lat, group?.home_lon]);

  async function pickPlace(p: { label: string; lat: number; lon: number }) {
    setPlace({ name: p.label.slice(0, 200), lat: p.lat, lon: p.lon });
    setRouting(true);
    setDrive(await driveTime(home, p));
    setRouting(false);
  }

  async function addFiles(files: FileList | null) {
    const list = [...(files ?? [])].slice(0, 8 - photos.length);
    if (!list.length) return;
    setUploading(list.length);
    for (const f of list) {
      try {
        const url = await uploadImage('plan-photos', uid, f);
        setPhotos((ps) => [...ps, url].slice(0, 8));
      } catch (e) {
        toast(humanError(e), 'error');
      }
      setUploading((n) => n - 1);
    }
  }

  function addPhotoUrl() {
    const u = safeUrl(photoUrl);
    if (!u || !u.startsWith('https://')) return toast('Pega un enlace de imagen que empiece por https://', 'error');
    setPhotos((ps) => [...ps, u].slice(0, 8));
    setPhotoUrl('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!group) return;
    const when = new Date(`${day}T${time}`);
    if (Number.isNaN(when.getTime())) return toast('Revisa la fecha y la hora', 'error');
    const linkUrl = link.trim() ? safeUrl(link.trim()) : null;
    if (link.trim() && !linkUrl) return toast('El enlace debe empezar por http:// o https://', 'error');
    const priceNum = price.trim() === '' ? null : Number(price.replace(',', '.'));
    if (priceNum !== null && (Number.isNaN(priceNum) || priceNum < 0)) return toast('El precio no es un número válido', 'error');

    const row = {
      title: title.trim(),
      description: description.trim(),
      link_url: linkUrl,
      photos,
      starts_at: when.toISOString(),
      duration_minutes: duration,
      price_per_person: priceNum,
      price_note: priceNote.trim(),
      location_name: place.name.trim(),
      lat: place.lat,
      lon: place.lon,
      drive_minutes: place.lat !== null ? drive?.minutes ?? null : null,
      drive_km: place.lat !== null ? drive?.km ?? null : null,
    };
    setBusy(true);
    const res = plan
      ? await supabase.from('plans').update(row).eq('id', plan.id).select('id').single()
      : await supabase.from('plans').insert({ ...row, group_id: group.id }).select('id').single();
    setBusy(false);
    if (res.error) return toast(humanError(res.error), 'error');
    toast(plan ? 'Plan actualizado' : '¡Plan propuesto! Ahora a esperar los votos.', 'ok');
    await reload();
    location.replace(`#/plan/${(res.data as { id: string }).id}`);
  }

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 720 }}>
      <motion.div className="page-head" {...rise(0)}>
        <div>
          <div className="eyebrow">{plan ? 'Editar plan' : 'Nuevo plan · que no se entere nadie en casa'}</div>
          <h1 className="title-xl">{plan ? <>Retocar la <span className="hl">orgía</span></> : <>La próxima <span className="hl">orgía</span></>}</h1>
        </div>
      </motion.div>

      <motion.section className="card stack" {...rise(1)}>
        <div className="field">
          <label className="label" htmlFor="title">Título</label>
          <input id="title" className="input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Karts en Fuenlabrada, cata de cervezas…" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="day">Día</label>
            <input id="day" type="date" className="input" required value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="time">Hora</label>
            <input id="time" type="time" className="input" required value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="label">Duración (más o menos)</span>
          <div className="chips">
            {DURATIONS.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={duration === d} onClick={() => setDuration(d)}>{fmtDuration(d)}</button>
            ))}
          </div>
          <span className="hint">Cuando acabe, a la manada le llega el aviso de «puntúa el plan».</span>
        </div>
      </motion.section>

      <motion.section className="card stack" {...rise(2)}>
        <div className="field">
          <label className="label" htmlFor="place">Ubicación</label>
          <PlaceSearch
            id="place"
            value={place.name}
            near={home}
            placeholder="Busca el sitio o la dirección"
            onText={(t) => { setPlace({ name: t, lat: null, lon: null }); setDrive(null); }}
            onPick={pickPlace}
          />
          <span className="hint row" style={{ gap: 6 }}>
            <Car size={16} weight="bold" />
            {routing ? 'Calculando el viaje…'
              : drive ? <b>{drive.minutes} min · {drive.km} km en coche desde {group?.home_label ?? 'casa'}</b>
              : place.lat !== null ? 'No se ha podido calcular el viaje.'
              : 'Elige una sugerencia y calculo cuánto se tarda desde casa.'}
          </span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="price">Precio por persona (€)</label>
            <input id="price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25" />
          </div>
          <div className="field">
            <label className="label" htmlFor="pnote">Qué incluye</label>
            <input id="pnote" className="input" maxLength={120} value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="Entrada + cena" />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="link">Web del plan</label>
          <div className="input-icon">
            <LinkIcon size={20} weight="bold" />
            <input id="link" className="input" type="url" inputMode="url" maxLength={2000} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          </div>
        </div>
      </motion.section>

      <motion.section className="card stack" {...rise(3)}>
        <div className="field">
          <span className="label">Fotos del sitio ({photos.length}/8)</span>
          {photos.length > 0 && (
            <div className="chips">
              {photos.map((u, i) => (
                <span key={u + i} style={{ position: 'relative' }}>
                  <img src={u} alt="" referrerPolicy="no-referrer" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 14, border: '2px solid var(--ink)' }} />
                  <button type="button" className="icon-btn" aria-label="Quitar foto" style={{ position: 'absolute', top: -8, right: -8, width: 28, height: 28 }}
                    onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}><X size={14} weight="bold" /></button>
                </span>
              ))}
            </div>
          )}
          {photos.length < 8 && (
            <div className="stack-sm">
              <label className="btn" style={{ alignSelf: 'flex-start' }}>
                <UploadSimple size={18} weight="bold" /> {uploading ? `Subiendo ${uploading}…` : 'Subir fotos'}
                <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading > 0} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </label>
              <div className="row">
                <div className="input-icon grow">
                  <ImageSquare size={20} weight="bold" />
                  <input className="input" inputMode="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="…o pega el enlace de una imagen" />
                </div>
                <button type="button" className="icon-btn" onClick={addPhotoUrl} aria-label="Añadir imagen por enlace"><Plus size={20} weight="bold" /></button>
              </div>
            </div>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="desc">Descripción</label>
          <textarea id="desc" className="textarea" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Véndelo bien: qué es, por qué mola, qué hay que llevar…" />
        </div>
      </motion.section>

      <motion.div className="grid-2" {...rise(4)}>
        <button type="button" className="btn" onClick={() => back('/')}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy || uploading > 0}>{busy ? 'Guardando…' : plan ? 'Guardar cambios' : 'Proponer plan'}</button>
      </motion.div>
    </form>
  );
}
