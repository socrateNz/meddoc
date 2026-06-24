"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlertCircle,
  Calendar,
  Info,
  CheckCheck,
  Trash2,
  Check,
  Activity,
  Sparkles,
  MessageSquare,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteReadNotifications,
} from "@/actions/notifications";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type: string;
  createdAt: Date;
}

interface NotificationsClientProps {
  notifications: Notification[];
  unreadCount: number;
  currentFilter: string;
}

const TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; bg: string; text: string; border: string; label: string }
> = {
  INCIDENT: {
    icon: AlertCircle,
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/20",
    label: "Incident",
  },
  APPOINTMENT: {
    icon: Calendar,
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/20",
    label: "Rendez-vous",
  },
  AI: {
    icon: Sparkles,
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    border: "border-violet-500/20",
    label: "Analyse IA",
  },
  MESSAGE: {
    icon: MessageSquare,
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
    label: "Message",
  },
  CARE_PLAN: {
    icon: Activity,
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20",
    label: "Plan de soins",
  },
  INFO: {
    icon: Info,
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/20",
    label: "Info",
  },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG["INFO"];
}

function formatDate(date: Date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "unread", label: "Non lues" },
  { key: "read", label: "Lues" },
];

export default function NotificationsClient({
  notifications,
  unreadCount,
  currentFilter,
}: NotificationsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      const res = await markNotificationRead(id);
      if (res.success) {
        router.refresh();
      } else {
        toast.error("Impossible de marquer comme lu.");
      }
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const res = await markAllNotificationsRead();
      if (res.success) {
        toast.success("Toutes les notifications marquées comme lues.");
        router.refresh();
      } else {
        toast.error("Erreur lors de la mise à jour.");
      }
    });
  };

  const handleDelete = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      const res = await deleteNotification(id);
      setRemovingId(null);
      if (res.success) {
        router.refresh();
      } else {
        toast.error("Impossible de supprimer la notification.");
      }
    });
  };

  const handleDeleteRead = () => {
    startTransition(async () => {
      const res = await deleteReadNotifications();
      if (res.success) {
        toast.success("Notifications lues supprimées.");
        router.refresh();
      } else {
        toast.error("Erreur lors de la suppression.");
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Notifications
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Alertes système, incidents et rappels de soins.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="gap-1.5 text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tout marquer comme lu
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteRead}
            disabled={isPending}
            className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer les lues
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex rounded-xl border bg-muted/30 p-1 gap-1 w-fit">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/dashboard/notifications${f.key !== "all" ? `?filter=${f.key}` : ""}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentFilter === f.key
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-2xl bg-muted/20">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Bell className="h-6 w-6 text-muted-foreground opacity-50" />
          </div>
          <p className="font-semibold text-foreground/70">Aucune notification</p>
          <p className="text-sm text-muted-foreground mt-1">
            {currentFilter === "unread"
              ? "Vous avez tout lu. Bravo !"
              : "Aucune notification correspondant au filtre sélectionné."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => {
            const config = getTypeConfig(n.type);
            const Icon = config.icon;
            const isRemoving = removingId === n.id;

            return (
              <div
                key={n.id}
                className={`group relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 ${
                  n.isRead
                    ? "bg-card border-border/40 opacity-80"
                    : "bg-card border-border shadow-sm"
                } ${isRemoving ? "opacity-40 scale-95" : ""}`}
              >
                {/* Unread dot */}
                {!n.isRead && (
                  <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}

                {/* Icon */}
                <div
                  className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center border ${config.bg} ${config.border}`}
                >
                  <Icon className={`h-4 w-4 ${config.text}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm font-semibold leading-snug ${n.isRead ? "text-foreground/70" : "text-foreground"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {n.message}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2 py-0 border ${config.border} ${config.text} ${config.bg}`}
                    >
                      {config.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/70">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      disabled={isPending}
                      title="Marquer comme lu"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={isPending}
                    title="Supprimer"
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
