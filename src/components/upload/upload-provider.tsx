"use client";

import {
  IconArrowRight,
  IconCheck,
  IconCloudUpload,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";

export interface UploadDraftData {
  title: string;
  description: string;
  category: string;
  contentType: string;
  accessModel: string;
  kind: "video" | "audio";
  tags: string[];
  thumbnailUrl?: string;
  selectedPlaylistId?: string;
  selectedSeriesId?: string;
  ageRating?: string;
  language?: string;
  subtitles?: Array<{ label: string; language: string }>;
  restrictedCountries?: string[];
  isScheduled?: boolean;
  scheduledAt?: string;
  allowComments?: boolean;
  allowAdverts?: boolean;
  contentWarnings?: string[];
  participants?: string[];
  productionCompanies?: string[];
}

export interface ActiveUpload {
  id: string;
  fileName: string;
  fileSize: number;
  kind: "video" | "audio";
  progress: number;
  phase: "idle" | "uploading" | "processing" | "ready" | "error";
  step: number;
  furthestStep: number;
  draftData: UploadDraftData;
  startedAt: string;
}

interface UploadContextValue {
  activeUpload: ActiveUpload | null;
  startUpload: (file: { name: string; size: number; kind?: "video" | "audio" }) => void;
  updateDraftData: (patch: Partial<UploadDraftData>) => void;
  setStep: (step: number) => void;
  setFurthestStep: (step: number) => void;
  cancelUpload: () => void;
  clearUpload: () => void;
  dismissWidget: () => void;
  widgetDismissed: boolean;
}

const STORAGE_KEY = "nexus_bg_upload_draft_v2";

const DEFAULT_DRAFT_DATA: UploadDraftData = {
  title: "",
  description: "",
  category: "general",
  contentType: "creator",
  accessModel: "free",
  kind: "video",
  tags: [],
  language: "English",
  allowComments: true,
  allowAdverts: true,
  contentWarnings: [],
  participants: [],
  productionCompanies: [],
};

const UploadContext = React.createContext<UploadContextValue>({
  activeUpload: null,
  startUpload: () => {},
  updateDraftData: () => {},
  setStep: () => {},
  setFurthestStep: () => {},
  cancelUpload: () => {},
  clearUpload: () => {},
  dismissWidget: () => {},
  widgetDismissed: false,
});

export const useUploadContext = () => React.useContext(UploadContext);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();

  const [activeUpload, setActiveUpload] = React.useState<ActiveUpload | null>(null);
  const [widgetDismissed, setWidgetDismissed] = React.useState(false);
  const toastFiredRef = React.useRef(false);

  // Restore active draft from localStorage on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ActiveUpload;
        setActiveUpload(parsed);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }, []);

  // Save to localStorage whenever activeUpload changes
  React.useEffect(() => {
    try {
      if (activeUpload) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activeUpload));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage unavailable or quota exceeded
    }
  }, [activeUpload]);

  // Background upload & processing progress simulator
  React.useEffect(() => {
    if (!activeUpload || activeUpload.phase === "ready" || activeUpload.phase === "error" || activeUpload.phase === "idle") {
      return;
    }

    const timer = setInterval(() => {
      setActiveUpload((current) => {
        if (!current || current.phase === "ready" || current.phase === "idle") return current;

        const nextProgress = Math.min(100, current.progress + (current.phase === "uploading" ? 4 : 2));
        let nextPhase: ActiveUpload["phase"] = current.phase;

        if (nextProgress >= 80 && current.phase === "uploading") {
          nextPhase = "processing";
        }

        if (nextProgress >= 100) {
          nextPhase = "ready";
          if (!toastFiredRef.current) {
            toastFiredRef.current = true;
            toast({
              title: "Upload & Transcoding Complete!",
              description: `'${current.draftData.title || current.fileName}' has finished processing and is saved as a draft. Click to review & publish.`,
            });
          }
        }

        return {
          ...current,
          progress: nextProgress,
          phase: nextPhase,
        };
      });
    }, 300);

    return () => clearInterval(timer);
  }, [activeUpload, toast]);

  const startUpload = React.useCallback(
    (file: { name: string; size: number; kind?: "video" | "audio" }) => {
      const rawTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const autoTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
      toastFiredRef.current = false;
      setWidgetDismissed(false);

      const newUpload: ActiveUpload = {
        id: `upload_${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        kind: file.kind ?? "video",
        progress: 5,
        phase: "uploading",
        step: 0,
        furthestStep: 0,
        startedAt: new Date().toISOString(),
        draftData: {
          ...DEFAULT_DRAFT_DATA,
          title: autoTitle,
          kind: file.kind ?? "video",
        },
      };

      setActiveUpload(newUpload);
      toast({
        title: "Background Upload Started",
        description: `Uploading '${file.name}'. You can freely navigate to other pages — progress will be saved in the background.`,
      });
    },
    [toast],
  );

  const updateDraftData = React.useCallback((patch: Partial<UploadDraftData>) => {
    setActiveUpload((current) => {
      if (!current) return current;
      return {
        ...current,
        draftData: {
          ...current.draftData,
          ...patch,
        },
      };
    });
  }, []);

  const setStep = React.useCallback((step: number) => {
    setActiveUpload((current) => {
      if (!current) return current;
      const nextFurthest = Math.max(current.furthestStep, step);
      return {
        ...current,
        step,
        furthestStep: nextFurthest,
      };
    });
  }, []);

  const setFurthestStep = React.useCallback((furthestStep: number) => {
    setActiveUpload((current) => {
      if (!current) return current;
      return {
        ...current,
        furthestStep: Math.max(current.furthestStep, furthestStep),
      };
    });
  }, []);

  const cancelUpload = React.useCallback(() => {
    setActiveUpload(null);
    localStorage.removeItem(STORAGE_KEY);
    toast({ title: "Upload cancelled and draft cleared" });
  }, [toast]);

  const clearUpload = React.useCallback(() => {
    setActiveUpload(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const dismissWidget = React.useCallback(() => {
    setWidgetDismissed(true);
  }, []);

  const contextValue = React.useMemo<UploadContextValue>(
    () => ({
      activeUpload,
      startUpload,
      updateDraftData,
      setStep,
      setFurthestStep,
      cancelUpload,
      clearUpload,
      dismissWidget,
      widgetDismissed,
    }),
    [
      activeUpload,
      startUpload,
      updateDraftData,
      setStep,
      setFurthestStep,
      cancelUpload,
      clearUpload,
      dismissWidget,
      widgetDismissed,
    ],
  );

  return (
    <UploadContext.Provider value={contextValue}>
      {children}

      {/* Floating Background Upload Progress Widget */}
      {activeUpload && !widgetDismissed && activeUpload.phase !== "idle" ? (
        <div className="fixed bottom-5 right-5 z-[99] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2 rounded-xl border border-border bg-surface-2/95 p-3.5 shadow-2xl backdrop-blur-md transition-all animate-slide-up">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={
                  activeUpload.phase === "ready"
                    ? "flex size-8 items-center justify-center rounded-lg bg-success/15 text-success"
                    : "flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent"
                }
              >
                {activeUpload.phase === "ready" ? (
                  <IconCheck className="size-4 text-success" />
                ) : (
                  <IconCloudUpload className="size-4 animate-pulse" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-fg">
                  {activeUpload.draftData.title || activeUpload.fileName}
                </p>
                <p className="text-2xs text-fg-subtle">
                  {activeUpload.phase === "ready"
                    ? "Upload complete · Saved as draft"
                    : activeUpload.phase === "processing"
                      ? "Transcoding & generating thumbnails..."
                      : `Uploading · Step ${activeUpload.step + 1} of 6`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissWidget}
              className="text-fg-subtle hover:text-fg transition-colors p-1"
              aria-label="Dismiss upload widget"
            >
              <IconX className="size-4" />
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-2xs text-fg-muted">
              <span>{activeUpload.phase === "ready" ? "Ready to publish" : `${Math.round(activeUpload.progress)}% complete`}</span>
              <Badge tone={activeUpload.phase === "ready" ? "published" : "accent"} size="sm">
                {activeUpload.phase === "ready" ? "Ready" : `${Math.round(activeUpload.progress)}%`}
              </Badge>
            </div>
            <ProgressBar value={activeUpload.progress} size="sm" />
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-border/60">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => router.push("/studio/upload")}
              className="gap-1 text-2xs"
            >
              Open Studio Upload
              <IconArrowRight className="size-3" />
            </Button>
          </div>
        </div>
      ) : null}
    </UploadContext.Provider>
  );
}
