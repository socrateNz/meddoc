"use client";

import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPatientFiles } from "@/actions/medical-files";
import MedicalFileUploader from "@/components/medical-files/medical-file-uploader";
import MedicalFileList, { type MedicalFileItem } from "@/components/medical-files/medical-file-list";

// Documents scannés du dossier patient (comptes rendus externes, anciens examens apportés par le
// patient...) — stockage privé, consultation tracée (cf. src/actions/medical-files.ts).
export default function PatientDocumentsCard({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const [files, setFiles] = useState<MedicalFileItem[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listPatientFiles({ patientId, category: "SCANNED_DOCUMENT" }).then((res) => {
      if (!cancelled) setFiles(res.success ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          Documents scannés
        </CardTitle>
        <CardDescription className="text-xs">Stockage sécurisé : chaque consultation est tracée dans le journal d&apos;audit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canWrite && <MedicalFileUploader patientId={patientId} category="SCANNED_DOCUMENT" askTitle buttonLabel="Ajouter un document" onUploaded={reload} />}
        {files === null ? <p className="text-xs text-muted-foreground">Chargement...</p> : <MedicalFileList files={files} onChanged={reload} />}
      </CardContent>
    </Card>
  );
}
