const tz = undefined; // la del dispositivo (Madrid para la manada)

export const fmtDay = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
export const fmtShort = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz });
export const fmtMonth = (d: Date) => d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

export function fmtDuration(min: number) {
  if (min >= 720) return min % 1440 === 0 ? `${min / 1440} día${min > 1440 ? 's' : ''}` : 'Día entero';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
}

export const fmtMoney = (n: number | null) =>
  n === null ? 'Por ver' : n === 0 ? 'Gratis' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 });

export function fmtAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return fmtTime(iso);
  return fmtShort(iso);
}

/** Cuenta atrás corta: «hoy», «mañana», «en 5 días». */
export function fmtUntil(iso: string) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  const d = Math.round((b.getTime() - a.getTime()) / 864e5);
  return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d > 1 ? `en ${d} días` : d === -1 ? 'ayer' : `hace ${-d} días`;
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
