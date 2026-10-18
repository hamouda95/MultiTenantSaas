import type { BusinessState } from "@saas/types";
import { emptyBusiness, visibleBusiness } from "./business.engine";

/**
 * Pure, deterministic DEMO fixture. Never writes to PostgreSQL and never creates
 * memberships. Must not be exposed by a production API endpoint.
 */
export function createDemoHoldingFixture(): BusinessState {
  const state = emptyBusiness();
  const groups = [
    { id: "demo-atlas", name: "Atlas Distribution Démo", stores: ["Tunis Centre", "La Marsa", "Sousse", "Sfax"], warehouse: "Dépôt Tunis" },
    { id: "demo-med", name: "Méditerranée Retail Démo", stores: ["Bizerte", "Nabeul", "Monastir"], warehouse: "Dépôt Nabeul" },
    { id: "demo-carthage", name: "Carthage Mode Démo", stores: ["Hammamet", "Gabès", "Djerba"], warehouse: "Dépôt Sfax" },
  ] as const;
  for (const group of groups) {
    state.companies.push({
      id: group.id, name: group.name, currency: "TND", country: "Tunisie",
      brands: ["Marque Démo"], leadDays: 7, coverDays: 21,
      minimumStock: 2, modules: ["purchasing", "inventory", "sales", "finance", "intelligence"],
    });
    state.locations.push({
      id: `${group.id}-warehouse`, companyId: group.id,
      name: group.warehouse, kind: "WAREHOUSE",
    });
    group.stores.forEach((name, index) => state.locations.push({
      id: `${group.id}-store-${index + 1}`, companyId: group.id,
      name, kind: "STORE",
    }));
    state.accounts.push({
      id: `${group.id}-bank`, companyId: group.id,
      name: "Banque fictive", kind: "BANK", opening: 1_000_000,
      source: "MANUAL", asOf: "2025-01-01",
    });
    for (let i = 1; i <= 10; i++) {
      state.products.push({
        id: `${group.id}-product-${i}`, companyId: group.id,
        sku: `DEMO-${i.toString().padStart(3, "0")}`,
        name: `Article fictif ${i}`, brand: "Marque Démo",
        size: "M", color: "Bleu", cost: 10_000 + i * 1_000,
      });
      state.movements.push({
        id: `${group.id}-opening-${i}`, companyId: group.id,
        productId: `${group.id}-product-${i}`,
        locationId: `${group.id}-warehouse`, quantity: 50,
        reason: "DEMO_OPENING", sourceId: "demo-fixture",
        date: "2025-01-01T00:00:00.000Z",
      });
    }
  }
  return state;
}

/** Exercise the same per-company projection as the authenticated business API. */
export function demoFixtureVisibleTo(companyIds: string[]): BusinessState {
  const state = createDemoHoldingFixture();
  state.access = companyIds.map((companyId) => ({
    companyId, userId: "demo-cfo", membershipId: "demo-membership", role: "FINANCE" as const,
  }));
  return visibleBusiness(state, "demo-cfo", false, "demo-membership");
}
