import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { temporaryFileLink } from "@/lib/medical-files-server";

// Consultation d'un fichier médical (document scanné, cliché d'imagerie) : seul point d'accès aux
// fichiers, tous privés sur Cloudinary. Vérifie l'accès au patient, trace la consultation dans le
// journal d'audit, puis redirige vers un lien Cloudinary valable quelques minutes — l'adresse
// stable de ce fichier (/api/files/<id>) ne donne donc jamais accès au contenu sans session.
const FILE_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await rateLimitOrResponse(req, 120, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(FILE_READ_ROLES);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });

    const file = await prisma.medicalFile.findUnique({ where: { id } });
    if (!file || file.deletedAt) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    if (!(await verifyPatientAccess(file.patientId, auth.user))) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    await logAuditAction(auth.user.id, "VIEW_MEDICAL_FILE", "MedicalFile", file.id, { patientId: file.patientId });

    const response = NextResponse.redirect(temporaryFileLink(file), 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Erreur lors de l'ouverture d'un fichier médical:", error);
    return NextResponse.json({ error: "Impossible d'ouvrir ce document." }, { status: 500 });
  }
}
