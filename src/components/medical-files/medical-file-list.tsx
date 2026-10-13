"use client";

import { FileImage, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { removeMedicalFile } from "@/actions/medical-files";
import { formatFileSize } from "@/lib/medical-files";

export interface MedicalFileItem {
  id: string;
  title: string | null;
  originalName: string;
  format: string;
  bytes: number;
  createdAt: string;
  uploadedBy: string | null;
  canRemove: boolean;
}

const formatDate = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

// Liste des fichiers d'un dossier ou d'un examen. Chaque ouverture passe par /api/files/<id>
// (contrôle d'accès + lien temporaire) ; les images sont prévisualisées par le même chemin.
export default function MedicalFileList({ files, showPreviews = false, onChanged }: { files: MedicalFileItem[]; showPreviews?: boolean; onChanged?: () => void }) {
  if (files.length === 0) return <p className="text-xs text-muted-foreground py-2">Aucun fichier.</p>;

  const remove = async (file: MedicalFileItem) => {
    if (!window.confirm(`Retirer « ${file.title || file.originalName} » du dossier ? Le fichier reste archivé.`)) return;
    const res = await removeMedicalFile(file.id);
    if (res.success) {
      toast.success("Fichier retiré du dossier.");
      onChanged?.();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className={showPreviews ? "grid grid-cols-2 sm:grid-cols-3 gap-3" : "divide-y divide-slate-100 dark:divide-slate-800"}>
      {files.map((f) => {
        const isImage = f.format !== "pdf";
        const href = `/api/files/${f.id}`;
        if (showPreviews) {
          return (
            <div key={f.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <a href={href} target="_blank" rel="noopener noreferrer" className="block aspect-4/3 bg-slate-900/90">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- lien temporaire servi par /api/files, hors pipeline next/image
                  <img src={href} alt={f.title || f.originalName} className="h-full w-full object-contain" loading="lazy" />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-slate-200">
                    <FileText className="h-8 w-8" />
                    <span className="text-xs">PDF</span>
                  </div>
                )}
              </a>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="text-[11px] text-muted-foreground truncate" title={f.originalName}>
                  {formatDate(f.createdAt)}
                </span>
                {f.canRemove && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => remove(f)} title="Retirer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={f.id} className="flex items-center gap-3 py-2.5">
            <div className="h-9 w-9 rounded-xl bg-slate-500/10 text-slate-600 flex items-center justify-center shrink-0">
              {isImage ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-primary truncate block">
                {f.title || f.originalName}
              </a>
              <p className="text-[11px] text-muted-foreground">
                {f.format.toUpperCase()} • {formatFileSize(f.bytes)} • {formatDate(f.createdAt)}
                {f.uploadedBy ? ` • ${f.uploadedBy}` : ""}
              </p>
            </div>
            {f.canRemove && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => remove(f)} title="Retirer du dossier">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
