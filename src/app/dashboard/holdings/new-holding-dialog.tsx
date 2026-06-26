"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, CalendarIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { createHolding } from "@/actions/super-admin";
import { SubscriptionPlan } from "@prisma/client";

const formSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  plan: z.nativeEnum(SubscriptionPlan),
  adminFirstName: z.string().min(2, "Prénom requis"),
  adminLastName: z.string().min(2, "Nom requis"),
  adminEmail: z.string().email("Email invalide"),
  isUnlimited: z.boolean(),
  licenseExpiresAt: z.string().optional(),
});

export default function NewHoldingDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      plan: "TRIAL",
      isUnlimited: true,
      licenseExpiresAt: "",
    },
  });

  const isUnlimited = watch("isUnlimited");

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setLoading(true);
    
    // Convert the string date to a Date object or null
    let licenseExpiresAt: Date | null = null;
    if (!data.isUnlimited && data.licenseExpiresAt) {
      licenseExpiresAt = new Date(data.licenseExpiresAt);
    }
    
    const response = await createHolding({
      ...data,
      licenseExpiresAt,
    });
    
    if (response.error) {
      toast.error(response.error);
    } else {
      toast.success("Holding créée avec succès !");
      reset();
      setOpen(false);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="h-4 w-4" />
        Nouvelle Holding
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une nouvelle Holding</DialogTitle>
          <DialogDescription>
            Ajoutez une nouvelle organisation racine et définissez son premier administrateur.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-500">Informations de la Holding</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nom de la Holding *</Label>
                <Input id="name" {...register("name")} placeholder="ex: Groupe Santé ABC" />
                {errors.name && <p className="text-[10px] text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Forfait *</Label>
                <Select onValueChange={(val: any) => setValue("plan", val)} defaultValue="TRIAL">
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un forfait" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Essai (Trial)</SelectItem>
                    <SelectItem value="BASIC">Basique</SelectItem>
                    <SelectItem value="PREMIUM">Premium</SelectItem>
                    <SelectItem value="ENTERPRISE">Entreprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Expiration de la Licence</Label>
                <div className="flex items-center gap-4 p-3 border rounded-md">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="isUnlimited" 
                      checked={isUnlimited}
                      onCheckedChange={(checked) => setValue("isUnlimited", checked === true)}
                    />
                    <label
                      htmlFor="isUnlimited"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Illimité
                    </label>
                  </div>
                  {!isUnlimited && (
                    <div className="flex-1">
                      <Input 
                        type="date" 
                        {...register("licenseExpiresAt")} 
                        min={new Date().toISOString().split('T')[0]}
                      />
                      {errors.licenseExpiresAt && <p className="text-[10px] text-red-500">{errors.licenseExpiresAt.message}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-500">Administrateur Principal</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adminFirstName">Prénom *</Label>
                <Input id="adminFirstName" {...register("adminFirstName")} placeholder="Prénom" />
                {errors.adminFirstName && <p className="text-[10px] text-red-500">{errors.adminFirstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminLastName">Nom *</Label>
                <Input id="adminLastName" {...register("adminLastName")} placeholder="Nom" />
                {errors.adminLastName && <p className="text-[10px] text-red-500">{errors.adminLastName.message}</p>}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="adminEmail">Email de connexion *</Label>
                <Input id="adminEmail" type="email" {...register("adminEmail")} placeholder="admin@holding.com" />
                {errors.adminEmail && <p className="text-[10px] text-red-500">{errors.adminEmail.message}</p>}
                <p className="text-xs text-slate-500">Un mot de passe par défaut sera généré et l'utilisateur devra le changer.</p>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer la Holding
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
