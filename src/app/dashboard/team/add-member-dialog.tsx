"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createTeamMember } from "@/actions/team";

const formSchema = z.object({
  firstName: z.string().min(2, "Prénom trop court"),
  lastName: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  role: z.enum(["MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER", "COORDINATOR"]),
  specialties: z.string().optional(),
  licenseNumber: z.string().optional(),
  organizationId: z.string().optional(),
});

const ROLE_OPTIONS = [
  { value: "MEDECIN", label: "Médecin" },
  { value: "CAREGIVER", label: "Infirmier(e)" },
  { value: "PHARMACIST", label: "Pharmacien(ne)" },
  { value: "CASHIER", label: "Caissier(ère)" },
];

// Un admin de holding ne fait plus que désigner le coordinateur d'une clinique ;
// un coordinateur recrute le personnel (soignant/pharmacien) de sa propre clinique.
export default function AddMemberDialog({
  isHoldingAdmin = false,
  holdingId = "",
  clinics = [],
  defaultOrganizationId = "",
}: {
  isHoldingAdmin?: boolean;
  holdingId?: string;
  clinics?: {id: string, name: string}[];
  defaultOrganizationId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role: isHoldingAdmin ? "COORDINATOR" : "CAREGIVER",
      organizationId: defaultOrganizationId,
    },
  });

  const selectedRole = watch("role");
  const selectedOrgId = watch("organizationId");

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    const result = await createTeamMember(values);
    setLoading(false);

    if (result.success) {
      toast.success("Membre ajouté avec succès. Mot de passe par défaut : ChangeMe!123");
      setOpen(false);
      reset();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="h-4 w-4" />
        {isHoldingAdmin ? "Désigner un coordinateur" : "Ajouter un membre"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isHoldingAdmin ? "Désigner un coordinateur" : "Nouveau membre"}</DialogTitle>
          <DialogDescription>
            {isHoldingAdmin
              ? "Affectez le coordinateur qui administrera au quotidien l'une de vos cliniques."
              : "Ajoutez un médecin, un infirmier(e), un pharmacien ou un(e) caissier(ère) à l'équipe de votre clinique."}{" "}
            Un mot de passe par défaut lui sera attribué.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && <p className="text-sm text-red-500">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && <p className="text-sm text-red-500">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" {...register("phone")} />
          </div>

          {!isHoldingAdmin && (
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select
                items={ROLE_OPTIONS}
                onValueChange={(val: any) => setValue("role", val)}
                value={selectedRole}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un rôle" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(selectedRole === "CAREGIVER" || selectedRole === "MEDECIN") && (
            <div className="space-y-2">
              <Label htmlFor="specialties">Spécialité principale</Label>
              <Input
                id="specialties"
                {...register("specialties")}
                placeholder={selectedRole === "MEDECIN" ? "ex: Médecine générale, Cardiologie..." : "ex: Infirmier, Kinésithérapeute..."}
              />
            </div>
          )}

          {selectedRole === "MEDECIN" && (
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">N° RPPS / Ordre (optionnel)</Label>
              <Input id="licenseNumber" {...register("licenseNumber")} placeholder="ex: 10001234567" />
            </div>
          )}

          {isHoldingAdmin && (
            <div className="space-y-2">
              <Label>Clinique à affecter</Label>
              <Select
                items={clinics.map((c) => ({ value: c.id, label: c.name }))}
                onValueChange={(val: any) => setValue("organizationId", val)}
                value={selectedOrgId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez une clinique" />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer le compte
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
