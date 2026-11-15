// O acesso de parceiro foi removido em 15/11/2026: só existe o perfil da dona da loja.
export type Role = 'admin'

export function cookieValueForRole(role: Role): string | null {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return null
  return `${secret}|${role}`
}

export function roleFromCookie(value: string | undefined): Role | null {
  if (!value) return null
  if (value === cookieValueForRole('admin')) return 'admin'
  return null
}
