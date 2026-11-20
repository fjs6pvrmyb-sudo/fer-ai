insert into public.organizations (id, name, currency, scale, timezone) values
  ('10000000-0000-4000-8000-000000000001', 'Panadería Demo', 'CRC', 2, 'America/Costa_Rica'),
  ('10000000-0000-4000-8000-000000000002', 'Cafetería Demo', 'CRC', 2, 'America/Costa_Rica')
on conflict do nothing;

insert into public.products (id, organization_id, name) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Pan de masa madre'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Croissant de mantequilla'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Focaccia de romero'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Café filtrado'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Latte de vainilla')
on conflict do nothing;

insert into public.product_prices (id, organization_id, product_id, currency, scale, amount_minor)
select price.id::uuid, product.organization_id, product.id, 'CRC', 2, price.amount
from (values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 500000),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 220000),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 350000),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 180000),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 290000)
) price(id, product_id, amount)
join public.products product on product.id = price.product_id::uuid
on conflict do nothing;
