// Tests du moteur sur une VRAIE base MongoDB (transactions, index uniques, conflits concurrents) —
// ignorés sans COMPTA_TEST_DATABASE_URL, qui doit pointer vers une base jetable en replica set :
//   COMPTA_TEST_DATABASE_URL="mongodb://127.0.0.1:27017/meddoc_compta_test?directConnection=true&replicaSet=rs0" npx vitest run src/lib/accounting
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { postEntry, reverseEntry, loadReportLines } from "./engine";
import { trialBalance } from "./reports";
import { AccountingError } from "./rules";

const url = process.env.COMPTA_TEST_DATABASE_URL;

describe.skipIf(!url)("moteur comptable (base réelle)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let org: string;

  beforeAll(async () => {
    org = (await db.organization.create({ data: { name: `Clinique test compta ${Date.now()}`, type: "CLINIC" } })).id;
  });
  afterAll(async () => {
    const entries = await db.accountingEntry.findMany({ where: { organizationId: org }, select: { id: true } });
    await db.accountingLine.deleteMany({ where: { organizationId: org } });
    await db.accountingEntry.deleteMany({ where: { id: { in: entries.map((e: { id: string }) => e.id) } } });
    await db.accountingCounter.deleteMany({ where: { organizationId: org } });
    await db.organization.delete({ where: { id: org } });
    await db.$disconnect();
  });

  const consultation = (sourceId?: string, date = "2026-03-10") => ({
    organizationId: org,
    journal: "VE" as const,
    date,
    label: "Consultation",
    sourceType: "CONSULTATION",
    sourceId,
    lines: [
      { account: "571", debit: 3000 },
      { account: "4111", debit: 7000 },
      { account: "7061", credit: 10000 },
    ],
  });

  it("numérote VE-2026-00001 puis 00002, et enregistre les lignes recopiées", async () => {
    const a = await postEntry(consultation(), db as never);
    const b = await postEntry(consultation(), db as never);
    expect(a.number).toBe("VE-2026-00001");
    expect(b.number).toBe("VE-2026-00002");
    const lines = await db.accountingLine.findMany({ where: { entryId: a.id } });
    expect(lines).toHaveLength(3);
    expect(lines.every((l: { journal: string; entryDate: string }) => l.journal === "VE" && l.entryDate === "2026-03-10")).toBe(true);
  });

  it("idempotence : un même document ne produit qu'une écriture", async () => {
    const source = "65f1a2b3c4d5e6f708192a3b";
    const first = await postEntry(consultation(source), db);
    const again = await postEntry(consultation(source), db);
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, number: first.number, created: false });
  });

  it("numérotation concurrente : 8 écritures simultanées, numéros uniques et sans trou", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => postEntry({ ...consultation(), journal: "OD", date: "2026-05-05" }, db)));
    const numbers = results.map((r) => Number(r.number.slice(-5))).sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("verrou : refuse une écriture datée de la période verrouillée, sauf document déjà comptabilisé", async () => {
    const source = "65f1a2b3c4d5e6f708192a3c";
    const done = await postEntry(consultation(source, "2026-01-15"), db);
    await db.organization.update({ where: { id: org }, data: { accountingLockedUntil: "2026-01-31" } });
    await expect(postEntry(consultation(undefined, "2026-01-20"), db)).rejects.toMatchObject({ code: "PERIOD_LOCKED" });
    expect((await postEntry(consultation(source, "2026-01-15"), db)).id).toBe(done.id);
    await db.organization.update({ where: { id: org }, data: { accountingLockedUntil: null } });
  });

  it("contrepassation : sens inversés, une seule fois, balance toujours équilibrée", async () => {
    const original = await postEntry(consultation("65f1a2b3c4d5e6f708192a3d"), db);
    const rev = await reverseEntry(original.id, { date: "2026-03-11", reason: "Erreur de saisie" }, db);
    const again = await reverseEntry(original.id, { date: "2026-03-12" }, db);
    expect(again.id).toBe(rev.id);
    const lines = await db.accountingLine.findMany({ where: { entryId: rev.id } });
    expect(lines.find((l: { account: string }) => l.account === "7061")?.debit).toBe(BigInt(10000));
    const all = await loadReportLines(org, "2026-12-31", db);
    expect(trialBalance(all, { from: "2026-01-01", to: "2026-12-31" }).balanced).toBe(true);
  });

  it("refuse une écriture déséquilibrée sans rien enregistrer", async () => {
    const before = await db.accountingEntry.count({ where: { organizationId: org } });
    await expect(postEntry({ ...consultation(), lines: [{ account: "571", debit: 100 }, { account: "7061", credit: 90 }] }, db)).rejects.toBeInstanceOf(AccountingError);
    expect(await db.accountingEntry.count({ where: { organizationId: org } })).toBe(before);
  });
});
