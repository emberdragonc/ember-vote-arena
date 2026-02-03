// Admin wallets that can boost markets
export const ADMIN_WALLETS = [
  '0xE3c938c71273bFFf7DEe21BDD3a8ee1e453Bdd1b', // Ember
  '0x1234567890123456789012345678901234567890', // Brian - UPDATE WITH REAL ADDRESS
].map(addr => addr.toLowerCase())

export function isAdmin(address: string | undefined): boolean {
  if (!address) return false
  return ADMIN_WALLETS.includes(address.toLowerCase())
}
