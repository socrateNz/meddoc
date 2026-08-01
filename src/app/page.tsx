"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  ArrowRight,
  Activity,
  Users,
  Clock,
  CheckCircle2,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  Heart,
  Calendar,
  Brain,
  FileText,
  AlertTriangle,
  Lock,
  Menu,
  X,
  Zap,
  MessageSquare,
  Package,
  Building2,
  ScrollText,
} from "lucide-react";

/* ─── Animated Counter ──────────────────────────────────────────────────────── */
function Counter({ end, suffix = "", duration = 1200 }: { end: number; suffix?: string; duration?: number }) {
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
      q: "Comment inscrire notre hôpital ou clinique sur MedDoc ?",
      a: "L'inscription de votre établissement se fait en nous contactant directement. Nous configurons votre organisation (holding ou clinique), vos services et vos premiers comptes praticiens avec vous.",
    },
    {
      q: "Qui a accès aux données de santé du patient ?",
      a: "L'accès est contrôlé par rôle (administrateur, coordinateur, soignant, famille, patient) : chaque compte ne voit que ce qui correspond à sa fonction et à son établissement. Toute action sensible est tracée dans un journal d'audit.",
    },
    {
      q: "Comment fonctionne l'assistant clinique IA ?",
      a: "Il s'appuie sur l'API Gemini de Google et une architecture RAG : il analyse le dossier du patient (antécédents, traitements, comptes rendus) pour générer un résumé clinique, un score de risque indicatif et des facteurs de risque à surveiller. C'est une aide à la décision, pas un diagnostic médical.",
    },
    {
      q: "Où et comment les données sont-elles stockées ?",
      a: "Les données sont hébergées sur MongoDB Atlas, chiffrées au repos et en transit. L'accès applicatif passe par une authentification sécurisée (sessions signées, cookies protégés) et un contrôle des droits par rôle à chaque requête.",
    },
    {
      q: "Quel est le délai de mise en place ?",
      a: "Cela dépend de la taille de votre établissement et du volume de dossiers à reprendre. On en discute ensemble lors du premier échange pour vous donner un délai précis, sans engagement.",
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
      desc: "Analyse des dossiers patients par l'IA Gemini pour faire ressortir des facteurs de risque et générer des résumés cliniques exploitables.",
    },
    {
      icon: Users,
      color: "bg-emerald-100 text-emerald-600",
      title: "Coordination d'Équipe",
      desc: "Messagerie interne, plans de soins et tâches assignées pour suivre en direct l'activité des différents services cliniques.",
    },
    {
      icon: Calendar,
      color: "bg-amber-100 text-amber-600",
      title: "Gestion des Rendez-vous",
      desc: "Planification des consultations et interventions, avec rappels automatiques envoyés aux soignants avant chaque rendez-vous.",
    },
    {
      icon: AlertTriangle,
      color: "bg-red-100 text-red-600",
      title: "Gestion des Incidents",
      desc: "Signalement immédiat, priorisation et escalade des incidents vers les coordinateurs, avec traçabilité complète.",
    },
    {
      icon: Package,
      color: "bg-indigo-100 text-indigo-600",
      title: "Finance & Pharmacie",
      desc: "Achats, ventes et inventaire de pharmacie avec traçabilité par lot (FEFO), facturation multi-articles et suivi de caisse en temps réel.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ─── Navbar ──────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "glass shadow-sm py-3" : "bg-transparent py-5"
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
            <a
              href="#contact"
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-blue-500/40 transition-all duration-200"
            >
              Demander une démo <ArrowRight className="h-4 w-4" />
            </a>
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
            <a href="#contact" className="mt-2 w-full text-center bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl" onClick={() => setMenuOpen(false)}>
              Demander une démo
            </a>
            <Link href="/login" className="w-full text-center text-sm font-semibold text-blue-600" onClick={() => setMenuOpen(false)}>
              Déjà client ? Se connecter
            </Link>
          </div>
        )}
      </header>

      <main className="flex-1">

        {/* ─── Hero Section ──────────────────────────────────────────────── */}
        <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950">
          {/* Ambient background glow */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-float pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />

          <div className="container mx-auto px-6 pt-28 pb-16 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left: Text */}
              <div className="space-y-8">
                <div className="animate-fade-up inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-wider">
                  Plateforme médicale IA · Basée à Douala, Cameroun
                </div>

                <h1 className="animate-fade-up-d1 text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight">
                  Toute la gestion de votre{" "}
                  <span className="text-gradient">clinique</span>{" "}
                  dans une seule plateforme
                </h1>

                <p className="animate-fade-up-d2 text-slate-400 text-lg leading-relaxed max-w-xl">
                  MedDoc réunit dossiers patients, coordination des soins, pharmacie et finance dans un espace unique, avec un assistant clinique propulsé par l&apos;IA — pensé pour les établissements de santé d&apos;Afrique francophone.
                </p>

                <div className="animate-fade-up-d3 flex flex-col sm:flex-row gap-4">
                  <a
                    href="#contact"
                    className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-bold px-8 py-4 rounded-xl text-base shadow-xl shadow-blue-500/30 hover:bg-blue-700 hover:shadow-blue-500/50 transition-all duration-200"
                  >
                    Demander une démo <ArrowRight className="h-4 w-4" />
                  </a>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 border border-white/10 text-white font-semibold px-8 py-4 rounded-xl text-base hover:bg-white/5 transition-all duration-200"
                  >
                    Se connecter
                  </Link>
                </div>

                {/* Trust badges */}
                <div className="animate-fade-up-d3 flex flex-wrap gap-6 pt-4">
                  {[
                    { icon: Building2, label: "Multi-établissements" },
                    { icon: Lock, label: "Accès par rôle" },
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
                      <span className="text-violet-300 text-xs font-semibold">Analyse IA — Aperçu patient</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/50 text-xs">Score de risque</span>
                      <span className="text-amber-400 text-xs font-bold">Modéré</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-[55%] bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" />
                    </div>
                    <p className="text-white/40 text-[10px] mt-2 leading-relaxed">
                      2 facteurs de risque identifiés à partir du dossier — résumé et recommandations générés automatiquement.
                    </p>
                  </div>
                </div>

                {/* Floating mini-cards */}
                <HeroCard icon={AlertTriangle} title="Incident signalé" sub="Priorité haute · en attente" className="top-4 -right-8 animate-float-slow" />
                <HeroCard icon={MessageSquare} title="Nouveau message" sub="Messagerie interne" className="bottom-4 -left-8 animate-float" style={{ animationDelay: "1s" } as React.CSSProperties} />
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

        {/* ─── Capabilities Strip ────────────────────────────────────────── */}
        <section className="bg-slate-50 py-16 border-b border-slate-200">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
              {[
                { val: 6 as number | string, label: "Rôles utilisateurs, du super-admin au patient", icon: Users, color: "text-blue-500" },
                { val: "Multi" as number | string, label: "Une holding, plusieurs cliniques, une plateforme", icon: Building2, color: "text-indigo-500" },
                { val: "RAG" as number | string, label: "Résumés cliniques et facteurs de risque par IA", icon: Brain, color: "text-violet-500" },
                { val: "FEFO" as number | string, label: "Achats, ventes et inventaire valorisés au FEFO", icon: Package, color: "text-emerald-500" },
              ].map(({ val, label, icon: Icon, color }, i) => (
                <div key={i} className="flex flex-col items-center gap-2 animate-fade-up">
                  <Icon className={`h-6 w-6 ${color} mb-1`} />
                  <p className={`text-3xl font-black ${color}`}>
                    {typeof val === "number" ? <Counter end={val} /> : val}
                  </p>
                  <p className="text-slate-500 text-xs leading-snug max-w-[160px]">{label}</p>
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
                Nos Services Cliniques
              </span>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                Une plateforme complète pour vos <span className="text-gradient">hôpitaux et cliniques</span>
              </h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                Tous les outils dont vos équipes médicales et administratives ont besoin, réunis au sein d&apos;une interface clinique performante.
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
                    Bien plus qu&apos;un outil de gestion administrative
                  </h2>
                  <p className="mt-4 text-slate-500 leading-relaxed">
                    MedDoc est construit pour les équipes soignantes exigeantes. Chaque fonctionnalité est conçue pour réduire la charge administrative et donner une vision claire de l&apos;activité clinique.
                  </p>
                </div>
                <ul className="space-y-5">
                  {[
                    {
                      icon: Brain,
                      color: "bg-violet-100 text-violet-600",
                      title: "Aide à la décision par IA",
                      desc: "L'assistant clinique (Gemini) analyse le dossier du patient et fait ressortir les facteurs de risque à partir des pathologies, allergies et traitements déclarés.",
                    },
                    {
                      icon: AlertTriangle,
                      color: "bg-red-100 text-red-600",
                      title: "Alerte & Escalade en temps réel",
                      desc: "Tout incident signalé par les soignants est immédiatement notifié aux coordinateurs médicaux avec priorisation.",
                    },
                    {
                      icon: Heart,
                      color: "bg-rose-100 text-rose-600",
                      title: "Organisation par services & unités",
                      desc: "Suivi des patients par service (urgences, soins intensifs, chirurgie...) avec capacité et affectation du personnel.",
                    },
                    {
                      icon: Lock,
                      color: "bg-indigo-100 text-indigo-600",
                      title: "Sécurité pensée pour la santé",
                      desc: "Contrôle d'accès par rôle, journal d'audit sur les actions sensibles, authentification sécurisée et données chiffrées.",
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

              {/* What's built card */}
              <div className="relative animate-fade-up-d1">
                <div className="absolute -inset-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-3xl blur-xl" />
                <div className="relative bg-gradient-to-br from-slate-900 to-blue-950 rounded-3xl p-8 text-white shadow-2xl">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Activity className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Ce qui est déjà construit</p>
                      <p className="text-white/40 text-xs">Un aperçu technique de la plateforme</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    {[
                      { val: "6", label: "Modules métiers", color: "text-blue-400" },
                      { val: "6", label: "Rôles & permissions", color: "text-emerald-400" },
                      { val: "FEFO", label: "Valorisation du stock", color: "text-amber-400" },
                      { val: "RAG", label: "Architecture IA (Gemini)", color: "text-violet-400" },
                      { val: "Multi", label: "Holdings & cliniques", color: "text-indigo-400" },
                      { val: "Audit", label: "Journal des actions sensibles", color: "text-rose-400" },
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
                Du déploiement au pilotage en <span className="text-gradient">4 étapes</span>
              </h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                Une intégration progressive, pensée pour ne pas perturber vos services pendant la mise en place.
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
                    title: "Échange & Cadrage",
                    desc: "On discute de votre établissement, de vos services et des modules dont vous avez réellement besoin pour démarrer.",
                    color: "from-blue-500 to-blue-600",
                  },
                  {
                    n: "02",
                    icon: FileText,
                    title: "Configuration",
                    desc: "Création de votre organisation, de vos services et de vos premiers comptes (admin, coordinateurs, soignants).",
                    color: "from-indigo-500 to-indigo-600",
                  },
                  {
                    n: "03",
                    icon: CheckCircle2,
                    title: "Prise en main",
                    desc: "Accompagnement de vos équipes médicales, soignantes et administratives sur l'utilisation de la plateforme.",
                    color: "from-violet-500 to-violet-600",
                  },
                  {
                    n: "04",
                    icon: Brain,
                    title: "Suivi & Amélioration",
                    desc: "Lancement effectif, avec un suivi rapproché pour ajuster la configuration à l'usage réel de vos équipes.",
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

        {/* ─── FAQ ─────────────────────────────────────────────────────────── */}
        <section id="faq" className="py-28 bg-white border-y border-slate-100">
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
                      className={`h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-transform duration-200 shrink-0 ${openFaq === idx ? "rotate-180" : ""
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
                Discutons de votre établissement
              </span>
              <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
                Prêt à moderniser la gestion de votre établissement ?
              </h2>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">
                Contactez-nous pour une démonstration de la plateforme et un échange sur les besoins spécifiques de votre clinique ou hôpital.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-bold px-8 py-4 rounded-xl text-base shadow-xl shadow-blue-500/30 hover:bg-blue-700 hover:shadow-blue-500/50 transition-all duration-200"
                >
                  Demander une démo <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 border border-white/10 text-white font-semibold px-8 py-4 rounded-xl text-base hover:bg-white/5 transition-all duration-200"
                >
                  Se connecter
                </Link>
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
                    Parlons de votre établissement
                  </h2>
                  <p className="mt-4 text-slate-500 leading-relaxed">
                    Vous souhaitez équiper votre établissement ou planifier une démonstration de nos fonctionnalités ? Écrivez-nous ou appelez directement.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { icon: Mail, label: "etarcos3@gmail.com", href: "mailto:etarcos3@gmail.com" },
                    { icon: Phone, label: "+237 656 954 474 / +237 694 854 474" },
                    { icon: MapPin, label: "Douala, Cameroun" },
                  ].map(({ icon: Icon, label, href }) => (
                    <div key={label} className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-blue-600" />
                      </div>
                      {href ? (
                        <a href={href} className="text-slate-600 text-sm font-medium hover:text-blue-600 transition-colors">
                          {label}
                        </a>
                      ) : (
                        <span className="text-slate-600 text-sm font-medium">{label}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Security note (honest, no third-party certification claims) */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 flex gap-3">
                  <ScrollText className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Données hébergées sur MongoDB Atlas (chiffrement au repos et en transit), accès contrôlé par rôle à chaque requête, et journal d&apos;audit sur les actions sensibles.
                  </p>
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
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-blue-500/40 transition-all duration-200 disabled:opacity-70"
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
                Plateforme de gestion et de coordination pour hôpitaux et cliniques, avec un assistant clinique IA — conçue pour les établissements de santé d&apos;Afrique francophone.
              </p>
            </div>

            {/* Navigation */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Navigation</p>
              {["Services", "Processus", "FAQ", "Contact"].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`} className="block text-sm text-slate-400 hover:text-white transition-colors">
                  {item}
                </a>
              ))}
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Contact</p>
              <a href="mailto:etarcos3@gmail.com" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
                <Mail className="h-3.5 w-3.5 text-blue-400" />
                etarcos3@gmail.com
              </a>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Phone className="h-3.5 w-3.5 text-blue-400" />
                +237 656 954 474
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                Douala, Cameroun
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">© 2026 Shede MedDoc. Tous droits réservés.</p>
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
