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
import { MoreHorizontal, Edit, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { updateHoldingSubscription } from "@/actions/super-admin";
import { toast } from "sonner";

interface HoldingActionsMenuProps {
  holding: {
    id: string;
    name: string;
    plan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    licenseExpiresAt: Date | null;
  };
}

export default function HoldingActionsMenu({ holding }: HoldingActionsMenuProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<SubscriptionPlan>(holding.plan);
  const [status, setStatus] = useState<SubscriptionStatus>(holding.subscriptionStatus);
  const [isUnlimited, setIsUnlimited] = useState<boolean>(!holding.licenseExpiresAt);
  const [licenseExpiresAt, setLicenseExpiresAt] = useState<string>(
    holding.licenseExpiresAt ? new Date(holding.licenseExpiresAt).toISOString().split('T')[0] : ""
  );

  const handleUpdate = async () => {
    setLoading(true);
    let expiresAt: Date | null = null;
    if (!isUnlimited && licenseExpiresAt) {
      expiresAt = new Date(licenseExpiresAt);
    }
    
    const response = await updateHoldingSubscription(holding.id, { 
      plan, 
      status, 
      licenseExpiresAt: expiresAt 
    });
    
    if (response.error) {
      toast.error(response.error);
    } else {
      toast.success("Abonnement mis à jour avec succès !");
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
            <DropdownMenuItem onClick={() => setShowEditDialog(true)} className="cursor-pointer">
              <Edit className="h-4 w-4 mr-2" />
              Modifier l'abonnement
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'abonnement</DialogTitle>
            <DialogDescription>
              Ajustez le forfait et le statut de la holding <strong>{holding.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Forfait</Label>
              <Select value={plan} onValueChange={(val) => { if (val) setPlan(val as SubscriptionPlan); }}>
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
              <Select value={status} onValueChange={(val) => { if (val) setStatus(val as SubscriptionStatus); }}>
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
