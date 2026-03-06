-- Aggregated market price analytics per listing.
-- Stores precomputed price bands so the Mini App can
-- render fast, high‑quality price analysis on the client.

create table if not exists public.listing_price_analysis (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  model_key text not null,
  market_low numeric not null,
  market_avg numeric not null,
  market_high numeric not null,
  sample_size integer not null,
  computed_at timestamptz not null default now()
);

create index if not exists listing_price_analysis_model_key_idx
  on public.listing_price_analysis (model_key);

create index if not exists listing_price_analysis_computed_at_idx
  on public.listing_price_analysis (computed_at desc);

alter table public.listing_price_analysis enable row level security;

drop policy if exists "Public can read listing_price_analysis" on public.listing_price_analysis;
create policy "Public can read listing_price_analysis"
on public.listing_price_analysis
for select
to anon, authenticated
using (true);

