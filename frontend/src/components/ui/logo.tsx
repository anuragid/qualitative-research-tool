import { cn } from "../../lib/utils";

const sizeClasses = {
  hero: "text-[64px] leading-none",
  heading: "text-[42px] leading-none",
  section: "text-[28px] leading-none",
  // Inherits the container's font. text-h4 would also switch to DM Serif Display;
  // the landing nav and footer set their own sans 20px/22px.
  sidebar: "",
  inline: "text-[inherit] leading-[inherit]",
} as const;

type LogoSize = keyof typeof sizeClasses;

interface LogoProps {
  size?: LogoSize;
  className?: string;
}

export function Logo({ size = "sidebar", className }: LogoProps) {
  return (
    <span
      className={cn(
        "font-semibold tracking-[-0.02em] select-none whitespace-nowrap",
        sizeClasses[size],
        className,
      )}
      aria-label="methodex"
    >
      metho
      <em className="italic text-[var(--color-brand-accent)] dark:text-[var(--color-brand-accent-dark)]">
        dex
      </em>
    </span>
  );
}
