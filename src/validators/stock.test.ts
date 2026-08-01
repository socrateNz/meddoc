import { describe, it, expect } from "vitest";
import { recordStockPurchaseSchema, saveInventoryCountsSchema } from "./stock";

describe("recordStockPurchaseSchema", () => {
  const base = {
    quantity: 10,
    purchasePrice: 500,
    supplier: "Labo Central",
  };

  it("accepts a purchase for an existing product", () => {
    const result = recordStockPurchaseSchema.safeParse({
      ...base,
      pharmacyItemId: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a purchase that creates a new product", () => {
    const result = recordStockPurchaseSchema.safeParse({
      ...base,
      newItem: { name: "Paracétamol 500mg", unitPrice: 500 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither an existing product nor a new product is provided", () => {
    const result = recordStockPurchaseSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative quantity", () => {
    const result = recordStockPurchaseSchema.safeParse({
      ...base,
      pharmacyItemId: "abc123",
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative purchase price", () => {
    const result = recordStockPurchaseSchema.safeParse({
      ...base,
      pharmacyItemId: "abc123",
      purchasePrice: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("saveInventoryCountsSchema", () => {
  it("accepts a valid payload", () => {
    const result = saveInventoryCountsSchema.safeParse({
      inventoryCountId: "count1",
      lines: [{ lineId: "line1", countedQuantity: 5 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty lines array", () => {
    const result = saveInventoryCountsSchema.safeParse({
      inventoryCountId: "count1",
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative counted quantity", () => {
    const result = saveInventoryCountsSchema.safeParse({
      inventoryCountId: "count1",
      lines: [{ lineId: "line1", countedQuantity: -1 }],
    });
    expect(result.success).toBe(false);
  });
});
