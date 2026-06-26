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
  role: z.enum(["CAREGIVER", "COORDINATOR", "ADMIN"]),
  specialties: z.string().optional(),
  organizationId: z.string().optional(),
});

export default function AddMemberDialog({
  isHoldingAdmin = false,
  holdingId = "",
  clinics = []
}: {
  isHoldingAdmin?: boolean;
  holdingId?: string;
  clinics?: {id: string, name: string}[];
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
      role: "CAREGIVER",
      organizationId: holdingId,
    },
  });

  const selectedRole = watch("role");

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
        Ajouter un membre
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nouveau membre</DialogTitle>
          <DialogDescription>
            Ajoutez un nouveau membre à l'équipe médicale. Un mot de passe par défaut lui sera attribué.
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

          <div className="space-y-2">
            <Label>Rôle</Label>
            <Select onValueChange={(val: any) => setValue("role", val)} defaultValue={selectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAREGIVER">Soignant</SelectItem>
                <SelectItem value="COORDINATOR">Coordinateur</SelectItem>
                <SelectItem value="ADMIN">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedRole === "CAREGIVER" && (
            <div className="space-y-2">
              <Label htmlFor="specialties">Spécialité principale</Label>
              <Input id="specialties" {...register("specialties")} placeholder="ex: Infirmier, Kinésithérapeute..." />
            </div>
          )}

          {isHoldingAdmin && (
            <div className="space-y-2">
              <Label>Établissement de rattachement</Label>
              <Select onValueChange={(val: any) => setValue("organizationId", val)} defaultValue={holdingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un établissement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={holdingId}>Siège (Holding)</SelectItem>
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
