-- Roles enum
create type public.app_role as enum ('admin', 'user');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- has_role function (security definer to avoid RLS recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- App config singleton
create table public.app_config (
  id int primary key default 1,
  proxy_username text,
  proxy_passwd text,
  price_per_gb_usdt numeric(10,2) not null default 3.00,
  usdt_address text,
  usdt_network text default 'TRC20',
  updated_at timestamptz not null default now(),
  constraint app_config_singleton check (id = 1)
);
alter table public.app_config enable row level security;
insert into public.app_config (id) values (1) on conflict do nothing;

-- Proxy orders
create table public.proxy_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gb_amount int not null check (gb_amount > 0),
  cost_usdt numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  tx_hash text,
  -- 711proxy response fields
  order_no text,
  proxy_username text,
  proxy_passwd text,
  host text,
  port text,
  proto text,
  un text,
  expire text,
  un_flow text,
  api_response jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
alter table public.proxy_orders enable row level security;
create index idx_proxy_orders_user on public.proxy_orders(user_id);
create index idx_proxy_orders_status on public.proxy_orders(status);

-- RLS: profiles
create policy "users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "admins view all profiles" on public.profiles for select using (public.has_role(auth.uid(), 'admin'));
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

-- RLS: user_roles
create policy "users view own role" on public.user_roles for select using (auth.uid() = user_id);
create policy "admins view all roles" on public.user_roles for select using (public.has_role(auth.uid(), 'admin'));
create policy "admins manage roles" on public.user_roles for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- RLS: app_config (admin only)
create policy "admins read config" on public.app_config for select using (public.has_role(auth.uid(), 'admin'));
create policy "admins update config" on public.app_config for update using (public.has_role(auth.uid(), 'admin'));

-- RLS: proxy_orders
create policy "users view own orders" on public.proxy_orders for select using (auth.uid() = user_id);
create policy "admins view all orders" on public.proxy_orders for select using (public.has_role(auth.uid(), 'admin'));
create policy "users create own orders" on public.proxy_orders for insert with check (auth.uid() = user_id and status = 'pending');
create policy "admins update orders" on public.proxy_orders for update using (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when lower(new.email) = 'robelomor@yahoo.com' then 'admin'::public.app_role else 'user'::public.app_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();