"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { 
  BookOpen, 
  ShieldCheck, 
  Building2, 
  Users, 
  Stethoscope, 
  HeartPulse, 
  UserCheck, 
  Search, 
  Printer, 
  ChevronRight, 
  Sparkles, 
  AlertCircle, 
  Wallet, 
  Calendar, 
  Activity, 
  FileText, 
  CheckCircle2, 
  Layers, 
  LifeBuoy,
  Lock,
  ArrowRight,
  Filter
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface UserManualProps {
  userRole?: string;
  clinicId?: string;
}

export default function UserManual({ userRole = "ADMIN", clinicId }: UserManualProps) {
  // Master definitions of all role sections
  const allRoleSections = [
    {
      id: "SUPER_ADMIN",
      title: "Super Administrateur",
      subtitle: "Gestion globale de l'infrastructure SaaS & Multi-Tenancy",
      icon: ShieldCheck,
      color: "from-blue-600 to-indigo-600",
      badge: "Système & SaaS",
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      items: [
        {
          title: "1. Tableau de bord Système",
          icon: Activity,
          content: "Permet de surveiller la santé globale de la plateforme MedDoc en temps réel.",
          details: [
            "Statistiques sur le nombre total de Holdings et de cliniques rattachées.",
            "Volume total d'utilisateurs actifs (admins, coordinateurs, soignants).",
            "Nombre global de patients enregistrés à travers tous les établissements.",
            "Supervision de l'état des abonnements SaaS."
          ],
          link: "/dashboard",
          linkText: "Accéder au Tableau de bord Système"
        },
        {
          title: "2. Gestion des Holdings & Cliniques",
          icon: Building2,
          content: "Supervision des groupes hospitaliers multi-tenants et création d'établissements.",
          details: [
            "Créer une nouvelle Holding avec dénomination sociale et identifiant unique.",
            "Rattacher de nouvelles cliniques à une Holding parente.",
            "Attribuer des quotas d'établissements (maxClinics) et d'utilisateurs (maxUsers).",
            "Consulter l'arborescence complète des organisations."
          ],
          link: "/dashboard/holdings",
          linkText: "Gérer les Holdings & Licences"
        },
        {
          title: "3. Abonnements, Licences & Plans",
          icon: Wallet,
          content: "Administration des offres d'abonnement et des limites de comptes.",
          details: [
            "Modifier le plan d'une organisation : TRIAL, BASIC, PREMIUM, ENTERPRISE.",
            "Gérer les statuts d'abonnement : ACTIVE, INACTIVE, TRIALING, CANCELLED.",
            "Définir et prolonger la date d'expiration de la licence médicale (licenseExpiresAt).",
            "Ajuster les plafonds d'utilisateurs et de cliniques en temps réel."
          ],
          link: "/dashboard/holdings",
          linkText: "Consulter la gestion des Licences"
        },
        {
          title: "4. Audit Système & Sécurité",
          icon: Lock,
          content: "Traçabilité complète des actions effectuées sur la plateforme.",
          details: [
            "Consultation des journaux d'audit (AuditLog) pour le respect des normes HDS/GDPR.",
            "Traçabilité des connexions, modifications de comptes et accès aux données de santé.",
            "Sécurisation des rôles et contrôle d'accès strict par réattributions."
          ]
        }
      ]
    },
    {
      id: "ADMIN",
      title: "Administrateur de Holding",
      subtitle: "Pilotage du réseau de cliniques, en lecture seule sur les opérations quotidiennes",
      icon: Building2,
      color: "from-emerald-600 to-teal-600",
      badge: "Direction Régionale",
      badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      items: [
        {
          title: "1. Créer, Suspendre & Superviser les Cliniques",
          icon: Layers,
          content: "L'admin agit comme un directeur régional : il structure le réseau, sans intervenir dans le quotidien.",
          details: [
            "Créer une nouvelle clinique et l'attacher à la holding.",
            "Suspendre ou réactiver une clinique (bloque l'accès de tout son personnel).",
            "Consulter les indicateurs (personnel, patients) de chaque établissement."
          ],
          link: "/dashboard/clinics",
          linkText: "Voir les cliniques affiliées"
        },
        {
          title: "2. Désigner le Coordinateur de chaque Clinique",
          icon: Users,
          content: "Le coordinateur est le véritable administrateur opérationnel d'une clinique ; l'admin ne fait que le nommer ou le remplacer.",
          details: [
            "Affecter un coordinateur à une clinique du réseau.",
            "Remplacer ou désactiver un coordinateur existant.",
            "Le recrutement du reste de l'équipe (soignants, pharmaciens) revient ensuite au coordinateur."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/team` : "/dashboard/team",
          linkText: "Gérer les coordinateurs"
        },
        {
          title: "3. Consultation en lecture seule",
          icon: Wallet,
          content: "L'admin voit tout ce qui se passe dans ses cliniques, mais ne modifie jamais les données opérationnelles.",
          details: [
            "Consulter les patients, consultations, rendez-vous et incidents de chaque clinique (sans créer/modifier).",
            "Consulter la caisse, le stock pharmacie et l'inventaire (sans enregistrer de vente, dépense ou achat).",
            "Consulter les paramètres de chaque clinique (modifiables uniquement par son coordinateur)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/finance` : "/dashboard/finance",
          linkText: "Consulter la Finance & Pharmacie"
        }
      ]
    },
    {
      id: "COORDINATOR",
      title: "Coordinateur Médical",
      subtitle: "Administrateur opérationnel complet d'une clinique : personnel, patients, pharmacie et caisse",
      icon: Stethoscope,
      color: "from-violet-600 to-purple-600",
      badge: "Administration de Clinique",
      badgeColor: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
      items: [
        {
          title: "1. Gestion du Personnel de la Clinique",
          icon: Users,
          content: "Le coordinateur recrute et gère toute l'équipe de sa clinique.",
          details: [
            "Ajouter des Soignants / Médecins (CAREGIVER) et des Pharmaciens (PHARMACIST).",
            "Activer / Désactiver les accès du personnel de sa clinique.",
            "Consulter les disponibilités et les affectations de l'équipe."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/team` : "/dashboard/team",
          linkText: "Gérer l'Équipe Médicale"
        },
        {
          title: "2. Admissions, Fiches Patients & Plans de Soins",
          icon: UserCheck,
          content: "Prise en charge administrative et médicale des nouveaux entrants.",
          details: [
            "Enregistrer les nouveaux patients avec état civil, pathologies et allergies connues.",
            "Définir le score de dépendance (1 à 5) pour l'allocation des ressources soignantes.",
            "Concevoir les plans de soins et suivre l'exécution des tâches par l'équipe soignante.",
            "Changer le statut du patient (ADMITTED, DISCHARGED, ARCHIVED)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/patients` : "/dashboard/patients",
          linkText: "Consulter la liste des Patients"
        },
        {
          title: "3. Rendez-vous, Incidents & Pharmacie/Caisse",
          icon: Calendar,
          content: "Organisation de l'agenda médical et suivi financier de l'établissement.",
          details: [
            "Planifier les consultations, examens et visites de contrôle.",
            "Superviser les incidents déclarés et leur résolution.",
            "Gérer le catalogue pharmacie, les achats de stock, les ventes, dépenses et l'inventaire."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/appointments` : "/dashboard/appointments",
          linkText: "Ouvrir l'Agenda des Rendez-vous"
        },
        {
          title: "4. Paramètres de la Clinique",
          icon: Layers,
          content: "Configuration propre à l'établissement.",
          details: [
            "Modifier les informations générales de la clinique.",
            "Consulter et ajuster les indicateurs opérationnels de son établissement."
          ],
          ...(clinicId ? { link: `/dashboard/clinics/${clinicId}/settings`, linkText: "Ouvrir les Paramètres de la Clinique" } : {})
        }
      ]
    },
    {
      id: "PHARMACIST",
      title: "Pharmacien(ne)",
      subtitle: "Gestion de la pharmacie, du stock et de la caisse — sans accès aux dossiers cliniques",
      icon: Wallet,
      color: "from-amber-600 to-orange-600",
      badge: "Pharmacie & Caisse",
      badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      items: [
        {
          title: "1. Catalogue Pharmacie & Lots",
          icon: Layers,
          content: "Gestion des médicaments, de leurs lots et de leurs dates de péremption.",
          details: [
            "Ajouter/modifier des médicaments (dosage, prix, fournisseur, numéro de lot, péremption).",
            "Suivre les alertes de rupture, stock faible ou péremption proche."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/finance` : "/dashboard/finance",
          linkText: "Accéder au Module Finance & Pharmacie"
        },
        {
          title: "2. Stock & Inventaire",
          icon: FileText,
          content: "Traçabilité complète des entrées et sorties de stock.",
          details: [
            "Enregistrer les achats de pharmacie (fournisseur, prix, quantité).",
            "Démarrer, saisir et clôturer un inventaire physique du stock."
          ]
        },
        {
          title: "3. Caisse & Ventes",
          icon: Wallet,
          content: "Encaissement des ventes de médicaments et gestion de la caisse.",
          details: [
            "Enregistrer une vente ou une facture regroupée pour un patient.",
            "Enregistrer une dépense / un retrait de caisse.",
            "Imprimer les reçus et factures."
          ]
        }
      ]
    },
    {
      id: "CAREGIVER",
      title: "Soignant / Médecin",
      subtitle: "Prise des constantes vitales, exécution des soins & Assistant IA",
      icon: HeartPulse,
      color: "from-rose-600 to-pink-600",
      badge: "Soins Terrain",
      badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      items: [
        {
          title: "1. Relevé des Constantes Vitales",
          icon: Activity,
          content: "Enregistrement rapide des données physiologiques au chevet du patient.",
          details: [
            "Saisir la Pression Artérielle (Systolique / Diastolique en mmHg).",
            "Saisir le Pouls (BPM), la Saturation en Oxygène (SpO2 en %), la Température (°C) et la Glycémie (g/L).",
            "Visualisation immédiate des indicateurs colorés d'alerte en cas de constante anormale."
          ]
        },
        {
          title: "2. Exécution des Tâches de Soins",
          icon: CheckCircle2,
          content: "Validation au fil de la journée des actes de soins attribués.",
          details: [
            "Consulter la feuille de soins quotidienne attribuée par le coordinateur.",
            "Cocher les tâches effectuées avec horodatage automatique.",
            "Ajouter des observations textuelles pour la relève d'équipe."
          ]
        },
        {
          title: "3. Assistant Clinique IA",
          icon: Sparkles,
          content: "Support à la décision clinique et analyse intelligente des synthèses.",
          details: [
            "Poser des questions médicales complexes sur les protocoles ou interactions médicamenteuses.",
            "Générer des résumés automatisés de l'historique médical d'un patient.",
            "Demander des pré-analyses de constantes ou de symptômes."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/ai-assistant` : "/dashboard/ai-assistant",
          linkText: "Lancer l'Assistant IA"
        },
        {
          title: "4. Signalement d'Incidents Instantané",
          icon: AlertCircle,
          content: "Transmission immédiate des urgences ou événements indésirables.",
          details: [
            "Déclarer un incident en quelques clics avec description et niveau de gravité.",
            "Alerter le coordinateur et le médecin d'astreinte en temps réel."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/incidents` : "/dashboard/incidents",
          linkText: "Déclarer un incident"
        }
      ]
    },
    {
      id: "FAMILY",
      title: "Patient & Famille",
      subtitle: "Suivi du dossier de santé, rendez-vous et échanges avec l'équipe",
      icon: Users,
      color: "from-sky-600 to-blue-600",
      badge: "Espace Patient & Proches",
      badgeColor: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      items: [
        {
          title: "1. Suivi de Santé & Journal de Soins",
          icon: HeartPulse,
          content: "Transparence et réassurance pour le patient et ses proches autorisés.",
          details: [
            "Consulter le résumé du dossier médical et le niveau de dépendance.",
            "Suivre l'évolution des constantes vitales et la prise en charge au quotidien.",
            "Consulter l'historique des rendez-vous et ordonnances."
          ]
        },
        {
          title: "2. Messagerie Sécurisée",
          icon: LifeBuoy,
          content: "Communication bienveillante avec l'équipe de coordination.",
          details: [
            "Envoyer des messages à la clinique pour toute question administrative ou d'organisation.",
            "Recevoir les notifications importantes concernant la santé du proche."
          ]
        }
      ]
    }
  ];

  // Role hierarchy filtering: Users can view their own role tab and all role tabs below them in hierarchy
  const roleHierarchy: Record<string, string[]> = {
    SUPER_ADMIN: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "CAREGIVER", "PHARMACIST", "FAMILY"],
    ADMIN: ["ADMIN", "COORDINATOR", "CAREGIVER", "PHARMACIST", "FAMILY"],
    COORDINATOR: ["COORDINATOR", "CAREGIVER", "PHARMACIST", "FAMILY"],
    CAREGIVER: ["CAREGIVER", "FAMILY"],
    PHARMACIST: ["PHARMACIST", "FAMILY"],
    FAMILY: ["FAMILY"],
    PATIENT: ["FAMILY"]
  };

  const visibleRoleSections = useMemo(() => {
    const allowedIds = roleHierarchy[userRole] || roleHierarchy["ADMIN"];
    return allRoleSections.filter((sec) => allowedIds.includes(sec.id));
  }, [userRole]);

  const [activeTab, setActiveTab] = useState<string>(
    visibleRoleSections[0]?.id || "ADMIN"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const handlePrint = () => {
    window.print();
  };

  const filteredSections = useMemo(() => {
    return visibleRoleSections.map((section) => {
      if (!searchQuery.trim()) return section;
      const q = searchQuery.toLowerCase();
      const matchesSection = 
        section.title.toLowerCase().includes(q) || 
        section.subtitle.toLowerCase().includes(q);
      
      const filteredItems = section.items.filter((item) => 
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.details.some(d => d.toLowerCase().includes(q))
      );

      if (matchesSection || filteredItems.length > 0) {
        return {
          ...section,
          items: filteredItems.length > 0 ? filteredItems : section.items
        };
      }
      return null;
    }).filter(Boolean) as typeof visibleRoleSections;
  }, [visibleRoleSections, searchQuery]);

  const currentSection = visibleRoleSections.find(s => s.id === activeTab) || visibleRoleSections[0];

  return (
    <div className="space-y-8 animate-fade-up max-w-7xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-8 md:p-10 shadow-2xl border border-slate-800">
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 translate-y-12 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold backdrop-blur-md">
                <BookOpen className="h-3.5 w-3.5" />
                <span>Documentation Officielle MedDoc EMR</span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-xs font-semibold">
                <Filter className="h-3 w-3 mr-1" />
                Rôle : {userRole}
              </Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300">
              Manuel d'Utilisation adapté à votre rôle
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Consultez les guides et procédures correspondant à vos habilitations ({userRole}) et à votre niveau de responsabilité en descendant.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button 
              onClick={handlePrint} 
              variant="outline" 
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-2 backdrop-blur-md transition-all duration-300"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimer / PDF</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-8 relative z-10 max-w-xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Rechercher une fonctionnalité (ex: Licences, Patient, Constantes, Incidents...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 pr-4 py-6 rounded-2xl bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:bg-white/15 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all backdrop-blur-md"
            />
          </div>
        </div>
      </div>

      {/* Role Tabs Navigation - Filtered by User Role Hierarchy */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {visibleRoleSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => {
                setActiveTab(sec.id);
                setSearchQuery("");
              }}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs md:text-sm font-semibold transition-all duration-300 whitespace-nowrap cursor-pointer ${
                isActive
                  ? `bg-gradient-to-r ${sec.color} text-white shadow-lg shadow-blue-500/25 scale-[1.02]`
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{sec.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {searchQuery.trim() ? (
        // Search Results View
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Résultats de recherche pour "{searchQuery}" ({filteredSections.reduce((acc, s) => acc + s.items.length, 0)} éléments)
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
              Effacer la recherche
            </Button>
          </div>

          {filteredSections.length === 0 ? (
            <Card className="p-8 text-center rounded-2xl">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Aucun résultat trouvé dans vos habilitations</h3>
              <p className="text-sm text-slate-500 mt-1">Essayez avec un autre mot-clé accessible sous votre rôle ({userRole}).</p>
            </Card>
          ) : (
            filteredSections.map((sec) => (
              <Card key={sec.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <CardHeader className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 py-4">
                  <div className="flex items-center gap-3">
                    <Badge className={sec.badgeColor}>{sec.badge}</Badge>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                      {sec.title}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {sec.items.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 space-y-2">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.title}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{item.content}</p>
                      <ul className="list-disc list-inside text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                        {item.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        // Tabbed View
        <div className="space-y-6">
          {/* Section Header Card */}
          {currentSection && (
            <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl bg-gradient-to-br ${currentSection.color} text-white shadow-md`}>
                    <currentSection.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">
                        Rôle : {currentSection.title}
                      </CardTitle>
                      <Badge className={currentSection.badgeColor}>{currentSection.badge}</Badge>
                    </div>
                    <CardDescription className="text-sm mt-0.5 text-slate-500 dark:text-slate-400">
                      {currentSection.subtitle}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 md:p-8 space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {currentSection.items.map((item, index) => {
                    const ItemIcon = item.icon;
                    return (
                      <div 
                        key={index} 
                        className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:border-blue-500/30"
                      >
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                                <ItemIcon className="h-5 w-5" />
                              </div>
                              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug">
                                {item.title}
                              </h3>
                            </div>
                          </div>

                          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                            {item.content}
                          </p>

                          <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                              Procédures & Règles :
                            </span>
                            <ul className="space-y-1.5">
                              {item.details.map((detail, dIdx) => (
                                <li key={dIdx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <ChevronRight className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                                  <span>{detail}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {item.link && (
                          <div className="pt-4 mt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                            <Link 
                              href={item.link}
                              className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group-hover:translate-x-1 duration-300"
                            >
                              <span>{item.linkText}</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Bottom FAQ & Quick Support Card */}
      <Card className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-slate-900/5 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
              <LifeBuoy className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Besoin d'aide supplémentaire ou d'assistance technique ?
              </h3>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 max-w-xl">
                Pour toute question sur la configuration des holdings, les licences SaaS ou l'intégration des équipements médicaux, contactez l'équipe support MedDoc.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="mailto:support@meddoc.health">
              <Button className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all">
                Contacter le Support
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
