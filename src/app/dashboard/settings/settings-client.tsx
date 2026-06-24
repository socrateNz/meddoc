"use client";

import { useState } from "react";
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
  Smartphone,
  Mail,
  MessageSquare,
  AlertCircle,
  Calendar,
  Activity,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile } from "@/actions/users";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
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
  CAREGIVER: "Soignant",
  PATIENT: "Patient",
  FAMILY: "Famille",
};

// ─── Profile Tab ─────────────────────────────────────────────────────────────
function ProfileTab({ user }: { user: User }) {
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
      {/* Identity card */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Informations Personnelles</CardTitle>
          <CardDescription>
            Mettez à jour vos coordonnées visibles par l&apos;équipe soignante.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Avatar section */}
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
const NOTIF_CHANNELS = [
  { id: "email", label: "Email", description: "Recevoir les alertes par email", icon: Mail },
  { id: "sms", label: "SMS", description: "Notifications critiques par SMS", icon: Smartphone },
  { id: "inapp", label: "Notifications in-app", description: "Alertes dans l'interface MedDoc", icon: Bell },
];

const NOTIF_TYPES = [
  { id: "incidents", label: "Incidents", description: "Création et escalade d'incidents", icon: AlertCircle, color: "text-red-500" },
  { id: "appointments", label: "Rendez-vous", description: "Rappels et modifications de RDV", icon: Calendar, color: "text-blue-500" },
  { id: "careplans", label: "Plans de soins", description: "Mises à jour des protocoles de soins", icon: Activity, color: "text-amber-500" },
  { id: "messages", label: "Messages", description: "Nouveaux messages reçus", icon: MessageSquare, color: "text-emerald-500" },
  { id: "ai", label: "Analyses IA", description: "Nouveaux rapports d'analyse clinique", icon: Sparkles, color: "text-violet-500" },
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

function NotificationsTab() {
  const [channels, setChannels] = useState({ email: true, sms: false, inapp: true });
  const [types, setTypes] = useState({
    incidents: true,
    appointments: true,
    careplans: true,
    messages: true,
    ai: false,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    toast.success("Préférences de notifications mises à jour.");
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Channels */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Canaux de notification</CardTitle>
          <CardDescription>Choisissez comment vous souhaitez être alerté.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {NOTIF_CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const checked = channels[ch.id as keyof typeof channels];
            return (
              <div key={ch.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{ch.label}</p>
                    <p className="text-xs text-muted-foreground">{ch.description}</p>
                  </div>
                </div>
                <Toggle
                  checked={checked}
                  onChange={(v) => setChannels((prev) => ({ ...prev, [ch.id]: v }))}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Event Types */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Types d&apos;événements</CardTitle>
          <CardDescription>Sélectionnez les événements pour lesquels vous souhaitez des alertes.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {NOTIF_TYPES.map((t) => {
            const Icon = t.icon;
            const checked = types[t.id as keyof typeof types];
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
                  checked={checked}
                  onChange={(v) => setTypes((prev) => ({ ...prev, [t.id]: v }))}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="gap-2">
          {saved ? (
            <><CheckCircle2 className="h-4 w-4" />Enregistré</>
          ) : (
            <><Save className="h-4 w-4" />Enregistrer les préférences</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
function SecurityTab({ user }: { user: User }) {
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
    await new Promise((r) => setTimeout(r, 800)); // Simulate API call
    toast.success("Mot de passe mis à jour avec succès.");
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setLoading(false);
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

      {/* Sessions info */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Informations de connexion</CardTitle>
          <CardDescription>Détails du compte et de la session active.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="text-sm font-semibold">Adresse email</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant="outline" className="text-xs">Vérifié</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-semibold">Session active</p>
              <p className="text-xs text-muted-foreground">Ce navigateur — Aujourd&apos;hui</p>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────
type Theme = "light" | "dark" | "system";
const THEMES: { key: Theme; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "light", label: "Clair", icon: Sun, desc: "Interface lumineuse" },
  { key: "dark", label: "Sombre", icon: Moon, desc: "Interface sombre" },
  { key: "system", label: "Système", icon: Monitor, desc: "Suit votre OS" },
];

const ACCENT_COLORS = [
  { name: "Bleu", value: "blue", cls: "bg-blue-500" },
  { name: "Violet", value: "violet", cls: "bg-violet-500" },
  { name: "Vert", value: "emerald", cls: "bg-emerald-500" },
  { name: "Indigo", value: "indigo", cls: "bg-indigo-500" },
  { name: "Rose", value: "rose", cls: "bg-rose-500" },
];

function AppearanceTab() {
  const [theme, setTheme] = useState<Theme>("system");
  const [accent, setAccent] = useState("blue");
  const [density, setDensity] = useState<"compact" | "normal" | "spacious">("normal");

  const handleSave = () => {
    toast.success("Préférences d'apparence enregistrées.");
  };

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Thème</CardTitle>
          <CardDescription>Choisissez l&apos;apparence générale de l&apos;interface.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const Icon = t.icon;
              const selected = theme === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
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

      {/* Accent Color */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Couleur d&apos;accentuation</CardTitle>
          <CardDescription>Personnalisez la couleur principale de l&apos;interface.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex gap-3 flex-wrap">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setAccent(c.value)}
                title={c.name}
                className={`h-8 w-8 rounded-full ${c.cls} transition-all duration-200 ${
                  accent === c.value
                    ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                    : "opacity-70 hover:opacity-100 hover:scale-105"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Couleur sélectionnée :{" "}
            <span className="font-semibold">
              {ACCENT_COLORS.find((c) => c.value === accent)?.name}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Density */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Densité d&apos;affichage</CardTitle>
          <CardDescription>Ajustez l&apos;espacement des éléments de l&apos;interface.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex rounded-xl border overflow-hidden w-fit">
            {(["compact", "normal", "spacious"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`px-5 py-2 text-sm font-medium transition-colors border-r last:border-r-0 ${
                  density === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {d === "compact" ? "Compact" : d === "normal" ? "Normal" : "Spacieux"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────
export default function SettingsClient({ user }: { user: User }) {
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
        {/* Sidebar Nav */}
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

        {/* Tab Content */}
        <div>
          {activeTab === "profile" && <ProfileTab user={user} />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "security" && <SecurityTab user={user} />}
          {activeTab === "appearance" && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}
