"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  ArrowRight,
  Activity,
  Shield,
  Users,
  Clock,
  CheckCircle2,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  Heart,
  Calendar,
  Sparkles,
  Brain,
  FileText,
  AlertTriangle,
  Lock,
  Menu,
  X,
  Star,
  Zap,
  TrendingUp,
  MessageSquare,
} from "lucide-react";

/* ─── Animated Counter ──────────────────────────────────────────────────────── */
function Counter({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
}

/* ─── Floating card decorations for hero ────────────────────────────────────── */
function HeroCard({
  icon: Icon,
  title,
  sub,
  className,
  style,
}: {
  icon: React.ElementType;
  title: string;
  sub: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`absolute glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl ${className}`} style={style}>
      <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-800 leading-none">{title}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

/* ─── Service Card ───────────────────────────────────────────────────────────── */
function ServiceCard({
  icon: Icon,
  color,
  title,
  desc,
  delay,
}: {
  icon: React.ElementType;
  color: string;
  title: string;
  desc: string;
  delay: string;
}) {
  return (
    <div
      className="group flex flex-col gap-4 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 animate-fade-up"
      style={{ animationDelay: delay }}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg mb-1.5">{title}</h3>
        <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Testimonial Card ───────────────────────────────────────────────────────── */
function TestimonialCard({ quote, name, role, stars }: { quote: string; name: string; role: string; stars: number }) {
  return (
    <div className="flex flex-col gap-4 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300">
      <div className="flex gap-1">
        {Array.from({ length: stars }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-slate-600 text-sm leading-relaxed italic">&ldquo;{quote}&rdquo;</p>
      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
          {name[0]}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{name}</p>
          <p className="text-xs text-slate-500">{role}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<{ type: "success" | "error" | null; msg: string }>({ type: null, msg: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, msg: "" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", msg: data.message });
        setFormData({ name: "", email: "", subject: "", message: "" });
      } else {
        setStatus({ type: "error", msg: data.error || "Une erreur est survenue." });
      }
    } catch {
      setStatus({ type: "error", msg: "Impossible de contacter le serveur." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqs = [
    {
      q: "Comment puis-je inscrire un proche sur MedDoc ?",
      a: "L'inscription se fait exclusivement via nos coordinateurs médicaux lors d'une évaluation à domicile. Cela garantit une modélisation précise du plan de soins personnalisé.",
    },
    {
      q: "Qui a accès aux données de santé du patient ?",
      a: "Seuls les soignants officiellement assignés au patient, le coordinateur médical responsable, et les membres de la famille autorisés par contrat disposent d'un accès sécurisé.",
    },
    {
      q: "Comment fonctionne l'intelligence artificielle clinique ?",
      a: "Notre IA basée sur une architecture RAG analyse les rapports de visite, les antécédents et les traitements pour détecter des facteurs de risque (chute, déshydratation, observance) et générer des résumés cliniques.",
    },
    {
      q: "Les documents médicaux sont-ils stockés de manière sécurisée ?",
      a: "Oui. Tous les documents sont hébergés sur une infrastructure conforme HDS (Hébergeur de Données de Santé) avec chiffrement de bout en bout et accès strictement contrôlé par rôles (RBAC).",
    },
    {
      q: "Quel est le délai de mise en place d'une prise en charge ?",
      a: "Après validation de l'évaluation initiale, un plan de soins est opérationnel sous 48 à 72 heures avec affectation des soignants qualifiés correspondant aux pathologies du patient.",
    },
  ];

  const services = [
    {
      icon: FileText,
      color: "bg-blue-100 text-blue-600",
      title: "Dossier Patient Digitalisé",
      desc: "Centralisation sécurisée des pathologies, allergies, traitements et historiques médicaux dans un espace unique accessible aux équipes soignantes.",
    },
    {
      icon: Brain,
      color: "bg-violet-100 text-violet-600",
      title: "Assistant IA Clinique",
      desc: "Analyse préventive par IA Gemini des dossiers patients pour identifier les risques physiologiques et générer des résumés cliniques actionnables.",
    },
    {
      icon: Users,
      color: "bg-emerald-100 text-emerald-600",
      title: "Coordination d'Équipe",
      desc: "Messagerie temps réel, assignation de tâches de soins et suivi en direct de l'activité terrain entre soignants et coordinateurs.",
    },
    {
      icon: Calendar,
      color: "bg-amber-100 text-amber-600",
      title: "Gestion des Rendez-vous",
      desc: "Planification intelligente des interventions à domicile avec rappels automatiques, gestion des créneaux et synchronisation des équipes.",
    },
    {
      icon: AlertTriangle,
      color: "bg-red-100 text-red-600",
      title: "Gestion des Incidents",
      desc: "Signalement immédiat, priorisation et escalade automatique des incidents vers les coordinateurs avec traçabilité complète.",
    },
    {
      icon: Shield,
      color: "bg-indigo-100 text-indigo-600",
      title: "Sécurité RGPD & HDS",
      desc: "Hébergement agréé données de santé, droits d'accès RBAC granulaires, journaux d'audit et conformité totale RGPD.",
    },
  ];

  const testimonials = [
    {
      quote: "MedDoc a transformé la façon dont nous coordonnons les soins. Les alertes IA nous ont permis d'éviter plusieurs hospitalisations d'urgence.",
      name: "Dr. Sophie M.",
      role: "Coordinatrice Médicale — Paris 16e",
      stars: 5,
    },
    {
      quote: "En tant que soignant, j'ai accès à tout le dossier de mon patient en quelques secondes. Les plans de soins sont clairs et les tâches bien définies.",
      name: "Karim B.",
      role: "Infirmier à Domicile",
      stars: 5,
    },
    {
      quote: "Je peux suivre les visites de maman en temps réel depuis l'application. Cette transparence nous rassuré énormément au quotidien.",
      name: "Isabelle T.",
      role: "Famille de patient",
      stars: 5,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ─── Navbar ──────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "glass shadow-sm py-3" : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">Med<span className="text-blue-600">Doc</span></span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {[
              { label: "Services", href: "#services" },
              { label: "Pourquoi nous", href: "#why" },
              { label: "Processus", href: "#process" },
              { label: "Témoignages", href: "#testimonials" },
              { label: "FAQ", href: "#faq" },
              { label: "Contact", href: "#contact" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Connexion
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all duration-200"
            >
              Accéder au portail <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              className="md:hidden p-2 text-slate-600 hover:text-blue-600 transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden glass border-t mt-2 mx-4 rounded-2xl p-5 flex flex-col gap-4">
            {["#services", "#why", "#process", "#faq", "#contact"].map((href) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors capitalize"
              >
                {href.replace("#", "")}
              </a>
            ))}
            <Link href="/login" className="mt-2 w-full text-center bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl" onClick={() => setMenuOpen(false)}>
              Accéder au portail
            </Link>
          </div>
        )}
      </header>

      <main className="flex-1">

        {/* ─── Hero Section ──────────────────────────────────────────────── */}
        <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950">
          {/* Animated background blobs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-float pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />

          {/* Spinning ring accent */}
          <div className="absolute top-16 right-16 h-24 w-24 rounded-full border border-blue-500/20 animate-spin-slow opacity-50 pointer-events-none" />
          <div className="absolute bottom-24 left-12 h-16 w-16 rounded-full border border-indigo-500/20 animate-spin-slow opacity-40 pointer-events-none" style={{ animationDirection: "reverse" }} />

          <div className="container mx-auto px-6 pt-28 pb-16 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left: Text */}
              <div className="space-y-8">
                <div className="animate-fade-up inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" />
                  Plateforme Médicale IA · Agréée HDS
                </div>

                <h1 className="animate-fade-up-d1 text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight">
                  La coordination de{" "}
                  <span className="text-gradient">soins à domicile</span>{" "}
                  réinventée
                </h1>

                <p className="animate-fade-up-d2 text-slate-400 text-lg leading-relaxed max-w-xl">
                  MedDoc connecte patients, familles et professionnels de santé sur une plateforme clinique de classe entreprise, augmentée par l&apos;intelligence artificielle Gemini.
                </p>

                <div className="animate-fade-up-d3 flex flex-col sm:flex-row gap-4">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold px-8 py-4 rounded-xl text-base shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transition-all duration-200"
                  >
                    Accéder au portail <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#contact"
                    className="inline-flex items-center justify-center gap-2 border border-white/10 text-white font-semibold px-8 py-4 rounded-xl text-base hover:bg-white/5 transition-all duration-200"
                  >
                    <Phone className="h-4 w-4" /> Prendre rendez-vous
                  </a>
                </div>

                {/* Trust badges */}
                <div className="animate-fade-up-d3 flex flex-wrap gap-6 pt-4">
                  {[
                    { icon: Shield, label: "Agréé HDS" },
                    { icon: Lock, label: "RGPD Conforme" },
                    { icon: Zap, label: "IA Gemini" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                      <Icon className="h-4 w-4 text-blue-400" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Floating UI mockup */}
              <div className="relative hidden lg:block h-[540px]">
                {/* Main card */}
                <div className="glass-dark rounded-3xl p-6 shadow-2xl shadow-blue-900/50 border border-white/5 animate-float">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                    <div className="h-3 w-3 rounded-full bg-emerald-400" />
                    <span className="text-white/30 text-xs ml-2 font-mono">MedDoc · Tableau de bord</span>
                  </div>

                  {/* Mock stat cards */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: "Patients actifs", val: "24", color: "text-blue-400" },
                      { label: "Incidents ouverts", val: "3", color: "text-red-400" },
                      { label: "Plans de soins", val: "18", color: "text-emerald-400" },
                      { label: "RDV planifiés", val: "12", color: "text-amber-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                        <p className="text-white/40 text-[10px] mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Mock AI analysis */}
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-violet-400" />
                      <span className="text-violet-300 text-xs font-semibold">Analyse IA — Mr. Dupont</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/50 text-xs">Score de risque</span>
                      <span className="text-amber-400 text-xs font-bold">67%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-[67%] bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" />
                    </div>
                    <p className="text-white/40 text-[10px] mt-2 leading-relaxed">
                      Risque élevé de déshydratation détecté. Recommandation : augmenter la fréquence de suivi hydrique.
                    </p>
                  </div>
                </div>

                {/* Floating mini-cards */}
                <HeroCard icon={CheckCircle2} title="Visite validée" sub="Mme. Bernard · il y a 12 min" className="top-4 -right-8 animate-float-slow" />
                <HeroCard icon={AlertTriangle} title="Incident signalé" sub="Mr. Rousseau · HAUTE priorité" className="bottom-24 -left-8 animate-float" style={{ animationDelay: "1s" } as React.CSSProperties} />
                <HeroCard icon={MessageSquare} title="Nouveau message" sub="Dr. Chen → équipe soins" className="bottom-4 right-4 animate-float-slow" style={{ animationDelay: "2s" } as React.CSSProperties} />
              </div>
            </div>
          </div>

          {/* Wave separator */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              <path d="M0 80H1440V40C1440 40 1200 0 720 0C240 0 0 40 0 40V80Z" fill="rgb(248 250 252)" />
            </svg>
          </div>
        </section>

        {/* ─── Stats Bar ─────────────────────────────────────────────────── */}
        <section className="bg-slate-50 py-16 border-b border-slate-200">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
              {[
                { val: 99, suffix: ".8%", label: "Satisfaction famille", icon: Heart, color: "text-rose-500" },
                { val: 40, suffix: "%", label: "Temps administratif réduit", icon: TrendingUp, color: "text-emerald-500", prefix: "-" },
                { val: 150, suffix: "k+", label: "Soins administrés", icon: Activity, color: "text-blue-500" },
                { val: 5, suffix: " min", label: "Délai d'alerte moyen", icon: Clock, color: "text-amber-500", prefix: "<" },
              ].map(({ val, suffix, label, icon: Icon, color, prefix }) => (
                <div key={label} className="flex flex-col items-center gap-2 animate-fade-up">
                  <Icon className={`h-6 w-6 ${color} mb-1`} />
                  <p className={`text-4xl font-black ${color}`}>
                    {prefix}
                    <Counter end={val} suffix={suffix} />
                  </p>
                  <p className="text-slate-500 text-xs uppercase tracking-wider font-medium">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Services Section ───────────────────────────────────────────── */}
        <section id="services" className="py-28 bg-slate-50">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 animate-fade-up">
              <span className="inline-flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest mb-4">
                <Sparkles className="h-3.5 w-3.5" /> Nos Services Cliniques
              </span>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                Une plateforme complète pour le <span className="text-gradient">soin à domicile</span>
              </h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                Tous les outils dont une équipe de soins à domicile a besoin, réunis dans une interface clinique unifiée.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s, i) => (
                <ServiceCard key={s.title} {...s} delay={`${i * 0.1}s`} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Why Us Section ─────────────────────────────────────────────── */}
        <section id="why" className="py-28 bg-white border-y border-slate-100">
          <div className="container mx-auto px-6">
            <div className="grid gap-16 lg:grid-cols-2 items-center">
              <div className="space-y-8 animate-fade-up">
                <div>
                  <span className="inline-flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest mb-4">
                    <Zap className="h-3.5 w-3.5" /> Pourquoi MedDoc ?
                  </span>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    Un partenaire clinique actif, pas un simple outil de gestion
                  </h2>
                  <p className="mt-4 text-slate-500 leading-relaxed">
                    MedDoc est construit pour les équipes soignantes exigeantes. Chaque fonctionnalité est conçue pour réduire la charge administrative et amplifier la qualité du soin.
                  </p>
                </div>
                <ul className="space-y-5">
                  {[
                    {
                      icon: Brain,
                      color: "bg-violet-100 text-violet-600",
                      title: "Évaluation IA préventive",
                      desc: "Détection automatique des facteurs de risque physiologiques (chute, déshydratation, observance médicamenteuse) par notre algorithme RAG Gemini.",
                    },
                    {
                      icon: AlertTriangle,
                      color: "bg-red-100 text-red-600",
                      title: "Alerte & Escalade en temps réel",
                      desc: "Tout incident signalé par les soignants est immédiatement notifié aux coordinateurs médicaux avec priorisation automatique.",
                    },
                    {
                      icon: Heart,
                      color: "bg-rose-100 text-rose-600",
                      title: "Transparence familiale",
                      desc: "Un portail dédié permet aux proches de suivre le planning des soins, les visites validées et les rapports cliniques en temps réel.",
                    },
                    {
                      icon: Lock,
                      color: "bg-indigo-100 text-indigo-600",
                      title: "Sécurité de niveau hospitalier",
                      desc: "Contrôle d'accès RBAC, journalisation des audits, chiffrement des données et conformité totale HDS + RGPD.",
                    },
                  ].map(({ icon: Icon, color, title, desc }) => (
                    <li key={title} className="flex gap-4">
                      <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{title}</p>
                        <p className="text-slate-500 text-sm mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Stats card */}
              <div className="relative animate-fade-up-d1">
                <div className="absolute -inset-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-3xl blur-xl" />
                <div className="relative bg-gradient-to-br from-slate-900 to-blue-950 rounded-3xl p-8 text-white shadow-2xl">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-blue-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">MedDoc en chiffres</p>
                      <p className="text-white/40 text-xs">Résultats clients 2025</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    {[
                      { val: "99.8%", label: "Satisfaction famille", color: "text-rose-400" },
                      { val: "-40%", label: "Temps administratif", color: "text-emerald-400" },
                      { val: "150k+", label: "Soins administrés", color: "text-blue-400" },
                      { val: "< 5 min", label: "Délai d'alerte moyen", color: "text-amber-400" },
                      { val: "24/7", label: "Supervision disponible", color: "text-violet-400" },
                      { val: "HDS", label: "Certification sécurité", color: "text-indigo-400" },
                    ].map(({ val, label, color }) => (
                      <div key={label} className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <p className={`text-2xl font-black ${color}`}>{val}</p>
                        <p className="text-white/40 text-[10px] uppercase tracking-wider mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Process Section ─────────────────────────────────────────────── */}
        <section id="process" className="py-28 bg-slate-50">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 animate-fade-up">
              <span className="inline-flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest mb-4">
                <Clock className="h-3.5 w-3.5" /> Notre Processus
              </span>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                De l&apos;évaluation au suivi continu en <span className="text-gradient">4 étapes</span>
              </h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                Une transition en douceur pour un accompagnement médical optimal à domicile.
              </p>
            </div>

            <div className="relative">
              {/* Connector line */}
              <div className="absolute top-10 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-blue-200 via-indigo-200 to-blue-200 hidden lg:block" />

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    n: "01",
                    icon: Users,
                    title: "Évaluation initiale",
                    desc: "Visite à domicile par un coordinateur médical qualifié pour évaluer les besoins et niveau de dépendance du patient.",
                    color: "from-blue-500 to-blue-600",
                  },
                  {
                    n: "02",
                    icon: FileText,
                    title: "Plan de soins",
                    desc: "Création du dossier patient, plan de soins personnalisé, prescriptions et protocoles médicaux sur la plateforme.",
                    color: "from-indigo-500 to-indigo-600",
                  },
                  {
                    n: "03",
                    icon: CheckCircle2,
                    title: "Affectation soignants",
                    desc: "Sélection et affectation des soignants agréés en fonction des pathologies, compétences et disponibilités.",
                    color: "from-violet-500 to-violet-600",
                  },
                  {
                    n: "04",
                    icon: Brain,
                    title: "Suivi IA continu",
                    desc: "Accès permanent au dashboard famille, surveillance IA préventive des risques et rapports cliniques automatisés.",
                    color: "from-blue-500 to-indigo-600",
                  },
                ].map(({ n, icon: Icon, title, desc, color }, i) => (
                  <div
                    key={n}
                    className="flex flex-col items-center text-center animate-fade-up"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div className={`relative h-20 w-20 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg mb-6`}>
                      <Icon className="h-8 w-8 text-white" />
                      <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white text-slate-900 text-xs font-black flex items-center justify-center shadow border border-slate-100">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg mb-2">{title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Testimonials ────────────────────────────────────────────────── */}
        <section id="testimonials" className="py-28 bg-white border-y border-slate-100">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 animate-fade-up">
              <span className="inline-flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest mb-4">
                <Star className="h-3.5 w-3.5 fill-blue-600" /> Témoignages
              </span>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                Ils font confiance à <span className="text-gradient">MedDoc</span>
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {testimonials.map((t, i) => (
                <div key={i} className="animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                  <TestimonialCard {...t} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ ─────────────────────────────────────────────────────────── */}
        <section id="faq" className="py-28 bg-slate-50">
          <div className="container mx-auto px-6 max-w-3xl">
            <div className="text-center mb-16 animate-fade-up">
              <span className="inline-flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest mb-4">
                FAQ
              </span>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">Questions fréquentes</h2>
              <p className="mt-4 text-slate-500">Tout ce que vous devez savoir pour démarrer sereinement.</p>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-fade-up"
                  style={{ animationDelay: `${idx * 0.08}s` }}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-5 text-left font-semibold text-slate-800 hover:text-blue-600 transition-colors group"
                  >
                    <span className="flex items-center gap-3">
                      <span className="h-6 w-6 rounded-lg bg-blue-50 text-blue-600 text-xs font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-transform duration-200 shrink-0 ${
                        openFaq === idx ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openFaq === idx && (
                    <div className="px-5 pb-5 pt-0 text-sm text-slate-500 leading-relaxed border-t border-slate-50 bg-slate-50/50">
                      <div className="pt-4">{faq.a}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA Banner ──────────────────────────────────────────────────── */}
        <section className="py-24 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/3 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl" />
          </div>
          <div className="container mx-auto px-6 text-center relative z-10">
            <div className="animate-fade-up max-w-2xl mx-auto">
              <span className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-wider mb-6">
                <Sparkles className="h-3 w-3" /> Démarrez maintenant
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
                Prêt à moderniser votre coordination de soins ?
              </h2>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">
                Rejoignez les équipes soignantes qui font confiance à MedDoc pour assurer la sécurité et le bien-être de leurs patients.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold px-8 py-4 rounded-xl text-base shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transition-all duration-200"
                >
                  Accéder au portail <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-2 border border-white/10 text-white font-semibold px-8 py-4 rounded-xl text-base hover:bg-white/5 transition-all duration-200"
                >
                  Demander une démo
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Contact Section ─────────────────────────────────────────────── */}
        <section id="contact" className="py-28 bg-slate-50">
          <div className="container mx-auto px-6">
            <div className="grid gap-16 lg:grid-cols-2 items-start">
              {/* Left */}
              <div className="space-y-8 animate-fade-up">
                <div>
                  <span className="inline-flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-widest mb-4">
                    <Mail className="h-3.5 w-3.5" /> Contact
                  </span>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    Contactez notre direction médicale
                  </h2>
                  <p className="mt-4 text-slate-500 leading-relaxed">
                    Vous souhaitez planifier une évaluation ou en savoir plus sur notre accompagnement ? Un coordinateur vous répondra sous 24 heures.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { icon: Mail, label: "direction@meddoc.com" },
                    { icon: Phone, label: "+33 (0)1 45 67 89 10" },
                    { icon: MapPin, label: "88 Avenue Kléber, 75116 Paris, France" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-slate-600 text-sm font-medium">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Certifications */}
                <div className="grid grid-cols-2 gap-3 pt-4">
                  {[
                    { label: "Agréé HDS", sub: "Hébergement Données de Santé" },
                    { label: "RGPD Conforme", sub: "Protection des données" },
                    { label: "ISO 27001", sub: "Sécurité informatique" },
                    { label: "HAS Qualité", sub: "Démarche qualité soins" },
                  ].map(({ label, sub }) => (
                    <div key={label} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-2.5">
                      <Shield className="h-4 w-4 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">{label}</p>
                        <p className="text-[10px] text-slate-500">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Form */}
              <div className="animate-fade-up-d1">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-8">
                  <h3 className="font-bold text-slate-900 text-lg mb-6">Envoyer un message</h3>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Nom complet</label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          placeholder="Jean Martin"
                          className="rounded-xl border-slate-200 focus:border-blue-400"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">Adresse email</label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          placeholder="jean@example.com"
                          className="rounded-xl border-slate-200 focus:border-blue-400"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Sujet</label>
                      <Input
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        required
                        placeholder="Demande de prise en charge"
                        className="rounded-xl border-slate-200 focus:border-blue-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700">Message</label>
                      <Textarea
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        required
                        rows={4}
                        placeholder="Décrivez votre besoin clinique..."
                        className="rounded-xl border-slate-200 focus:border-blue-400 resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.01] transition-all duration-200 disabled:opacity-70 disabled:scale-100"
                    >
                      {isSubmitting ? (
                        "Envoi en cours..."
                      ) : (
                        <>Envoyer le message <ArrowRight className="h-4 w-4" /></>
                      )}
                    </button>
                    {status.type && (
                      <Alert variant={status.type === "success" ? "success" : "destructive"}>
                        {status.type === "success" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                        <AlertTitle>
                          {status.type === "success" ? "Succès" : "Erreur"}
                        </AlertTitle>
                        <AlertDescription>{status.msg}</AlertDescription>
                      </Alert>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-white py-16">
        <div className="container mx-auto px-6">
          <div className="grid gap-10 md:grid-cols-4 mb-12">
            {/* Brand */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-white" />
                </div>
                <span className="text-xl font-extrabold">Med<span className="text-blue-400">Doc</span></span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                La plateforme de coordination de soins à domicile de référence, augmentée par l&apos;intelligence artificielle clinique.
              </p>
              <div className="flex gap-3">
                {["HDS", "RGPD", "ISO 27001"].map((b) => (
                  <span key={b} className="text-[10px] font-bold text-blue-400 border border-blue-800/50 bg-blue-900/30 px-2.5 py-1 rounded-md">
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Navigation</p>
              {["Services", "Processus", "Témoignages", "FAQ", "Contact"].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`} className="block text-sm text-slate-400 hover:text-white transition-colors">
                  {item}
                </a>
              ))}
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Contact</p>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Mail className="h-3.5 w-3.5 text-blue-400" />
                direction@meddoc.com
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Phone className="h-3.5 w-3.5 text-blue-400" />
                +33 (0)1 45 67 89 10
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                88 Av. Kléber, 75116 Paris
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">© 2026 MedDoc. Tous droits réservés. Agréé Hébergeur de Données de Santé (HDS).</p>
            <div className="flex gap-6">
              <a href="#" className="text-xs text-slate-500 hover:text-white transition-colors">Mentions légales</a>
              <a href="#" className="text-xs text-slate-500 hover:text-white transition-colors">Confidentialité</a>
              <a href="#" className="text-xs text-slate-500 hover:text-white transition-colors">CGU</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
