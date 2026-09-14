-- Same discovery as 20260914000006_poster_gradient.sql, one page later: the channel
-- page passes channel.bannerGradient/avatarGradient straight into the same
-- gradient-indexing component, unconditionally. Same fix, same reasoning.
alter table organizations add column banner_gradient text[2];
alter table organizations add column avatar_gradient text[2];
update organizations set
  banner_gradient = array['#2A1B4D', '#0D1424'],
  avatar_gradient = array['#8B5CF6', '#4C2889']
where banner_gradient is null;
alter table organizations alter column banner_gradient set not null;
alter table organizations alter column avatar_gradient set not null;
