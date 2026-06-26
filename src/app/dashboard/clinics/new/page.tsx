"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClinic } from "@/actions/organizations";
import { Building2, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewClinicPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom de la clinique est requis");
      return;
    }

    setIsSubmitting(true);
    try {
      const { clinic, error } = await createClinic({ name });
      
      if (error) {
        toast.error(error);
      } else {
        toast.success("Clinique créée avec succès");
        router.push("/dashboard/clinics");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/clinics">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Ajouter une clinique</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créez un nouvel établissement rattaché à votre holding.
          </p>
        </div>
      </div>

      <Card className="border-slate-200/60 dark:border-slate-800/60 shadow-sm bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              Informations générales
            </CardTitle>
            <CardDescription>
              Seul le nom est requis pour le moment. Vous pourrez configurer l'adresse et les autres détails ultérieurement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold">
                Nom de la clinique <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ex: Clinique des Lilas"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50 focus-visible:ring-blue-500"
                disabled={isSubmitting}
                required
              />
            </div>
            
            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mt-6">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">Que se passe-t-il ensuite ?</h4>
              <p className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                Une fois la clinique créée, elle sera instantanément disponible dans le système. Vous pourrez ensuite y rattacher des coordinateurs, des soignants et y admettre des patients. Les données de cette clinique seront isolées des autres.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800/50 pt-6">
            <Link href="/dashboard/clinics">
              <Button type="button" variant="outline" className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" disabled={isSubmitting}>
                Annuler
              </Button>
            </Link>
            <Button 
              type="submit" 
              disabled={isSubmitting || !name.trim()}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création en cours...
                </>
              ) : (
                "Créer la clinique"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
