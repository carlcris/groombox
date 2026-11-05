// "₱1,300", or "₱1,300.50" when there are centavos (design brief §9).
export function formatPeso(amount: number): string {
  const hasCentavos = Math.round(amount * 100) % 100 !== 0;
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
