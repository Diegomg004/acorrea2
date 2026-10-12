-- Acorrea2 · almacenamiento de fotos (avatares y fotos de planes).
-- Buckets públicos de lectura (las rutas llevan UUID aleatorio), escritura
-- solo en la carpeta propia: <auth.uid()>/<fichero>. Tamaño y tipo limitados.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('plan-photos', 'plan-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists acorrea2_own_insert on storage.objects;
create policy acorrea2_own_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'plan-photos')
              and (storage.foldername(name))[1] = (select auth.uid()::text));
-- ponytail: sin borrado de ficheros viejos (avatar cambiado, foto quitada).
-- Con 1 GB gratis y fotos comprimidas a ~300 KB sobra; si algún día llena,
-- política de delete + select en la carpeta propia y limpiar desde el cliente.
