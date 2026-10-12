import { useEffect, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';
import { searchPlaces, type LatLon, type Place } from '../lib/geo.ts';

/** Buscador de sitios con sugerencias (OpenStreetMap). Escribir sin elegir también vale. */
export function PlaceSearch({ id, value, near, placeholder, onText, onPick }: {
  id: string;
  value: string;
  near: LatLon;
  placeholder: string;
  onText: (text: string) => void;
  onPick: (p: Place) => void;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || value.trim().length < 3) { setResults([]); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(value, near, ac.signal)
        .then((r) => { setResults(r); setFailed(false); })
        .catch((e: unknown) => { if ((e as Error).name !== 'AbortError') setFailed(true); });
    }, 350);
    return () => { clearTimeout(t); ac.abort(); };
  }, [value, open, near]);

  return (
    <div className="stack-sm" style={{ gap: 6 }}>
      <div className="input-icon">
        <MapPin size={20} weight="bold" />
        <input
          id={id}
          className="input"
          value={value}
          maxLength={200}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => { onText(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="suggest" role="listbox">
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} type="button" role="option" aria-selected="false"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(r); setOpen(false); }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {failed && <span className="hint">El buscador de sitios no responde; puedes dejarlo escrito a mano.</span>}
    </div>
  );
}
