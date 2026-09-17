"use client";

import {
  IconAlertTriangle,
  IconCheck,
  IconCloudUpload,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Checkbox,
  Field,
  Input,
  RadioCard,
  Select,
  Switch,
  Textarea,
} from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { ProgressBar } from "@/components/ui/progress";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import * as api from "@/lib/mock-api";
import { CONTENT_TYPE_LABELS } from "@/lib/mock-api/data/categories";
import {
  useBulkImport,
  useCategories,
  useCreateStudioUpload,
  useCurrentUser,
  usePlaylists,
  usePublishDraft,
  useSeries,
  useSuggestedThumbnails,
  useThumbnailSuggestions,
  useUploadThumbnailFile,
} from "@/lib/mock-api/hooks";
import type {
  AccessModel,
  AgeRating,
  BulkImportRow,
  ContentStatus,
  ContentType,
  SubtitleTrack,
  UploadSession,
  VideoDraft,
} from "@/lib/mock-api/types";
import { cn, formatBytes } from "@/lib/utils";

// Display-only mirror of storage.ts's MAX_MASTER_UPLOAD_BYTES (a server-only module,
// can't be imported into a client component) — the server is what actually enforces
// this; keep these two numbers in sync by hand if the server-side default ever changes.
const MAX_MASTER_UPLOAD_BYTES = 250 * 1024 * 1024;

const STEPS = [
  { id: "upload", title: "Upload", description: "Transfer the master file" },
  { id: "metadata", title: "Metadata", description: "Title, category, credits" },
  { id: "thumbnails", title: "Thumbnails", description: "Pick or upload artwork" },
  { id: "captions", title: "Captions", description: "Subtitles and audio description" },
  { id: "rights", title: "Rights", description: "Ownership and availability" },
  { id: "publishing", title: "Publishing", description: "Status and monetisation" },
];

const COUNTRIES = [
  "GB", "IE", "DE", "FR", "ES", "PT", "NL", "IT", "PL", "US", "CA", "AU", "NZ", "LK", "IN", "SG", "ZA",
].map((code) => ({ value: code, label: code }));

const LANGUAGES = [
  "English", "Welsh", "German", "French", "Spanish", "Portuguese", "Polish", "Urdu", "Sinhala", "Tamil", "Arabic",
];

const CONTENT_LABELS = [
  "strong-language", "graphic-content", "medical-procedure", "flashing-imagery",
  "political-content", "gambling", "synthetic-media",
].map((value) => ({ value, label: value.replace(/-/g, " ") }));

const ACCESS_MODELS: Array<{ value: AccessModel; label: string; description: string }> = [
  { value: "free", label: "Free", description: "Anyone can watch. No advertising." },
  { value: "ad-supported", label: "Advertising-supported", description: "Free to watch, monetised with pre/mid-roll." },
  { value: "rent", label: "Rental", description: "Time-limited access for a one-off fee." },
  { value: "buy", label: "Purchase", description: "Permanent access, kept in the viewer's library." },
  { value: "ppv", label: "Pay-per-view", description: "One-off access for events and premieres." },
  { value: "subscription", label: "Platform subscription", description: "Included with Nexus Premium." },
  { value: "membership", label: "Channel membership", description: "Included for your paying members." },
];

export default function UploadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  // Real channels get a real upload/publish path (this section); the mock ch_mara-style
  // fallback keeps the fully-simulated wizard exactly as it always was — see
  // docs/DEVELOPMENT-PLAN.md's P2 entry for why this is a first *slice* of P2, not all
  // of it (transcoding/suggested-frame thumbnails/captions all still need Mux).
  const isRealChannel = api.looksLikeRealId(channelId);

  const { data: playlists = [] } = usePlaylists(channelId);
  const { data: series = [] } = useSeries(channelId);
  const publishDraft = usePublishDraft();
  const createStudioUpload = useCreateStudioUpload();
  const uploadThumbnailFile = useUploadThumbnailFile();

  const [mode, setMode] = React.useState<"single" | "bulk">("single");
  const [step, setStep] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);

  /* ----------------------------- Step 1: upload ---------------------------- */
  const [session, setSession] = React.useState<UploadSession | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [masterAssetPath, setMasterAssetPath] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Drives the mock chunked transfer — real channels never reach this (see startUpload).
  React.useEffect(() => {
    if (isRealChannel || !session || session.phase !== "uploading") return;
    let cancelled = false;
    const tick = async () => {
      const next = await api.advanceUpload(session.id);
      if (!cancelled && next) setSession(next);
    };
    const timer = window.setTimeout(tick, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isRealChannel, session]);

  // Poll while the mock "processing" stage finishes.
  React.useEffect(() => {
    if (isRealChannel || session?.phase !== "processing") return;
    const timer = window.setInterval(async () => {
      const next = await api.getUploadSession(session.id);
      if (next) setSession(next);
    }, 400);
    return () => window.clearInterval(timer);
  }, [isRealChannel, session?.phase, session?.id]);

  /** Real accounts: a genuine PUT to a signed Supabase Storage URL, with real
   * `XMLHttpRequest` upload-progress events driving the exact same progress UI the mock
   * path already used — see uploadMasterFile()'s header for why XHR, not fetch. */
  const startRealUpload = async (file: File) => {
    setMasterAssetPath(null);
    setSession({
      id: "real",
      fileName: file.name,
      fileSizeBytes: file.size,
      uploadedBytes: 0,
      phase: "uploading",
      chunkIndex: 0,
      totalChunks: 1,
      createdAt: new Date().toISOString(),
    });
    try {
      const { path, signedUrl } = await createStudioUpload.mutateAsync({
        channelId,
        fileName: file.name,
        fileSizeBytes: file.size,
      });
      await api.uploadMasterFile(signedUrl, file, (loaded, total) => {
        setSession((current) => (current ? { ...current, uploadedBytes: loaded, fileSizeBytes: total } : current));
      });
      setMasterAssetPath(path);
      setSession((current) =>
        current ? { ...current, phase: "complete", uploadedBytes: current.fileSizeBytes, chunkIndex: 1 } : current,
      );
    } catch (error) {
      setSession((current) =>
        current
          ? { ...current, phase: "failed", error: error instanceof Error ? error.message : "Upload failed." }
          : current,
      );
    }
  };

  const startUpload = (picked: { name: string; size: number; file?: File }) => {
    if (isRealChannel) {
      if (picked.file) void startRealUpload(picked.file);
      return;
    }
    // The session carries the file name and size, so nothing else needs to
    // hold the File object — and it never leaves the page.
    void api.createUploadSession(picked.name, picked.size).then(setSession);
  };

  /* --------------------------- Step 2: metadata ---------------------------- */
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [contentType, setContentType] = React.useState<ContentType>("user-generated");
  const [categoryIds, setCategoryIds] = React.useState<string[]>([]);
  const { data: categories = [] } = useCategories();
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagDraft, setTagDraft] = React.useState("");
  const [participants, setParticipants] = React.useState("");
  const [productionCompany, setProductionCompany] = React.useState("");
  const [releaseDate, setReleaseDate] = React.useState("2026-08-12");
  const [language, setLanguage] = React.useState("English");
  const [country, setCountry] = React.useState("GB");

  /* -------------------------- Step 3: thumbnails --------------------------- */
  const { data: suggestions = [] } = useThumbnailSuggestions(
    step >= 2 && session ? session.id : "",
  );
  const [thumbnailId, setThumbnailId] = React.useState<string | null>(null);
  const [customThumb, setCustomThumb] = React.useState<string | null>(null);
  const [customThumbUrl, setCustomThumbUrl] = React.useState<string | null>(null);
  // Real, publicly-servable URL once a real channel's thumbnail has actually finished
  // uploading — customThumbUrl above stays a local blob preview regardless of channel
  // type; this is what's sent to publishVideo. Always null for a mock channel.
  const [customThumbnailUrl, setCustomThumbnailUrl] = React.useState<string | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = React.useState(false);

  // Real suggested frames (2026-09-17) — ffmpeg-extracted from the uploaded master,
  // fetched once when a real channel reaches this step. Selecting one sets
  // customThumbnailUrl directly, same as a completed upload — it's already a real,
  // publicly-servable thumbnails-bucket image.
  const suggestedThumbnails = useSuggestedThumbnails();
  const [realSuggestions, setRealSuggestions] = React.useState<api.SuggestedThumbnail[]>([]);
  const [selectedSuggestionUrl, setSelectedSuggestionUrl] = React.useState<string | null>(null);
  const suggestionsRequestedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isRealChannel || !masterAssetPath || STEPS[step].id !== "thumbnails") return;
    if (suggestionsRequestedRef.current) return;
    suggestionsRequestedRef.current = true;
    suggestedThumbnails.mutate(
      { channelId, masterAssetPath },
      {
        onSuccess: (items) => setRealSuggestions(items),
        onError: (error) =>
          toast({
            tone: "error",
            title: "Couldn't generate suggested thumbnails",
            description: error instanceof Error ? error.message : "Upload your own instead.",
          }),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealChannel, masterAssetPath, step, channelId]);

  /* --------------------------- Step 4: captions ---------------------------- */
  const [subtitles, setSubtitles] = React.useState<SubtitleTrack[]>([]);
  const [autoTranscribe, setAutoTranscribe] = React.useState(true);
  const [audioDescription, setAudioDescription] = React.useState(false);
  const [newTrackLang, setNewTrackLang] = React.useState("English");
  const [newTrackKind, setNewTrackKind] = React.useState<SubtitleTrack["kind"]>("subtitles");

  /* ---------------------------- Step 5: rights ----------------------------- */
  const [declaredOwner, setDeclaredOwner] = React.useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = React.useState(false);
  const [licenceStart, setLicenceStart] = React.useState("2026-08-12");
  const [licenceEnd, setLicenceEnd] = React.useState("");
  const [territoryMode, setTerritoryMode] = React.useState<"worldwide" | "allow" | "block">("worldwide");
  const [permittedCountries, setPermittedCountries] = React.useState<string[]>([]);
  const [blockedCountries, setBlockedCountries] = React.useState<string[]>([]);
  const [ageRating, setAgeRating] = React.useState<AgeRating>("PG");
  const [contentLabels, setContentLabels] = React.useState<string[]>([]);

  /* -------------------------- Step 6: publishing --------------------------- */
  const [status, setStatus] = React.useState<ContentStatus>("published");
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [accessModels, setAccessModels] = React.useState<AccessModel[]>(["ad-supported"]);
  const [rentPrice, setRentPrice] = React.useState("3.99");
  const [buyPrice, setBuyPrice] = React.useState("9.99");
  const [ppvPrice, setPpvPrice] = React.useState("5.99");
  const [rentalWindow, setRentalWindow] = React.useState("48");
  const [sponsored, setSponsored] = React.useState(false);
  const [sponsorName, setSponsorName] = React.useState("");
  const [commerceProduct, setCommerceProduct] = React.useState("");
  const [commercePrice, setCommercePrice] = React.useState("");
  const [playlistIds, setPlaylistIds] = React.useState<string[]>([]);
  const [seriesId, setSeriesId] = React.useState("");
  const [seasonNumber, setSeasonNumber] = React.useState("1");
  const [episodeNumber, setEpisodeNumber] = React.useState("1");

  const uploadComplete = session?.phase === "complete";

  const canContinue = (() => {
    switch (STEPS[step].id) {
      case "upload":
        return uploadComplete;
      case "metadata":
        return title.trim().length > 2 && categoryIds.length > 0;
      case "thumbnails":
        return isRealChannel
          ? Boolean(customThumbnailUrl) && !thumbnailUploading
          : Boolean(thumbnailId || customThumb);
      case "captions":
        return true;
      case "rights":
        return declaredOwner.trim().length > 1 && ownershipConfirmed;
      default:
        return true;
    }
  })();

  const goNext = () => {
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthest((current) => Math.max(current, next));
  };

  const submit = async () => {
    const draft: VideoDraft = {
      // Real channels: the real master asset's storage path, set once the real upload
      // finishes (see startRealUpload) — not session?.id, which is just the fixed
      // string "real" for a real session and carries no useful information itself.
      uploadSessionId: isRealChannel ? (masterAssetPath ?? "") : (session?.id ?? ""),
      title: title.trim(),
      description,
      contentType,
      categoryIds,
      tags,
      participants: participants.split(",").map((p) => p.trim()).filter(Boolean),
      productionCompany,
      releaseDate,
      language,
      country,
      thumbnailId,
      customThumbnailName: customThumb,
      customThumbnailUrl,
      subtitles,
      autoTranscribe,
      audioDescription,
      rights: {
        declaredOwner,
        ownershipConfirmed,
        licenceStart,
        licenceEnd: licenceEnd || null,
        permittedCountries: territoryMode === "allow" ? permittedCountries : [],
        blockedCountries: territoryMode === "block" ? blockedCountries : [],
        ageRating,
        contentLabels,
      },
      pricing: {
        accessModels,
        rentPrice: accessModels.includes("rent")
          ? { amount: Math.round(Number(rentPrice) * 100), currency: "GBP" }
          : undefined,
        buyPrice: accessModels.includes("buy")
          ? { amount: Math.round(Number(buyPrice) * 100), currency: "GBP" }
          : undefined,
        ppvPrice: accessModels.includes("ppv")
          ? { amount: Math.round(Number(ppvPrice) * 100), currency: "GBP" }
          : undefined,
        rentalWindowHours: Number(rentalWindow) || 48,
        sponsored,
        sponsorName: sponsored ? sponsorName : undefined,
        affiliateLinks: commerceProduct
          ? [
              {
                id: "cl_new",
                label: "Shop this video",
                productName: commerceProduct,
                price: { amount: Math.round(Number(commercePrice || 0) * 100), currency: "GBP" },
                martProductId: "mart_new_product",
                timestampSeconds: 120,
              },
            ]
          : undefined,
      },
      status,
      scheduledFor: status === "scheduled" ? scheduledFor || null : null,
      playlistIds,
      seriesId: seriesId || null,
      seasonNumber: seriesId ? Number(seasonNumber) : null,
      episodeNumber: seriesId ? Number(episodeNumber) : null,
    };

    let created: { id: string; slug: string; status: string };
    try {
      created = await publishDraft.mutateAsync(draft);
    } catch (error) {
      toast({
        tone: "error",
        title: "Couldn't publish",
        description: error instanceof Error ? error.message : "Something went wrong. Try again.",
      });
      return;
    }

    toast({
      title:
        created.status === "pending"
          ? "Held for review"
          : created.status === "published"
            ? "Published"
            : `Saved as ${created.status}`,
      description:
        created.status === "pending"
          ? "Sponsored or age-rated content is held back from public view before it goes live."
          : "Your video is in Content.",
    });
    router.push("/studio/content");
  };

  return (
    <>
      <PageHeader
        title="Upload"
        description={
          isRealChannel
            ? "Six steps from master file to published title. Upload, metadata, suggested thumbnails, rights and publishing are real — captions and transcoding are still simulated, so playback will show as “processing” until that's wired up."
            : "Six steps from master file to published title. Everything is mocked — no file leaves your browser and nothing is transcoded."
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant={mode === "single" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setMode("single")}
            >
              <IconCloudUpload />
              Single upload
            </Button>
            <Button
              variant={mode === "bulk" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setMode("bulk")}
            >
              <IconTable />
              Bulk import
            </Button>
          </div>
        }
      />

      <PageBody>
        {mode === "bulk" ? (
          <BulkImportPanel />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <Stepper
                steps={STEPS}
                current={step}
                furthestReached={furthest}
                onStepClick={setStep}
                orientation="vertical"
              />
            </aside>

            <div className="min-w-0">
              <Card>
                <CardHeader
                  title={STEPS[step].title}
                  description={STEPS[step].description}
                  action={
                    <span className="text-xs text-fg-subtle nx-tnum">
                      Step {step + 1} of {STEPS.length}
                    </span>
                  }
                />
                <CardBody className="space-y-5">
                  {/* ------------------------- Upload ------------------------ */}
                  {STEPS[step].id === "upload" ? (
                    session ? (
                      <UploadProgress
                        session={session}
                        resumable={!isRealChannel}
                        onPause={async () => setSession(await api.pauseUpload(session.id))}
                        onResume={async () => setSession(await api.resumeUpload(session.id))}
                        onCancel={() => {
                          setSession(null);
                          setMasterAssetPath(null);
                        }}
                      />
                    ) : (
                      <div
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragging(false);
                          const dropped = event.dataTransfer.files?.[0];
                          if (dropped) startUpload({ name: dropped.name, size: dropped.size, file: dropped });
                        }}
                        className={cn(
                          "rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors",
                          dragging ? "border-accent bg-accent/5" : "border-border bg-surface-2",
                        )}
                      >
                        <IconCloudUpload className="mx-auto size-10 text-fg-subtle" />
                        <p className="mt-3 font-display text-base font-semibold text-fg">
                          Drop your master file here
                        </p>
                        <p className="mt-1 text-sm text-fg-muted">
                          {isRealChannel
                            ? `Uploaded for real, up to ${Math.round(MAX_MASTER_UPLOAD_BYTES / (1024 * 1024))}MB for this preview build.`
                            : "ProRes, DNxHD, MP4 or MOV. Resumable — if the connection drops it picks up from the last completed chunk."}
                        </p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                            Select a file
                          </Button>
                          {!isRealChannel ? (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                startUpload({
                                  name: "NX_MASTER_0042_PRORES.mov",
                                  size: 8_640_000_000,
                                })
                              }
                            >
                              Use a sample file
                            </Button>
                          ) : null}
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="video/*"
                          className="sr-only"
                          onChange={(event) => {
                            const picked = event.target.files?.[0];
                            if (picked) startUpload({ name: picked.name, size: picked.size, file: picked });
                          }}
                        />
                      </div>
                    )
                  ) : null}

                  {/* ------------------------ Metadata ----------------------- */}
                  {STEPS[step].id === "metadata" ? (
                    <>
                      <Field
                        label="Title"
                        htmlFor="up-title"
                        required
                        aside={`${title.length}/100`}
                      >
                        <Input
                          id="up-title"
                          value={title}
                          maxLength={100}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="Anamorphic on a budget: what actually matters"
                        />
                      </Field>

                      <Field
                        label="Description"
                        htmlFor="up-desc"
                        aside={`${description.length}/5000`}
                        hint="The first two lines show in search results and share previews."
                      >
                        <Textarea
                          id="up-desc"
                          value={description}
                          maxLength={5000}
                          rows={5}
                          onChange={(event) => setDescription(event.target.value)}
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Content type" htmlFor="up-type" required>
                          <Select
                            id="up-type"
                            value={contentType}
                            onChange={(event) =>
                              setContentType(event.target.value as ContentType)
                            }
                          >
                            {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((type) => (
                              <option key={type} value={type}>
                                {CONTENT_TYPE_LABELS[type]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field
                          label="Categories"
                          htmlFor="up-categories"
                          required
                          hint={`Showing ${CONTENT_TYPE_LABELS[contentType]} categories first.`}
                        >
                          <MultiSelect
                            id="up-categories"
                            options={[...categories]
                              .sort((a, b) =>
                                a.contentType === contentType && b.contentType !== contentType
                                  ? -1
                                  : b.contentType === contentType && a.contentType !== contentType
                                    ? 1
                                    : 0,
                              )
                              .map((category) => ({
                                value: category.id,
                                label: category.name,
                                group:
                                  category.contentType === contentType
                                    ? `${CONTENT_TYPE_LABELS[category.contentType]} (this content type)`
                                    : CONTENT_TYPE_LABELS[category.contentType],
                              }))}
                            value={categoryIds}
                            onChange={setCategoryIds}
                            placeholder="Choose at least one"
                          />
                        </Field>
                      </div>

                      <Field label="Tags" hint="Press Enter to add. Helps search and related content.">
                        <Input
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && tagDraft.trim()) {
                              event.preventDefault();
                              setTags((current) =>
                                Array.from(new Set([...current, tagDraft.trim()])),
                              );
                              setTagDraft("");
                            }
                          }}
                          placeholder="cinematography, lenses, tutorial"
                        />
                        {tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <Badge key={tag} tone="neutral" size="sm">
                                #{tag}
                                <button
                                  type="button"
                                  aria-label={`Remove ${tag}`}
                                  onClick={() =>
                                    setTags((current) => current.filter((t) => t !== tag))
                                  }
                                  className="-mr-1 rounded-full p-0.5 hover:text-fg"
                                >
                                  <IconX className="size-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Participants & cast"
                          htmlFor="up-participants"
                          hint="Comma separated."
                        >
                          <Input
                            id="up-participants"
                            value={participants}
                            onChange={(event) => setParticipants(event.target.value)}
                            placeholder="Mara Solace, Devon Pryce"
                          />
                        </Field>
                        <Field label="Production company" htmlFor="up-company">
                          <Input
                            id="up-company"
                            value={productionCompany}
                            onChange={(event) => setProductionCompany(event.target.value)}
                          />
                        </Field>
                        <Field label="Release date" htmlFor="up-release">
                          <DatePicker
                            id="up-release"
                            value={releaseDate}
                            onChange={setReleaseDate}
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Language" htmlFor="up-lang">
                            <Select
                              id="up-lang"
                              value={language}
                              onChange={(event) => setLanguage(event.target.value)}
                            >
                              {LANGUAGES.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Country" htmlFor="up-country">
                            <Select
                              id="up-country"
                              value={country}
                              onChange={(event) => setCountry(event.target.value)}
                            >
                              {COUNTRIES.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {/* ----------------------- Thumbnails ---------------------- */}
                  {STEPS[step].id === "thumbnails" ? (
                    <>
                      {!isRealChannel ? (
                        <div>
                          <p className="flex items-center gap-2 text-sm font-medium text-fg">
                            <IconSparkles className="size-4 text-accent" />
                            Suggested frames
                          </p>
                          <p className="mt-1 text-xs text-fg-muted">
                            Generated from the upload. Scores reflect sharpness,
                            faces and motion — mocked here.
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {suggestions.map((suggestion) => (
                              <button
                                key={suggestion.id}
                                type="button"
                                onClick={() => {
                                  setThumbnailId(suggestion.id);
                                  setCustomThumb(null);
                                }}
                                className={cn(
                                  "overflow-hidden rounded-lg border-2 text-left transition-colors",
                                  thumbnailId === suggestion.id
                                    ? "border-accent"
                                    : "border-transparent hover:border-border-strong",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className="block aspect-video w-full"
                                  style={{
                                    backgroundImage: `linear-gradient(140deg, ${suggestion.gradient[0]}, ${suggestion.gradient[1]})`,
                                  }}
                                />
                                <span className="flex items-center justify-between px-2 py-1.5">
                                  <span className="text-2xs text-fg-muted">
                                    {suggestion.label}
                                  </span>
                                  <span className="text-2xs text-fg-subtle nx-tnum">
                                    {(suggestion.score * 100).toFixed(0)}%
                                  </span>
                                </span>
                              </button>
                            ))}
                            {suggestions.length === 0 ? (
                              <p className="col-span-full text-sm text-fg-subtle">
                                Generating suggestions…
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="flex items-center gap-2 text-sm font-medium text-fg">
                            <IconSparkles className="size-4 text-accent" />
                            Suggested frames
                          </p>
                          <p className="mt-1 text-xs text-fg-muted">
                            Real frames extracted from your upload — pick one, or upload your own below.
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {realSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.url}
                                type="button"
                                onClick={() => {
                                  setSelectedSuggestionUrl(suggestion.url);
                                  setCustomThumbnailUrl(suggestion.url);
                                  setCustomThumb(null);
                                  setCustomThumbUrl(null);
                                }}
                                className={cn(
                                  "overflow-hidden rounded-lg border-2 text-left transition-colors",
                                  selectedSuggestionUrl === suggestion.url
                                    ? "border-accent"
                                    : "border-transparent hover:border-border-strong",
                                )}
                              >
                                <img
                                  src={suggestion.url}
                                  alt={`Frame at ${Math.round(suggestion.timestampSeconds)}s`}
                                  className="block aspect-video w-full object-cover"
                                />
                                <span className="flex items-center px-2 py-1.5">
                                  <span className="text-2xs text-fg-muted nx-tnum">
                                    {Math.round(suggestion.timestampSeconds)}s
                                  </span>
                                </span>
                              </button>
                            ))}
                            {suggestedThumbnails.isPending ? (
                              <p className="col-span-full text-sm text-fg-subtle">Generating suggestions…</p>
                            ) : realSuggestions.length === 0 ? (
                              <p className="col-span-full text-sm text-fg-subtle">
                                No suggestions available — upload your own below.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}

                      <div className={cn("border-t border-border pt-5")}>
                        <Field
                          label="Upload a thumbnail"
                          hint="1920×1080 recommended, under 5 MB."
                          required={isRealChannel}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            disabled={thumbnailUploading}
                            onChange={async (event) => {
                              const picked = event.target.files?.[0];
                              if (!picked) return;
                              setCustomThumb(picked.name);
                              setCustomThumbUrl(URL.createObjectURL(picked));
                              setCustomThumbnailUrl(null);
                              setThumbnailId(null);
                              setSelectedSuggestionUrl(null);
                              if (!isRealChannel) return;
                              setThumbnailUploading(true);
                              try {
                                const url = await uploadThumbnailFile.mutateAsync({ channelId, file: picked });
                                setCustomThumbnailUrl(url);
                              } catch (error) {
                                toast({
                                  title: "Couldn't upload thumbnail",
                                  description: error instanceof Error ? error.message : undefined,
                                  tone: "error",
                                });
                                setCustomThumb(null);
                                setCustomThumbUrl(null);
                              } finally {
                                setThumbnailUploading(false);
                              }
                            }}
                            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-3/70"
                          />
                        </Field>
                        {customThumb ? (
                          <div className="mt-3 flex items-center gap-3">
                            {customThumbUrl ? (
                              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded border border-border">
                                <img
                                  src={customThumbUrl}
                                  alt="Custom thumbnail preview"
                                  className="size-full object-cover"
                                />
                              </div>
                            ) : null}
                            <div>
                              <Badge tone={thumbnailUploading ? "pending" : "published"} size="sm">
                                {thumbnailUploading ? null : <IconCheck />}
                                {thumbnailUploading ? "Uploading…" : customThumb}
                              </Badge>
                              <p className="mt-1 text-xs text-fg-subtle">
                                Selected as active video thumbnail
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {/* ------------------------ Captions ----------------------- */}
                  {STEPS[step].id === "captions" ? (
                    <>
                      <Switch
                        checked={autoTranscribe}
                        onCheckedChange={setAutoTranscribe}
                        label="Auto-transcribe this video"
                        description="Generates a caption track in the source language. Mocked — no speech recognition runs."
                      />
                      <Switch
                        checked={audioDescription}
                        onCheckedChange={setAudioDescription}
                        label="Audio description track available"
                        description="Adds an AD option to the player's audio-track menu."
                      />

                      <div className="border-t border-border pt-5">
                        <p className="text-sm font-medium text-fg">Subtitle tracks</p>
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <Field label="Language" className="min-w-[10rem] flex-1">
                            <Select
                              value={newTrackLang}
                              onChange={(event) => setNewTrackLang(event.target.value)}
                              sizeVariant="sm"
                            >
                              {LANGUAGES.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Kind" className="min-w-[9rem]">
                            <Select
                              value={newTrackKind}
                              onChange={(event) =>
                                setNewTrackKind(event.target.value as SubtitleTrack["kind"])
                              }
                              sizeVariant="sm"
                            >
                              <option value="subtitles">Subtitles</option>
                              <option value="captions">Captions</option>
                              <option value="sdh">SDH</option>
                            </Select>
                          </Field>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setSubtitles((current) => [
                                ...current,
                                {
                                  id: `sub_${current.length + 1}`,
                                  language: newTrackLang,
                                  languageCode: newTrackLang.slice(0, 2).toLowerCase(),
                                  kind: newTrackKind,
                                  autoGenerated: false,
                                  status: "ready",
                                },
                              ])
                            }
                          >
                            Add track
                          </Button>
                        </div>

                        {subtitles.length > 0 ? (
                          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                            {subtitles.map((track, index) => (
                              <li
                                key={track.id}
                                className="flex items-center gap-3 px-3 py-2.5"
                              >
                                <Badge tone="neutral" size="sm">
                                  {track.languageCode.toUpperCase()}
                                </Badge>
                                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                                  {track.language}
                                </span>
                                <Badge tone="outline" size="sm">
                                  {track.kind}
                                </Badge>
                                <button
                                  type="button"
                                  aria-label={`Remove ${track.language}`}
                                  onClick={() =>
                                    setSubtitles((current) =>
                                      current.filter((_, i) => i !== index),
                                    )
                                  }
                                  className="rounded p-1 text-fg-subtle hover:text-danger"
                                >
                                  <IconX className="size-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 rounded border border-dashed border-border px-3 py-4 text-center text-sm text-fg-subtle">
                            No subtitle tracks yet.
                            {autoTranscribe
                              ? " Auto-transcription will add one after processing."
                              : ""}
                          </p>
                        )}
                      </div>
                    </>
                  ) : null}

                  {/* ------------------------- Rights ------------------------ */}
                  {STEPS[step].id === "rights" ? (
                    <>
                      <Field
                        label="Declared rights holder"
                        htmlFor="up-owner"
                        required
                        hint="The person or organisation that owns or controls the rights."
                      >
                        <Input
                          id="up-owner"
                          value={declaredOwner}
                          onChange={(event) => setDeclaredOwner(event.target.value)}
                          placeholder="Mara Solace / Northlight Pictures Ltd"
                        />
                      </Field>

                      <Checkbox
                        checked={ownershipConfirmed}
                        onChange={(event) => setOwnershipConfirmed(event.target.checked)}
                        label="I confirm I own or am licensed to distribute all content in this video"
                        description="Including music, archive footage and third-party clips. Required before publishing."
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Licence starts" htmlFor="up-lic-start">
                          <DatePicker
                            id="up-lic-start"
                            value={licenceStart}
                            onChange={setLicenceStart}
                          />
                        </Field>
                        <Field
                          label="Licence ends"
                          htmlFor="up-lic-end"
                          hint="Leave empty for no end date."
                        >
                          <DatePicker
                            id="up-lic-end"
                            value={licenceEnd}
                            onChange={setLicenceEnd}
                            placeholder="No end date"
                          />
                        </Field>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium text-fg">
                          Territory availability
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            { value: "worldwide", title: "Worldwide", description: "Available everywhere." },
                            { value: "allow", title: "Selected only", description: "Available only where listed." },
                            { value: "block", title: "Worldwide except", description: "Blocked where listed." },
                          ].map((option) => (
                            <RadioCard
                              key={option.value}
                              name="territory"
                              value={option.value}
                              checked={territoryMode === option.value}
                              onChange={(value) =>
                                setTerritoryMode(value as typeof territoryMode)
                              }
                              title={option.title}
                              description={option.description}
                            />
                          ))}
                        </div>

                        {territoryMode === "allow" ? (
                          <div className="mt-3">
                            <MultiSelect
                              options={COUNTRIES}
                              value={permittedCountries}
                              onChange={setPermittedCountries}
                              placeholder="Select permitted countries"
                            />
                          </div>
                        ) : null}
                        {territoryMode === "block" ? (
                          <div className="mt-3">
                            <MultiSelect
                              options={COUNTRIES}
                              value={blockedCountries}
                              onChange={setBlockedCountries}
                              placeholder="Select blocked countries"
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Age classification"
                          htmlFor="up-rating"
                          required
                          hint="18 holds the video back from public view before publishing."
                        >
                          <Select
                            id="up-rating"
                            value={ageRating}
                            onChange={(event) => setAgeRating(event.target.value as AgeRating)}
                          >
                            {(["U", "PG", "12", "15", "18"] as AgeRating[]).map((rating) => (
                              <option key={rating} value={rating}>
                                {rating}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field
                          label="Content labels"
                          hint="Any label routes the video to review."
                        >
                          <MultiSelect
                            options={CONTENT_LABELS}
                            value={contentLabels}
                            onChange={setContentLabels}
                            placeholder="None"
                            allLabel="No labels"
                          />
                        </Field>
                      </div>
                    </>
                  ) : null}

                  {/* ----------------------- Publishing ---------------------- */}
                  {STEPS[step].id === "publishing" ? (
                    <>
                      <div>
                        <p className="mb-2 text-sm font-medium text-fg">
                          Publishing status
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {[
                            { value: "draft", title: "Draft", description: "Only you can see it." },
                            { value: "private", title: "Private", description: "Visible to you and invited viewers." },
                            { value: "unlisted", title: "Unlisted", description: "Anyone with the link can watch." },
                            { value: "scheduled", title: "Scheduled", description: "Publishes automatically at a set time." },
                            { value: "published", title: "Publish now", description: "Live in the catalogue immediately." },
                            { value: "archived", title: "Archived", description: "Kept, but removed from the catalogue." },
                          ].map((option) => (
                            <RadioCard
                              key={option.value}
                              name="status"
                              value={option.value}
                              checked={status === option.value}
                              onChange={(value) => setStatus(value as ContentStatus)}
                              title={option.title}
                              description={option.description}
                            />
                          ))}
                        </div>

                        {status === "scheduled" ? (
                          <div className="mt-3 max-w-sm">
                            <Field label="Publish at" htmlFor="up-schedule">
                              <DatePicker
                                id="up-schedule"
                                value={scheduledFor}
                                onChange={setScheduledFor}
                                withTime
                              />
                            </Field>
                          </div>
                        ) : null}
                      </div>

                      <div className="border-t border-border pt-5">
                        <p className="text-sm font-medium text-fg">Monetisation</p>
                        <p className="mt-1 text-xs text-fg-muted">
                          Pick every model that applies. Prices are illustrative —
                          no payment provider exists in this build.
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {ACCESS_MODELS.map((model) => (
                            <label
                              key={model.value}
                              className={cn(
                                "flex cursor-pointer gap-2.5 rounded border p-3 transition-colors",
                                accessModels.includes(model.value)
                                  ? "border-accent bg-accent/[0.07]"
                                  : "border-border bg-surface-2 hover:border-border-strong",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={accessModels.includes(model.value)}
                                onChange={() =>
                                  setAccessModels((current) =>
                                    current.includes(model.value)
                                      ? current.filter((m) => m !== model.value)
                                      : [...current, model.value],
                                  )
                                }
                                className="mt-0.5 size-4 shrink-0 rounded-sm border border-border-strong bg-surface accent-[rgb(var(--nx-accent))]"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-fg">
                                  {model.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-fg-muted">
                                  {model.description}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-4">
                          {accessModels.includes("rent") ? (
                            <>
                              <Field label="Rental price (£)" htmlFor="p-rent">
                                <Input
                                  id="p-rent"
                                  value={rentPrice}
                                  onChange={(e) => setRentPrice(e.target.value)}
                                  sizeVariant="sm"
                                  inputMode="decimal"
                                />
                              </Field>
                              <Field label="Window (hours)" htmlFor="p-window">
                                <Input
                                  id="p-window"
                                  value={rentalWindow}
                                  onChange={(e) => setRentalWindow(e.target.value)}
                                  sizeVariant="sm"
                                  inputMode="numeric"
                                />
                              </Field>
                            </>
                          ) : null}
                          {accessModels.includes("buy") ? (
                            <Field label="Purchase price (£)" htmlFor="p-buy">
                              <Input
                                id="p-buy"
                                value={buyPrice}
                                onChange={(e) => setBuyPrice(e.target.value)}
                                sizeVariant="sm"
                                inputMode="decimal"
                              />
                            </Field>
                          ) : null}
                          {accessModels.includes("ppv") ? (
                            <Field label="PPV price (£)" htmlFor="p-ppv">
                              <Input
                                id="p-ppv"
                                value={ppvPrice}
                                onChange={(e) => setPpvPrice(e.target.value)}
                                sizeVariant="sm"
                                inputMode="decimal"
                              />
                            </Field>
                          ) : null}
                        </div>
                      </div>

                      <div className="border-t border-border pt-5">
                        <Switch
                          checked={sponsored}
                          onCheckedChange={setSponsored}
                          label="This video contains paid promotion"
                          description="Required by policy. Sponsored videos are labelled and routed to review."
                        />
                        {sponsored ? (
                          <div className="mt-3 max-w-sm">
                            <Field label="Sponsor name" htmlFor="sponsor">
                              <Input
                                id="sponsor"
                                value={sponsorName}
                                onChange={(event) => setSponsorName(event.target.value)}
                                placeholder="Kestrel Rigs"
                              />
                            </Field>
                          </div>
                        ) : null}
                      </div>

                      <div className="border-t border-border pt-5">
                        <p className="text-sm font-medium text-fg">
                          Commerce link (optional)
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">
                          Adds a “Shop this video” card during playback, linked to a
                          Mart product.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Product name" htmlFor="commerce-name">
                            <Input
                              id="commerce-name"
                              value={commerceProduct}
                              onChange={(event) => setCommerceProduct(event.target.value)}
                              placeholder="SirulUltra 1.33x adapter"
                              sizeVariant="sm"
                            />
                          </Field>
                          <Field label="Price (£)" htmlFor="commerce-price">
                            <Input
                              id="commerce-price"
                              value={commercePrice}
                              onChange={(event) => setCommercePrice(event.target.value)}
                              sizeVariant="sm"
                              inputMode="decimal"
                            />
                          </Field>
                        </div>
                      </div>

                      <div className="border-t border-border pt-5">
                        <p className="text-sm font-medium text-fg">Organise</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Add to playlists">
                            <MultiSelect
                              options={playlists.map((playlist) => ({
                                value: playlist.id,
                                label: playlist.title,
                              }))}
                              value={playlistIds}
                              onChange={setPlaylistIds}
                              placeholder="None"
                              allLabel="Not in a playlist"
                            />
                          </Field>
                          <Field label="Series" htmlFor="series">
                            <Select
                              id="series"
                              value={seriesId}
                              onChange={(event) => setSeriesId(event.target.value)}
                            >
                              <option value="">Not part of a series</option>
                              {series.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.title}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          {seriesId ? (
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Season" htmlFor="season">
                                <Input
                                  id="season"
                                  value={seasonNumber}
                                  onChange={(e) => setSeasonNumber(e.target.value)}
                                  inputMode="numeric"
                                  sizeVariant="sm"
                                />
                              </Field>
                              <Field label="Episode" htmlFor="episode">
                                <Input
                                  id="episode"
                                  value={episodeNumber}
                                  onChange={(e) => setEpisodeNumber(e.target.value)}
                                  inputMode="numeric"
                                  sizeVariant="sm"
                                />
                              </Field>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {(sponsored || ageRating === "18" || contentLabels.length > 0) &&
                      status === "published" ? (
                        <p className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-fg-muted">
                          <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                          This video will publish as{" "}
                          <strong className="text-fg">Pending review</strong> rather
                          than going live immediately, because it is sponsored,
                          18-rated, or carries a content label.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </CardBody>
              </Card>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  disabled={step === 0}
                >
                  Back
                </Button>
                <div className="flex gap-2">
                  {step === STEPS.length - 1 ? (
                    <Button
                      variant="primary"
                      onClick={submit}
                      loading={publishDraft.isPending}
                    >
                      {status === "published" ? "Publish" : `Save as ${status}`}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={goNext} disabled={!canContinue}>
                      Continue
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

/* ---------------------------- Upload progress ----------------------------- */

function UploadProgress({
  session,
  onPause,
  onResume,
  onCancel,
  resumable = true,
}: {
  session: UploadSession;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  /** False for a real upload (a single real PUT, no chunk-level resume tracking exists
   * yet — see docs/DEVELOPMENT-PLAN.md's P2 entry) — hides pause/resume/retry controls
   * that would otherwise imply a capability that isn't real yet. */
  resumable?: boolean;
}) {
  const percent = (session.uploadedBytes / session.fileSizeBytes) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 p-4">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            session.phase === "failed"
              ? "bg-danger/15 text-danger"
              : session.phase === "complete"
                ? "bg-success/15 text-success"
                : "bg-accent-soft text-accent",
          )}
        >
          {session.phase === "failed" ? (
            <IconAlertTriangle className="size-5" />
          ) : session.phase === "complete" ? (
            <IconCheck className="size-5" />
          ) : (
            <IconCloudUpload className="size-5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{session.fileName}</p>
          <p className="mt-0.5 text-xs text-fg-muted nx-tnum">
            {formatBytes(session.uploadedBytes)} of {formatBytes(session.fileSizeBytes)}
            {resumable ? ` · chunk ${session.chunkIndex}/${session.totalChunks}` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          {resumable && session.phase === "uploading" ? (
            <Button variant="secondary" size="sm" onClick={onPause}>
              <IconPlayerPause />
              Pause
            </Button>
          ) : null}
          {resumable && session.phase === "paused" ? (
            <Button variant="primary" size="sm" onClick={onResume}>
              <IconPlayerPlay />
              Resume
            </Button>
          ) : null}
          {resumable && session.phase === "failed" ? (
            <Button variant="primary" size="sm" onClick={onResume}>
              <IconRefresh />
              Retry from chunk {session.chunkIndex}
            </Button>
          ) : null}
          {session.phase !== "complete" ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <ProgressBar
        value={percent}
        tone={
          session.phase === "failed"
            ? "danger"
            : session.phase === "complete"
              ? "success"
              : "accent"
        }
        striped={session.phase === "processing"}
        label={
          session.phase === "uploading"
            ? "Uploading"
            : session.phase === "paused"
              ? "Paused"
              : session.phase === "failed"
                ? "Upload interrupted"
                : session.phase === "processing"
                  ? "Processing — generating renditions and thumbnails"
                  : "Upload complete"
        }
        valueLabel={`${percent.toFixed(0)}%`}
      />

      {session.error ? (
        <p className="flex items-start gap-2 rounded border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-fg-muted">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          {session.error}
        </p>
      ) : null}

      {session.phase === "complete" ? (
        <p className="flex items-start gap-2 rounded border border-success/30 bg-success/10 p-3 text-xs leading-relaxed text-fg-muted">
          <IconCheck className="mt-0.5 size-4 shrink-0 text-success" />
          Transfer finished. Renditions and thumbnail suggestions are ready —
          continue to metadata.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------ Bulk import ------------------------------- */

function BulkImportPanel() {
  const [started, setStarted] = React.useState(false);
  const { data: rows = [], isLoading } = useBulkImport(started);
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);

  const columns: Array<Column<BulkImportRow>> = [
    {
      key: "file",
      header: "File",
      sortValue: (row) => row.fileName,
      cell: (row) => (
        <span className="font-mono text-xs text-fg-muted">{row.fileName}</span>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortValue: (row) => row.title,
      cell: (row) => <span className="font-medium text-fg">{row.title}</span>,
    },
    {
      key: "type",
      header: "Type",
      secondary: true,
      sortValue: (row) => row.contentType,
      cell: (row) => (
        <Badge tone="neutral" size="sm">
          {CONTENT_TYPE_LABELS[row.contentType]}
        </Badge>
      ),
    },
    {
      key: "language",
      header: "Language",
      secondary: true,
      sortValue: (row) => row.language,
      cell: (row) => row.language,
    },
    {
      key: "rating",
      header: "Rating",
      secondary: true,
      cell: (row) => <Badge tone="outline" size="sm">{row.ageRating}</Badge>,
    },
    {
      key: "access",
      header: "Access",
      secondary: true,
      cell: (row) => row.accessModel,
    },
    {
      key: "status",
      header: "Validation",
      sortValue: (row) => row.status,
      cell: (row) => (
        <div>
          <Badge
            tone={
              row.status === "ready"
                ? "published"
                : row.status === "warning"
                  ? "pending"
                  : "rejected"
            }
            size="sm"
          >
            {row.status}
          </Badge>
          {row.message ? (
            <p className="mt-1 max-w-xs text-2xs leading-snug text-fg-subtle">
              {row.message}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  if (!started) {
    return (
      <Card>
        <CardHeader
          title="Bulk upload & metadata import"
          description="For distributors and enterprise accounts. Upload a CSV or XML manifest alongside your masters and validate every row before publishing."
        />
        <CardBody>
          <div className="rounded-lg border-2 border-dashed border-border bg-surface-2 px-6 py-12 text-center">
            <IconTable className="mx-auto size-9 text-fg-subtle" />
            <p className="mt-3 font-display text-base font-semibold text-fg">
              Import a metadata manifest
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              CSV, TSV or Media Manifest XML. Rows are validated against your
              rights schedule before anything publishes.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => setStarted(true)}>
              Load a sample manifest
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const ready = rows.filter((row) => row.status !== "error");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg nx-tnum">
            {rows.length} rows · {ready.length} importable ·{" "}
            {rows.length - ready.length} blocked
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Fix errors in the manifest, or edit rows inline before importing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>
            Load a different manifest
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={ready.length === 0}
            onClick={() =>
              toast({
                title: `${selected.length || ready.length} titles queued`,
                description:
                  "Mock import — rows would be created as drafts for review.",
              })
            }
          >
            Import {selected.length || ready.length} rows
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-fg-muted">Validating manifest…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          pageSize={12}
          caption="Bulk import validation"
        />
      )}
    </div>
  );
}
