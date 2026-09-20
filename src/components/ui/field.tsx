"use client";

import { IconEye, IconEyeOff } from "@tabler/icons-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------- Field ---------------------------------- */

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
  /** Right-aligned helper, e.g. a character counter. */
  aside?: React.ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
  aside,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label ? (
            <label
              htmlFor={htmlFor}
              className="text-sm font-medium text-fg leading-tight"
            >
              {label}
              {required ? <span className="text-accent"> *</span> : null}
            </label>
          ) : (
            <span />
          )}
          {aside ? (
            <span className="text-2xs text-fg-subtle nx-tnum">{aside}</span>
          ) : null}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------- Input ---------------------------------- */

const controlBase =
  "w-full rounded border bg-surface-2 text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  sizeVariant?: "sm" | "md";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className, invalid, leading, trailing, sizeVariant = "md", ...props },
    ref,
  ) {
    const height = sizeVariant === "sm" ? "h-8 text-sm" : "h-10 text-sm";
    const input = (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          height,
          invalid ? "border-danger" : "border-border",
          leading ? "pl-9" : "pl-3",
          trailing ? "pr-9" : "pr-3",
          className,
        )}
        {...props}
      />
    );

    if (!leading && !trailing) return input;

    return (
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle [&_svg]:size-4">
            {leading}
          </span>
        ) : null}
        {input}
        {trailing ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle [&_svg]:size-4">
            {trailing}
          </span>
        ) : null}
      </div>
    );
  },
);

/* --------------------------- Password input ------------------------------ */

/** Input with a show/hide toggle — every real password-entry field (sign in, register,
 * set a new password) should use this rather than plain `type="password"`, so someone
 * can check what they typed before submitting. Not used for the account settings
 * parental PIN field, which is deliberately masked-only by design ("never displayed
 * once set") — a reveal toggle there would contradict its own stated purpose. */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type" | "trailing">
>(function PasswordInput({ leading, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? "text" : "password"}
      leading={leading}
      trailing={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="pointer-events-auto flex items-center rounded text-fg-subtle hover:text-fg"
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      }
      {...props}
    />
  );
});

/* ----------------------------- Textarea --------------------------------- */

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        "px-3 py-2 text-sm leading-relaxed resize-y",
        invalid ? "border-danger" : "border-border",
        className,
      )}
      {...props}
    />
  );
});

/* ------------------------------ Select ---------------------------------- */

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  sizeVariant?: "sm" | "md";
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid, sizeVariant = "md", children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            controlBase,
            sizeVariant === "sm" ? "h-8 text-sm" : "h-10 text-sm",
            "appearance-none pl-3 pr-9",
            invalid ? "border-danger" : "border-border",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  },
);

/* ----------------------------- Checkbox --------------------------------- */

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, label, description, id, ...props }, ref) {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className={cn("flex gap-2.5", className)}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm border border-border-strong bg-surface-2 accent-[rgb(var(--nx-accent))]"
          {...props}
        />
        {(label || description) && (
          <div className="min-w-0">
            {label ? (
              <label
                htmlFor={inputId}
                className="block cursor-pointer text-sm text-fg leading-snug"
              >
                {label}
              </label>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);

/* ------------------------------- Radio ---------------------------------- */

export interface RadioCardProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  icon,
  disabled,
  size = "md",
}: RadioCardProps) {
  const isSm = size === "sm";

  return (
    <label
      className={cn(
        "group relative flex cursor-pointer rounded border transition-colors",
        isSm ? "gap-2.5 p-2.5 sm:p-3" : "gap-3 p-3.5",
        checked
          ? "border-accent bg-accent/[0.07]"
          : "border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {icon ? (
        <span
          className={cn(
            isSm ? "mt-0.5 [&_svg]:size-4" : "mt-0.5 [&_svg]:size-5",
            checked ? "text-accent" : "text-fg-muted",
          )}
        >
          {icon}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "mt-1 size-4 shrink-0 rounded-full border-2 transition-colors",
            checked ? "border-accent bg-accent" : "border-border-strong",
          )}
        >
          {checked ? (
            <span className="block size-full scale-[0.35] rounded-full bg-accent-fg" />
          ) : null}
        </span>
      )}
      <div className="min-w-0">
        <p className={cn("font-medium text-fg", isSm ? "text-xs sm:text-sm" : "text-sm")}>
          {title}
        </p>
        {description ? (
          <p
            className={cn(
              "leading-snug text-fg-muted",
              isSm ? "mt-0.5 text-2xs sm:text-xs" : "mt-0.5 text-xs leading-relaxed",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
    </label>
  );
}

/* ------------------------------ Switch ---------------------------------- */

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
}: SwitchProps) {
  const generatedId = React.useId();
  const switchId = id ?? generatedId;
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <div className="min-w-0">
          {label ? (
            <label htmlFor={switchId} className="block text-sm font-medium text-fg">
              {label}
            </label>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked
            ? "border-accent bg-accent"
            : "border-border-strong bg-surface-3",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-all",
            checked
              ? "left-[calc(100%-1.25rem)] bg-accent-fg"
              : "left-1 bg-fg-muted",
          )}
        />
      </button>
    </div>
  );
}
