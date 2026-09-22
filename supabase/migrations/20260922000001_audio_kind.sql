-- Music/audio & podcasts, first real slice (DEC-16, docs/DEVELOPMENT-PLAN.md §11). Audio
-- content lives in the existing `videos` table rather than a parallel one — video_rights/
-- video_pricing/video_categories/video_tags/video_credits are already generic and FK to
-- videos(id), copyright_cases.video_id is a hard FK to videos(id), moderation_queue/
-- audit_log are already untyped-id generic, and subscription access-checking is purely
-- plan-status based with no content-shape awareness — reusing this table means none of
-- that integration surface needs to change. `kind` (asset format) is deliberately
-- separate from `content_type` (genre/vertical, unchanged in meaning): a music track and
-- a podcast episode are both kind='audio', just different content_type verticals.
alter table videos add column kind text not null default 'video' check (kind in ('video', 'audio'));

-- video_quality_levels (the pixel-height transcode ladder) and video_audio_tracks
-- (alternate-language dub tracks alongside a picture track) stay video-only and simply
-- go unpopulated for audio rows — neither needs a schema change.

alter table videos drop constraint videos_content_type_check;
alter table videos add constraint videos_content_type_check check (content_type in (
  'commercial', 'film', 'entertainment', 'education', 'news', 'documentary', 'live',
  'tourism', 'government', 'nonprofit', 'user-generated', 'music', 'podcast'
));

alter table categories drop constraint categories_content_type_check;
alter table categories add constraint categories_content_type_check check (content_type in (
  'commercial', 'film', 'entertainment', 'education', 'news', 'documentary', 'live',
  'tourism', 'government', 'nonprofit', 'user-generated', 'music', 'podcast'
));
