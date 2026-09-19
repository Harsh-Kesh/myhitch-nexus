-- Real creator analytics (FR-6.9) read watch_progress grouped by video and bucketed by
-- date across a whole channel's videos — the existing primary key (account_id,
-- video_id) doesn't help either of those access patterns. Read-only additions, no
-- schema/data change.
create index watch_progress_video_id_idx on watch_progress(video_id);
create index watch_progress_updated_at_idx on watch_progress(updated_at);
