// Monta el backend de Acorrea2 de una vez, con la API de gestión de Supabase:
//   1. crea el proyecto gratuito (o usa uno existente con SUPABASE_PROJECT_REF),
//   2. aplica supabase/schema.sql y supabase/storage.sql,
//   3. configura el login (sin emails, contraseña mínima 8),
//   4. genera las claves VAPID de los avisos,
//   5. guarda variables y secretos en el repo de GitHub (cuenta Diegomg004),
//   6. deja un .env local (gitignorado) para `npm run dev`.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup.mjs
//
// Re-ejecutable: si el proyecto ya existe, solo re-aplica esquema y configuración.
// Las claves VAPID se conservan si ya están en .env.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const env = Object.fromEntries(
  existsSync('.env')
    ? readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
    : []);
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
const REPO = process.env.GITHUB_REPO || 'Diegomg004/acorrea2';
const GH_USER = REPO.split('/')[0];
const APP_URL = process.env.APP_URL || `https://${GH_USER.toLowerCase()}.github.io/${REPO.split('/')[1]}/`;
const REGION = process.env.SUPABASE_REGION || 'eu-west-3'; // París: lo más cerca de Madrid
if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN (créalo en https://supabase.com/dashboard/account/tokens).');
  process.exit(1);
}

async function api(method, path, body) {
  const r = await fetch(`https://api.supabase.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Proyecto
let ref = process.env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF;
if (!ref) {
  const existing = (await api('GET', '/v1/projects')).find((p) => p.name === 'acorrea2');
  if (existing) ref = existing.ref;
}
if (!ref) {
  const orgs = await api('GET', '/v1/organizations');
  const org = orgs.find((o) => o.slug === process.env.SUPABASE_ORG || o.id === process.env.SUPABASE_ORG) ?? orgs[0];
  if (!org) throw new Error('Tu cuenta de Supabase no tiene organizaciones.');
  console.log(`Creando proyecto «acorrea2» en ${org.name} (${REGION})…`);
  const p = await api('POST', '/v1/projects', {
    name: 'acorrea2',
    organization_slug: org.slug ?? org.id,
    db_pass: randomBytes(24).toString('base64url'), // no se guarda: todo va por la API de gestión
    region_selection: { type: 'specific', code: REGION },
  });
  ref = p.ref;
}
console.log(`Proyecto: ${ref}`);
for (let i = 0; ; i++) {
  const p = await api('GET', `/v1/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  if (i > 60) throw new Error(`El proyecto no arranca (estado ${p.status}).`);
  if (i === 0) console.log(`Esperando a que arranque (${p.status})…`);
  await sleep(10_000);
}
// La base puede tardar unos segundos más que el «healthy» del proyecto.
for (let i = 0; ; i++) {
  try { await api('POST', `/v1/projects/${ref}/database/query`, { query: 'select 1' }); break; }
  catch (e) { if (i > 30) throw e; await sleep(5_000); }
}

// 2. Esquema
for (const f of ['supabase/schema.sql', 'supabase/storage.sql']) {
  await api('POST', `/v1/projects/${ref}/database/query`, { query: readFileSync(f, 'utf8') });
  console.log(`Aplicado ${f}`);
}

// 3. Login: sin confirmación por email (los «emails» son usuario@acorrea2.app y nunca se envían).
await api('PATCH', `/v1/projects/${ref}/config/auth`, {
  site_url: APP_URL,
  uri_allow_list: `${APP_URL}**,http://localhost:5173/**`,
  mailer_autoconfirm: true,
  external_email_enabled: true,
  external_anonymous_users_enabled: false,
  disable_signup: false,
  password_min_length: 8,
});
console.log('Login configurado');

// 4. Claves
const keys = await api('GET', `/v1/projects/${ref}/api-keys?reveal=true`);
const publicKey = keys.find((k) => k.type === 'publishable')?.api_key ?? keys.find((k) => k.name === 'anon')?.api_key;
const serviceKey = keys.find((k) => k.type === 'secret')?.api_key ?? keys.find((k) => k.name === 'service_role')?.api_key;
if (!publicKey || !serviceKey) throw new Error('No encuentro las claves del proyecto.');
const url = `https://${ref}.supabase.co`;
const vapid = env.VAPID_PRIVATE_KEY && env.VITE_VAPID_PUBLIC_KEY
  ? { publicKey: env.VITE_VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  : webpush.generateVAPIDKeys();

// 5. GitHub (sin cambiar la cuenta activa de gh: token de la cuenta del repo)
let ghToken;
try { ghToken = execFileSync('gh', ['auth', 'token', '--user', GH_USER], { encoding: 'utf8' }).trim(); }
catch { console.warn(`gh no tiene sesión de ${GH_USER}: me salto GitHub.`); }
if (ghToken) {
  const gh = (...args) => execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: ghToken }, stdio: ['pipe', 'ignore', 'inherit'] });
  gh('variable', 'set', 'SUPABASE_URL', '--body', url, '-R', REPO);
  gh('variable', 'set', 'SUPABASE_KEY', '--body', publicKey, '-R', REPO);
  gh('variable', 'set', 'VAPID_PUBLIC_KEY', '--body', vapid.publicKey, '-R', REPO);
  gh('secret', 'set', 'SUPABASE_SERVICE_KEY', '--body', serviceKey, '-R', REPO);
  gh('secret', 'set', 'VAPID_PRIVATE_KEY', '--body', vapid.privateKey, '-R', REPO);
  console.log(`Variables y secretos guardados en ${REPO}`);
}

// 6. .env local
writeFileSync('.env', [
  '# Generado por scripts/setup.mjs. NO se sube a git.',
  `SUPABASE_PROJECT_REF=${ref}`,
  `VITE_SUPABASE_URL=${url}`,
  `VITE_SUPABASE_KEY=${publicKey}`,
  `VITE_VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `SUPABASE_URL=${url}`,
  `SUPABASE_SERVICE_KEY=${serviceKey}`,
  `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  '',
].join('\n'));
if (env.SUPABASE_ACCESS_TOKEN) console.log('El token de Supabase ya no queda en .env (da acceso a toda tu cuenta).');
console.log(`Listo. App: ${APP_URL}`);
