"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { attachMedicalFile, requestUploadSignature } from "@/actions/medical-files";
import { ALLOWED_MIME_TYPES, validateFileBeforeUpload, type MedicalFileCategory } from "@/lib/medical-files";

interface MedicalFileUploaderProps {
  patientId: string;
  category: MedicalFileCategory;
  radiologyOrderId?: string;
  // Intitulé demandé avant l'envoi (documents scannés) ; inutile pour un cliché d'examen.
  askTitle?: boolean;
  buttonLabel?: string;
  onUploaded?: () => void;
}

// Envoi d'un fichier médical en trois temps (cf. src/actions/medical-files.ts) : signature délivrée
// par le serveur, envoi DIRECT du navigateur vers Cloudinary (pas de limite de taille Vercel), puis
// rattachement au dossier après vérification du fichier réellement reçu.
export default function MedicalFileUploader({ patientId, category, radiologyOrderId, askTitle = false, buttonLabel = "Ajouter un fichier", onUploaded }: MedicalFileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    const problem = validateFileBeforeUpload(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const signed = await requestUploadSignature(patientId);
      if (!signed.success) throw new Error(signed.error);
      const { cloudName, apiKey, signature, timestamp, public_id, type, allowed_formats } = signed.data;

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("public_id", public_id);
      form.append("type", type);
      form.append("allowed_formats", allowed_formats);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.public_id) {
        throw new Error(body?.error?.message ? `Envoi refusé : ${body.error.message}` : "L'envoi du fichier a échoué.");
      }

      const attached = await attachMedicalFile({
        patientId,
        publicId: body.public_id,
        resourceType: body.resource_type === "raw" ? "raw" : "image",
        category,
        originalName: file.name.slice(0, 200),
        title: askTitle && title.trim() ? title.trim() : undefined,
        radiologyOrderId,
      });
      if (!attached.success) throw new Error(attached.error);

      toast.success("Fichier ajouté au dossier.");
      setTitle("");
      onUploaded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L'envoi du fichier a échoué.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {askTitle && (
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Intitulé (ex: Compte-rendu externe, ordonnance...)"
          className="h-9 w-64 rounded-xl text-sm"
          maxLength={200}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? "Envoi..." : buttonLabel}
      </Button>
      <span className="text-[11px] text-muted-foreground">PDF, JPEG ou PNG — 20 Mo max.</span>
    </div>
  );
}
