"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface SimpleBarPoint {
  label: string;
  value: number;
}

// Barres horizontales (une ligne par catégorie) : les libellés d'établissement ou de forfait sont
// trop longs pour un axe X vertical, surtout sur mobile. La hauteur suit le nombre de lignes pour
// que les barres gardent une épaisseur lisible quelle que soit la quantité de données.
export default function SimpleBarChart({
  data,
  valueLabel,
  color = "var(--chart-1)",
}: {
  data: SimpleBarPoint[];
  valueLabel: string;
  color?: string;
}) {
  const chartConfig = { value: { label: valueLabel, color } } satisfies ChartConfig;
  const height = Math.max(140, data.length * 44 + 24);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <YAxis
          dataKey="label"
          type="category"
          tickLine={false}
          axisLine={false}
          width={110}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={5} />
      </BarChart>
    </ChartContainer>
  );
}
