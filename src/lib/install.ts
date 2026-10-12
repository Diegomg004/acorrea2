// Android/Chrome avisan de que la app se puede instalar; lo guardamos para
// ofrecer un botón. En iPhone no existe: allí se instala desde Compartir.
interface InstallPromptEvent extends Event { prompt: () => Promise<void> }

let deferred: InstallPromptEvent | null = null;

export function captureInstallPrompt() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    dispatchEvent(new Event('acorrea2-installable'));
  });
}

export const canPromptInstall = () => deferred !== null;

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
}
