alter table desks add column if not exists book_scope text not null default 'all';
alter table desks add column if not exists book_symbols jsonb not null default '[]'::jsonb;
