// Messenger, Facebook, and Instagram open links in their own browsers, where Google refuses to
// sign in (TRD §5). They mark their user agents: FBAN/FBAV/FB_IAB for Facebook and Messenger,
// "Instagram" for Instagram.
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram/i.test(userAgent);
}
