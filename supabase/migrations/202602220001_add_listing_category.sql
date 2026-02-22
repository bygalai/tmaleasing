-- Add category column for filtering listings by section (legkovye, gruzovye, speztechnika, pricepy).
-- Format: source-specific slug. For VTB: legkovye, gruzovye, etc.
-- Existing rows get 'legkovye' to preserve current behavior.
alter table public.listings
  add column if not exists category text default 'legkovye';

create index if not exists listings_category_idx on public.listings (category);
create index if not exists listings_source_category_idx on public.listings (source, category);

comment on column public.listings.category is 'Section/category slug for filtering: legkovye, gruzovye, speztechnika, pricepy';
