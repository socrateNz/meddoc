import { prisma } from "@/lib/db";

export class AppointmentService {
  static async createAppointment(data: any) {
    return prisma.appointment.create({
      data: {
        patientId: data.patientId,
        caregiverId: data.caregiverId,
        title: data.title,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: data.durationMinutes,
        type: data.type, // VISIT, CONSULTATION, TELECONSULTATION
      },
      include: {
        patient: { include: { user: true } },
        caregiver: { include: { user: true } },
      }
    });
  }

  static async getAppointmentsForUser(userId: string, role: string) {
    if (role === "CAREGIVER") {
      const caregiver = await prisma.caregiver.findUnique({ where: { userId } });
      if (!caregiver) return [];
      return prisma.appointment.findMany({
        where: { caregiverId: caregiver.id },
        include: { patient: { include: { user: true } } },
      });
    }
    
    if (role === "PATIENT") {
      const patient = await prisma.patient.findUnique({ where: { userId } });
      if (!patient) return [];
      return prisma.appointment.findMany({
        where: { patientId: patient.id },
        include: { caregiver: { include: { user: true } } },
      });
    }
    
    if (role === "FAMILY") {
      const family = await prisma.familyMember.findUnique({ where: { userId } });
      if (!family) return [];
      return prisma.appointment.findMany({
        where: { patientId: family.patientId },
        include: { caregiver: { include: { user: true } } },
      });
    }

    // ADMIN et COORDINATOR voient tout
    return prisma.appointment.findMany({
      include: {
        patient: { include: { user: true } },
        caregiver: { include: { user: true } },
      },
    });
  }
}
