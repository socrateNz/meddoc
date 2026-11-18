import { prisma } from "@/lib/db";

// Une demande (examen, imagerie, ordonnance) rattachée à une visite prénatale doit viser la
// patiente de cette grossesse — refuse un identifiant de visite d'une autre patiente.
export async function assertPrenatalVisitOfPatient(prenatalVisitId: string, patientId: string) {
  const visit = await prisma.prenatalVisit.findUnique({
    where: { id: prenatalVisitId },
    select: { pregnancy: { select: { patientId: true } } },
  });
  if (!visit || visit.pregnancy.patientId !== patientId) throw new Error("Visite prénatale introuvable pour cette patiente.");
}
