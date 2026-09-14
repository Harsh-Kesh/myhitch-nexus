-- Found by actually clicking through the app after swapping searchVideos(), not by
-- static review: VideoCard passes `posterGradient` straight into <Poster gradient={...}>,
-- which indexes gradient[0]/gradient[1] unconditionally with no fallback — omitting it
-- (as the original catalogue migration deliberately did, judging it purely cosmetic) was
-- wrong; it's load-bearing UI, not decoration, and its absence crashes every list render.
-- Same seeded-snapshot treatment as everything else: real values from the mock dataset.
alter table videos add column poster_gradient text[2];
update videos set poster_gradient = array['#3B2F6B', '#0B1020'] where poster_gradient is null;
alter table videos alter column poster_gradient set not null;
