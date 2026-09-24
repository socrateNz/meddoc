"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface FinanceTrendPoint {
  label: string;
  income: number;
  expense: number;
}

const chartConfig = {
  income: { label: "Recettes", color: "var(--chart-2)" },
  expense: { label: "Dépenses", color: "var(--chart-3)" },
} satisfies ChartConfig;

// 12 500 -> "13 k", 2 100 000 -> "2,1 M" : lisible sur un axe étroit (mobile).
function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

export default function FinanceTrendChart({ data }: { data: FinanceTrendPoint[] }) {
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);
  const totalIncome = data.reduce((sum, d) => sum + d.income, 0);
  const totalExpense = data.reduce((sum, d) => sum + d.expense, 0);

  return (
    <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Recettes et dépenses</CardTitle>
          <CardDescription className="text-xs">7 derniers jours, en FCFA.</CardDescription>
        </div>
        <Wallet className="h-4 w-4 text-emerald-500 shrink-0 mt-1" />
      </CardHeader>
      <CardContent className="pt-2">
        {!hasData ? (
          <p className="text-sm text-slate-500 py-16 text-center">Aucune opération sur les 7 derniers jours.</p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
              <BarChart data={data} margin={{ left: 0, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={compact} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                <Bar dataKey="expense" fill="var(--color-expense)" radius={4} />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Recettes :{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {new Intl.NumberFormat("fr-FR").format(Math.round(totalIncome))} FCFA
                </span>
              </span>
              <span>
                Dépenses :{" "}
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {new Intl.NumberFormat("fr-FR").format(Math.round(totalExpense))} FCFA
                </span>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
