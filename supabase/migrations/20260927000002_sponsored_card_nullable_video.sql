-- Allow standalone ad impressions (e.g. sponsored-card in discovery rails) where no video is attached
alter table ad_impressions alter column video_id drop not null;
alter table ad_impressions alter column channel_id drop not null;
