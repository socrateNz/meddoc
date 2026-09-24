"use client";

import { Label, Pie, PieChart } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface RevenueSlice {
  category: string;
  value: number;
}

// Clés = TransactionCategory côté serveur (cf. schema.prisma). Les catégories de dépense n'ont
// pas leur place ici : ce graphique ne montre que les recettes.
const chartConfig = {
  PHARMACY_SALE: { label: "Pharmacie", color: "var(--chart-2)" },
  SERVICE_FEE: { label: "Consultations et services", color: "var(--chart-1)" },
  LAB_EXAM_FEE: { label: "Laboratoire", color: "var(--chart-5)" },
  OTHER: { label: "Autres", color: "var(--chart-4)" },
} satisfies ChartConfig;

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

export default function RevenueBreakdownChart({ data }: { data: RevenueSlice[] }) {
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, fill: `var(--color-${d.category})` }));
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Origine des recettes</CardTitle>
          <CardDescription className="text-xs">30 derniers jours.</CardDescription>
        </div>
        <PieChartIcon className="h-4 w-4 text-violet-500 shrink-0 mt-1" />
      </CardHeader>
      <CardContent className="pt-2">
        {slices.length === 0 ? (
          <p className="text-sm text-slate-500 py-16 text-center">Aucune recette sur les 30 derniers jours.</p>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[260px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="category" />} />
              <Pie data={slices} dataKey="value" nameKey="category" innerRadius={62} strokeWidth={4}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-xl font-bold">
                            {compact(total)}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} className="fill-muted-foreground text-xs">
                            FCFA
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                />
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="category" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
