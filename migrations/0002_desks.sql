create table if not exists profiles (
  user_id text primary key,
  username text not null,
  username_key text not null unique,
  display_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists desks (
  user_id text primary key,
  symbols jsonb not null,
  selected text not null default '',
  board text not null default 'equity',
  notes jsonb not null default '{}'::jsonb,
  analyses jsonb not null default '{}'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  book_analysis jsonb,
  updated_at timestamptz not null default now()
);
