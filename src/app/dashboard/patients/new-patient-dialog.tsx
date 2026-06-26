"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2 } from "lucide-react";
import { createPatient } from "@/actions/patients";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function NewPatientDialog({ 
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

  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [dependencyLevel, setDependencyLevel] = useState(1);
  const [organizationId, setOrganizationId] = useState(holdingId);

  // Tag input states
  const [pathologyInput, setPathologyInput] = useState("");
  const [pathologies, setPathologies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);

  const handleAddPathology = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && pathologyInput.trim()) {
      e.preventDefault();
      if (!pathologies.includes(pathologyInput.trim())) {
        setPathologies([...pathologies, pathologyInput.trim()]);
      }
      setPathologyInput("");
    }
  };

  const handleRemovePathology = (index: number) => {
    setPathologies(pathologies.filter((_, i) => i !== index));
  };

  const handleAddAllergy = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && allergyInput.trim()) {
      e.preventDefault();
      if (!allergies.includes(allergyInput.trim())) {
        setAllergies([...allergies, allergyInput.trim()]);
      }
      setAllergyInput("");
    }
  };

  const handleRemoveAllergy = (index: number) => {
    setAllergies(allergies.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !dateOfBirth || !address) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const response = await createPatient({
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        address,
        emergencyContact,
        dependencyLevel,
        pathologies,
        allergies,
        organizationId: isHoldingAdmin ? organizationId : undefined,
      });

      if (response.success) {
        toast.success(`Patient ${firstName} ${lastName} créé avec succès.`);
        setOpen(false);
        // Reset form
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setDateOfBirth("");
        setAddress("");
        setEmergencyContact("");
        setDependencyLevel(1);
        setPathologies([]);
        setAllergies([]);
        if (isHoldingAdmin) setOrganizationId(holdingId);
      } else {
        toast.error(response.error || "Erreur lors de la création du patient.");
      }
    } catch (err: any) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="flex fle-row gap-2gap-2 bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg transition-all hover:scale-[1.02] duration-200" />}>
        <Plus className="h-4 w-4" />
        Nouveau patient
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-card border border-border/40 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">Nouveau Patient</DialogTitle>
          <DialogDescription>
            Enregistrez un nouveau patient et ses coordonnées de santé essentielles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom *</Label>
              <Input
                id="lastName"
                placeholder="Ex: Dupont"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom *</Label>
              <Input
                id="firstName"
                placeholder="Ex: Jean"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="jean.dupont@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date de naissance *</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Niveau de dépendance ({dependencyLevel})</Label>
              <div className="flex items-center gap-1.5 pt-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDependencyLevel(level)}
                    className={`flex-1 h-9 rounded-lg font-medium text-sm transition-all border ${dependencyLevel === level
                        ? "bg-primary border-primary text-primary-foreground shadow-md scale-105"
                        : "bg-background hover:bg-accent border-border text-muted-foreground"
                      }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isHoldingAdmin && (
            <div className="space-y-2">
              <Label>Établissement de rattachement</Label>
              <Select value={organizationId} onValueChange={(val: any) => val && setOrganizationId(val)}>
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

          <div className="space-y-2">
            <Label htmlFor="address">Adresse du domicile *</Label>
            <Input
              id="address"
              placeholder="Ex: 12 Rue de la Paix, 75002 Paris"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emergencyContact">Contact d'urgence (Nom & Tél)</Label>
            <Input
              id="emergencyContact"
              placeholder="Ex: Marie Dupont (Fille) - 06 98 76 54 32"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
            />
          </div>

          {/* Pathologies */}
          <div className="space-y-2">
            <Label htmlFor="pathologies">Pathologies (Appuyez sur Entrée pour ajouter)</Label>
            <Input
              id="pathologies"
              placeholder="Ex: Diabète Type 2"
              value={pathologyInput}
              onChange={(e) => setPathologyInput(e.target.value)}
              onKeyDown={handleAddPathology}
            />
            {pathologies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {pathologies.map((pathology, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1 pr-1.5 py-0.5">
                    {pathology}
                    <button
                      type="button"
                      onClick={() => handleRemovePathology(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Allergies */}
          <div className="space-y-2">
            <Label htmlFor="allergies">Allergies (Appuyez sur Entrée pour ajouter)</Label>
            <Input
              id="allergies"
              placeholder="Ex: Pénicilline"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={handleAddAllergy}
            />
            {allergies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {allergies.map((allergy, idx) => (
                  <Badge key={idx} variant="outline" className="gap-1 pr-1.5 py-0.5 border-amber-500/30 text-amber-600 bg-amber-500/5">
                    {allergy}
                    <button
                      type="button"
                      onClick={() => handleRemoveAllergy(idx)}
                      className="text-amber-600 hover:text-destructive transition-colors rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="min-w-[100px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                "Créer"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
