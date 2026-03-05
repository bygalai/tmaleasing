-- Старая цена (до скидки) для отображения зачёркнутой в Mini App.
alter table public.listings
  add column if not exists original_price numeric;

create index if not exists listings_original_price_idx on public.listings (original_price) where original_price is not null;
