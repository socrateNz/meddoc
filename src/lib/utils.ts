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
  // Erreur technique (base de données, réseau, bug) : jamais montrée telle quelle à l'utilisateur —
  // elle est illisible pour lui et expose des détails internes. Seuls les messages écrits pour lui
  // (throw new Error("...") dans les actions) passent.
  if (isTechnicalError(error)) {
    console.error(fallback, error);
    return isUnavailableError(error) ? SERVICE_UNAVAILABLE_MESSAGE : fallback;
  }
  return error?.message || fallback;
}

export const SERVICE_UNAVAILABLE_MESSAGE = "Le service est momentanément indisponible. Vérifiez votre connexion et réessayez dans un instant.";

const TECHNICAL_ERROR_NAMES = new Set([
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientRustPanicError",
  "PrismaClientValidationError",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
]);

const TECHNICAL_MESSAGE = /invocation|prisma|Server selection timeout|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|os error|MongoServer|Mongo(Network|Server)Error|fetch failed|socket hang up|Cannot read propert|is not a function|undefined is not|stack trace/i;

export function isTechnicalError(error: any): boolean {
  if (!error) return false;
  if (TECHNICAL_ERROR_NAMES.has(error.name) || TECHNICAL_ERROR_NAMES.has(error.constructor?.name)) return true;
  return typeof error.message === "string" && TECHNICAL_MESSAGE.test(error.message);
}

// Base de données ou réseau injoignable (plutôt qu'un bug) : on invite à réessayer.
export function isUnavailableError(error: any): boolean {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /PrismaClientInitializationError|Server selection timeout|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|os error|fetch failed|socket hang up|No available servers|Can't reach database/i.test(text);
}
