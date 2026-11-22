import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions-catalog";

export type ApiUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Identité prise UNIQUEMENT dans le cookie de session signé (cf. getCurrentUser), jamais dans des
// en-têtes envoyés par le client : un en-tête `x-user-role` est librement falsifiable.
// `access` : une permission (cf. src/lib/permissions-catalog.ts), ou une liste de rôles pour les
// contrôles d'identité (admin de holding...).
export async function requireApiUser(
  access?: Permission | string[]
): Promise<{ user: ApiUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  const allowed = !access || (Array.isArray(access) ? access.includes(user.role) : can(user, access));
  if (!allowed) {
    return { response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  }
  return { user };
}
