# Acorrea2

App de planes para tres amigos (y los que se inviten). Personal de Diego: **no es de la flota Wilokia**.

- **Repo:** `Diegomg004/acorrea2`, **público** (GitHub Pages gratis y minutos de Actions ilimitados
  para el cron; en privado el cron agotaría los 2000 min/mes). Rama `main`.
- **Push:** `gh auth switch --user Diegomg004` → `git push origin main` → `gh auth switch --user DiegomgWilokia`.
  Pushear a `main` **publica** (workflow `deploy.yml` → GitHub Pages).
- **Stack:** Vite + React 19 + TypeScript, `motion`, Phosphor icons, CSS propio (`src/styles.css`,
  tokens arriba). Sin router: hash (`src/lib/route.ts`). Supabase (auth, Postgres+RLS, storage, realtime).
- **Diseño:** propio («brutalismo blando»: crema, tinta, bordes 2 px, sombras duras). **No** usa las
  skills de marca Wilokia, a petición de Diego.

## Comandos

- `npm run verify` — typecheck + tests de lógica (`node --test`) + build.
- `npm run test:db` — 40 comprobaciones de RLS/privilegios contra un Postgres **local** desechable
  (`TEST_DATABASE_URL`, se niega a otro host). Binarios en `C:\Program Files\PostgreSQL\16\bin`.
- `npm run setup` — monta/actualiza Supabase con `SUPABASE_ACCESS_TOKEN` (API de gestión): esquema,
  auth, claves VAPID, variables y secretos del repo. Re-ejecutable.
- `scripts/notify.mjs` — lo ejecuta el cron `notify.yml` cada 10 min: encola «puntúa el plan»,
  envía Web Push, limpia. También mantiene despierto el Supabase gratuito.

## Reglas que no se ven en el código

- El login es nombre + contraseña: el email es `<usuario>@acorrea2.app` y nunca se envía (autoconfirm).
- Sin invitación solo se registra la **primera** persona (trigger `handle_new_user`).
- Cambios de esquema: editar `supabase/schema.sql` (re-ejecutable) y relanzar `npm run setup`.
  Cualquier columna nueva que escriba el cliente necesita su `grant insert/update (col)`.
- El turno lo calcula `turnTable` (menos planes no rechazados → más tiempo sin proponer → antigüedad).
  El ranking es media de medias por plan, sin autovoto.
