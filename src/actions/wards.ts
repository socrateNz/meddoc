"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getOrCreateClinicWards(clinicId: string) {
  try {
    // 1. Fetch existing wards for this clinic
    let wards = await prisma.ward.findMany({
      where: { organizationId: clinicId },
      orderBy: { code: "asc" }
    });

    // 2. If no wards exist, initialize them
    if (wards.length === 0) {
      const defaultWards = [
        { name: "Urgences", code: "EMERGENCY", capacity: 20 },
        { name: "Soins Intensifs", code: "ICU", capacity: 10 },
        { name: "Chirurgie & Ambulatoire", code: "SURGERY", capacity: 30 }
      ];

      // Create wards
      const createdWards = [];
      for (const dw of defaultWards) {
        const w = await prisma.ward.create({
          data: {
            name: dw.name,
            code: dw.code,
            capacity: dw.capacity,
            organizationId: clinicId
          }
        });
        createdWards.push(w);
      }
      wards = createdWards;

      // 3. Assign existing patients to these newly created wards dynamically based on clinical state
      const patients = await prisma.patient.findMany({
        where: { organizationId: clinicId },
        include: { incidents: { where: { status: "OPEN" } } }
      });

      const emergencyWard = wards.find(w => w.code === "EMERGENCY");
      const icuWard = wards.find(w => w.code === "ICU");
      const surgeryWard = wards.find(w => w.code === "SURGERY");

      for (const p of patients) {
        let assignedWardId: string | null = null;

        if (p.incidents.length > 0 && emergencyWard) {
          assignedWardId = emergencyWard.id;
        } else if (p.dependencyLevel >= 4 && icuWard) {
          assignedWardId = icuWard.id;
        } else if (surgeryWard) {
          assignedWardId = surgeryWard.id;
        }

        if (assignedWardId) {
          await prisma.patient.update({
            where: { id: p.id },
            data: { wardId: assignedWardId }
          });
        }
      }
    }

    return { success: true, wards };
  } catch (error: any) {
    console.error("Error in getOrCreateClinicWards:", error);
    return { success: false, error: error.message || "Impossible de récupérer ou d'initialiser les services." };
  }
}
