-- Тип кузова (Мусоровоз, Седан, Внедорожник и т.д.) — отдельно от body_color (цвет).
alter table public.listings
  add column if not exists body_type text;

create index if not exists listings_body_type_idx on public.listings (body_type);

comment on column public.listings.body_type is 'Тип кузова: Мусоровоз, Седан, Внедорожник и т.д. Не путать с body_color (цвет).';
