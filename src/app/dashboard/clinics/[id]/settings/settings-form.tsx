"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClinic } from "@/actions/organizations";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ClinicSettingsForm({ clinic }: { clinic: { id: string; name: string } }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState(clinic.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom de la clinique est requis");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await updateClinic(clinic.id, { name });
      
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
            Modifiez les informations de base de cette clinique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold">
              Nom de la clinique <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 max-w-md border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50"
              disabled={isSubmitting}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800/50 pt-6">
          <Button 
            type="submit" 
            disabled={isSubmitting || !name.trim() || name === clinic.name}
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
      </form>
    </Card>
  );
}
