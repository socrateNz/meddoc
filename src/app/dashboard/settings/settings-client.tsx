"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  User,
  Bell,
  Shield,
  Palette,
  Save,
  Loader2,
  Moon,
  Sun,
  Monitor,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile, changePassword, updateNotificationPreferences } from "@/actions/users";
import { toast } from "sonner";

interface SettingsUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
  mutedNotificationTypes: string[];
}

type Tab = "profile" | "notifications" | "security" | "appearance";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "profile", label: "Mon Profil", icon: User },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Sécurité & Accès", icon: Shield },
  { key: "appearance", label: "Apparence", icon: Palette },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  COORDINATOR: "Coordinateur",
  MEDECIN: "Médecin",
  CAREGIVER: "Infirmier(e)",
  PHARMACIST: "Pharmacien(ne)",
  PATIENT: "Patient",
  FAMILY: "Famille",
  SUPER_ADMIN: "Super administrateur",
};

// ─── Profile Tab ─────────────────────────────────────────────────────────────
function ProfileTab({ user }: { user: SettingsUser }) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName) {
      toast.error("Le prénom et le nom sont requis.");
      return;
    }
    setLoading(true);
    try {
      const res = await updateProfile({ firstName, lastName, phone });
      if (res.success) toast.success("Profil mis à jour avec succès.");
      else toast.error(res.error ?? "Erreur lors de la mise à jour.");
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Informations Personnelles</CardTitle>
          <CardDescription>
            Mettez à jour vos coordonnées visibles par l&apos;équipe soignante.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center gap-5 mb-6 pb-6 border-b">
            <Avatar className="h-16 w-16 border-2 border-border shadow">
              <AvatarImage src={user.avatarUrl ?? ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                {user.lastName[0]}{user.firstName[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold text-base">{user.firstName} {user.lastName}</p>
              <Badge variant="outline" className="mt-1 text-xs border-primary/30 text-primary bg-primary/5">
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="settings-lastName">Nom</Label>
                <Input
                  id="settings-lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-firstName">Prénom</Label>
                <Input
                  id="settings-firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-email">Adresse email</Label>
              <Input
                id="settings-email"
                type="email"
                value={user.email}
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">L&apos;email ne peut pas être modifié.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-phone">Téléphone</Label>
              <Input
                id="settings-phone"
                type="tel"
                placeholder="Ex : 06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Rôle d&apos;accès</Label>
              <div className="p-3 bg-muted/50 border rounded-lg text-sm font-semibold text-foreground/80">
                {ROLE_LABELS[user.role] ?? user.role}
                <span className="ml-2 text-xs font-normal text-muted-foreground">(géré par l&apos;administrateur)</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={loading} className="gap-2 min-w-[140px]">
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Enregistrement...</>
                ) : (
                  <><Save className="h-4 w-4" />Enregistrer</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Notification Prefs Tab ───────────────────────────────────────────────────
// Ne couvre que les types de Notification réellement générés par l'application
// (voir src/lib/events.ts, src/lib/scheduler.ts) : pas de canal Email/SMS, ils
// n'existent pas encore côté envoi.
const NOTIF_TYPES = [
  { id: "INCIDENT", label: "Incidents", description: "Création et escalade d'incidents", icon: AlertCircle, color: "text-red-500" },
  { id: "APPOINTMENT", label: "Rendez-vous", description: "Rappels et affectations de rendez-vous", icon: Calendar, color: "text-blue-500" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function NotificationsTab({ user }: { user: SettingsUser }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const t of NOTIF_TYPES) {
      state[t.id] = !user.mutedNotificationTypes.includes(t.id);
    }
    return state;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const mutedTypes = NOTIF_TYPES.filter((t) => !enabled[t.id]).map((t) => t.id);
      const res = await updateNotificationPreferences(mutedTypes);
      if (res.success) {
        toast.success("Préférences de notifications mises à jour.");
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Types d&apos;événements</CardTitle>
          <CardDescription>
            Choisissez les événements pour lesquels vous recevez une notification dans MedDoc.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {NOTIF_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 ${t.color}`} />
                  <div>
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </div>
                <Toggle
                  checked={enabled[t.id]}
                  onChange={(v) => setEnabled((prev) => ({ ...prev, [t.id]: v }))}
                />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Ces notifications s&apos;affichent dans MedDoc (cloche en haut de l&apos;écran). L&apos;envoi par email ou SMS n&apos;est pas disponible pour le moment.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[180px]">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Enregistrement...</>
          ) : (
            <><Save className="h-4 w-4" />Enregistrer les préférences</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
function SecurityTab({ user }: { user: SettingsUser }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = newPw.length === 0 ? 0 : newPw.length < 6 ? 1 : newPw.length < 10 ? 2 : 3;
  const strengthLabel = ["", "Faible", "Moyen", "Fort"];
  const strengthColor = ["", "bg-red-500", "bg-amber-500", "bg-emerald-500"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    if (newPw.length < 8) {
      toast.error("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setLoading(true);
    try {
      const res = await changePassword(currentPw, newPw);
      if (res.success) {
        toast.success("Mot de passe mis à jour avec succès.");
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
      } else {
        toast.error(res.error || "Erreur lors du changement de mot de passe.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Changer le mot de passe</CardTitle>
          <CardDescription>Utilisez un mot de passe fort d&apos;au moins 8 caractères.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="current-pw">Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showCurrent ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-pw">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNew ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPw.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3].map((s) => (
                      <div
                        key={s}
                        className={`flex-1 rounded-full transition-colors duration-300 ${
                          strength >= s ? strengthColor[strength] : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Force : <span className="font-semibold">{strengthLabel[strength]}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirmer le nouveau mot de passe</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                className={
                  confirmPw && confirmPw !== newPw
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {confirmPw && confirmPw !== newPw && (
                <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={loading} className="gap-2 min-w-[140px]">
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Mise à jour...</>
                ) : (
                  <><Lock className="h-4 w-4" />Mettre à jour</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Informations de connexion</CardTitle>
          <CardDescription>Détails du compte utilisé pour vous connecter.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-semibold">Adresse email</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant="outline" className="text-xs">{ROLE_LABELS[user.role] ?? user.role}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────
const THEMES: { key: "light" | "dark" | "system"; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "light", label: "Clair", icon: Sun, desc: "Interface lumineuse" },
  { key: "dark", label: "Sombre", icon: Moon, desc: "Interface sombre" },
  { key: "system", label: "Système", icon: Monitor, desc: "Suit votre OS" },
];

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Thème</CardTitle>
          <CardDescription>Choisissez l&apos;apparence générale de l&apos;interface. Le changement est appliqué immédiatement.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const Icon = t.icon;
              const selected = theme === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setTheme(t.key);
                    toast.success(`Thème « ${t.label} » appliqué.`);
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/50 hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                  <p className={`text-xs font-semibold ${selected ? "text-primary" : "text-muted-foreground"}`}>
                    {t.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                  {selected && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────
export default function SettingsClient({ user }: { user: SettingsUser }) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground mt-1">
          Gérez les informations de votre compte et vos préférences d&apos;application.
        </p>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-6 items-start">
        <nav className="flex flex-col gap-1 bg-muted/20 border rounded-xl p-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all duration-150 ${
                  active
                    ? "bg-background shadow-sm text-primary font-semibold"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div>
          {activeTab === "profile" && <ProfileTab user={user} />}
          {activeTab === "notifications" && <NotificationsTab user={user} />}
          {activeTab === "security" && <SecurityTab user={user} />}
          {activeTab === "appearance" && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}
