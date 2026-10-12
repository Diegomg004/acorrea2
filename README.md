# Acorrea2

> Libertad condicional, una vez al mes.

App para que la manada organice el plan del mes: calendario, fichas de plan con fotos, precio,
ubicación y tiempo en coche desde casa, votos (aprobar o rechazar), chat por plan, turnos de quién
propone y un podio con las notas de cada plan.

**App:** https://diegomg004.github.io/acorrea2/

## Instalarla en el móvil (sin App Store ni Play Store)

Es una app web instalable (PWA): se instala desde el navegador y se abre a pantalla completa con su
icono, como cualquier app.

- **iPhone:** abre el enlace en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**.
  Ábrela desde el icono y, en *Grupo*, pulsa **Activar avisos** (iOS solo da avisos a las apps
  instaladas así).
- **Android:** abre el enlace en Chrome → menú ⋮ → **Instalar app** (o el botón *Instalar la app* en
  *Grupo*).

Para entrar hace falta el **enlace de invitación** del grupo (*Grupo → Crear enlace de invitación*).
La única excepción es la primera persona que se registra: es quien funda la manada.

## Cómo está hecho

| Pieza | Dónde vive | Coste |
|---|---|---|
| La app (React + Vite, PWA) | GitHub Pages, publicada por GitHub Actions en cada push a `main` | 0 € |
| Login, base de datos, fotos, chat en vivo | Supabase (plan gratuito) | 0 € |
| Avisos push y recordatorio de «puntúa el plan» | Cron de GitHub Actions cada 10 min (`scripts/notify.mjs`) | 0 € |
| Mapas: buscar sitios y tiempo en coche | Photon y OSRM (OpenStreetMap), sin claves | 0 € |

El cron, además, mantiene despierta la base de datos (Supabase pausa los proyectos gratuitos tras
una semana sin actividad).

## Seguridad

- **RLS en todas las tablas**: nadie ve ni toca nada de un grupo al que no pertenece. Los clientes
  solo pueden escribir las columnas que necesitan (privilegios por columna).
- **Sin invitación no hay alta**: lo impone un trigger en la base de datos, no la interfaz.
  Invitaciones de 128 bits, caducan a los 14 días y valen para 10 personas.
- **Sin SQL dinámico**: todo va por consultas parametrizadas o funciones con `search_path` vacío.
- **Enlaces solo `http(s)`** (la base de datos rechaza `javascript:` y compañía) y fotos solo `https`.
- **CSP** estricta en la página publicada: scripts únicamente propios.
- La clave pública de Supabase va en el bundle (es así por diseño); la de servicio y la privada de
  los avisos solo existen como *secrets* de GitHub Actions.
- Contraseñas de 8 caracteres o más; las gestiona Supabase Auth (bcrypt).

`npm run test:db` comprueba todo esto (40 casos: intrusos, inyección, votarse a sí mismo, puntuar
antes de tiempo, invitaciones caducadas…) contra un Postgres local desechable.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173 (necesita .env, ver .env.example)
npm run verify       # typecheck + tests + build
TEST_DATABASE_URL=postgres://postgres@localhost:55499/postgres npm run test:db
```

### Montar el backend desde cero

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run setup
```

Crea el proyecto de Supabase, aplica `supabase/schema.sql` y `supabase/storage.sql`, configura el
login, genera las claves VAPID y guarda variables y secretos en el repo de GitHub. Es re-ejecutable:
para cambiar el esquema, edita el SQL y vuelve a lanzarlo.
