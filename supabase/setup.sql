create table if not exists public.unfold_user_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.unfold_user_workspace enable row level security;
revoke all on table public.unfold_user_workspace from anon, authenticated;
grant select, insert, update on table public.unfold_user_workspace to authenticated;

drop policy if exists "Users read their own Unfold workspace" on public.unfold_user_workspace;
create policy "Users read their own Unfold workspace"
on public.unfold_user_workspace for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own Unfold workspace" on public.unfold_user_workspace;
create policy "Users create their own Unfold workspace"
on public.unfold_user_workspace for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own Unfold workspace" on public.unfold_user_workspace;
create policy "Users update their own Unfold workspace"
on public.unfold_user_workspace for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.unfold_public_scene (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.unfold_public_scene enable row level security;
revoke all on table public.unfold_public_scene from anon, authenticated;
grant select on table public.unfold_public_scene to anon;
grant select, insert, update, delete on table public.unfold_public_scene to authenticated;

drop policy if exists "Anyone reads shared Unfold scenes" on public.unfold_public_scene;
create policy "Anyone reads shared Unfold scenes"
on public.unfold_public_scene for select to anon, authenticated
using (true);

drop policy if exists "Users create their own shared Unfold scenes" on public.unfold_public_scene;
create policy "Users create their own shared Unfold scenes"
on public.unfold_public_scene for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own shared Unfold scenes" on public.unfold_public_scene;
create policy "Users update their own shared Unfold scenes"
on public.unfold_public_scene for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own shared Unfold scenes" on public.unfold_public_scene;
create policy "Users delete their own shared Unfold scenes"
on public.unfold_public_scene for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('unfold-images', 'unfold-images', false, 52428800)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit)
values ('unfold-public-images', 'unfold-public-images', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "Users read their own Unfold images" on storage.objects;
create policy "Users read their own Unfold images"
on storage.objects for select to authenticated
using (bucket_id = 'unfold-images' and owner_id = (select auth.uid()::text));

drop policy if exists "Users upload their own Unfold images" on storage.objects;
create policy "Users upload their own Unfold images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'unfold-images' and
  (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users upload their own public Unfold images" on storage.objects;
create policy "Users upload their own public Unfold images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'unfold-public-images' and
  (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users update their own public Unfold images" on storage.objects;
create policy "Users update their own public Unfold images"
on storage.objects for update to authenticated
using (bucket_id = 'unfold-public-images' and owner_id = (select auth.uid()::text))
with check (
  bucket_id = 'unfold-public-images' and
  (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users delete their own public Unfold images" on storage.objects;
create policy "Users delete their own public Unfold images"
on storage.objects for delete to authenticated
using (bucket_id = 'unfold-public-images' and owner_id = (select auth.uid()::text));

drop policy if exists "Users update their own Unfold images" on storage.objects;
create policy "Users update their own Unfold images"
on storage.objects for update to authenticated
using (bucket_id = 'unfold-images' and owner_id = (select auth.uid()::text))
with check (
  bucket_id = 'unfold-images' and
  (storage.foldername(name))[1] = (select auth.uid()::text)
);
