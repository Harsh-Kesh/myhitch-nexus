-- Sub-category seed for the new 'music'/'podcast' content types (20260922000001), same
-- flat-per-vertical shape and density as 20260916000001_expand_categories.sql. No
-- image_url, matching that migration's own precedent — only the original 15 mock-seeded
-- categories carry real artwork; every category added by a migration since has gone
-- without one, and the browse UI already tolerates a missing image_url.
insert into categories (slug, name, description, content_type, accent_token) values
  -- ── music ──────────────────────────────────────────────────────────────────
  ('singles-and-eps', 'Singles & EPs', 'New tracks and short releases from independent and signed artists.', 'music', 6),
  ('albums', 'Albums', 'Full-length releases, grouped as playlists by the uploading artist.', 'music', 2),
  ('live-performances', 'Live performances', 'Live sets, sessions and concert recordings.', 'music', 1),
  ('remixes-and-mashups', 'Remixes & mashups', null, 'music', 3),
  ('hip-hop-rap', 'Hip-hop & rap', null, 'music', 4),
  ('pop', 'Pop', null, 'music', 5),
  ('rock-and-alternative', 'Rock & alternative', null, 'music', 2),
  ('electronic-and-dance', 'Electronic & dance', null, 'music', 6),
  ('rnb-and-soul', 'R&B & soul', null, 'music', 1),
  ('afrobeats', 'Afrobeats', null, 'music', 3),

  -- ── podcast ────────────────────────────────────────────────────────────────
  ('interviews-and-conversations', 'Interviews & conversations', 'Long-form conversation and interview shows.', 'podcast', 3),
  ('true-crime', 'True crime', 'Investigative and true-crime audio series.', 'podcast', 5),
  ('comedy-podcasts', 'Comedy', null, 'podcast', 2),
  ('news-and-commentary', 'News & commentary', null, 'podcast', 4),
  ('business-and-finance-podcasts', 'Business & finance', null, 'podcast', 1),
  ('health-and-wellness-podcasts', 'Health & wellness', null, 'podcast', 6),
  ('education-podcasts', 'Education', null, 'podcast', 3),
  ('storytelling-and-fiction', 'Storytelling & fiction', null, 'podcast', 5),
  ('sports-podcasts', 'Sports', null, 'podcast', 2),
  ('technology-podcasts', 'Technology', null, 'podcast', 4)
on conflict (slug) do nothing;
