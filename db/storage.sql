-- Storage dei VIDEO per CARICO — incollare nel SQL Editor di Supabase ed eseguire.
-- Va lanciato UNA VOLTA, dopo schema.sql.
--
-- Bucket PRIVATO di proposito: sono video personali di allenamento. Non esiste un link
-- pubblico; per guardarli l'app chiede di volta in volta un URL firmato che scade in un'ora.
-- Convenzione dei percorsi: <id utente>/<uuid>.<estensione>. La prima cartella È l'id
-- dell'utente, ed è su quella che le policy qui sotto verificano il proprietario.

insert into storage.buckets (id, name, public, file_size_limit)
values ('video', 'video', false, 52428800)   -- 50 MB a file
on conflict (id) do nothing;

-- Niente vincolo sui MIME: l'iPhone manda video/quicktime, Android video/mp4 e altri
-- ancora; filtrare qui significherebbe respingere caricamenti legittimi. La scelta del
-- file è già ristretta a video/* dal selettore dell'app.

-- ═══ RLS: ognuno vede, carica e cancella solo i propri file ═══
create policy "video: leggo i miei" on storage.objects for select
  using (bucket_id = 'video' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "video: carico i miei" on storage.objects for insert
  with check (bucket_id = 'video' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "video: cancello i miei" on storage.objects for delete
  using (bucket_id = 'video' and (storage.foldername(name))[1] = auth.uid()::text);
