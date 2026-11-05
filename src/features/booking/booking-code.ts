// Booking codes are stored as 12 characters and shown in groups of four: 7K2M-QX9D-4HTB.
export function formatBookingCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

export function bookingPath(code: string): string {
  return `/booking/${formatBookingCode(code)}`;
}
