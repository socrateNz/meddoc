"use client";

import type { ReactNode } from "react";
import { Label, Pie, PieChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface DonutSlice {
  // Identifiant court sans espace (sert de suffixe à la variable CSS --color-<key>).
  key: string;
  label: string;
  value: number;
  color: string;
}

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

// Anneau générique : titre, part de chaque tranche en légende et total au centre. Le contenu
// (tranches, libellés, couleurs) vient entièrement de la page, qui sait ce qu'elle mesure. `icon`
// est un élément déjà instancié (pas une référence de composant) : seul un élément peut traverser
// la frontière serveur -> client.
export default function DonutChart({
  title,
  description,
  icon,
  slices,
  centerLabel,
  emptyText,
  footer,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  slices: DonutSlice[];
  centerLabel: string;
  emptyText: string;
  footer?: ReactNode;
}) {
  const visible = slices.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);
  const chartConfig: ChartConfig = Object.fromEntries(visible.map((s) => [s.key, { label: s.label, color: s.color }]));
  const data = visible.map((s) => ({ key: s.key, value: s.value, fill: `var(--color-${s.key})` }));

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
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500 py-16 text-center">{emptyText}</p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[220px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
                <Pie data={data} dataKey="value" nameKey="key" innerRadius={56} strokeWidth={4}>
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                              {compact(total)}
                            </tspan>
                            <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} className="fill-muted-foreground text-xs">
                              {centerLabel}
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }}
                  />
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="key" />} />
              </PieChart>
            </ChartContainer>
            {footer && <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">{footer}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
