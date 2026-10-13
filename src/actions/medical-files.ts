"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { MAX_FILE_BYTES, MEDICAL_FILE_CATEGORIES, belongsToPatientFolder, isAllowedFormat } from "@/lib/medical-files";
import { destroyUploadedResource, fetchUploadedResource, signPatientUpload } from "@/lib/medical-files-server";

// Fichiers médicaux (étape D de l'audit d'évolution) — documents scannés du dossier patient et
// clichés d'imagerie, stockés sur Cloudinary sans URL publique (cf. src/lib/medical-files-server.ts).
// Envoi : 1) requestUploadSignature (paramètres signés, dossier du patient imposé), 2) envoi direct
// navigateur → Cloudinary, 3) attachMedicalFile (vérification du fichier réellement reçu).
const FILE_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const FILE_WRITE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

async function requirePatientFileUser(patientId: string, roles: string[]) {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");
  if (!roles.includes(activeUser.role)) throw new Error("Non autorisé.");
  if (!(await verifyPatientAccess(patientId, activeUser))) {
    throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
  }
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { organizationId: true } });
  if (!patient?.organizationId) throw new Error("Patient introuvable.");
  return { activeUser, organizationId: patient.organizationId };
}

export async function requestUploadSignature(patientId: string) {
  try {
    z.string().min(1).parse(patientId);
    const { organizationId } = await requirePatientFileUser(patientId, FILE_WRITE_ROLES);
    return { success: true as const, data: signPatientUpload(organizationId, patientId) };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Impossible de préparer l'envoi du fichier.") };
  }
}

const attachSchema = z.object({
  patientId: z.string().min(1),
  publicId: z.string().min(1),
  resourceType: z.enum(["image", "raw"]),
  category: z.enum(MEDICAL_FILE_CATEGORIES),
  originalName: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  medicalRecordId: z.string().min(1).optional(),
  radiologyOrderId: z.string().min(1).optional(),
});

export async function attachMedicalFile(data: z.input<typeof attachSchema>) {
  try {
    const input = attachSchema.parse(data);
    const { activeUser, organizationId } = await requirePatientFileUser(input.patientId, FILE_WRITE_ROLES);

    // Seul un fichier envoyé dans le dossier de CE patient (identifiant imposé par la signature)
    // peut lui être rattaché.
    if (!belongsToPatientFolder(input.publicId, organizationId, input.patientId)) {
      throw new Error("Fichier invalide pour ce patient.");
    }

    // Taille et format vérifiés sur le fichier réellement reçu par Cloudinary, jamais sur les
    // métadonnées déclarées par le navigateur.
    const uploaded = await fetchUploadedResource(input.publicId, input.resourceType);
    if (!uploaded) throw new Error("Fichier introuvable sur le stockage : l'envoi a peut-être échoué.");
    if (!isAllowedFormat(uploaded.format) || uploaded.bytes > MAX_FILE_BYTES) {
      await destroyUploadedResource(input.publicId, uploaded.resourceType);
      throw new Error("Fichier refusé : PDF, JPEG ou PNG de 20 Mo maximum.");
    }

    if (input.medicalRecordId) {
      const record = await prisma.medicalRecord.findUnique({ where: { id: input.medicalRecordId }, select: { patientId: true } });
      if (record?.patientId !== input.patientId) throw new Error("Document du dossier invalide pour ce patient.");
    }
    if (input.radiologyOrderId) {
      const order = await prisma.radiologyOrder.findUnique({ where: { id: input.radiologyOrderId }, select: { patientId: true, status: true } });
      if (order?.patientId !== input.patientId) throw new Error("Examen d'imagerie invalide pour ce patient.");
      // Un compte-rendu validé porte sur des clichés précis : on n'en ajoute plus ensuite.
      if (order.status === "VALIDATED" || order.status === "CANCELLED") {
        throw new Error("Cet examen est validé ou annulé : aucun cliché ne peut plus y être ajouté.");
      }
    }

    const file = await prisma.medicalFile.create({
      data: {
        organizationId,
        patientId: input.patientId,
        category: input.category,
        title: input.title || null,
        publicId: input.publicId,
        resourceType: uploaded.resourceType,
        format: uploaded.format.toLowerCase(),
        bytes: uploaded.bytes,
        originalName: input.originalName,
        uploadedById: activeUser.id,
        medicalRecordId: input.medicalRecordId || null,
        radiologyOrderId: input.radiologyOrderId || null,
      },
    });

    await logAuditAction(activeUser.id, "UPLOAD_MEDICAL_FILE", "MedicalFile", file.id, {
      patientId: input.patientId,
      category: input.category,
      bytes: uploaded.bytes,
    });
    revalidatePath(`/dashboard/patients/${input.patientId}`);
    return { success: true as const, data: { id: file.id } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement du fichier.") };
  }
}

export async function listPatientFiles(data: { patientId: string; category?: (typeof MEDICAL_FILE_CATEGORIES)[number]; radiologyOrderId?: string }) {
  try {
    z.object({ patientId: z.string().min(1) }).parse(data);
    const { activeUser } = await requirePatientFileUser(data.patientId, FILE_READ_ROLES);

    const files = await prisma.medicalFile.findMany({
      where: {
        patientId: data.patientId,
        ...(data.category ? { category: data.category } : {}),
        ...(data.radiologyOrderId ? { radiologyOrderId: data.radiologyOrderId } : {}),
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      orderBy: { createdAt: "desc" },
    });
    const uploaders = await prisma.user.findMany({
      where: { id: { in: [...new Set(files.map((f) => f.uploadedById))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(uploaders.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return {
      success: true as const,
      data: files.map((f) => ({
        id: f.id,
        title: f.title,
        originalName: f.originalName,
        format: f.format,
        bytes: f.bytes,
        category: f.category,
        createdAt: f.createdAt.toISOString(),
        uploadedBy: nameById.get(f.uploadedById) ?? null,
        canRemove: activeUser.role === "COORDINATOR" || f.uploadedById === activeUser.id,
      })),
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des documents.") };
  }
}

// Retrait d'un fichier du dossier : masqué mais conservé (traçabilité médico-légale), par son
// auteur ou un coordinateur.
export async function removeMedicalFile(fileId: string) {
  try {
    z.string().min(1).parse(fileId);
    const file = await prisma.medicalFile.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt) throw new Error("Document introuvable.");
    const { activeUser } = await requirePatientFileUser(file.patientId, FILE_WRITE_ROLES);
    if (activeUser.role !== "COORDINATOR" && file.uploadedById !== activeUser.id) {
      throw new Error("Seul l'auteur de l'envoi ou un coordinateur peut retirer ce document.");
    }

    await prisma.medicalFile.update({ where: { id: fileId }, data: { deletedAt: new Date(), deletedById: activeUser.id } });
    await logAuditAction(activeUser.id, "REMOVE_MEDICAL_FILE", "MedicalFile", fileId, { patientId: file.patientId });
    revalidatePath(`/dashboard/patients/${file.patientId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du retrait du document.") };
  }
}
