"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface CountPoint {
  label: string;
  value: number;
}

// Évolution d'un effectif dans le temps (rendez-vous par jour, nouveaux patients par semaine,
// remises par jour...) : barres pour des jours discrets, aire pour une tendance sur plusieurs
// semaines. `icon` est un élément déjà instancié (seul un élément traverse la frontière
// serveur -> client, pas une référence de composant).
export default function CountTrendChart({
  title,
  description,
  icon,
  data,
  valueLabel,
  color = "var(--chart-1)",
  variant = "bar",
  emptyText,
  footer,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  data: CountPoint[];
  valueLabel: string;
  color?: string;
  variant?: "bar" | "area";
  emptyText: string;
  footer?: ReactNode;
}) {
  const chartConfig = { value: { label: valueLabel, color } } satisfies ChartConfig;
  const hasData = data.some((d) => d.value > 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
      <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
    </>
  );

  return (
    <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {icon && <div className="shrink-0 mt-1">{icon}</div>}
      </CardHeader>
      <CardContent className="pt-2">
        {!hasData ? (
          <p className="text-sm text-slate-500 py-16 text-center">{emptyText}</p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
              {variant === "area" ? (
                <AreaChart data={data} margin={{ left: 0, right: 8, top: 4 }}>
                  {axes}
                  <Area
                    dataKey="value"
                    type="monotone"
                    stroke="var(--color-value)"
                    fill="var(--color-value)"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                </AreaChart>
              ) : (
                <BarChart data={data} margin={{ left: 0, right: 4, top: 4 }}>
                  {axes}
                  <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                </BarChart>
              )}
            </ChartContainer>
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {footer ?? (
                <>
                  Total sur la période : <span className="font-semibold text-slate-700 dark:text-slate-300">{total}</span>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
