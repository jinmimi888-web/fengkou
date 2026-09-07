-- Articles (user publishing) + optional admin role on Better Auth user.

alter table "user" add column if not exists role text not null default 'user';

create table if not exists articles (
  id text primary key,
  user_id text not null,
  title text not null,
  slug text not null,
  summary text not null default '',
  body text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz
);

create unique index if not exists articles_slug_alive_idx
  on articles (slug) where deleted_at is null;

create index if not exists articles_user_alive_idx
  on articles (user_id) where deleted_at is null;

create index if not exists articles_published_idx
  on articles (published_at desc)
  where deleted_at is null and status = 'published';
