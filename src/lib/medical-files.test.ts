import { describe, it, expect } from "vitest";
import { MAX_FILE_BYTES, belongsToPatientFolder, formatFileSize, isAllowedFormat, patientFileFolder, validateFileBeforeUpload } from "./medical-files";

describe("belongsToPatientFolder", () => {
  it("accepte un fichier placé directement dans le dossier du patient", () => {
    expect(patientFileFolder("org1", "p1")).toBe("meddoc/org1/p1");
    expect(belongsToPatientFolder("meddoc/org1/p1/abc123", "org1", "p1")).toBe(true);
  });

  it("refuse le fichier d'un autre patient, d'un autre établissement ou d'un sous-dossier", () => {
    expect(belongsToPatientFolder("meddoc/org1/p2/abc123", "org1", "p1")).toBe(false);
    expect(belongsToPatientFolder("meddoc/org2/p1/abc123", "org1", "p1")).toBe(false);
    // Préfixe partagé : p1 ne doit pas couvrir p10.
    expect(belongsToPatientFolder("meddoc/org1/p10/abc123", "org1", "p1")).toBe(false);
    expect(belongsToPatientFolder("meddoc/org1/p1/sub/abc123", "org1", "p1")).toBe(false);
    expect(belongsToPatientFolder("meddoc/org1/p1/", "org1", "p1")).toBe(false);
  });
});

describe("formats et taille", () => {
  it("n'accepte que PDF, JPEG et PNG", () => {
    expect(isAllowedFormat("pdf")).toBe(true);
    expect(isAllowedFormat("JPG")).toBe(true);
    expect(isAllowedFormat("png")).toBe(true);
    expect(isAllowedFormat("gif")).toBe(false);
    expect(isAllowedFormat("")).toBe(false);
    expect(isAllowedFormat(null)).toBe(false);
  });

  it("contrôle le fichier avant l'envoi", () => {
    expect(validateFileBeforeUpload({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateFileBeforeUpload({ type: "image/gif", size: 1000 })).toMatch(/Format/);
    expect(validateFileBeforeUpload({ type: "image/png", size: MAX_FILE_BYTES + 1 })).toMatch(/volumineux/);
    expect(validateFileBeforeUpload({ type: "image/png", size: 0 })).toMatch(/vide/);
  });

  it("affiche la taille en Ko / Mo", () => {
    expect(formatFileSize(200)).toBe("1 Ko");
    expect(formatFileSize(150 * 1024)).toBe("150 Ko");
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2,5 Mo");
  });
});
