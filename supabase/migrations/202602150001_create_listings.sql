create extension if not exists pgcrypto;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  title text not null,
  price numeric,
  mileage numeric,
  year integer,
  images text[] not null default '{}',
  listing_url text,
  source text not null default 'vtb',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_source_idx on public.listings (source);
create index if not exists listings_price_idx on public.listings (price);
create index if not exists listings_year_idx on public.listings (year);

create or replace function public.set_listings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row
execute function public.set_listings_updated_at();

alter table public.listings enable row level security;

drop policy if exists "Public can read listings" on public.listings;
create policy "Public can read listings"
on public.listings
for select
to anon, authenticated
using (true);
