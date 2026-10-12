// Mapas sin claves ni cuentas: Photon (búsqueda, OpenStreetMap) y OSRM (ruta en coche).
// Ambos admiten CORS. Si fallan, el plan se guarda igual, sin tiempo de coche.

export interface LatLon { lat: number; lon: number }
export interface Place extends LatLon { label: string }

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

export async function searchPlaces(q: string, near: LatLon, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${near.lat}&lon=${near.lon}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Buscador de sitios: ${r.status}`);
  const j = (await r.json()) as { features?: PhotonFeature[] };
  return (j.features ?? []).map(({ geometry, properties: p }) => {
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const parts = [p.name, street, p.city ?? p.town ?? p.village ?? p.county, p.state].filter(Boolean) as string[];
    const [lon, lat] = geometry.coordinates;
    return { label: [...new Set(parts)].join(', '), lat, lon };
  });
}

export async function driveTime(from: LatLon, to: LatLon): Promise<{ minutes: number; km: number } | null> {
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`);
    if (!r.ok) return null;
    const route = ((await r.json()) as { routes?: { duration: number; distance: number }[] }).routes?.[0];
    return route ? { minutes: Math.round(route.duration / 60), km: Math.round(route.distance / 100) / 10 } : null;
  } catch {
    return null;
  }
}

export const directionsUrl = (from: LatLon, to: LatLon) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=driving`;
export const searchUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
