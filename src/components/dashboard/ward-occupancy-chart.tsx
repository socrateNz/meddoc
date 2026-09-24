"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface WardOccupancy {
  name: string;
  occupied: number;
  capacity: number;
}

const chartConfig = {
  occupied: { label: "Lits occupés", color: "var(--chart-3)" },
  free: { label: "Lits libres", color: "var(--chart-2)" },
} satisfies ChartConfig;

// Occupation par service : une barre empilée (occupés + libres = capacité) par service, avec en
// dessous le détail chiffré "occupés / capacité (%)" que montraient les anciennes barres — le
// graphique donne la vue d'ensemble, la liste garde la valeur exacte. Les libres sont bornés à 0 :
// un service sur-occupé (plus de patients que de lits) ne doit pas produire une barre négative.
export default function WardOccupancyChart({ wards }: { wards: WardOccupancy[] }) {
  const data = wards.map((w) => ({
    name: w.name,
    occupied: w.occupied,
    free: Math.max(0, w.capacity - w.occupied),
  }));

  return (
    <div className="space-y-4">
      <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: Math.max(150, wards.length * 56 + 60) }}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} />
          <YAxis
            dataKey="name"
            type="category"
            tickLine={false}
            axisLine={false}
            width={96}
            tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
          />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="occupied" stackId="beds" fill="var(--color-occupied)" radius={[4, 0, 0, 4]} />
          <Bar dataKey="free" stackId="beds" fill="var(--color-free)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartContainer>

      <ul className="space-y-1.5 text-sm">
        {wards.map((w) => {
          const pct = w.capacity > 0 ? Math.min(100, Math.round((w.occupied / w.capacity) * 100)) : 0;
          return (
            <li key={w.name} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{w.name}</span>
              <span className="text-slate-500 shrink-0">
                {w.occupied} / {w.capacity} lits ({pct}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
