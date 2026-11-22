import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nextIpp } from "@/lib/ipp";
import { technicalPatientEmail } from "@/lib/patient-identity";

// Dossier patient d'un nouveau-né (néonatalogie, couveuse, vaccins...) : créé à l'accouchement,
// rattaché à la mère (Patient.motherPatientId) et au nouveau-né de l'accouchement (Newborn.patientId).
// Pas de compte de connexion (comme un patient sans e-mail). Le service est celui de néonatalogie
// ou de pédiatrie s'il existe, sinon celui de la mère. Module serveur sans « use server » : jamais
// appelable depuis le navigateur, seulement par les actions qui ont déjà contrôlé l'accès.

const PEDIATRIC_SERVICE = /n[ée]o-?nat|p[ée]diatr/i;

export async function createNewbornPatient(input: { newbornId: string; motherPatientId: string; rank: number; twins: boolean }) {
  const newborn = await prisma.newborn.findUnique({ where: { id: input.newbornId }, include: { delivery: true } });
  if (!newborn) throw new Error("Nouveau-né introuvable.");
  if (newborn.patientId) return newborn.patientId;
  if (newborn.vitalStatus === "STILLBIRTH") throw new Error("Pas de dossier pour un enfant mort-né.");

  const mother = await prisma.patient.findUnique({
    where: { id: input.motherPatientId },
    select: { id: true, organizationId: true, serviceId: true, address: true, user: { select: { lastName: true, phone: true } } },
  });
  if (!mother) throw new Error("Dossier de la mère introuvable.");

  const services = mother.organizationId
    ? await prisma.clinicService.findMany({ where: { organizationId: mother.organizationId, isActive: true }, select: { id: true, name: true } })
    : [];
  // Néonatalogie d'abord, puis pédiatrie, sinon le service de la mère (maternité).
  const pediatric = services.find((s) => /n[ée]o-?nat/i.test(s.name)) ?? services.find((s) => PEDIATRIC_SERVICE.test(s.name));
  const serviceId = pediatric?.id ?? mother.serviceId ?? null;

  const ipp = await nextIpp();
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  const firstName = input.twins ? `Bébé ${input.rank}` : "Bébé";

  const patientId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: technicalPatientEmail(ipp),
        passwordHash,
        firstName,
        lastName: mother.user.lastName,
        role: Role.PATIENT,
        phone: mother.user.phone,
        organizationId: mother.organizationId,
        isActive: false,
      },
    });
    const patient = await tx.patient.create({
      data: {
        ipp,
        userId: user.id,
        dateOfBirth: newborn.delivery.deliveredAt,
        sex: newborn.sex === "M" || newborn.sex === "F" ? newborn.sex : null,
        address: mother.address,
        emergencyContact: `Mère : ${mother.user.lastName}${mother.user.phone ? ` (${mother.user.phone})` : ""}`,
        dependencyLevel: 1,
        pathologies: [],
        allergies: [],
        organizationId: mother.organizationId,
        serviceId,
        motherPatientId: mother.id,
      },
    });
    await tx.newborn.update({ where: { id: newborn.id }, data: { patientId: patient.id } });
    return patient.id;
  });
  return patientId;
}
