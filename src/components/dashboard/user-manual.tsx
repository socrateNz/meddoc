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
import { useModules } from "@/components/modules-provider";
import type { ModuleKey } from "@/lib/modules";

interface ManualItem {
  title: string;
  // Rubrique propre à un module de la licence : masquée si le module est inactif.
  module?: ModuleKey;
  icon: React.ComponentType<{ className?: string }>;
  content: string;
  details: string[];
  link?: string;
  linkText?: string;
}

interface ManualSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badge: string;
  badgeColor: string;
  items: ManualItem[];
}

interface UserManualProps {
  userRole?: string;
  clinicId?: string;
}

export default function UserManual({ userRole = "ADMIN", clinicId }: UserManualProps) {
  // Contenu du manuel, par rôle. Une rubrique liée à un module de la licence (`module`) n'est
  // affichée que si ce module est actif pour l'établissement (cf. src/lib/modules.ts) ; la
  // numérotation est calculée à l'affichage, pour ne pas laisser de trous.
  const allRoleSections: ManualSection[] = [
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
          title: "Tableau de bord Système",
          icon: Activity,
          content: "Permet de surveiller la santé globale de la plateforme MedDoc en temps réel.",
          details: [
            "Statistiques sur le nombre total de Holdings et de cliniques rattachées.",
            "Volume total d'utilisateurs actifs (admins, coordinateurs, soignants).",
            "Nombre global de patients enregistrés à travers tous les établissements.",
            "Supervision de l'état des abonnements SaaS et des licences qui expirent dans les 30 jours."
          ],
          link: "/dashboard",
          linkText: "Accéder au Tableau de bord Système"
        },
        {
          title: "Gestion des Holdings & Cliniques",
          icon: Building2,
          content: "Supervision des groupes hospitaliers multi-tenants et création d'établissements.",
          details: [
            "Créer une nouvelle Holding avec son administrateur (mot de passe provisoire à changer à la première connexion).",
            "Rattacher de nouvelles cliniques à une Holding parente.",
            "Attribuer des quotas d'établissements (maxClinics) et d'utilisateurs (maxUsers).",
            "Réinitialiser le mot de passe de l'administrateur d'une Holding, la suspendre ou la réactiver."
          ],
          link: "/dashboard/holdings",
          linkText: "Gérer les Holdings & Licences"
        },
        {
          title: "Abonnements, Licences & Plans",
          icon: Wallet,
          content: "Administration des offres d'abonnement, des échéances de paiement et des limites de comptes.",
          details: [
            "Choisir le plan d'une Holding : TRIAL, BASIC, PREMIUM, ENTERPRISE. À la création, le plan coche les modules correspondants (voir « Modules de la licence »).",
            "Gérer les statuts d'abonnement : ACTIVE, INACTIVE, TRIALING, CANCELLED. Une licence inactive ou expirée coupe l'accès de toute la Holding.",
            "Définir et prolonger la date d'expiration de la licence, le montant, la fréquence et le mode de paiement (intégral ou en tranches).",
            "Télécharger le reçu de la Holding depuis le menu ⋯."
          ],
          link: "/dashboard/holdings",
          linkText: "Consulter la gestion des Licences"
        },
        {
          title: "Modules de la licence",
          icon: Layers,
          content: "Choisir les fonctionnalités incluses pour chaque Holding : elles s'appliquent à toutes ses cliniques.",
          details: [
            "Ouvrir le menu ⋯ d'une Holding > « Modules de la licence » et cocher les modules : Accueil, Urgences, Hospitalisation, Laboratoire, Imagerie, Bloc opératoire, Banque de sang, Pharmacie & stock, Maternité, IA, Contrats aidants, Interopérabilité.",
            "Les boutons Basique, Premium et Entreprise appliquent le préréglage du plan ; vous pouvez ensuite ajuster module par module.",
            "Les prérequis sont cochés d'office : les Urgences nécessitent l'Accueil.",
            "Le socle reste toujours inclus : patients et dossier médical, rendez-vous, ordonnances, caisse, finance, équipe, messagerie, journal d'audit.",
            "Retirer un module masque ses écrans sans effacer ses données ; elles réapparaissent à la réactivation.",
            "Le retrait est refusé tant qu'un séjour d'hospitalisation ou une transfusion est en cours ; pour le reste (interventions programmées, analyses non terminées…), un avertissement demande confirmation.",
            "Chaque changement est inscrit au journal d'audit. Vous êtes seul à pouvoir modifier les modules."
          ],
          link: "/dashboard/holdings",
          linkText: "Gérer les modules des Holdings"
        },
        {
          title: "Audit Système & Sécurité",
          icon: Lock,
          content: "Traçabilité complète des actions effectuées sur la plateforme.",
          details: [
            "Consultation des journaux d'audit (AuditLog) pour le respect des normes HDS/GDPR.",
            "Traçabilité des connexions, modifications de comptes et accès aux données de santé, y compris chaque ouverture d'un document médical.",
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
          title: "Créer, Suspendre & Superviser les Cliniques",
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
          title: "Désigner le Coordinateur de chaque Clinique",
          icon: Users,
          content: "Le coordinateur est le véritable administrateur opérationnel d'une clinique ; l'admin ne fait que le nommer ou le remplacer.",
          details: [
            "Affecter un coordinateur à une clinique du réseau.",
            "Remplacer ou désactiver un coordinateur existant.",
            "Le recrutement du reste de l'équipe (médecins, infirmier(e)s, pharmaciens, caissiers) revient ensuite au coordinateur."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/team` : "/dashboard/team",
          linkText: "Gérer les coordinateurs"
        },
        {
          title: "Consultation en lecture seule",
          icon: Wallet,
          content: "L'admin voit tout ce qui se passe dans ses cliniques, mais ne modifie jamais les données opérationnelles.",
          details: [
            "Consulter les patients, consultations, incidents et le calendrier de chaque clinique — rendez-vous, gardes et échéances (sans créer/modifier).",
            "Consulter la caisse, la finance et le journal de caisse, et l'exporter en PDF ou en Excel (sans encaisser ni enregistrer de dépense).",
            "Consulter les paramètres de chaque clinique (modifiables uniquement par son coordinateur)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/finance` : "/dashboard/finance",
          linkText: "Consulter la Finance"
        },
        {
          title: "Stock pharmacie en lecture seule",
          module: "PHARMACIE",
          icon: FileText,
          content: "Suivi du stock des pharmacies du réseau.",
          details: [
            "Consulter le stock, sa valorisation et l'historique des inventaires (sans enregistrer d'achat ni d'inventaire)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/pharmacie` : "/dashboard/pharmacie",
          linkText: "Consulter la Pharmacie"
        },
        {
          title: "Modules de votre licence",
          icon: Lock,
          content: "Les fonctionnalités incluses dans la licence de votre holding s'appliquent à toutes vos cliniques.",
          details: [
            "La liste de vos modules est visible dans la Configuration de chaque clinique, en lecture seule.",
            "Pour ajouter ou retirer un module, contactez l'équipe MedDoc : seul l'administrateur de la plateforme peut les modifier."
          ]
        }
      ]
    },
    {
      id: "COORDINATOR",
      title: "Coordinateur Médical",
      subtitle: "Administrateur opérationnel complet d'une clinique : personnel, patients, services et caisse",
      icon: Stethoscope,
      color: "from-violet-600 to-purple-600",
      badge: "Administration de Clinique",
      badgeColor: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
      items: [
        {
          title: "Gestion du Personnel de la Clinique",
          icon: Users,
          content: "Le coordinateur recrute et gère toute l'équipe de sa clinique.",
          details: [
            "Ajouter des Médecins (MEDECIN), des Infirmier(e)s (CAREGIVER), des Pharmaciens (PHARMACIST) et des Caissier(ère)s (CASHIER).",
            "Activer / Désactiver les accès du personnel de sa clinique.",
            "Planifier les gardes de chaque membre de l'équipe depuis le Calendrier (menu « + Nouveau » > Garde)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/team` : "/dashboard/team",
          linkText: "Gérer l'Équipe Médicale"
        },
        {
          title: "Admissions, Fiches Patients & Plans de Soins",
          icon: UserCheck,
          content: "Prise en charge administrative et médicale des nouveaux entrants.",
          details: [
            "Enregistrer les nouveaux patients avec état civil, pathologies et allergies connues. Chaque patient reçoit automatiquement un IPP (ex. IPP-2026-001248), repris sur tous les documents imprimés.",
            "L'e-mail du patient est facultatif : sans e-mail, le dossier est créé mais le patient n'a pas de compte de connexion.",
            "Définir le score de dépendance (1 à 5) pour l'allocation des ressources soignantes.",
            "Concevoir les plans de soins et suivre l'exécution des tâches par l'équipe soignante.",
            "Joindre des documents scannés au dossier (onglet Dossier médical) : PDF, JPEG ou PNG de 20 Mo maximum. Un document retiré est masqué mais conservé."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/patients` : "/dashboard/patients",
          linkText: "Consulter la liste des Patients"
        },
        {
          title: "Accueil & file d'attente",
          module: "ACCUEIL",
          icon: UserCheck,
          content: "Enregistrement des arrivées du jour et suivi de la file d'attente.",
          details: [
            "Enregistrer une arrivée : rechercher le patient (nom, IPP, téléphone) ou le créer sur place, choisir l'orientation, la priorité et éventuellement le médecin.",
            "Le patient reçoit un ticket du jour ; la file se classe par priorité puis par ordre d'arrivée, avec le temps d'attente.",
            "Appeler, prendre en charge, terminer ou annuler un passage depuis la file."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/accueil` : undefined,
          linkText: "Ouvrir l'Accueil"
        },
        {
          title: "Chambres, lits & séjours d'hospitalisation",
          module: "HOSPITALISATION",
          icon: Layers,
          content: "Organisation des services et facturation des nuitées.",
          details: [
            "Créer les services, chambres et lits ; fixer le tarif de la nuitée par service, et le remplacer au besoin pour une chambre (VIP, chambre commune).",
            "Affecter un lit à un patient ouvre son séjour ; un changement de lit poursuit le même séjour.",
            "Une nuitée est comptée à chaque minuit passé dans la clinique, avec un minimum d'une nuitée.",
            "À la sortie, le bulletin de sortie est obligatoire et les nuitées sont facturées. S'il reste un montant à payer, la sortie est bloquée ; vous seul pouvez la forcer, en indiquant un motif.",
            "Corriger la date d'admission d'un séjour en cas d'erreur de saisie."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/rooms` : undefined,
          linkText: "Gérer les Chambres & Lits"
        },
        {
          title: "Calendrier & Incidents",
          icon: Calendar,
          content: "Organisation du calendrier de la clinique et suivi des événements indésirables.",
          details: [
            "Planifier les rendez-vous, les gardes et les événements depuis le menu « + Nouveau » du Calendrier.",
            "Suivre les échéances (fins de contrats, péremptions) affichées sur le calendrier.",
            "Superviser les incidents déclarés et leur résolution."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/appointments` : "/dashboard/appointments",
          linkText: "Ouvrir le Calendrier"
        },
        {
          title: "Caisse, Finance & Journal",
          icon: Wallet,
          content: "Suivi financier de l'établissement.",
          details: [
            "Les actes facturés par les services (consultations, analyses, examens, interventions, séjours…) arrivent automatiquement en factures en attente à la caisse.",
            "Annuler un paiement déjà encaissé passe par une contrepassation : l'encaissement d'origine reste visible et une écriture inverse l'annule. Les deux sont exclus des indicateurs.",
            "Exporter le journal de caisse en PDF ou en Excel avec les filtres en cours (période, caisse, type, mode de paiement).",
            "Gérer les caisses, consulter les sessions et la synthèse financière."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/finance` : "/dashboard/finance",
          linkText: "Ouvrir la Finance"
        },
        {
          title: "Pharmacie & stock",
          module: "PHARMACIE",
          icon: FileText,
          content: "Catalogue, approvisionnement et inventaire de la pharmacie.",
          details: [
            "Gérer le catalogue pharmacie, les achats de stock, les fournisseurs et les bons de commande (réception partielle possible).",
            "Annuler un achat de stock : son paiement est contrepassé, jamais supprimé.",
            "Démarrer, saisir et clôturer un inventaire physique ; suivre les lots qui périment dans les 90 jours."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/pharmacie` : "/dashboard/pharmacie",
          linkText: "Ouvrir la Pharmacie"
        },
        {
          title: "Catalogue d'imagerie",
          module: "IMAGERIE",
          icon: FileText,
          content: "Les examens d'imagerie proposés par la clinique et leurs tarifs.",
          details: [
            "Ajouter, modifier ou désactiver un examen (radiographie, échographie, scanner, IRM, ECG, mammographie…) dans l'onglet « Catalogue des examens ».",
            "Un nouveau tarif ne change jamais un examen déjà prescrit : le tarif est figé à la prescription."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/imagerie?tab=catalogue` : undefined,
          linkText: "Ouvrir le catalogue d'imagerie"
        },
        {
          title: "Salles d'opération",
          module: "BLOC",
          icon: Layers,
          content: "Les salles dans lesquelles le bloc programme les interventions.",
          details: [
            "Créer les salles dans l'onglet « Salles » du Bloc opératoire.",
            "Désactiver une salle : elle n'est plus proposée à la programmation, ses interventions passées restent consultables."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/bloc?tab=salles` : undefined,
          linkText: "Gérer les salles"
        },
        {
          title: "Interopérabilité (HL7 / FHIR)",
          module: "INTEROPERABILITE",
          icon: Lock,
          content: "Connecter un automate de laboratoire ou un logiciel tiers.",
          details: [
            "Dans la Configuration de la clinique, créer une clé d'accès en choisissant ses droits : automate de laboratoire (HL7) et/ou lecture des dossiers (FHIR).",
            "La clé n'est affichée qu'une seule fois : copiez-la et transmettez-la au prestataire de façon sécurisée.",
            "Révoquer une clé coupe immédiatement l'accès du système externe.",
            "Les résultats envoyés par un automate restent à valider par un biologiste, comme une saisie manuelle. Tous les accès sont tracés dans le journal d'audit."
          ],
          ...(clinicId ? { link: `/dashboard/clinics/${clinicId}/settings`, linkText: "Ouvrir la Configuration" } : {})
        },
        {
          title: "Paramètres de la Clinique",
          icon: Layers,
          content: "Configuration propre à l'établissement.",
          details: [
            "Modifier le nom et le logo de la clinique (repris sur tous les documents PDF).",
            "Consulter la liste des modules de votre licence, en lecture seule : pour en ajouter, contactez l'équipe MedDoc."
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
          title: "Remise des médicaments",
          module: "PHARMACIE",
          icon: CheckCircle2,
          content: "Remettre au patient les médicaments réglés à la caisse.",
          details: [
            "Retrouver dans la file de remise les ordonnances et ventes réglées, grâce au code de retrait du ticket.",
            "Remettre tout ou partie des produits ; le stock est décompté lot par lot (le plus proche de la péremption d'abord).",
            "Consulter l'historique des remises."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/pharmacie` : "/dashboard/pharmacie",
          linkText: "Ouvrir la Pharmacie"
        },
        {
          title: "Catalogue Pharmacie & Lots",
          module: "PHARMACIE",
          icon: Layers,
          content: "Gestion des médicaments, de leurs lots et de leurs dates de péremption.",
          details: [
            "Ajouter/modifier des médicaments (dosage, prix, fournisseur, numéro de lot, péremption).",
            "Suivre les alertes de rupture, stock faible ou péremption proche."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/pharmacie` : "/dashboard/pharmacie",
          linkText: "Accéder à la Pharmacie"
        },
        {
          title: "Stock, Fournisseurs & Inventaire",
          module: "PHARMACIE",
          icon: FileText,
          content: "Traçabilité complète des entrées et sorties de stock.",
          details: [
            "Enregistrer les achats de pharmacie (fournisseur, prix, quantité) ; passer et réceptionner des bons de commande.",
            "Démarrer, saisir et clôturer un inventaire physique du stock."
          ]
        },
        {
          title: "Caisse & Ventes",
          icon: Wallet,
          content: "Encaissement des ventes et gestion de la caisse.",
          details: [
            "Enregistrer une vente ou une facture regroupée pour un patient.",
            "Enregistrer une dépense / un retrait de caisse.",
            "Imprimer les reçus et factures.",
            "Encaisser même sans réseau : la vente est synchronisée au retour de la connexion."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/caisse` : "/dashboard/caisse",
          linkText: "Ouvrir la Caisse"
        },
        {
          title: "Accueil & file d'attente",
          module: "ACCUEIL",
          icon: UserCheck,
          content: "Suivre la file d'attente du jour.",
          details: [
            "Consulter les patients en attente, leur ticket, leur orientation et leur temps d'attente.",
            "L'enregistrement des arrivées est fait par l'accueil (caisse, soignants, coordinateur)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/accueil` : undefined,
          linkText: "Ouvrir l'Accueil"
        },
        {
          title: "Calendrier & Échéances",
          icon: Calendar,
          content: "Vos gardes, vos événements et les dates à anticiper.",
          details: [
            "Consulter vos gardes planifiées et créer vos propres événements (vous seul les voyez).",
            "Repérer sur le calendrier les lots de stock qui expirent dans les 90 jours, lot par lot.",
            "Sur téléphone, le calendrier s'ouvre en vue Planning ; vous pouvez passer en vue Jour, Semaine ou Mois."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/appointments` : "/dashboard/appointments",
          linkText: "Ouvrir le Calendrier"
        }
      ]
    },
    {
      id: "CASHIER",
      title: "Caissier(ère)",
      subtitle: "Ouverture et clôture de caisse, encaissement des ventes et des factures — avec mode hors-ligne",
      icon: Wallet,
      color: "from-teal-600 to-emerald-600",
      badge: "Caisse",
      badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      items: [
        {
          title: "Ouverture & Clôture de caisse",
          icon: Wallet,
          content: "Chaque encaissement se rattache à une session de caisse ouverte.",
          details: [
            "Ouvrir la session de caisse avant d'encaisser la première vente du service.",
            "Clôturer la session en fin de service après avoir compté la caisse.",
            "Enregistrer une dépense ou un retrait de caisse, rattaché à la session en cours."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/caisse` : "/dashboard/caisse",
          linkText: "Ouvrir la Caisse"
        },
        {
          title: "Ventes & Encaissements",
          icon: FileText,
          content: "Encaisser les ventes comptant et les factures en attente.",
          details: [
            "Les actes prescrits dans la clinique (consultations, analyses, examens, interventions, séjours…) arrivent automatiquement en factures en attente.",
            "Créer une vente au panier : patient inscrit ou client de passage (nom facultatif).",
            "Régler une facture en attente, en totalité ou en partie : le reste dû reste enregistré.",
            "Imprimer le ticket ou la facture après chaque encaissement.",
            "Un paiement encaissé par erreur ne se supprime pas : le coordinateur l'annule par une contrepassation."
          ]
        },
        {
          title: "Vente de médicaments",
          module: "PHARMACIE",
          icon: CheckCircle2,
          content: "Les produits de la pharmacie se vendent aussi à la caisse.",
          details: [
            "Ajouter des produits de la pharmacie au panier d'une vente.",
            "La remise des médicaments reste assurée par le pharmacien, qui utilise le code de retrait du ticket."
          ]
        },
        {
          title: "Accueil & file d'attente",
          module: "ACCUEIL",
          icon: UserCheck,
          content: "Enregistrer les arrivées au guichet.",
          details: [
            "Rechercher le patient (nom, IPP, téléphone) ou le créer sur place, choisir l'orientation et la priorité : il reçoit un ticket du jour.",
            "Suivre la file d'attente, appeler le patient suivant, annuler un passage."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/accueil` : undefined,
          linkText: "Ouvrir l'Accueil"
        },
        {
          title: "Mode hors-ligne",
          icon: Activity,
          content: "En cas de coupure réseau, vous pouvez continuer à encaisser.",
          details: [
            "Une vente ou un paiement enregistré sans réseau est mis en file d'attente et envoyé dès le retour de la connexion.",
            "Le ticket imprimable d'une vente hors-ligne n'est disponible qu'après synchronisation : prévenez le patient.",
            "Un paiement ou une vente refusé au moment de la synchronisation (session refermée, stock changé) reste visible dans le bandeau d'alerte, avec un bouton pour l'écarter."
          ]
        },
        {
          title: "Calendrier & Gardes",
          icon: Calendar,
          content: "Votre planning personnel et vos rappels, au même endroit que le reste de l'équipe.",
          details: [
            "Consulter vos gardes planifiées par le coordinateur.",
            "Créer vos propres événements personnels : seuls vous les voyez.",
            "Sur téléphone, le calendrier s'ouvre en vue Planning ; vous pouvez passer en vue Jour, Semaine ou Mois."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/appointments` : "/dashboard/appointments",
          linkText: "Ouvrir le Calendrier"
        }
      ]
    },
    {
      id: "MEDECIN",
      title: "Médecin",
      subtitle: "Consultations, diagnostic, prescriptions, examens et suivi des patients",
      icon: Stethoscope,
      color: "from-blue-600 to-cyan-600",
      badge: "Autorité Clinique",
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      items: [
        {
          title: "Tableau de bord Médecin",
          icon: Calendar,
          content: "Vue centralisée de l'activité clinique du jour.",
          details: [
            "Consulter ses consultations du jour et son calendrier : ses rendez-vous, les rendez-vous non affectés à personne et ses gardes.",
            "Retrouver la liste de ses patients et ses notes cliniques récentes."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/medecin` : undefined,
          linkText: "Ouvrir mon tableau de bord"
        },
        {
          title: "Urgences & tri",
          module: "URGENCES",
          icon: AlertCircle,
          content: "Le tableau des patients orientés « Urgences » à l'accueil.",
          details: [
            "Les patients non triés apparaissent en tête, puis par niveau de tri et ordre d'arrivée ; le tableau se met à jour toutes les 20 secondes.",
            "Trier un patient sur l'échelle CIMU à 5 niveaux (du niveau 1, détresse vitale, au niveau 5, non urgent) avec le motif de recours et les constantes. Le niveau est toujours votre décision.",
            "Chaque niveau a un délai cible ; un badge signale le dépassement. Un patient trié en niveau 1 ou 2 passe en priorité urgente dans la file de l'accueil.",
            "Retrier un patient qui s'aggrave, le prendre en charge, puis terminer son passage."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/urgences` : undefined,
          linkText: "Ouvrir les Urgences"
        },
        {
          title: "Ronde médicale",
          module: "HOSPITALISATION",
          icon: Stethoscope,
          content: "La visite quotidienne de l'équipe au chevet des patients hospitalisés, service par service.",
          details: [
            "Ouvrir la ronde du jour d'un service : chaque patient hospitalisé est listé dans l'ordre des chambres, avec ses dernières constantes, ses tâches de soins en attente, ses analyses en cours et ses incidents ouverts.",
            "Choisir les présents avant de démarrer la ronde (ou les modifier ensuite, puis les enregistrer). Basculer entre la liste et la grille (lits par chambre) pour repérer les patients d'un coup d'œil.",
            "Pour chaque patient, cliquer sur « Visiter » (ou sur son lit dans la grille) : une fenêtre s'ouvre avec ses constantes, puis vous enregistrez les constats, la décision (poursuivre, adapter, examens, sortie envisagée, transfert) et la conduite à tenir.",
            "Passer un patient non vu en précisant le motif. Clôturer la ronde à la fin de la visite : les patients non vus restent signalés dans le résumé."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/ronde` : undefined,
          linkText: "Ouvrir la ronde du jour"
        },
        {
          title: "Consultations & Diagnostic",
          icon: FileText,
          content: "Clôture structurée d'une consultation avec codification du diagnostic.",
          details: [
            "Rédiger symptômes, diagnostic et plan de traitement.",
            "Coder le diagnostic au format CIM-10 (recherche assistée)."
          ]
        },
        {
          title: "Ordonnances",
          icon: CheckCircle2,
          content: "Autorité exclusive de prescription des médicaments.",
          details: [
            "Rédiger une ordonnance structurée (médicament, dosage, fréquence, durée), avec contrôle des interactions médicamenteuses.",
            "Renouveler une ordonnance ou partir d'un modèle ; imprimer l'ordonnance en PDF."
          ]
        },
        {
          title: "Envoi des ordonnances à la pharmacie",
          module: "PHARMACIE",
          icon: CheckCircle2,
          content: "Faire délivrer les médicaments par la pharmacie de la clinique.",
          details: [
            "Envoyer une ordonnance à la pharmacie : les médicaments sont facturés à la caisse puis remis par le pharmacien."
          ]
        },
        {
          title: "Examens de laboratoire",
          module: "LABORATOIRE",
          icon: FileText,
          content: "Prescrire, suivre et valider les analyses.",
          details: [
            "Prescrire un examen depuis la consultation ou le dossier patient (facturé à la caisse dès la prescription) et suivre son cycle jusqu'à la validation.",
            "Valider les résultats de vos patients : un résultat validé est verrouillé. Les valeurs critiques déclenchent une alerte.",
            "Votre tableau de bord affiche vos résultats récents et ceux en attente.",
            "Sans réseau, vous pouvez aussi demander un examen : les tarifs affichés sont alors estimatifs."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/lab` : "/dashboard/lab",
          linkText: "Ouvrir le Laboratoire"
        },
        {
          title: "Imagerie médicale",
          module: "IMAGERIE",
          icon: FileText,
          content: "Prescription et compte-rendu des examens d'imagerie.",
          details: [
            "Prescrire depuis l'onglet Imagerie du dossier patient, en choisissant dans le catalogue de la clinique : la facture part à la caisse dès la prescription.",
            "Une fois l'examen réalisé et les clichés déposés, rédiger le compte-rendu et la conclusion, puis le valider. Le compte-rendu se télécharge en PDF.",
            "Annuler un examen non réalisé et non payé ; s'il a déjà été réglé, l'annulation passe d'abord par la caisse."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/imagerie` : undefined,
          linkText: "Ouvrir l'Imagerie"
        },
        {
          title: "Bloc opératoire",
          module: "BLOC",
          icon: Stethoscope,
          content: "Programmation des interventions et compte-rendu opératoire.",
          details: [
            "Programmer une intervention : patient, salle, date, heure, durée, chirurgien, anesthésiste, infirmier(e) de bloc et forfait (facturé à la caisse dès la programmation). Un créneau qui chevauche la même salle ou la même personne est refusé.",
            "La check-list de sécurité se signe en 3 temps : avant l'induction, avant l'incision, avant la sortie de salle. L'intervention ne peut commencer qu'après les deux premiers temps, et se terminer qu'après le troisième.",
            "Le compte-rendu opératoire et les consignes post-opératoires sont rédigés par le chirurgien de l'intervention pour la clore ; il peut ensuite le corriger. Le compte-rendu se télécharge en PDF.",
            "Déplacer ou annuler une intervention tant qu'elle n'a pas commencé (une intervention déjà réglée s'annule d'abord à la caisse)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/bloc` : undefined,
          linkText: "Ouvrir le Bloc opératoire"
        },
        {
          title: "Transfusions",
          module: "BANQUE_SANG",
          icon: HeartPulse,
          content: "Réserver une poche de sang pour un patient.",
          details: [
            "Dans la Banque de sang, « Réserver une poche » : saisir le groupe sanguin confirmé du patient, le résultat de la RAI et, pour les globules rouges, du cross-match.",
            "Seules les poches compatibles et non périmées sont proposées. Un groupe différent de celui du dossier bloque la réservation : refaites le groupage.",
            "Annuler une réservation remet la poche en stock."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/banque-sang?tab=transfusions` : undefined,
          linkText: "Ouvrir la Banque de sang"
        },
        {
          title: "Sortie d'hospitalisation",
          module: "HOSPITALISATION",
          icon: UserCheck,
          content: "Clore le séjour d'un patient hospitalisé.",
          details: [
            "La sortie se fait en clôturant le plan de soins, avec un bulletin de sortie obligatoire, imprimable en PDF.",
            "Les nuitées sont facturées à la sortie. S'il reste un montant à payer, la sortie est bloquée : seul le coordinateur peut la forcer, avec un motif."
          ]
        },
        {
          title: "Documents du dossier",
          icon: FileText,
          content: "Pièces scannées jointes au dossier patient.",
          details: [
            "Joindre un document (PDF, JPEG ou PNG, 20 Mo maximum) depuis l'onglet Dossier médical.",
            "Chaque ouverture d'un document est tracée dans le journal d'audit ; un document retiré est masqué mais conservé."
          ]
        },
        {
          title: "Assistant Clinique IA",
          module: "IA",
          icon: Sparkles,
          content: "Support à la décision clinique et analyse intelligente des synthèses.",
          details: [
            "Poser des questions médicales complexes sur les protocoles ou interactions médicamenteuses.",
            "Générer une analyse IA du dossier d'un patient (onglet Analyse IA) ou des résultats d'une demande de laboratoire.",
            "Dicter les notes de consultation à la voix (transcription IA, relecture obligatoire avant validation)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/ai-assistant` : "/dashboard/ai-assistant",
          linkText: "Lancer l'Assistant IA"
        },
        {
          title: "Mode hors-ligne",
          icon: Activity,
          content: "Pendant une coupure réseau, les actions de soins les plus courantes restent disponibles.",
          details: [
            "Saisir des constantes vitales : elles sont envoyées au retour de la connexion.",
            "Un bandeau d'alerte signale toute action qui n'a pas pu être synchronisée ; vous pouvez l'écarter après vérification.",
            "La prescription de médicaments et la validation de résultats exigent la connexion."
          ]
        },
        {
          title: "Messagerie d'équipe",
          icon: LifeBuoy,
          content: "Échanges avec les collègues dans les canaux et les conversations privées.",
          details: [
            "Partager le dossier d'un patient dans une conversation.",
            "Les pièces jointes (fichiers, images) ne sont pas acceptées : passez par le dossier patient."
          ]
        }
      ]
    },
    {
      id: "CAREGIVER",
      title: "Infirmier(e)",
      subtitle: "Prise des constantes vitales, exécution des soins & gestes techniques",
      icon: HeartPulse,
      color: "from-rose-600 to-pink-600",
      badge: "Soins Terrain",
      badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      items: [
        {
          title: "Relevé des Constantes Vitales",
          icon: Activity,
          content: "Enregistrement rapide des données physiologiques au chevet du patient.",
          details: [
            "Saisir la Pression Artérielle (Systolique / Diastolique en mmHg).",
            "Saisir le Pouls (BPM), la Saturation en Oxygène (SpO2 en %), la Température (°C) et la Glycémie (g/L).",
            "Visualisation immédiate des indicateurs colorés d'alerte en cas de constante anormale.",
            "Fonctionne sans réseau : la saisie est envoyée dès le retour de la connexion."
          ]
        },
        {
          title: "Exécution des Tâches de Soins",
          icon: CheckCircle2,
          content: "Validation au fil de la journée des actes de soins attribués.",
          details: [
            "Consulter la feuille de soins quotidienne attribuée par le coordinateur.",
            "Cocher les tâches effectuées avec horodatage automatique.",
            "Ajouter des observations textuelles pour la relève d'équipe.",
            "Retrouver vos tâches à venir dans le Calendrier : les vôtres et celles qui ne sont affectées à personne.",
            "Cocher une tâche fonctionne aussi hors-ligne ; elle sera synchronisée au retour de la connexion."
          ]
        },
        {
          title: "Accueil & file d'attente",
          module: "ACCUEIL",
          icon: UserCheck,
          content: "Enregistrer une arrivée et suivre la file du jour.",
          details: [
            "Rechercher le patient (nom, IPP, téléphone) ou le créer, choisir l'orientation et la priorité : il reçoit un ticket du jour.",
            "Appeler un patient, puis prendre en charge et terminer les passages orientés vers votre service."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/accueil` : undefined,
          linkText: "Ouvrir l'Accueil"
        },
        {
          title: "Tri des urgences",
          module: "URGENCES",
          icon: AlertCircle,
          content: "Trier les patients orientés « Urgences » dès leur arrivée.",
          details: [
            "Les patients à trier clignotent en tête du tableau des urgences.",
            "Choisir le niveau CIMU (1 à 5), saisir le motif de recours et les constantes (TA, FC, FR, SpO2, T°, glycémie, douleur, Glasgow) : elles s'ajoutent au dossier du patient.",
            "Surveiller les délais cibles : un badge signale tout dépassement. Retrier un patient qui s'aggrave."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/urgences` : undefined,
          linkText: "Ouvrir les Urgences"
        },
        {
          title: "Ronde médicale",
          module: "HOSPITALISATION",
          icon: Stethoscope,
          content: "Participer à la visite quotidienne de l'équipe au chevet des patients hospitalisés.",
          details: [
            "Retrouver la ronde du jour de votre service : les patients hospitalisés, dans l'ordre des chambres, avec leurs dernières constantes et leurs soins en attente.",
            "Vous signaler comme présent à la ronde, pour que l'équipe sache qui a participé.",
            "Noter vos constats sur chaque patient (état, douleur, tolérance) : cliquez sur « Voir » ou « Visiter » dans la liste (ou sur le lit dans la grille) pour ouvrir la fenêtre de visite. Le médecin lit ces constats avant de décider.",
            "Un patient admis pendant la ronde y est ajouté automatiquement ; un patient qui ne peut pas être vu se passe avec un motif."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/ronde` : undefined,
          linkText: "Ouvrir la ronde du jour"
        },
        {
          title: "Prélèvements de Laboratoire",
          module: "LABORATOIRE",
          icon: FileText,
          content: "Gestes techniques d'exécution sur prescription du médecin.",
          details: [
            "Enregistrer un prélèvement d'échantillon (type, quantité, état) sur une demande prescrite.",
            "Imprimer les étiquettes des tubes : leur code-barres porte la référence de la demande (LAB-…).",
            "Marquer la réception au laboratoire et saisir un résultat brut."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/lab` : "/dashboard/lab",
          linkText: "Ouvrir le Laboratoire"
        },
        {
          title: "Réalisation des examens d'imagerie",
          module: "IMAGERIE",
          icon: FileText,
          content: "Réaliser l'examen prescrit et déposer les clichés.",
          details: [
            "Marquer l'examen réalisé, avec vos observations.",
            "Déposer les clichés (JPEG, PNG ou PDF, 20 Mo maximum) sur la fiche de l'examen, tant que le compte-rendu n'est pas validé. Le médecin rédige ensuite le compte-rendu."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/imagerie` : undefined,
          linkText: "Ouvrir l'Imagerie"
        },
        {
          title: "Check-list au bloc opératoire",
          module: "BLOC",
          icon: CheckCircle2,
          content: "Signer les étapes de sécurité de chaque intervention.",
          details: [
            "Signer, dans l'ordre, les étapes « avant l'induction », « avant l'incision » et « avant la sortie de salle ».",
            "Chaque point doit être confirmé (« Oui ») ou, quand c'est prévu, déclaré « N/A ». Si un point ne peut pas être confirmé, ne signez pas : réglez d'abord le problème."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/bloc` : undefined,
          linkText: "Ouvrir le Bloc opératoire"
        },
        {
          title: "Banque de sang & transfusions",
          module: "BANQUE_SANG",
          icon: HeartPulse,
          content: "Gérer les poches et poser les transfusions en toute sécurité.",
          details: [
            "Réceptionner une poche : numéro, produit, groupe, rhésus, date de péremption. Le stock signale les poches périmées et celles qui périment dans les 3 jours ; détruire une poche inutilisable avec son motif.",
            "Avant la pose, le contrôle ultime au lit est obligatoire : identité du patient, concordance de la poche, péremption, carte de contrôle ABO (globules rouges) et constantes de départ.",
            "En fin de transfusion, saisir les constantes de fin et l'éventuel effet indésirable : il est déclaré automatiquement comme incident d'hémovigilance."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/banque-sang` : undefined,
          linkText: "Ouvrir la Banque de sang"
        },
        {
          title: "Signalement d'Incidents Instantané",
          icon: AlertCircle,
          content: "Transmission immédiate des urgences ou événements indésirables.",
          details: [
            "Déclarer un incident en quelques clics avec description et niveau de gravité.",
            "Alerter le coordinateur et le médecin d'astreinte en temps réel."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/incidents` : "/dashboard/incidents",
          linkText: "Déclarer un incident"
        },
        {
          title: "Documents du dossier",
          icon: FileText,
          content: "Pièces scannées jointes au dossier patient.",
          details: [
            "Joindre un document (PDF, JPEG ou PNG, 20 Mo maximum) depuis l'onglet Dossier médical : ordonnance externe, compte-rendu, pièce administrative…",
            "Vous pouvez retirer un document que vous avez déposé : il est masqué mais conservé."
          ]
        },
        {
          title: "Calendrier, Gardes & Rappels",
          icon: Calendar,
          content: "Votre planning et les rappels qui vous évitent d'oublier une intervention.",
          details: [
            "Consulter vos gardes et vos rendez-vous. Les rendez-vous qui n'ont pas encore de soignant apparaissent aussi : vous pouvez vous les attribuer.",
            "Créer vos propres événements personnels : vous seul les voyez.",
            "Recevoir un rappel 24 h, 2 h et 1 h avant chacun de vos rendez-vous, ainsi que votre agenda du jour.",
            "Ces rappels s'affichent sur l'appareil si vous avez autorisé les notifications (Paramètres > Notifications)."
          ],
          link: clinicId ? `/dashboard/clinics/${clinicId}/appointments` : "/dashboard/appointments",
          linkText: "Ouvrir le Calendrier"
        },
        {
          title: "Messagerie d'équipe",
          icon: LifeBuoy,
          content: "Échanges avec les collègues dans les canaux et les conversations privées.",
          details: [
            "Partager le dossier d'un patient dans une conversation.",
            "Les pièces jointes (fichiers, images) ne sont pas acceptées : passez par le dossier patient."
          ]
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
          title: "Suivi de Santé & Journal de Soins",
          icon: HeartPulse,
          content: "Transparence et réassurance pour le patient et ses proches autorisés.",
          details: [
            "Consulter le résumé du dossier médical et le niveau de dépendance.",
            "Suivre l'évolution des constantes vitales et la prise en charge au quotidien.",
            "Consulter l'historique des rendez-vous et ordonnances.",
            "Si vous avez un compte patient : recevoir un rappel 24 h, 2 h et 1 h avant chacun de vos rendez-vous, sur l'appareil si vous avez autorisé les notifications."
          ]
        },
        {
          title: "Messagerie Sécurisée",
          icon: LifeBuoy,
          content: "Communication bienveillante avec l'équipe de coordination.",
          details: [
            "Envoyer des messages à la clinique pour toute question administrative ou d'organisation.",
            "Recevoir les notifications importantes concernant la santé du proche.",
            "La messagerie n'accepte pas de pièces jointes (fichiers, images)."
          ]
        }
      ]
    }
  ];


  // Role hierarchy filtering: Users can view their own role tab and all role tabs below them in hierarchy
  const roleHierarchy: Record<string, string[]> = {
    SUPER_ADMIN: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER", "FAMILY"],
    ADMIN: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER", "FAMILY"],
    COORDINATOR: ["COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER", "FAMILY"],
    MEDECIN: ["MEDECIN", "FAMILY"],
    CAREGIVER: ["CAREGIVER", "FAMILY"],
    PHARMACIST: ["PHARMACIST", "FAMILY"],
    CASHIER: ["CASHIER", "FAMILY"],
    FAMILY: ["FAMILY"],
    PATIENT: ["FAMILY"]
  };

  const enabledModules = useModules();
  const visibleRoleSections = useMemo(() => {
    const allowedIds = roleHierarchy[userRole] || roleHierarchy["ADMIN"];
    return allRoleSections
      .filter((sec) => allowedIds.includes(sec.id))
      .map((sec) => ({ ...sec, items: sec.items.filter((item) => !item.module || enabledModules.includes(item.module)) }))
      .filter((sec) => sec.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allRoleSections est recréé à chaque rendu mais ne dépend que de clinicId
  }, [userRole, enabledModules, clinicId]);

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
              Manuel d&apos;Utilisation adapté à votre rôle
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
              Résultats de recherche pour &quot;{searchQuery}&quot; ({filteredSections.reduce((acc, s) => acc + s.items.length, 0)} éléments)
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
                                {index + 1}. {item.title}
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
                Besoin d&apos;aide supplémentaire ou d&apos;assistance technique ?
              </h3>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 max-w-xl">
                Pour toute question sur la configuration des holdings, les licences SaaS ou l&apos;intégration des équipements médicaux, contactez l&apos;équipe support MedDoc.
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
