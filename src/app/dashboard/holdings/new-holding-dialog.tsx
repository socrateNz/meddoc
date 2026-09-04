"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, CalendarIcon, CheckCircle2, Copy, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { createHolding } from "@/actions/super-admin";
import { SubscriptionPlan, PaymentFrequency, PaymentPlan } from "@prisma/client";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";

const PLAN_OPTIONS = [
  { value: "TRIAL", label: "Essai (Trial)" },
  { value: "BASIC", label: "Basique" },
  { value: "PREMIUM", label: "Premium" },
  { value: "ENTERPRISE", label: "Entreprise" },
];

const FREQUENCY_OPTIONS = [
  { value: "MONTHLY", label: "Mensuelle" },
  { value: "YEARLY", label: "Annuelle" },
];

const PAYMENT_PLAN_OPTIONS = [
  { value: "FULL", label: "Paiement intégral (en une fois)" },
  { value: "INSTALLMENTS", label: "Paiement échelonné (en tranches)" },
];

// Doit rester synchronisé avec le mot de passe par défaut codé en dur dans
// src/actions/super-admin.ts:createHolding — affiché ici pour que le super admin puisse le
// transmettre à l'administrateur de la nouvelle holding (requiresPasswordChange le forcera à en
// choisir un autre à sa première connexion).
const DEFAULT_HOLDING_ADMIN_PASSWORD = "admin123";

// Un seul bouton copie l'email ET le mot de passe ensemble (format "email: xxx\nmot de passe:
// xxx"), plutôt qu'un bouton par champ — plus pratique pour coller les deux d'un coup dans un
// message destiné à l'administrateur de la holding.
function CredentialsBlock({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`email: ${email}\nmot de passe: ${password}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier automatiquement. Sélectionnez le texte manuellement.");
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5">
      <div className="min-w-0 space-y-1 font-mono text-sm">
        <p className="text-slate-800 dark:text-slate-200 truncate">
          <span className="text-slate-400">email: </span>
          <span className="font-semibold">{email}</span>
        </p>
        <p className="text-slate-800 dark:text-slate-200 truncate">
          <span className="text-slate-400">mot de passe: </span>
          <span className="font-semibold">{password}</span>
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy} title="Copier les identifiants">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

const formSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  plan: z.nativeEnum(SubscriptionPlan),
  adminFirstName: z.string().min(2, "Prénom requis"),
  adminLastName: z.string().min(2, "Nom requis"),
  adminEmail: z.string().email("Email invalide"),
  isUnlimited: z.boolean(),
  licenseExpiresAt: z.string().optional(),
  paymentAmount: z.string().optional(),
  paymentFrequency: z.nativeEnum(PaymentFrequency).optional(),
  paymentPlan: z.nativeEnum(PaymentPlan),
  installmentsCount: z.string().optional(),
  nextPaymentDate: z.string().optional(),
});

export default function NewHoldingDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Une fois la holding créée, le dialogue bascule sur un écran de confirmation permettant de
  // télécharger la facture d'abonnement plutôt que de se refermer immédiatement.
  const [createdHolding, setCreatedHolding] = useState<any | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<{ name: string; email: string } | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      plan: "TRIAL",
      isUnlimited: true,
      licenseExpiresAt: "",
      paymentAmount: "",
      paymentFrequency: "MONTHLY",
      paymentPlan: "FULL",
      installmentsCount: "",
      nextPaymentDate: "",
    },
  });

  const isUnlimited = watch("isUnlimited");
  const selectedPlan = watch("plan");
  const selectedFrequency = watch("paymentFrequency");
  const selectedPaymentPlan = watch("paymentPlan");

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setLoading(true);

    // Convert the string date to a Date object or null
    let licenseExpiresAt: Date | null = null;
    if (!data.isUnlimited && data.licenseExpiresAt) {
      licenseExpiresAt = new Date(data.licenseExpiresAt);
    }

    const paymentAmount = data.paymentAmount ? Number(data.paymentAmount) : null;

    const response = await createHolding({
      ...data,
      licenseExpiresAt,
      paymentAmount,
      paymentFrequency: paymentAmount !== null ? (data.paymentFrequency || "MONTHLY") : null,
      installmentsCount: data.paymentPlan === "INSTALLMENTS" && data.installmentsCount ? Number(data.installmentsCount) : null,
      nextPaymentDate: data.nextPaymentDate ? new Date(data.nextPaymentDate) : null,
    });

    if (response.error) {
      toast.error(response.error);
    } else {
      toast.success("Holding créée avec succès !");
      setCreatedHolding(response.holding);
      setCreatedAdmin({ name: `${data.adminFirstName} ${data.adminLastName}`, email: data.adminEmail });
    }
    setLoading(false);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      // Ne réinitialise qu'à la fermeture, pour ne pas perdre createdHolding pendant que
      // l'écran de confirmation (et son bouton de téléchargement) est encore affiché.
      reset();
      setCreatedHolding(null);
      setCreatedAdmin(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="h-4 w-4" />
        Nouvelle Holding
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {createdHolding ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                Holding créée avec succès
              </DialogTitle>
              <DialogDescription>
                <strong>{createdHolding.name + " "}</strong> a été créée. Vous pouvez télécharger la facture d&apos;abonnement
                (avec les emplacements de signature pour les deux parties) dès maintenant.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Identifiants de connexion de l&apos;administrateur</p>
              <CredentialsBlock email={createdAdmin?.email || ""} password={DEFAULT_HOLDING_ADMIN_PASSWORD} />
              <p className="text-xs text-slate-500">
                Un changement de mot de passe sera demandé à la première connexion. Transmettez ces identifiants à l&apos;administrateur.
              </p>
            </div>

            <div className="py-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Fermer</Button>
              <PDFDownloadButton
                documentName={`Facture_Abonnement_${createdHolding.name}`}
                type="holding-invoice"
                data={{ holding: createdHolding, adminName: createdAdmin?.name, adminEmail: createdAdmin?.email }}
                buttonText="Télécharger la facture"
                variant="default"
              />
            </div>
          </>
        ) : (
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
                  <Select items={PLAN_OPTIONS} onValueChange={(val: any) => setValue("plan", val)} value={selectedPlan}>
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
                <div className="space-y-2">
                  <Label htmlFor="paymentAmount">Montant du forfait (FCFA)</Label>
                  <Input
                    id="paymentAmount"
                    type="number"
                    min="0"
                    {...register("paymentAmount")}
                    placeholder="ex: 150000"
                  />
                  {errors.paymentAmount && <p className="text-[10px] text-red-500">{errors.paymentAmount.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Fréquence de facturation</Label>
                  <Select items={FREQUENCY_OPTIONS} onValueChange={(val: any) => setValue("paymentFrequency", val)} value={selectedFrequency}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez une fréquence" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Mensuelle</SelectItem>
                      <SelectItem value="YEARLY">Annuelle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mode de paiement</Label>
                  <Select items={PAYMENT_PLAN_OPTIONS} onValueChange={(val: any) => setValue("paymentPlan", val)} value={selectedPaymentPlan}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez un mode de paiement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL">Paiement intégral (en une fois)</SelectItem>
                      <SelectItem value="INSTALLMENTS">Paiement échelonné (en tranches)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedPaymentPlan === "INSTALLMENTS" && (
                  <div className="space-y-2">
                    <Label htmlFor="installmentsCount">Nombre de tranches</Label>
                    <Input
                      id="installmentsCount"
                      type="number"
                      min="1"
                      {...register("installmentsCount")}
                      placeholder="ex: 3"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="nextPaymentDate">Date du prochain paiement</Label>
                  <Input
                    id="nextPaymentDate"
                    type="date"
                    {...register("nextPaymentDate")}
                  />
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
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer la Holding
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
