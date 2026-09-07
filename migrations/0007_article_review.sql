-- Article review workflow: reject_reason + status values draft|pending|published|rejected.

alter table articles add column if not exists reject_reason text;

-- Optional check: allow existing draft/published; add pending/rejected for review.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'articles_status_check'
  ) then
    alter table articles
      add constraint articles_status_check
      check (status in ('draft', 'pending', 'published', 'rejected'));
  end if;
end $$;

-- Index pending queue for admin review queue.
create index if not exists articles_pending_idx
  on articles (updated_at desc)
  where deleted_at is null and status = 'pending';
