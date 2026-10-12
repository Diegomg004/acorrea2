import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles.css';
import { App } from './App.tsx';
import { ToastProvider } from './components/toast.tsx';
import { registerSW } from './lib/push.ts';
import { captureInstallPrompt } from './lib/install.ts';

captureInstallPrompt();
registerSW();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
