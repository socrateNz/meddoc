import { BaseRepository } from "./BaseRepository";

export class PatientRepository extends BaseRepository {
  async create(data: {
    userId: string;
    dateOfBirth: Date;
    address: string;
    emergencyContact?: string;
    dependencyLevel?: number;
    pathologies?: string[];
    allergies?: string[];
  }) {
    return this.db.patient.create({
      data: {
        userId: data.userId,
        dateOfBirth: data.dateOfBirth,
        address: data.address,
        emergencyContact: data.emergencyContact,
        dependencyLevel: data.dependencyLevel || 1,
        pathologies: data.pathologies || [],
        allergies: data.allergies || [],
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async findAll() {
    return this.db.patient.findMany({
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
      },
    });
  }

  async findById(id: string) {
    return this.db.patient.findUnique({
      where: { id },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
        familyMembers: {
          include: { user: { select: { firstName: true, lastName: true, phone: true } } },
        },
        medicalRecords: true,
        carePlans: {
          where: { status: "ACTIVE" },
          include: { medications: true, tasks: true },
        },
        contracts: true,
      },
    });
  }
}

export const patientRepository = new PatientRepository();
