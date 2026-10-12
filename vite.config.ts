import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// CSP solo en el build (el modo dev de Vite inyecta scripts en línea).
// Scripts únicamente propios; red solo a Supabase y a los servicios de mapas.
const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://router.project-osrm.org https://photon.komoot.io; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" />`,
    ),
};

// GitHub Pages sirve el sitio en /<repo>/. En local, en la raíz.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), csp],
  build: { chunkSizeWarningLimit: 900 },
});
