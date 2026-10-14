-- Bus Bingo schema.
-- agencies: transit agencies (one per city/system). Only Edmonton today; add a
--   row here (and in src/lib/agencies.js) to support another city.
-- seen_buses: one row per user + agency + route. Un-seeing a bus sets
--   seen = false rather than deleting, so offline changes sync with
--   last-write-wins on updated_at (set by the client when the tap happened).

create table public.agencies (
	id text primary key,
	name text not null,
	city text not null,
	region text,
	country text,
	timezone text,
	routes_url text,
	created_at timestamptz not null default now()
);

alter table public.agencies enable row level security;

create policy "Agencies are readable by everyone"
	on public.agencies for select
	to anon, authenticated
	using (true);

insert into public.agencies (id, name, city, region, country, timezone, routes_url)
values (
	'ets',
	'Edmonton Transit Service',
	'Edmonton',
	'Alberta',
	'CA',
	'America/Edmonton',
	'https://data.edmonton.ca/resource/d577-xky7.json'
);

create table public.seen_buses (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	agency_id text not null references public.agencies (id),
	route_number text not null,
	seen boolean not null default true,
	seen_at timestamptz,
	updated_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	primary key (user_id, agency_id, route_number)
);

create index seen_buses_agency_id_idx on public.seen_buses (agency_id);

alter table public.seen_buses enable row level security;

create policy "Users can read their own seen buses"
	on public.seen_buses for select
	to authenticated
	using ((select auth.uid()) = user_id);

create policy "Users can add their own seen buses"
	on public.seen_buses for insert
	to authenticated
	with check ((select auth.uid()) = user_id);

create policy "Users can update their own seen buses"
	on public.seen_buses for update
	to authenticated
	using ((select auth.uid()) = user_id)
	with check ((select auth.uid()) = user_id);

create policy "Users can delete their own seen buses"
	on public.seen_buses for delete
	to authenticated
	using ((select auth.uid()) = user_id);

grant select on public.agencies to anon, authenticated;
grant select, insert, update, delete on public.seen_buses to authenticated;
