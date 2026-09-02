"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateClinic } from "@/actions/organizations";
import { Loader2, Save, ImageUp, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// Redimensionne l'image côté client avant l'envoi (aucun logo de clinique n'a besoin de dépasser
// quelques centaines de pixels) et la rasterise en PNG — évite un SVG que @react-pdf/renderer ne
// sait pas afficher, et garde le data URI stocké en base largement sous la limite du validateur.
async function fileToResizedDataUrl(file: File, maxDim = 320): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image invalide."));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de traiter l'image dans ce navigateur.");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/png");
}

interface ClinicSettingsFormProps {
  clinic: { id: string; name: string; logoUrl?: string | null };
  readOnly?: boolean;
}

export default function ClinicSettingsForm({ clinic, readOnly = false }: ClinicSettingsFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [name, setName] = useState(clinic.name);
  const [logoUrl, setLogoUrl] = useState(clinic.logoUrl || "");

  const isDirty = name !== clinic.name || logoUrl !== (clinic.logoUrl || "");

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Format d'image non pris en charge (PNG, JPEG ou WebP uniquement).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop volumineuse (5 Mo maximum).");
      return;
    }

    setIsProcessingLogo(true);
    try {
      const resized = await fileToResizedDataUrl(file);
      setLogoUrl(resized);
    } catch (error: any) {
      toast.error(error.message || "Impossible de traiter cette image.");
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom de la clinique est requis");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await updateClinic(clinic.id, { name, logoUrl });

      if (error) {
        toast.error(error);
      } else {
        toast.success("Paramètres mis à jour avec succès");
        router.refresh();
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-200/60 dark:border-slate-800/60 shadow-sm bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
          <CardDescription>
            {readOnly
              ? "Consultation seule. Le coordinateur de cette clinique peut modifier ces paramètres."
              : "Modifiez les informations de base de cette clinique."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Logo de l&apos;établissement</Label>
            <p className="text-xs text-muted-foreground">
              Affiché en en-tête de tous les documents PDF générés pour cette clinique (reçus, ordonnances, rapports labo, dossiers patient...).
            </p>
            <div className="flex items-center gap-4 pt-1">
              <div className="h-20 w-20 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-center overflow-hidden shrink-0">
                {isProcessingLogo ? (
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                ) : logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo de la clinique" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                )}
              </div>
              {!readOnly && (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleLogoChange}
                    disabled={isSubmitting || isProcessingLogo}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || isProcessingLogo}
                    className="gap-2"
                  >
                    <ImageUp className="h-4 w-4" />
                    {logoUrl ? "Changer le logo" : "Téléverser un logo"}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLogoUrl("")}
                      disabled={isSubmitting || isProcessingLogo}
                      className="gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                      Retirer le logo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold">
              Nom de la clinique <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 max-w-md border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50"
              disabled={isSubmitting || readOnly}
              required
            />
          </div>
        </CardContent>
        {!readOnly && (
          <CardFooter className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800/50 pt-6">
            <Button
              type="submit"
              disabled={isSubmitting || isProcessingLogo || !name.trim() || !isDirty}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  );
}
