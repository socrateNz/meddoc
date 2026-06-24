import { incidentRepository } from "@/repositories/IncidentRepository";
import { Priority, IncidentStatus } from "@prisma/client";

export class IncidentService {
  static async createIncident(data: any, reporterId: string) {
    return incidentRepository.create({
      patientId: data.patientId,
      reportedById: reporterId,
      title: data.title,
      description: data.description,
      priority: data.priority as Priority || "MEDIUM",
    });
  }

  static async getIncidents() {
    return incidentRepository.findAll();
  }

  static async updateIncidentStatus(id: string, status: IncidentStatus) {
    return incidentRepository.updateStatus(id, status);
  }
}
