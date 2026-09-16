"use client";

// Shared by Magazine and Exchange Hub creation — picking "which project is this about"
// should come from a creator's own published work when they have any, rather than being
// retyped as free text that could drift from the real title. Falls back to a plain name
// field when there's nothing real to pick from yet (real video publishing is still mock,
// so most accounts have zero eligible uploads today) — see each caller's own comment.
import * as React from "react";
import { Field, Input, Select } from "@/components/ui/field";

export interface ProjectPickerVideo {
  id: string;
  title: string;
}

export function ProjectPicker({
  videos,
  name,
  videoId,
  onChange,
  label,
  hint,
  namePlaceholder = "The Saltmarsh",
}: {
  videos: ProjectPickerVideo[];
  name: string;
  videoId: string;
  onChange: (next: { name: string; videoId: string }) => void;
  label: string;
  hint?: string;
  namePlaceholder?: string;
}) {
  const hasVideos = videos.length > 0;
  const [customMode, setCustomMode] = React.useState(!hasVideos);

  if (!hasVideos || customMode) {
    return (
      <Field label={label} htmlFor="project-picker-name" required>
        <Input
          id="project-picker-name"
          value={name}
          onChange={(event) => onChange({ name: event.target.value, videoId: "" })}
          placeholder={namePlaceholder}
        />
        {hasVideos ? (
          <button
            type="button"
            className="mt-1.5 text-xs text-accent underline-offset-2 hover:underline"
            onClick={() => setCustomMode(false)}
          >
            Choose from your uploads instead
          </button>
        ) : null}
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor="project-picker-select" required hint={hint}>
      <Select
        id="project-picker-select"
        value={videoId}
        onChange={(event) => {
          const selected = videos.find((video) => video.id === event.target.value);
          onChange({ name: selected?.title ?? "", videoId: event.target.value });
        }}
      >
        <option value="">Select an upload…</option>
        {videos.map((video) => (
          <option key={video.id} value={video.id}>
            {video.title}
          </option>
        ))}
      </Select>
      <button
        type="button"
        className="mt-1.5 text-xs text-accent underline-offset-2 hover:underline"
        onClick={() => setCustomMode(true)}
      >
        Something else — type a name
      </button>
    </Field>
  );
}
