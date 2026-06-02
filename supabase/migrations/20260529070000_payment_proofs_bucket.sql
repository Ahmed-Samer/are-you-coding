-- Storage bucket for payment proof screenshots
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
  array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder (path begins with their auth.uid())
create policy "Users upload own payment proofs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users read own payment proofs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own payment proofs"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
