import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export type ApiUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Identité prise UNIQUEMENT dans le cookie de session signé (cf. getCurrentUser), jamais dans des
// en-têtes envoyés par le client : un en-tête `x-user-role` est librement falsifiable.
export async function requireApiUser(
  allowedRoles?: string[]
): Promise<{ user: ApiUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { response: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  }
  return { user };
}
