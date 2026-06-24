import { patientRepository } from "@/repositories/PatientRepository";

export class PatientService {
  static async createPatient(data: any) {
    return patientRepository.create({
      userId: data.userId,
      dateOfBirth: new Date(data.dateOfBirth),
      address: data.address,
      emergencyContact: data.emergencyContact,
      dependencyLevel: data.dependencyLevel || 1,
      pathologies: data.pathologies || [],
      allergies: data.allergies || [],
    });
  }

  static async getPatients() {
    return patientRepository.findAll();
  }

  static async getPatientById(id: string) {
    return patientRepository.findById(id);
  }
}
