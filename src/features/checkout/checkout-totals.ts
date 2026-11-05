// The checkout screen's running totals, in centavos to avoid floating-point drift. The database
// recalculates the sale on completion with the same rules: the deposit is applied up to the bill,
// and any excess is refunded outside GroomBox.
export type CheckoutTotals = {
  subtotal: number;
  discount: number;
  tips: number;
  total: number;
  depositApplied: number;
  balance: number;
  refundDue: number;
};

export function toCentavos(amount: number): number {
  return Math.round(amount * 100);
}

export function parseAmount(text: string): number {
  const value = Number(text.trim());
  return text.trim() === "" || !Number.isFinite(value) ? 0 : value;
}

export function checkoutTotals(itemAmounts: number[], discount: number, tips: number[], deposit: number): CheckoutTotals {
  const subtotal = itemAmounts.reduce((sum, amount) => sum + toCentavos(amount), 0);
  const discountCentavos = toCentavos(discount);
  const tipCentavos = tips.reduce((sum, tip) => sum + toCentavos(tip), 0);
  const total = subtotal - discountCentavos + tipCentavos;
  const depositApplied = Math.min(toCentavos(deposit), Math.max(total, 0));
  return {
    subtotal: subtotal / 100,
    discount: discountCentavos / 100,
    tips: tipCentavos / 100,
    total: total / 100,
    depositApplied: depositApplied / 100,
    balance: Math.max(total - depositApplied, 0) / 100,
    refundDue: (toCentavos(deposit) - depositApplied) / 100,
  };
}
