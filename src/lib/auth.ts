export type Role = 'admin' | 'partner'

export function cookieValueForRole(role: Role): string | null {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return null
  return `${secret}|${role}`
}

export function roleFromCookie(value: string | undefined): Role | null {
  if (!value) return null
  if (value === cookieValueForRole('admin')) return 'admin'
  if (value === cookieValueForRole('partner')) return 'partner'
  return null
}
