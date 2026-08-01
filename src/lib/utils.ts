import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formats a caught error for Server Action responses, turning zod validation
// errors into their first human-readable issue instead of a raw JSON blob.
export function toErrorMessage(error: any, fallback: string): string {
  if (error?.name === "ZodError" && error.issues?.[0]?.message) {
    return error.issues[0].message;
  }
  return error?.message || fallback;
}
