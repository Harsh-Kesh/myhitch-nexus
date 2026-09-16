-- Expands the upload/browse category taxonomy from 15 sub-categories (roughly one or two
-- per content type) to a genuinely comprehensive list, per the boss's request and the
-- research pass behind it (docs/DEVELOPMENT-PLAN.md — Categories research, 2026-09-16).
--
-- Shape follows what that research found every real platform converging on: a small,
-- flat, multi-select list per vertical (TMDB caps genre selection at 2-3 from a flat
-- 19-entry list; Vimeo caps at 2 categories + 1 sub-category) rather than a deep nested
-- tree — so this stays flat under each of the 11 real content_type values (the client's
-- 10 §5 verticals, with "News and documentaries" split into the schema's existing
-- 'news'/'documentary' types), adding to the existing 15 rather than restructuring them
-- (existing rows stay untouched — they're already linked to seeded videos via
-- video_categories, so renaming/removing any of them would orphan real data).
--
-- Deliberately NOT hierarchical (no parent_id): the research found no real platform asks
-- an uploader to navigate a multi-level tree in a picklist, and the current schema's flat
-- (content_type, category) shape already supports everything here with no migration risk.
-- What would have been a third tier in the research report (e.g. Feature Films > Drama)
-- is flattened into its own entry under the parent vertical instead, matching TMDB's own
-- flat-genre-list convention.
--
-- IAB/IPTC mapping (for future ad-targeting/brand-safety use) is deliberately NOT modelled
-- here — the research flagged that as a backend-only concern for when programmatic
-- advertising exists, not something to bolt onto the schema speculatively now.

insert into categories (slug, name, description, content_type, accent_token) values
  -- ── commercial (existing: brand-films, product-launches) ──────────────────
  ('corporate-campaigns', 'Corporate campaigns', 'Company overviews, culture films and internal comms.', 'commercial', 2),
  ('tv-commercials', 'TV & streaming commercials', 'Broadcast and streaming ad spots.', 'commercial', 3),
  ('social-ad-cutdowns', 'Social & digital ads', 'Short-form cutdowns built for social placements.', 'commercial', 4),
  ('retail-ecommerce', 'Retail & e-commerce', 'Product showcases and shoppable video.', 'commercial', 6),
  ('real-estate-marketing', 'Real estate marketing', 'Property walkthroughs and development showcases.', 'commercial', 1),
  ('automotive-ads', 'Automotive advertising', 'Vehicle launches, reviews and dealership campaigns.', 'commercial', 2),
  ('testimonials-case-studies', 'Testimonials & case studies', 'Client success stories and social proof.', 'commercial', 3),
  ('recruitment-employer-branding', 'Recruitment & employer branding', 'Careers pages and hiring campaigns.', 'commercial', 4),
  ('sponsored-branded-content', 'Sponsorship & branded content', 'Paid placements and brand partnerships — must carry sponsorship disclosure.', 'commercial', 5),

  -- ── film (existing: feature-films, short-films) ───────────────────────────
  ('drama', 'Drama', null, 'film', 1),
  ('comedy-film', 'Comedy', null, 'film', 2),
  ('action-adventure', 'Action & adventure', null, 'film', 3),
  ('horror', 'Horror', null, 'film', 4),
  ('thriller', 'Thriller', null, 'film', 5),
  ('sci-fi-fantasy', 'Sci-fi & fantasy', null, 'film', 6),
  ('romance-film', 'Romance', null, 'film', 1),
  ('animation-film', 'Animation', null, 'film', 2),
  ('independent-festival-films', 'Independent & festival films', null, 'film', 3),
  ('trailers-teasers', 'Trailers & teasers', null, 'film', 4),
  ('behind-the-scenes', 'Behind the scenes & making-of', null, 'film', 5),
  ('web-series-micro-drama', 'Web series & micro-dramas', null, 'film', 6),
  ('international-cinema', 'International & foreign-language', null, 'film', 1),

  -- ── entertainment (existing: music, series) ───────────────────────────────
  ('comedy-sketch', 'Comedy & sketch', null, 'entertainment', 3),
  ('lifestyle-vlogs', 'Lifestyle & vlogs', null, 'entertainment', 4),
  ('reality-unscripted', 'Reality & unscripted', null, 'entertainment', 5),
  ('celebrity-pop-culture', 'Celebrity & pop culture', null, 'entertainment', 1),
  ('gaming-esports', 'Gaming & esports', null, 'entertainment', 2),
  ('fashion-beauty', 'Fashion & beauty', null, 'entertainment', 3),
  ('food-cooking', 'Food & cooking', null, 'entertainment', 4),
  ('podcasts-video', 'Podcasts', null, 'entertainment', 5),
  ('animation-cartoons', 'Animation & cartoons', null, 'entertainment', 6),
  ('talk-shows-interviews', 'Talk shows & interviews', null, 'entertainment', 1),

  -- ── education (existing: courses, skills) ─────────────────────────────────
  ('business-management-ed', 'Business & management', null, 'education', 2),
  ('technology-it-ed', 'Technology & IT', null, 'education', 3),
  ('health-medicine-ed', 'Health & medicine', null, 'education', 4),
  ('arts-humanities-ed', 'Arts & humanities', null, 'education', 5),
  ('science-engineering-ed', 'Science & engineering', null, 'education', 6),
  ('law-social-sciences-ed', 'Law & social sciences', null, 'education', 1),
  ('tutorials-howto-ed', 'Tutorials & how-to', null, 'education', 2),
  ('certification-prep', 'Professional development & certification', null, 'education', 3),
  ('workplace-compliance-training', 'Workplace & compliance training', null, 'education', 4),
  ('academic-lectures', 'Academic lectures & seminars', null, 'education', 5),
  ('language-learning', 'Language learning', null, 'education', 6),
  ('k12-education', 'K-12 education', null, 'education', 1),
  ('webinars-panels-ed', 'Webinars & panels', null, 'education', 2),

  -- ── news (existing: news-bulletins) ────────────────────────────────────────
  ('breaking-news', 'Breaking news & reports', null, 'news', 3),
  ('interviews-news', 'Interviews', null, 'news', 4),
  ('investigative-journalism', 'Investigative journalism', null, 'news', 5),
  ('current-affairs-panels', 'Current affairs & panels', null, 'news', 6),
  ('local-regional-news', 'Local & regional news', null, 'news', 1),

  -- ── documentary (existing: investigations) ─────────────────────────────────
  ('doc-social-issue', 'Social issue documentaries', null, 'documentary', 2),
  ('doc-nature-environment', 'Nature & environment documentaries', null, 'documentary', 3),
  ('doc-history-biography', 'History & biography documentaries', null, 'documentary', 4),
  ('doc-science-tech', 'Science & technology documentaries', null, 'documentary', 6),
  ('doc-true-crime', 'True crime documentaries', null, 'documentary', 1),

  -- ── live (existing: conferences) ───────────────────────────────────────────
  ('concerts-festivals', 'Concerts & festivals', null, 'live', 2),
  ('sports-live', 'Sports — live & highlights', null, 'live', 3),
  ('religious-faith-events', 'Religious & faith events', null, 'live', 4),
  ('live-product-launches', 'Product launches', null, 'live', 5),
  ('award-shows', 'Award shows', null, 'live', 6),
  ('community-cultural-festivals', 'Community & cultural festivals', null, 'live', 1),
  ('webcasts-livestreams', 'Webcasts & livestreams', null, 'live', 3),
  ('weddings-celebrations', 'Weddings & private celebrations', null, 'live', 4),

  -- ── tourism (existing: destinations) ────────────────────────────────────────
  ('hotel-accommodation', 'Hotel & accommodation showcases', null, 'tourism', 1),
  ('travel-programmes', 'Travel programmes & series', null, 'tourism', 2),
  ('adventure-outdoor-tourism', 'Adventure & outdoor tourism', null, 'tourism', 4),
  ('culinary-wine-tourism', 'Culinary & wine tourism', null, 'tourism', 5),
  ('cultural-heritage-tourism', 'Cultural & heritage tourism', null, 'tourism', 6),
  ('cruise-transport-experiences', 'Cruise & transport experiences', null, 'tourism', 1),
  ('event-tourism', 'Event tourism', null, 'tourism', 2),
  ('aerial-drone-tourism', 'Aerial & drone destination footage', null, 'tourism', 4),

  -- ── government (existing: public-notices) ─────────────────────────────────
  ('awareness-campaigns-gov', 'Awareness campaigns', null, 'government', 1),
  ('civic-education', 'Civic education', null, 'government', 3),
  ('council-updates', 'Council & local government updates', null, 'government', 4),
  ('emergency-preparedness', 'Emergency & disaster preparedness', null, 'government', 5),
  ('public-consultation', 'Public consultation & engagement', null, 'government', 6),
  ('indigenous-community-content', 'Cultural & Indigenous community content', null, 'government', 1),

  -- ── nonprofit (existing: impact) ────────────────────────────────────────────
  ('fundraising-appeals', 'Fundraising appeals & stories', null, 'nonprofit', 1),
  ('project-updates-nonprofit', 'Project updates & field reports', null, 'nonprofit', 2),
  ('donor-impact-reporting', 'Donor & impact reporting', null, 'nonprofit', 3),
  ('volunteer-advocacy', 'Volunteer & advocacy stories', null, 'nonprofit', 4),
  ('environmental-sustainability', 'Environmental & sustainability', null, 'nonprofit', 5),
  ('humanitarian-response', 'Humanitarian & emergency response', null, 'nonprofit', 2),

  -- ── user-generated (existing: creators) ─────────────────────────────────────
  ('reviews-unboxings', 'Reviews & unboxings', null, 'user-generated', 2),
  ('commentary-reaction', 'Commentary & reaction', null, 'user-generated', 3),
  ('ugc-tutorials-howto', 'Tutorials & how-to', null, 'user-generated', 4),
  ('challenges-trends', 'Challenges & trends', null, 'user-generated', 5),
  ('fan-content-tribute', 'Fan content & tribute', null, 'user-generated', 6),
  ('personal-livestreams', 'Live streams', null, 'user-generated', 2)
on conflict (slug) do nothing;
