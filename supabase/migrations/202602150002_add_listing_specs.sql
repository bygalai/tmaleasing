alter table public.listings
  add column if not exists city text,
  add column if not exists vin text,
  add column if not exists engine text,
  add column if not exists transmission text,
  add column if not exists drivetrain text,
  add column if not exists body_color text;

create index if not exists listings_city_idx on public.listings (city);
create index if not exists listings_vin_idx on public.listings (vin);