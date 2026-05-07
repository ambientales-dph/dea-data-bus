
export const AUTH_WHITELIST = [
  'user@example.com',
  'admin@geodatos.com',
  'field.technician@environmental.org',
  'inspector@government.gov',
  'luisbree@gmail.com'
];

export function isUserWhitelisted(email: string | null): boolean {
  if (!email) return false;
  return AUTH_WHITELIST.includes(email.toLowerCase());
}
