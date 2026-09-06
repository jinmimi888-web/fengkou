create table if not exists password_resets (
  id text primary key,
  user_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists password_resets_user_id_idx on password_resets (user_id);
create index if not exists password_resets_expires_idx on password_resets (expires_at);
