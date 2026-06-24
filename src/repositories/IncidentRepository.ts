import { BaseRepository } from "./BaseRepository";
import { Priority, IncidentStatus } from "@prisma/client";

export class IncidentRepository extends BaseRepository {
  async create(data: {
    patientId: string;
    reportedById: string;
    title: string;
    description: string;
    priority?: Priority;
  }) {
    return this.db.incident.create({
      data: {
        patientId: data.patientId,
        reportedById: data.reportedById,
        title: data.title,
        description: data.description,
        priority: data.priority || "MEDIUM",
      },
      include: {
        patient: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async findAll(where: any = {}) {
    return this.db.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async updateStatus(id: string, status: IncidentStatus) {
    return this.db.incident.update({
      where: { id },
      data: { status },
    });
  }
}

export const incidentRepository = new IncidentRepository();
