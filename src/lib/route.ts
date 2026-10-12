import { useEffect, useState } from 'react';

// Router de hash: GitHub Pages no sabe de rutas, el hash sí funciona siempre.
export interface Route { parts: string[]; query: URLSearchParams }

function parse(): Route {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return {
    parts: path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } }),
    query: new URLSearchParams(qs ?? ''),
  };
}

// Cualquier cambio de hash tras la carga es navegación dentro de la app.
let navigatedInApp = false;
addEventListener('hashchange', () => { navigatedInApp = true; });

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(to: string) {
  location.hash = to.startsWith('#') ? to : `#${to}`;
}

/** Cerrar una hoja: atrás si venimos de la app, a inicio si se abrió desde un aviso. */
export function back(fallback = '/') {
  if (navigatedInApp && history.length > 1) history.back();
  else location.replace(`#${fallback}`);
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
