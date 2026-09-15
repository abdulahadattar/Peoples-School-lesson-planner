import { User } from 'firebase/auth';

/**
 * Verified Admin emails allowed to edit critical school configurations (e.g. enrollments).
 */
export const ADMIN_EMAILS: string[] = [
  'abdul7762had@gmail.com',
  'abdul7762ahad@gmail.com',
];

/**
 * Checks if a given email or Firebase User has admin privileges.
 */
export function isUserAdmin(userOrEmail?: User | string | null): boolean {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
