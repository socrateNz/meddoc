import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MAX_PAGE_SIZE } from "@/lib/pagination";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";

// Lecture seule pour la réplication RxDB du catalogue d'examens (cf. src/lib/offline-db.ts) —
// mêmes rôles que listLabTests (src/actions/lab.ts, assertLabReadRole), aucune écriture possible
// par ce chemin.
const OFFLINE_READ_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER", "ADMIN"];

function toReplicatedDoc(test: {
  id: string;
  name: string;
  department: string | null;
  basePrice: number;
  organizationId: string | null;
  updatedAt: Date;
}) {
  return {
    id: test.id,
    name: test.name,
    department: test.department,
    basePrice: test.basePrice,
    organizationId: test.organizationId,
    updatedAt: test.updatedAt.toISOString(),
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
    const batchSize = Math.min(Math.max(Number(searchParams.get("limit")) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const orgFilter: Prisma.LabTestWhereInput =
      currentUser.organization?.type === "HOLDING"
        ? { OR: [{ organizationId: currentUser.organizationId }, { organization: { parentId: currentUser.organizationId } }] }
        : { organizationId: currentUser.organizationId };

    const where = checkpointUpdatedAt
      ? {
          AND: [
            orgFilter,
            { isActive: true },
            {
              OR: [
                { updatedAt: { gt: new Date(checkpointUpdatedAt) } },
                { updatedAt: new Date(checkpointUpdatedAt), id: { gt: checkpointId ?? "" } },
              ],
            },
          ],
        }
      : { AND: [orgFilter, { isActive: true }] };

    const tests = await prisma.labTest.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true, name: true, department: true, basePrice: true, organizationId: true, updatedAt: true },
    });

    const documents = tests.map(toReplicatedDoc);
    const last = tests[tests.length - 1];
    const checkpoint = last
      ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
      : checkpointUpdatedAt
        ? { updatedAt: checkpointUpdatedAt, id: checkpointId ?? "" }
        : null;

    return NextResponse.json({ documents, checkpoint });
  } catch (error) {
    console.error("Sync lab-tests pull error:", error);
    return NextResponse.json({ error: "Erreur lors de la synchronisation." }, { status: 500 });
  }
}
