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
import { MoreHorizontal, Edit, Loader2, Eye, FileDown, Crown, Building2, Users, Activity, UserX, UserCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubscriptionPlan, SubscriptionStatus, PaymentFrequency } from "@prisma/client";
import { updateHoldingSubscription, deactivateHolding, reactivateHolding, deleteHolding } from "@/actions/super-admin";
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
  };
}

export default function HoldingActionsMenu({ holding }: HoldingActionsMenuProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {holding.name}
              <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider ${
                holding.plan === "ENTERPRISE" ? "border-purple-500/30 text-purple-600 bg-purple-500/10" :
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier</DialogTitle>
            <DialogDescription>
              Modifiez les informations de la holding <strong>{holding.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select items={STATUS_OPTIONS} value={status} onValueChange={(val) => { if (val) setStatus(val as SubscriptionStatus); }}>
                <SelectTrigger>
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
            
            <div className="space-y-2">
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

            <div className="grid grid-cols-2 gap-4">
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
                  <SelectTrigger>
                    <SelectValue placeholder="Fréquence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Mensuelle</SelectItem>
                    <SelectItem value="YEARLY">Annuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`maxClinics-${holding.id}`}>Nombre maximum de cliniques</Label>
                <Input
                  id={`maxClinics-${holding.id}`}
                  type="number"
                  min="1"
                  value={maxClinics}
                  onChange={(e) => setMaxClinics(e.target.value)}
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
                />
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
