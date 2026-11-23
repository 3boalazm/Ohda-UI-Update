/**
 * Prices. Ohda is sold by Code & Canvas, a company registered in Egypt. Customers outside Egypt
 * (including Saudi Arabia) buy an exported digital service from the Egyptian company: the price is
 * set in USD and paid to the Egyptian company. The Saudi agent is a representative only; it does
 * not sell or collect payments, and no Saudi entity of Code & Canvas is implied.
 */
export type PlanId = "single" | "family";
export type Market = "EG" | "INTL";

export const PRICES: Record<PlanId, Record<Market, { amount: number; currency: "EGP" | "USD" }>> = {
  single: { EG: { amount: 99, currency: "EGP" }, INTL: { amount: 5, currency: "USD" } },
  family: { EG: { amount: 199, currency: "EGP" }, INTL: { amount: 10, currency: "USD" } },
};

export const PLAN_NAME: Record<PlanId, string> = { single: "فردي", family: "باقة العيلة" };

export function priceLabel(plan: PlanId, market: Market): string {
  const p = PRICES[plan][market];
  return p.currency === "EGP" ? `${p.amount} جنيه` : `${p.amount} دولار`;
}

/** "99 جنيه في مصر · 5 دولار من برّه مصر" */
export function bothPrices(plan: PlanId): string {
  return `${priceLabel(plan, "EG")} في مصر · ${priceLabel(plan, "INTL")} من برّه مصر`;
}

export const SELLER_LINE =
  "البائع: Code & Canvas — شركة مسجّلة في مصر. العملاء من برّه مصر (ومنهم السعودية) بيدفعوا للشركة في مصر بالدولار.";

export const ORDER_WHATSAPP = "201001850509";
