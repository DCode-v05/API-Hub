'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '@/lib/ui';

/* ── Button ───────────────────────────────────────────────────────────── */

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-foreground text-background hover:bg-foreground/90',
  secondary: 'border border-border bg-muted text-foreground hover:bg-muted/60',
  outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
  danger: 'bg-danger text-white hover:bg-danger/90',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-[15px]',
  icon: 'h-9 w-9',
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/* ── Card ─────────────────────────────────────────────────────────────── */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg border border-border bg-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('flex items-center justify-between gap-3 border-b border-border px-5 py-3.5', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('text-sm font-semibold tracking-tight', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('p-5', className)} {...props} />;
}

/* ── Badge ────────────────────────────────────────────────────────────── */

type BadgeVariant = 'muted' | 'outline' | 'accent' | 'success' | 'warning' | 'danger';
const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  muted: 'bg-muted text-muted-foreground',
  outline: 'border border-border text-muted-foreground',
  accent: 'border border-accent/25 bg-accent/10 text-accent',
  success: 'border border-success/25 bg-success/10 text-success',
  warning: 'border border-warning/25 bg-warning/10 text-warning',
  danger: 'border border-danger/25 bg-danger/10 text-danger',
};

export function Badge({
  variant = 'muted',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', BADGE_VARIANTS[variant], className)}
      {...props}
    />
  );
}

/* ── Form controls ────────────────────────────────────────────────────── */

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx('text-[13px] font-medium text-foreground', className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors',
          'placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/15',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        spellCheck={false}
        className={cx(
          'w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground transition-colors',
          'placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/15',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const generatedId = React.useId();
  const id = htmlFor ?? generatedId;
  // Associate the label with the field's control so clicking the label focuses it and screen
  // readers announce the accessible name.
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: (children as React.ReactElement<{ id?: string }>).props.id ?? id,
      })
    : children;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {child}
    </div>
  );
}

/* ── Segmented control ────────────────────────────────────────────────── */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-full gap-1 rounded-md border border-border bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Spinner ──────────────────────────────────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin', className)} />;
}
