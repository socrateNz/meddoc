import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";

// Lecture seule pour la réplication RxDB du catalogue pharmacie (cf. src/lib/offline-db.ts) —
// composer un panier de caisse hors-ligne (nom, prix, dernier stock connu) sans pouvoir rien
// modifier par ce chemin. Mêmes rôles que la caisse (src/actions/registers.ts,
// assertRegisterOperateRole) plus le pharmacien, qui dispense depuis le même catalogue.
const OFFLINE_READ_ROLES = ["COORDINATOR", "CASHIER", "PHARMACIST", "ADMIN"];

function toReplicatedDoc(item: {
  id: string;
  name: string;
  dosage: string | null;
  unitPrice: number;
  stockQuantity: number;
  saleBlockedAt: Date | null;
  saleBlockedReason: string | null;
  organizationId: string | null;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    dosage: item.dosage,
    unitPrice: item.unitPrice,
    stockQuantity: item.stockQuantity,
    saleBlockedAt: item.saleBlockedAt ? item.saleBlockedAt.toISOString() : null,
    saleBlockedReason: item.saleBlockedReason,
    organizationId: item.organizationId,
    updatedAt: item.updatedAt.toISOString(),
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
    const batchSize = Math.min(Math.max(Number(searchParams.get("limit")) || 200, 1), 500);

    const orgFilter: Prisma.PharmacyItemWhereInput =
      currentUser.organization?.type === "HOLDING"
        ? { OR: [{ organizationId: currentUser.organizationId }, { organization: { parentId: currentUser.organizationId } }] }
        : { organizationId: currentUser.organizationId };

    const where = checkpointUpdatedAt
      ? {
          AND: [
            orgFilter,
            {
              OR: [
                { updatedAt: { gt: new Date(checkpointUpdatedAt) } },
                { updatedAt: new Date(checkpointUpdatedAt), id: { gt: checkpointId ?? "" } },
              ],
            },
          ],
        }
      : orgFilter;

    const items = await prisma.pharmacyItem.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        name: true,
        dosage: true,
        unitPrice: true,
        stockQuantity: true,
        saleBlockedAt: true,
        saleBlockedReason: true,
        organizationId: true,
        updatedAt: true,
      },
    });

    const documents = items.map(toReplicatedDoc);
    const last = items[items.length - 1];
    const checkpoint = last
      ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
      : checkpointUpdatedAt
        ? { updatedAt: checkpointUpdatedAt, id: checkpointId ?? "" }
        : null;

    return NextResponse.json({ documents, checkpoint });
  } catch (error) {
    console.error("Sync pharmacy-items pull error:", error);
    return NextResponse.json({ error: "Erreur lors de la synchronisation." }, { status: 500 });
  }
}
