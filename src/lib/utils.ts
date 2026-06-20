import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of intervals) {
    const v = Math.floor(seconds / secs);
    if (v >= 1) return `${v}${label} ago`;
  }
  return "just now";
}

// ── v4 dashboard view helpers ───────────────────────────────────────────────

/** Deterministic accent palette cycled by index (mirrors v4 mock palette). */
export const ACCENT_PALETTE = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#0f766e", // teal
  "#ea580c", // orange
  "#db2777", // pink
  "#0891b2", // cyan
  "#ca8a04", // amber
  "#4f46e5", // indigo
] as const;

export function accentForIndex(index: number): string {
  return ACCENT_PALETTE[index % ACCENT_PALETTE.length];
}

export function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function pluralize(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

export type Health = "On track" | "Needs review" | "At risk";

export function healthFromProgress(progress: number): Health {
  if (progress >= 80) return "On track";
  if (progress >= 50) return "Needs review";
  return "At risk";
}

export type PlanStatus = "Draft" | "Review" | "Ready" | "Blocked" | "Shipped";

/** Map OpenSpec task status (DB) → v4 plan-board status. */
export function taskStatusToPlan(status: string): PlanStatus {
  switch (status) {
    case "ready":
      return "Ready";
    case "in-progress":
    case "review":
      return "Review";
    case "done":
      return "Shipped";
    case "blocked":
      return "Blocked";
    case "backlog":
    default:
      return "Draft";
  }
}
