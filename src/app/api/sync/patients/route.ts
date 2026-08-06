import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { getOrgScopeWhere } from "@/lib/org-scope";

// Lecture seule pour la réplication RxDB Phase 1 — aucune écriture de Patient hors-ligne,
// les modifications passent toujours par les Server Actions existantes (createPatient,
// reassignPatient...) quand le réseau est disponible.
const OFFLINE_READ_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

// Les champs sensibles sont renvoyés en clair ici (protégés en transit par TLS) : le
// chiffrement au repos se fait côté client, juste avant l'écriture dans le storage local
// (cf. src/lib/offline-db.ts, pull.modifier + src/lib/offline-crypto.ts). Le serveur ne
// détient jamais la clé de chiffrement locale.
function toReplicatedDoc(patient: {
  id: string;
  organizationId: string | null;
  status: string;
  dependencyLevel: number;
  updatedAt: Date;
  dateOfBirth: Date;
  address: string;
  allergies: string[];
  pathologies: string[];
  user: { firstName: string; lastName: string; email: string };
}) {
  return {
    id: patient.id,
    firstName: patient.user.firstName,
    lastName: patient.user.lastName,
    email: patient.user.email,
    address: patient.address,
    allergies: patient.allergies,
    pathologies: patient.pathologies,
    dateOfBirth: patient.dateOfBirth.toISOString(),
    organizationId: patient.organizationId,
    status: patient.status,
    dependencyLevel: patient.dependencyLevel,
    updatedAt: patient.updatedAt.toISOString(),
    _deleted: false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimitOrResponse(req, 30, 60000);
    if (limited) return limited;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }
    if (!OFFLINE_READ_ROLES.includes(currentUser.role)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const checkpointUpdatedAt = searchParams.get("updatedAt");
    const checkpointId = searchParams.get("id");
    const batchSize = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

    const orgScope = getOrgScopeWhere(currentUser);
    // orgScope peut lui-même porter un `OR` (cas HOLDING) : composer via `AND` plutôt que
    // spread, sinon un second `OR` top-level écraserait celui d'orgScope et ferait fuiter des
    // patients hors de la portée organisationnelle de l'utilisateur.
    const where = checkpointUpdatedAt
      ? {
          AND: [
            orgScope,
            {
              OR: [
                { updatedAt: { gt: new Date(checkpointUpdatedAt) } },
                { updatedAt: new Date(checkpointUpdatedAt), id: { gt: checkpointId ?? "" } },
              ],
            },
          ],
        }
      : orgScope;

    const patients = await prisma.patient.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: batchSize,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    const documents = patients.map(toReplicatedDoc);
    const last = patients[patients.length - 1];
    const checkpoint = last
      ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
      : checkpointUpdatedAt
        ? { updatedAt: checkpointUpdatedAt, id: checkpointId ?? "" }
        : null;

    return NextResponse.json({ documents, checkpoint });
  } catch (error: any) {
    console.error("Sync patients pull error:", error);
    return NextResponse.json({ error: "Erreur lors de la synchronisation." }, { status: 500 });
  }
}
