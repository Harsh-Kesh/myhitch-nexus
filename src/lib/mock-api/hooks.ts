"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import * as api from "./index";
import type {
  AnalyticsRange,
  Campaign,
  Category,
  Channel,
  LiveEvent,
  ModerationAction,
  ModerationItem,
  Organisation,
  PlatformConfigTables,
  SearchFilters,
  User,
  Video,
  VideoDraft,
} from "./types";

/**
 * Query keys are namespaced by resource so a mutation can invalidate exactly
 * what it affects — e.g. actioning a moderation item refreshes the queue, the
 * audit log and the affected video without touching anything else.
 */
export const qk = {
  featured: ["featured"] as const,
  search: (filters: SearchFilters) => ["search", filters] as const,
  video: (id: string) => ["video", id] as const,
  related: (id: string) => ["related", id] as const,
  categories: ["categories"] as const,
  category: (slug: string) => ["category", slug] as const,
  channel: (id: string) => ["channel", id] as const,
  channels: ["channels"] as const,
  channelVideos: (id: string, all?: boolean) => ["channel-videos", id, all] as const,
  following: ["following"] as const,
  entitlement: (videoId: string) => ["entitlement", videoId] as const,
  requestCountry: ["request-country"] as const,
  comments: (videoId: string) => ["comments", videoId] as const,
  moderationComments: (channelId: string) => ["moderation-comments", channelId] as const,
  myRating: (videoId: string) => ["my-rating", videoId] as const,
  watchlist: ["watchlist"] as const,
  continueWatching: ["continue-watching"] as const,
  watchProgress: (videoId: string) => ["watch-progress", videoId] as const,
  liveEvents: (status?: LiveEvent["status"]) => ["live-events", status] as const,
  liveEvent: (id: string) => ["live-event", id] as const,
  channelLive: (id: string) => ["channel-live", id] as const,
  chat: (id: string) => ["chat", id] as const,
  polls: (id: string) => ["polls", id] as const,
  upload: (id: string) => ["upload", id] as const,
  thumbnails: (id: string) => ["thumbnails", id] as const,
  bulkImport: ["bulk-import"] as const,
  playlists: (channelId: string) => ["playlists", channelId] as const,
  playlist: (id: string) => ["playlist", id] as const,
  series: (channelId?: string) => ["series", channelId] as const,
  seriesDetail: (seriesId: string) => ["series-detail", seriesId] as const,
  analytics: (channelId: string, range: AnalyticsRange) =>
    ["analytics", channelId, range] as const,
  revenue: (channelId: string) => ["revenue", channelId] as const,
  campaigns: (advertiserId?: string) => ["campaigns", advertiserId] as const,
  campaign: (id: string) => ["campaign", id] as const,
  campaignSeries: (id: string) => ["campaign-series", id] as const,
  leads: (channelId: string) => ["leads", channelId] as const,
  productLinks: (channelId: string) => ["product-links", channelId] as const,
  adminSummary: ["admin-summary"] as const,
  moderationQueue: (queue?: ModerationItem["queue"]) => ["moderation-queue", queue] as const,
  auditLog: (filters?: Record<string, unknown>) => ["audit-log", filters] as const,
  adminUsers: ["admin-users"] as const,
  organisations: ["organisations"] as const,
  cases: ["cases"] as const,
  config: ["platform-config"] as const,
  user: ["current-user"] as const,
  purchases: ["purchases"] as const,
  subscriptions: ["subscriptions"] as const,
  notifications: ["notifications"] as const,
  myMagazineArticles: ["my-magazine-articles"] as const,
  magazineArticle: (id: string) => ["magazine-article", id] as const,
  mySponsorshipListings: ["my-sponsorship-listings"] as const,
  sponsorshipListing: (id: string) => ["sponsorship-listing", id] as const,
  organizationVerification: (organizationId: string) => ["organization-verification", organizationId] as const,
  verificationDocuments: (organizationId: string) => ["verification-documents", organizationId] as const,
};

type Opts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

/* ----------------------------- Discovery ------------------------------- */

export const useFeaturedContent = () =>
  useQuery({ queryKey: qk.featured, queryFn: api.getFeaturedContent });

export const useSearchVideos = (filters: SearchFilters, opts?: Opts<Awaited<ReturnType<typeof api.searchVideos>>>) =>
  useQuery({
    queryKey: qk.search(filters),
    queryFn: () => api.searchVideos(filters),
    ...opts,
  });

export const useVideo = (id: string) =>
  useQuery({ queryKey: qk.video(id), queryFn: () => api.getVideo(id), enabled: Boolean(id) });

export const useRelatedVideos = (id: string) =>
  useQuery({
    queryKey: qk.related(id),
    queryFn: () => api.getRelatedVideos(id),
    enabled: Boolean(id),
  });

export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: api.getCategories });

export const useCategory = (slug: string) =>
  useQuery({ queryKey: qk.category(slug), queryFn: () => api.getCategory(slug) });

/* ------------------------------ Channels -------------------------------- */

export const useChannel = (id: string) =>
  useQuery({ queryKey: qk.channel(id), queryFn: () => api.getChannel(id), enabled: Boolean(id) });

export const useChannels = () =>
  useQuery({ queryKey: qk.channels, queryFn: api.getChannels });

export function useUpdateChannel(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Channel>) => api.updateChannel(id, patch),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.channel(id) });
      client.invalidateQueries({ queryKey: qk.channels });
    },
  });
}

export const useChannelVideos = (channelId: string, includeUnpublished = false) =>
  useQuery({
    queryKey: qk.channelVideos(channelId, includeUnpublished),
    queryFn: () => api.getChannelVideos(channelId, { includeUnpublished }),
    enabled: Boolean(channelId),
  });

export function useToggleFollow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.toggleFollow,
    // Optimistic so the follow button and the channel's own follower count
    // (a separate query, qk.channel — not covered by invalidating qk.following)
    // update instantly instead of waiting on a round trip + refetch.
    onMutate: async (channelId: string) => {
      const followingKey = [...qk.following, channelId];
      await client.cancelQueries({ queryKey: followingKey });
      await client.cancelQueries({ queryKey: qk.channel(channelId) });
      const previousFollowing = client.getQueryData<boolean>(followingKey);
      const previousChannel = client.getQueryData<Channel>(qk.channel(channelId));
      const nextFollowing = !previousFollowing;
      client.setQueryData(followingKey, nextFollowing);
      if (previousChannel) {
        client.setQueryData(qk.channel(channelId), {
          ...previousChannel,
          followers: previousChannel.followers + (nextFollowing ? 1 : -1),
        });
      }
      return { previousFollowing, previousChannel };
    },
    onError: (_err, channelId, context) => {
      if (!context) return;
      client.setQueryData([...qk.following, channelId], context.previousFollowing);
      if (context.previousChannel) client.setQueryData(qk.channel(channelId), context.previousChannel);
    },
    onSettled: (_data, _err, channelId) => {
      client.invalidateQueries({ queryKey: qk.following });
      client.invalidateQueries({ queryKey: qk.featured });
      client.invalidateQueries({ queryKey: qk.channel(channelId) });
    },
  });
}

export const useIsFollowing = (channelId: string) =>
  useQuery({
    queryKey: [...qk.following, channelId],
    queryFn: () => api.isFollowing(channelId),
    enabled: Boolean(channelId),
  });

/* ---------------------------- Entitlement ------------------------------- */

// userId defaults to the mock viewer id — real callers pass the real signed-in
// account's id (video-client.tsx does, from useCurrentUser()) so a real video's
// entitlement check in mock-api/index.ts's getEntitlement() actually queries against
// the right account instead of a hardcoded mock id that can never own anything real.
// `ready` defaults to true for every other caller of this hook; video-client.tsx passes
// `!isCurrentUserLoading` so this never fires (and caches) with the default userId
// before the real one is known — qk.entitlement() doesn't key on userId, so a query
// that already ran with the wrong id wouldn't otherwise refetch once the real one
// arrives (the same hydration-ordering gap admin-shell.tsx hit — see its own comment).
export const useEntitlement = (videoId: string, userId = "usr_viewer", ready = true) =>
  useQuery({
    queryKey: qk.entitlement(videoId),
    queryFn: () => api.getEntitlement(userId, videoId),
    enabled: Boolean(videoId) && ready,
  });

export const useRequestCountry = () =>
  useQuery({ queryKey: qk.requestCountry, queryFn: api.getRequestCountry });

export function useSetRequestCountry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.setRequestCountry,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.requestCountry });
      client.invalidateQueries({ queryKey: ["entitlement"] });
    },
  });
}

export function useStartSubscription() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      plan,
      interval,
    }: {
      plan: "premium" | "family" | "business";
      interval?: "month" | "year";
    }) => api.startSubscription(plan, interval),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.subscriptions });
      client.invalidateQueries({ queryKey: ["entitlement"] });
    },
  });
}

/* ------------------------------ Playback -------------------------------- */

export const useWatchProgress = (videoId: string) =>
  useQuery({
    queryKey: qk.watchProgress(videoId),
    queryFn: () => api.getWatchProgress(videoId),
    enabled: Boolean(videoId),
  });

export const useContinueWatching = () =>
  useQuery({ queryKey: qk.continueWatching, queryFn: api.getContinueWatching });

export function useSaveWatchProgress() {
  return useMutation({
    mutationFn: ({
      videoId,
      position,
      duration,
    }: {
      videoId: string;
      position: number;
      duration: number;
    }) => api.saveWatchProgress(videoId, position, duration),
  });
}

/* ------------------------------- Social --------------------------------- */

export const useComments = (videoId: string) =>
  useQuery({
    queryKey: qk.comments(videoId),
    queryFn: () => api.getComments(videoId),
    enabled: Boolean(videoId),
  });

export function usePostComment(videoId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.postComment(videoId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.comments(videoId) }),
  });
}

export function useReplyToComment(videoId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      api.replyToComment(commentId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.comments(videoId) }),
  });
}

export const useModerationComments = (channelId: string) =>
  useQuery({
    queryKey: qk.moderationComments(channelId),
    queryFn: () => api.getModerationComments(channelId),
    enabled: Boolean(channelId),
  });

export function useModerateComment(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      action,
    }: {
      commentId: string;
      action: "publish" | "hold" | "remove" | "pin" | "heart";
    }) => api.moderateComment(commentId, action),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.moderationComments(channelId) });
      client.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}

export const useMyRating = (videoId: string) =>
  useQuery({
    queryKey: qk.myRating(videoId),
    queryFn: () => api.getMyRating(videoId),
    enabled: Boolean(videoId),
  });

export function useRateVideo(videoId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (stars: 1 | 2 | 3 | 4 | 5) => api.rateVideo(videoId, stars),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.myRating(videoId) });
      client.invalidateQueries({ queryKey: qk.video(videoId) });
    },
  });
}

export function useLikeVideo(videoId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.likeVideo(videoId),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.video(videoId) }),
  });
}

export const useWatchlist = () =>
  useQuery({ queryKey: qk.watchlist, queryFn: api.getWatchlist });

export function useToggleWatchlist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.toggleWatchlist,
    // Optimistic — the quick-add button on a card and the main button on the video
    // page both derive "in watchlist" purely from membership in this cached list, so
    // flipping membership here updates them instantly instead of waiting on the
    // server round trip + refetch. The added placeholder only needs `id` to satisfy
    // that membership check; onSettled's invalidate replaces it with the real row
    // (with poster/title/etc.) as soon as the request completes.
    onMutate: async (videoId: string) => {
      await client.cancelQueries({ queryKey: qk.watchlist });
      const previous = client.getQueryData<Video[]>(qk.watchlist);
      client.setQueryData<Video[]>(qk.watchlist, (current = []) => {
        const exists = current.some((item) => item.id === videoId);
        if (exists) return current.filter((item) => item.id !== videoId);
        return [...current, { id: videoId } as unknown as Video];
      });
      return { previous };
    },
    onError: (_err, _videoId, context) => {
      if (context?.previous) client.setQueryData(qk.watchlist, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.watchlist }),
  });
}

/* -------------------------------- Live ---------------------------------- */

export const useLiveEvents = (status?: LiveEvent["status"]) =>
  useQuery({ queryKey: qk.liveEvents(status), queryFn: () => api.getLiveEvents(status) });

export const useLiveEvent = (id: string) =>
  useQuery({ queryKey: qk.liveEvent(id), queryFn: () => api.getLiveEvent(id), enabled: Boolean(id) });

export const useChannelLiveEvents = (channelId: string) =>
  useQuery({
    queryKey: qk.channelLive(channelId),
    queryFn: () => api.getChannelLiveEvents(channelId),
    enabled: Boolean(channelId),
  });

export function useCreateLiveEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createLiveEvent,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["live-events"] });
      client.invalidateQueries({ queryKey: ["channel-live"] });
    },
  });
}

export function useRegenerateStreamKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.regenerateStreamKey,
    onSuccess: () => client.invalidateQueries({ queryKey: ["live-event"] }),
  });
}

export function usePublishReplay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.publishReplay,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["live-event"] });
      client.invalidateQueries({ queryKey: ["live-events"] });
      client.invalidateQueries({ queryKey: ["channel-videos"] });
      client.invalidateQueries({ queryKey: qk.auditLog() });
    },
  });
}

export function useEndLiveEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.endLiveEvent,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["live-event"] });
      client.invalidateQueries({ queryKey: ["live-events"] });
    },
  });
}

export const useChatMessages = (eventId: string) =>
  useQuery({
    queryKey: qk.chat(eventId),
    queryFn: () => api.getChatMessages(eventId),
    enabled: Boolean(eventId),
  });

export function useSendChatMessage(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.sendChatMessage(eventId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.chat(eventId) }),
  });
}

export function useModerateChatMessage(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      action,
    }: {
      messageId: string;
      action: "hold" | "remove" | "restore";
    }) => api.moderateChatMessage(messageId, action),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.chat(eventId) }),
  });
}

export const usePolls = (eventId: string) =>
  useQuery({ queryKey: qk.polls(eventId), queryFn: () => api.getPolls(eventId), enabled: Boolean(eventId) });

export function useVotePoll(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      api.votePoll(pollId, optionId),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.polls(eventId) }),
  });
}

/* ------------------------------ Uploads --------------------------------- */

export const useThumbnailSuggestions = (sessionId: string) =>
  useQuery({
    queryKey: qk.thumbnails(sessionId),
    queryFn: () => api.getThumbnailSuggestions(sessionId),
    enabled: Boolean(sessionId),
  });

export const useBulkImport = (enabled: boolean) =>
  useQuery({ queryKey: qk.bulkImport, queryFn: () => api.validateBulkImport(), enabled });

export function useCreateStudioUpload() {
  return useMutation({
    mutationFn: ({ channelId, fileName, fileSizeBytes }: { channelId: string; fileName: string; fileSizeBytes: number }) =>
      api.createStudioUploadUrl(channelId, fileName, fileSizeBytes),
  });
}

export function useUploadThumbnailFile() {
  return useMutation({
    mutationFn: ({ channelId, file }: { channelId: string; file: File }) => api.uploadThumbnailFile(channelId, file),
  });
}

export function useSuggestedThumbnails() {
  return useMutation({
    mutationFn: ({ channelId, masterAssetPath }: { channelId: string; masterAssetPath: string }) =>
      api.getSuggestedThumbnails(channelId, masterAssetPath),
  });
}

export function usePublishDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: VideoDraft) => api.publishDraft(draft),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["channel-videos"] });
      client.invalidateQueries({ queryKey: ["moderation-queue"] });
      client.invalidateQueries({ queryKey: qk.adminSummary });
      client.invalidateQueries({ queryKey: qk.auditLog() });
      client.invalidateQueries({ queryKey: ["search"] });
    },
  });
}

export function useUpdateVideoStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ videoId, status }: { videoId: string; status: Parameters<typeof api.updateVideoStatus>[1] }) =>
      api.updateVideoStatus(videoId, status),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["channel-videos"] });
      client.invalidateQueries({ queryKey: ["video"] });
      client.invalidateQueries({ queryKey: qk.auditLog() });
    },
  });
}

/* ---------------------------- Collections ------------------------------- */

export const usePlaylists = (channelId: string) =>
  useQuery({
    queryKey: qk.playlists(channelId),
    queryFn: () => api.getPlaylists(channelId),
    enabled: Boolean(channelId),
  });

export const usePlaylist = (id: string) =>
  useQuery({ queryKey: qk.playlist(id), queryFn: () => api.getPlaylist(id), enabled: Boolean(id) });

export function useCreatePlaylist(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createPlaylist,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.playlists(channelId) }),
  });
}

export function useUpdatePlaylist(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updatePlaylist>[1] }) =>
      api.updatePlaylist(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.playlists(channelId) }),
  });
}

export const useSeries = (channelId?: string) =>
  useQuery({ queryKey: qk.series(channelId), queryFn: () => api.getSeries(channelId) });

export function useCreateSeries(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ title, description }: { title: string; description: string }) =>
      api.createSeries(channelId, title, description),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.series(channelId) }),
  });
}

export const useSeriesDetail = (seriesId: string) =>
  useQuery({
    queryKey: qk.seriesDetail(seriesId),
    queryFn: () => api.getSeriesDetail(seriesId),
    enabled: Boolean(seriesId),
  });

/* ----------------------------- Analytics -------------------------------- */

export const useCreatorAnalytics = (channelId: string, range: AnalyticsRange = "28d") =>
  useQuery({
    queryKey: qk.analytics(channelId, range),
    queryFn: () => api.getCreatorAnalytics(channelId, range),
    enabled: Boolean(channelId),
  });

export const useRevenueSummary = (channelId: string) =>
  useQuery({
    queryKey: qk.revenue(channelId),
    queryFn: () => api.getRevenueSummary(channelId),
    enabled: Boolean(channelId),
  });

export const useCampaignSeries = (campaignId: string) =>
  useQuery({
    queryKey: qk.campaignSeries(campaignId),
    queryFn: () => api.getCampaignSeries(campaignId),
    enabled: Boolean(campaignId),
  });

/* ---------------------------- Advertising ------------------------------- */

export const useCampaigns = (advertiserId?: string) =>
  useQuery({ queryKey: qk.campaigns(advertiserId), queryFn: () => api.getCampaigns(advertiserId) });

export const useCampaign = (id: string) =>
  useQuery({ queryKey: qk.campaign(id), queryFn: () => api.getCampaign(id), enabled: Boolean(id) });

export function useCreateCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.createCampaign>[0]) =>
      api.createCampaign(payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["campaigns"] });
      client.invalidateQueries({ queryKey: ["moderation-queue"] });
      client.invalidateQueries({ queryKey: qk.adminSummary });
      client.invalidateQueries({ queryKey: qk.auditLog() });
    },
  });
}

export function useUpdateCampaignStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: Campaign["status"]; reason?: string }) =>
      api.updateCampaignStatus(id, status, reason),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["campaigns"] });
      client.invalidateQueries({ queryKey: ["campaign"] });
      client.invalidateQueries({ queryKey: qk.auditLog() });
    },
  });
}

export const useLeads = (channelId: string) =>
  useQuery({ queryKey: qk.leads(channelId), queryFn: () => api.getLeads(channelId), enabled: Boolean(channelId) });

export function useUpdateLeadStatus(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof api.updateLeadStatus>[1] }) =>
      api.updateLeadStatus(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.leads(channelId) }),
  });
}

export const useProductLinks = (channelId: string) =>
  useQuery({
    queryKey: qk.productLinks(channelId),
    queryFn: () => api.getProductLinks(channelId),
    enabled: Boolean(channelId),
  });

export function useCreateProductLink(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createProductLink,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.productLinks(channelId) }),
  });
}

/* -------------------------------- Admin --------------------------------- */

export const useAdminSummary = () =>
  useQuery({ queryKey: qk.adminSummary, queryFn: api.getAdminSummary });

export const useModerationQueue = (queue?: ModerationItem["queue"]) =>
  useQuery({ queryKey: qk.moderationQueue(queue), queryFn: () => api.getModerationQueue(queue) });

export function useActionModerationItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      action,
      reason,
    }: {
      itemId: string;
      action: ModerationAction;
      reason: string;
    }) => api.actionModerationItem(itemId, action, reason),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["moderation-queue"] });
      client.invalidateQueries({ queryKey: ["audit-log"] });
      client.invalidateQueries({ queryKey: qk.adminSummary });
      client.invalidateQueries({ queryKey: ["video"] });
      client.invalidateQueries({ queryKey: ["campaigns"] });
      client.invalidateQueries({ queryKey: qk.organisations });
      client.invalidateQueries({ queryKey: ["channel-videos"] });
    },
  });
}

export const useAuditLog = (filters: Parameters<typeof api.getAuditLog>[0] = {}) =>
  useQuery({ queryKey: qk.auditLog(filters), queryFn: () => api.getAuditLog(filters) });

export const useAdminUsers = () =>
  useQuery({ queryKey: qk.adminUsers, queryFn: api.getAdminUsers });

export function useCreateAdminUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; fullName: string; roles: User["roles"] }) =>
      api.createAdminUser(input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.adminUsers });
      client.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export function useSetPassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (newPassword: string) => api.setPassword(newPassword),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.user }),
  });
}

export function useUpdateUserRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: User["roles"] }) =>
      api.updateUserRole(userId, roles),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.adminUsers });
      client.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export function useUpdateUserStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      status,
      reason,
    }: {
      userId: string;
      status: User["status"];
      reason: string;
    }) => api.updateUserStatus(userId, status, reason),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.adminUsers });
      client.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export const useOrganisations = () =>
  useQuery({ queryKey: qk.organisations, queryFn: api.getOrganisations });

export function useUpdateOrganisationStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      status,
      reason,
    }: {
      orgId: string;
      status: Organisation["verificationStatus"];
      reason: string;
    }) => api.updateOrganisationStatus(orgId, status, reason),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.organisations });
      client.invalidateQueries({ queryKey: ["audit-log"] });
      client.invalidateQueries({ queryKey: ["channel"] });
    },
  });
}

export const useCases = () => useQuery({ queryKey: qk.cases, queryFn: api.getCases });

export function useAddCaseNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      caseId,
      body,
      kind,
    }: {
      caseId: string;
      body: string;
      kind: "note" | "escalation" | "resolution";
    }) => api.addCaseNote(caseId, body, kind),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.cases });
      client.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export const usePlatformConfig = () =>
  useQuery({ queryKey: qk.config, queryFn: api.getPlatformConfig });

export function useAddCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<Category, "id" | "videoCount">) => api.addCategory(payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.config });
      client.invalidateQueries({ queryKey: qk.categories });
      client.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

/**
 * React Query cannot carry a generic through `mutationFn`, so the table/rows
 * pair is widened to a union here and narrowed by the calling screen.
 */
type ConfigTableUpdate = {
  [K in keyof PlatformConfigTables]: { table: K; rows: PlatformConfigTables[K] };
}[keyof PlatformConfigTables];

export function useUpdateConfigTable() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ table, rows }: ConfigTableUpdate) =>
      api.updateConfigTable(table, rows as never),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.config });
      client.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

/* ------------------------------- Account -------------------------------- */

export const useCurrentUser = () =>
  useQuery({ queryKey: qk.user, queryFn: api.getCurrentUser });

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.login,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.user }),
  });
}

export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<User>) => api.updateUser(patch),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.user }),
  });
}

export function useSwitchProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.switchProfile,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.user }),
  });
}

export const usePurchases = () =>
  useQuery({ queryKey: qk.purchases, queryFn: api.getPurchases });

export const useSubscriptions = () =>
  useQuery({ queryKey: qk.subscriptions, queryFn: api.getSubscriptions });

export function useCancelSubscription() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.cancelSubscription,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.subscriptions }),
  });
}

export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: api.getNotifications });

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) =>
      id ? api.markNotificationRead(id) : api.markAllNotificationsRead(),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.register,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.user }),
  });
}

export function useVerifyOtp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.verifyOtp,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.user }),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    // Personalized queries (home rails' Continue watching / From channels you
    // follow, and the dedicated continue-watching list) were server-rendered from
    // the now-dead session — invalidating only qk.user left their stale cached
    // payload on screen until an unrelated refetch or a manual reload happened to
    // clear it.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.user });
      client.invalidateQueries({ queryKey: qk.featured });
      client.invalidateQueries({ queryKey: qk.continueWatching });
      client.invalidateQueries({ queryKey: qk.watchlist });
      client.invalidateQueries({ queryKey: qk.following });
    },
  });
}

/* ------------------------------ Magazine -------------------------------- */

export const useMyMagazineArticles = () =>
  useQuery({ queryKey: qk.myMagazineArticles, queryFn: api.getMyMagazineArticles });

export const useMagazineArticle = (id: string) =>
  useQuery({
    queryKey: qk.magazineArticle(id),
    queryFn: () => api.getMagazineArticle(id),
    enabled: Boolean(id),
  });

export function useCreateMagazineArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createMagazineArticle,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.myMagazineArticles }),
  });
}

export function useUpdateMagazineArticle(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.updateMagazineArticle>[1]) =>
      api.updateMagazineArticle(id, patch),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.magazineArticle(id) });
      client.invalidateQueries({ queryKey: qk.myMagazineArticles });
    },
  });
}

export function useSubmitMagazineArticle(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.submitMagazineArticle(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.magazineArticle(id) });
      client.invalidateQueries({ queryKey: qk.myMagazineArticles });
    },
  });
}

export function useWithdrawMagazineArticle(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.withdrawMagazineArticle(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.magazineArticle(id) });
      client.invalidateQueries({ queryKey: qk.myMagazineArticles });
    },
  });
}

/* --------------------------- Sponsorship ("Exchange Hub") ---------------- */

export const useMySponsorshipListings = () =>
  useQuery({ queryKey: qk.mySponsorshipListings, queryFn: api.getMySponsorshipListings });

export const useSponsorshipListing = (id: string) =>
  useQuery({
    queryKey: qk.sponsorshipListing(id),
    queryFn: () => api.getSponsorshipListing(id),
    enabled: Boolean(id),
  });

export function useCreateSponsorshipListing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createSponsorshipListing,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.mySponsorshipListings }),
  });
}

export function useUpdateSponsorshipListing(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.updateSponsorshipListing>[1]) =>
      api.updateSponsorshipListing(id, patch),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.sponsorshipListing(id) });
      client.invalidateQueries({ queryKey: qk.mySponsorshipListings });
    },
  });
}

export function useSubmitSponsorshipListing(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.submitSponsorshipListing(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.sponsorshipListing(id) });
      client.invalidateQueries({ queryKey: qk.mySponsorshipListings });
    },
  });
}

export function useWithdrawSponsorshipListing(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.withdrawSponsorshipListing(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.sponsorshipListing(id) });
      client.invalidateQueries({ queryKey: qk.mySponsorshipListings });
    },
  });
}

/* -------------- Organisation verification (2026-09-17) -------------- */

export const useOrganizationVerification = (organizationId: string) =>
  useQuery({
    queryKey: qk.organizationVerification(organizationId),
    queryFn: () => api.getOrganizationVerification(organizationId),
    enabled: Boolean(organizationId),
  });

export function useSaveVerificationDraft(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: api.OrganizationVerificationDraft) =>
      api.saveOrganizationVerificationDraft(organizationId, draft),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.organizationVerification(organizationId) }),
  });
}

export function useRunAbnLookup(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (abn: string) => api.runOrganizationAbnLookup(organizationId, abn),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.organizationVerification(organizationId) }),
  });
}

export const useVerificationDocuments = (organizationId: string) =>
  useQuery({
    queryKey: qk.verificationDocuments(organizationId),
    queryFn: () => api.getVerificationDocuments(organizationId),
    enabled: Boolean(organizationId),
  });

export function useUploadVerificationDocument(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ documentType, file }: { documentType: "business_registration" | "licence" | "insurance" | "other"; file: File }) =>
      api.uploadVerificationDocument(organizationId, documentType, file),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.verificationDocuments(organizationId) }),
  });
}

export function useSubmitOrganizationVerification(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.submitOrganizationVerification(organizationId),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.organizationVerification(organizationId) }),
  });
}
