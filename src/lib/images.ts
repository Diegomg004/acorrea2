import { supabase } from './supabase.ts';

/** Reduce y pasa a JPEG en el propio móvil: fotos de 4 MB se quedan en ~300 KB. */
async function compress(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.82));
}

export async function uploadImage(bucket: 'avatars' | 'plan-photos', userId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Eso no es una imagen');
  const blob = await compress(file, bucket === 'avatars' ? 512 : 1600);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
