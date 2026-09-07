create table if not exists desk_packs (
  id text primary key,
  token text not null unique,
  user_id text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists desk_packs_token_idx on desk_packs (token);
create index if not exists desk_packs_expires_idx on desk_packs (expires_at);
