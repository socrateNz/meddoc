"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Loader2, Eye, FileDown, Crown, Building2, Users, Activity, UserX, UserCheck, Trash2, KeyRound, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubscriptionPlan, SubscriptionStatus, PaymentFrequency, PaymentPlan } from "@prisma/client";
import { updateHoldingSubscription, deactivateHolding, reactivateHolding, deleteHolding, resetHoldingAdminPassword } from "@/actions/super-admin";
import { toast } from "sonner";

const PLAN_LABELS: Record<string, string> = {
  TRIAL: "Essai (Trial)",
  BASIC: "Basique",
  PREMIUM: "Premium",
  ENTERPRISE: "Entreprise",
};

const PLAN_OPTIONS = [
  { value: "TRIAL", label: "Essai (Trial)" },
  { value: "BASIC", label: "Basique" },
  { value: "PREMIUM", label: "Premium" },
  { value: "ENTERPRISE", label: "Entreprise" },
];

const STATUS_OPTIONS = [
  { value: "TRIALING", label: "En essai (Trialing)" },
  { value: "ACTIVE", label: "Actif" },
  { value: "INACTIVE", label: "Inactif" },
  { value: "CANCELLED", label: "Annulé" },
];

const FREQUENCY_OPTIONS = [
  { value: "MONTHLY", label: "Mensuelle" },
  { value: "YEARLY", label: "Annuelle" },
];

const PAYMENT_PLAN_OPTIONS = [
  { value: "FULL", label: "Paiement intégral (en une fois)" },
  { value: "INSTALLMENTS", label: "Paiement échelonné (en tranches)" },
];

const PAYMENT_PLAN_LABELS: Record<string, string> = {
  FULL: "Paiement intégral",
  INSTALLMENTS: "Paiement échelonné",
};

interface HoldingActionsMenuProps {
  holding: {
    id: string;
    name: string;
    plan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    licenseExpiresAt: Date | null;
    paymentAmount?: number | null;
    paymentFrequency?: PaymentFrequency | null;
    createdAt?: Date | string;
    adminUser?: { firstName: string; lastName: string; email: string } | null;
    _count?: { children: number; users: number; patients: number };
    maxClinics?: number;
    maxUsers?: number;
    paymentPlan?: PaymentPlan;
    installmentsCount?: number | null;
    nextPaymentDate?: Date | string | null;
  };
}

export default function HoldingActionsMenu({ holding }: HoldingActionsMenuProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string; defaultPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const adminName = holding.adminUser ? `${holding.adminUser.firstName} ${holding.adminUser.lastName}` : undefined;
  const isInactive = holding.subscriptionStatus === "INACTIVE" || holding.subscriptionStatus === "CANCELLED";
  const hasClinics = (holding._count?.children ?? 0) > 0;

  const handleDeactivateToggle = async () => {
    setStatusActionLoading(true);
    const response = isInactive ? await reactivateHolding(holding.id) : await deactivateHolding(holding.id);
    setStatusActionLoading(false);
    if (response.error) {
      toast.error(response.error);
    } else {
      toast.success(isInactive ? "Holding réactivée." : "Holding désactivée.");
      setShowDeactivateDialog(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const response = await deleteHolding(holding.id);
    setDeleting(false);
    if (response.error) {
      toast.error(response.error);
    } else {
      toast.success("Holding supprimée.");
      setShowDeleteDialog(false);
    }
  };

  const handleResetAdminPassword = async () => {
    setResettingPassword(true);
    const response = await resetHoldingAdminPassword(holding.id);
    setResettingPassword(false);
    if (response.error) {
      toast.error(response.error);
    } else if (response.data) {
      setResetResult(response.data);
    }
  };

  const handleCopyCredentials = async () => {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(`email: ${resetResult.email}\nmot de passe: ${resetResult.defaultPassword}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier automatiquement. Sélectionnez le texte manuellement.");
    }
  };

  const handleDownloadReceipt = async () => {
    setDownloading(true);
    try {
      const HoldingInvoicePDFDocument = (await import("@/components/pdf/holding-invoice-pdf")).default;
      const { pdf } = await import("@react-pdf/renderer");

      const element = (
        <HoldingInvoicePDFDocument
          holding={holding}
          adminName={adminName}
          adminEmail={holding.adminUser?.email}
        />
      );

      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Facture_Abonnement_${holding.name}`.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Reçu téléchargé !");
    } catch (error: any) {
      console.error("Erreur lors de la génération du reçu:", error);
      toast.error("Impossible de générer le reçu. Veuillez réessayer.");
    } finally {
      setDownloading(false);
    }
  };
  const [name, setName] = useState<string>(holding.name);
  const [plan, setPlan] = useState<SubscriptionPlan>(holding.plan);
  const [status, setStatus] = useState<SubscriptionStatus>(holding.subscriptionStatus);
  const [isUnlimited, setIsUnlimited] = useState<boolean>(!holding.licenseExpiresAt);
  const [licenseExpiresAt, setLicenseExpiresAt] = useState<string>(
    holding.licenseExpiresAt ? new Date(holding.licenseExpiresAt).toISOString().split('T')[0] : ""
  );
  const [paymentAmount, setPaymentAmount] = useState<string>(
    holding.paymentAmount != null ? String(holding.paymentAmount) : ""
  );
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>(
    holding.paymentFrequency || "MONTHLY"
  );
  const [maxClinics, setMaxClinics] = useState<string>(String(holding.maxClinics ?? 1));
  const [maxUsers, setMaxUsers] = useState<string>(String(holding.maxUsers ?? 10));
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>(holding.paymentPlan || "FULL");
  const [installmentsCount, setInstallmentsCount] = useState<string>(
    holding.installmentsCount != null ? String(holding.installmentsCount) : ""
  );
  const [nextPaymentDate, setNextPaymentDate] = useState<string>(
    holding.nextPaymentDate ? new Date(holding.nextPaymentDate).toISOString().split('T')[0] : ""
  );

  const handleUpdate = async () => {
    if (!name.trim()) {
      toast.error("Le nom de la holding est requis.");
      return;
    }

    setLoading(true);
    let expiresAt: Date | null = null;
    if (!isUnlimited && licenseExpiresAt) {
      expiresAt = new Date(licenseExpiresAt);
    }

    const amount = paymentAmount ? Number(paymentAmount) : null;

    const response = await updateHoldingSubscription(holding.id, {
      name: name.trim(),
      plan,
      status,
      licenseExpiresAt: expiresAt,
      paymentAmount: amount,
      paymentFrequency: amount !== null ? paymentFrequency : null,
      maxClinics: Math.max(1, Number(maxClinics) || 1),
      maxUsers: Math.max(1, Number(maxUsers) || 1),
      paymentPlan,
      installmentsCount: paymentPlan === "INSTALLMENTS" && installmentsCount ? Number(installmentsCount) : null,
      nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
    });

    if (response.error) {
      toast.error(response.error);
    } else {
      toast.success("Holding mise à jour avec succès !");
      setShowEditDialog(false);
    }
    setLoading(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400">
          <span className="sr-only">Ouvrir le menu</span>
          <MoreHorizontal className="h-4 w-4 text-slate-500" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowDetailsDialog(true)} className="cursor-pointer">
              <Eye className="h-4 w-4 mr-2" />
              Voir les détails
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowEditDialog(true)} className="cursor-pointer">
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadReceipt} disabled={downloading} className="cursor-pointer">
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              Télécharger le reçu
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowResetPasswordDialog(true)} className="cursor-pointer">
              <KeyRound className="h-4 w-4 mr-2" />
              Réinitialiser le mot de passe admin
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowDeactivateDialog(true)} className="cursor-pointer">
              {isInactive ? <UserCheck className="h-4 w-4 mr-2" /> : <UserX className="h-4 w-4 mr-2" />}
              {isInactive ? "Réactiver" : "Désactiver"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={hasClinics}
              className="cursor-pointer"
              title={hasClinics ? "Retirez d'abord les cliniques rattachées à cette holding." : undefined}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{isInactive ? "Réactiver cette holding ?" : "Désactiver cette holding ?"}</DialogTitle>
            <DialogDescription>
              {isInactive ? (
                <>Le compte <strong>{holding.name}</strong> retrouvera l&apos;accès à la plateforme.</>
              ) : (
                <>
                  Le compte <strong>{holding.name}</strong> et l&apos;ensemble de ses cliniques n&apos;auront plus accès à la
                  plateforme. Cette action est réversible à tout moment.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" disabled={statusActionLoading} />}>Annuler</DialogClose>
            <Button
              variant={isInactive ? "default" : "destructive"}
              onClick={handleDeactivateToggle}
              disabled={statusActionLoading}
            >
              {statusActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isInactive ? "Oui, réactiver" : "Oui, désactiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer définitivement cette holding ?</DialogTitle>
            <DialogDescription>
              Le compte <strong>{holding.name}</strong> et son (ses) administrateur(s) seront supprimés
              définitivement. Cette action est <strong>irréversible</strong> et ne peut pas être annulée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" disabled={deleting} />}>Annuler</DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Oui, supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showResetPasswordDialog}
        onOpenChange={(v) => { setShowResetPasswordDialog(v); if (!v) { setResetResult(null); setCopied(false); } }}
      >
        <DialogContent className="sm:max-w-[425px]">
          {resetResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-600">
                  <KeyRound className="h-5 w-5" />
                  Mot de passe réinitialisé
                </DialogTitle>
                <DialogDescription>
                  L&apos;administrateur devra choisir un nouveau mot de passe à sa prochaine connexion. Transmettez-lui ces identifiants.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 my-2">
                <div className="min-w-0 space-y-1 font-mono text-sm">
                  <p className="text-slate-800 dark:text-slate-200 truncate">
                    <span className="text-slate-400">email: </span>
                    <span className="font-semibold">{resetResult.email}</span>
                  </p>
                  <p className="text-slate-800 dark:text-slate-200 truncate">
                    <span className="text-slate-400">mot de passe: </span>
                    <span className="font-semibold">{resetResult.defaultPassword}</span>
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyCredentials} title="Copier les identifiants">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setShowResetPasswordDialog(false)}>Fermer</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Réinitialiser le mot de passe admin ?</DialogTitle>
                <DialogDescription>
                  Le mot de passe de l&apos;administrateur de <strong>{holding.name}</strong>
                  {adminName ? <> (<strong>{adminName}</strong>)</> : ""} sera remplacé par un mot de passe par défaut.
                  Il devra le changer à sa prochaine connexion.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-4 gap-2 sm:gap-0">
                <DialogClose render={<Button variant="outline" disabled={resettingPassword} />}>Annuler</DialogClose>
                <Button onClick={handleResetAdminPassword} disabled={resettingPassword}>
                  {resettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Oui, réinitialiser
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {holding.name}
              <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider ${holding.plan === "ENTERPRISE" ? "border-purple-500/30 text-purple-600 bg-purple-500/10" :
                holding.plan === "PREMIUM" ? "border-blue-500/30 text-blue-600 bg-blue-500/10" :
                  "border-slate-500/30 text-slate-600 bg-slate-500/10"
                }`}>
                {holding.plan === "ENTERPRISE" && <Crown className="h-3 w-3 mr-1 inline" />}
                {PLAN_LABELS[holding.plan] || holding.plan}
              </Badge>
            </DialogTitle>
            <DialogDescription>Fiche détaillée de la holding.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50">
                <Building2 className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                <p className="text-lg font-bold">{holding._count?.children ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Cliniques</p>
              </div>
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50">
                <Users className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                <p className="text-lg font-bold">{holding._count?.users ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Utilisateurs</p>
              </div>
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50">
                <Activity className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                <p className="text-lg font-bold">{holding._count?.patients ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Patients</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Statut</span>
                <Badge variant={holding.subscriptionStatus === "ACTIVE" ? "default" : "secondary"} className="uppercase text-[10px] font-bold">
                  {holding.subscriptionStatus}
                </Badge>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Créée le</span>
                <span className="font-medium">{holding.createdAt ? new Date(holding.createdAt).toLocaleDateString("fr-FR") : "-"}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Licence</span>
                <span className="font-medium">
                  {holding.licenseExpiresAt ? `Expire le ${new Date(holding.licenseExpiresAt).toLocaleDateString("fr-FR")}` : "Illimitée"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Tarif</span>
                <span className="font-medium">
                  {holding.paymentAmount != null
                    ? `${new Intl.NumberFormat("fr-FR").format(holding.paymentAmount)} FCFA / ${holding.paymentFrequency === "YEARLY" ? "an" : "mois"}`
                    : "Non défini"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Mode de paiement</span>
                <span className="font-medium">
                  {PAYMENT_PLAN_LABELS[holding.paymentPlan || "FULL"]}
                  {holding.paymentPlan === "INSTALLMENTS" && holding.installmentsCount ? ` (${holding.installmentsCount} tranches)` : ""}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Prochain paiement</span>
                <span className="font-medium">
                  {holding.nextPaymentDate ? new Date(holding.nextPaymentDate).toLocaleDateString("fr-FR") : "-"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Administrateur</span>
                <span className="font-medium">{adminName || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-medium">{holding.adminUser?.email || "-"}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>Fermer</Button>
            <Button onClick={handleDownloadReceipt} disabled={downloading} className="gap-2">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Télécharger le reçu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl! w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la holding <strong>{holding.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-500">Informations de la Holding</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`name-${holding.id}`}>Nom de la Holding</Label>
                  <Input
                    id={`name-${holding.id}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex: Groupe Santé ABC"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forfait</Label>
                  <Select items={PLAN_OPTIONS} value={plan} onValueChange={(val) => { if (val) setPlan(val as SubscriptionPlan); }}>
                    <SelectTrigger className="w-full">
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
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Select items={STATUS_OPTIONS} value={status} onValueChange={(val) => { if (val) setStatus(val as SubscriptionStatus); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionnez un statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRIALING">En essai (Trialing)</SelectItem>
                      <SelectItem value="ACTIVE">Actif</SelectItem>
                      <SelectItem value="INACTIVE">Inactif</SelectItem>
                      <SelectItem value="CANCELLED">Annulé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Expiration de la Licence</Label>
                  <div className="flex items-center gap-4 p-3 border rounded-md">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`isUnlimited-${holding.id}`}
                        checked={isUnlimited}
                        onCheckedChange={(checked) => setIsUnlimited(checked === true)}
                      />
                      <label
                        htmlFor={`isUnlimited-${holding.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        Illimité
                      </label>
                    </div>
                    {!isUnlimited && (
                      <div className="flex-1">
                        <Input
                          type="date"
                          value={licenseExpiresAt}
                          onChange={(e) => setLicenseExpiresAt(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-500">Facturation</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`paymentAmount-${holding.id}`}>Montant du forfait (FCFA)</Label>
                  <Input
                    id={`paymentAmount-${holding.id}`}
                    type="number"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="ex: 150000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fréquence</Label>
                  <Select items={FREQUENCY_OPTIONS} value={paymentFrequency} onValueChange={(val) => { if (val) setPaymentFrequency(val as PaymentFrequency); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Fréquence" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Mensuelle</SelectItem>
                      <SelectItem value="YEARLY">Annuelle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mode de paiement</Label>
                  <Select items={PAYMENT_PLAN_OPTIONS} value={paymentPlan} onValueChange={(val) => { if (val) setPaymentPlan(val as PaymentPlan); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Mode de paiement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL">Paiement intégral (en une fois)</SelectItem>
                      <SelectItem value="INSTALLMENTS">Paiement échelonné (en tranches)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {paymentPlan === "INSTALLMENTS" && (
                  <div className="space-y-2">
                    <Label htmlFor={`installmentsCount-${holding.id}`}>Nombre de tranches</Label>
                    <Input
                      id={`installmentsCount-${holding.id}`}
                      type="number"
                      min="1"
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(e.target.value)}
                      placeholder="ex: 3"
                    />
                  </div>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`nextPaymentDate-${holding.id}`}>Date du prochain paiement</Label>
                  <Input
                    id={`nextPaymentDate-${holding.id}`}
                    type="date"
                    value={nextPaymentDate}
                    onChange={(e) => setNextPaymentDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-500">Limites</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`maxClinics-${holding.id}`}>Nombre maximum de cliniques</Label>
                  <Input
                    id={`maxClinics-${holding.id}`}
                    type="number"
                    min="1"
                    value={maxClinics}
                    onChange={(e) => setMaxClinics(e.target.value)}
                    onBlur={() => {
                      if (!maxClinics || Number(maxClinics) < 1) setMaxClinics("1");
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`maxUsers-${holding.id}`}>Nombre maximum d&apos;utilisateurs</Label>
                  <Input
                    id={`maxUsers-${holding.id}`}
                    type="number"
                    min="1"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(e.target.value)}
                    onBlur={() => {
                      if (!maxUsers || Number(maxUsers) < 1) setMaxUsers("1");
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Annuler</Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
