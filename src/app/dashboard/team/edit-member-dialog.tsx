"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateTeamMember } from "@/actions/team";

const formSchema = z.object({
  firstName: z.string().min(2, "Prénom trop court"),
  lastName: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  phone: z.string().optional(),
  specialties: z.string().optional(),
  licenseNumber: z.string().optional(),
});

interface EditMemberDialogProps {
  member: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditMemberDialog({ member, open, onOpenChange }: EditMemberDialogProps) {
  const [loading, setLoading] = useState(false);
  const isCaregiverOrDoctor = member.role === "CAREGIVER" || member.role === "MEDECIN";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone || "",
      specialties: member.caregiverProfile?.specialties?.[0] || "",
      licenseNumber: member.caregiverProfile?.licenseNumber || "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    const result = await updateTeamMember({ userId: member.id, ...values });
    setLoading(false);

    if (result.success) {
      toast.success("Membre modifié avec succès.");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Modifier {member.firstName} {member.lastName}
          </DialogTitle>
          <DialogDescription>
            Mettez à jour les informations de contact de ce membre.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">Prénom</Label>
              <Input id="edit-firstName" {...register("firstName")} />
              {errors.firstName && <p className="text-sm text-red-500">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Nom</Label>
              <Input id="edit-lastName" {...register("lastName")} />
              {errors.lastName && <p className="text-sm text-red-500">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Téléphone</Label>
            <Input id="edit-phone" {...register("phone")} />
          </div>

          {isCaregiverOrDoctor && (
            <div className="space-y-2">
              <Label htmlFor="edit-specialties">Spécialité principale</Label>
              <Input id="edit-specialties" {...register("specialties")} />
            </div>
          )}

          {member.role === "MEDECIN" && (
            <div className="space-y-2">
              <Label htmlFor="edit-licenseNumber">N° RPPS / Ordre (optionnel)</Label>
              <Input id="edit-licenseNumber" {...register("licenseNumber")} />
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
