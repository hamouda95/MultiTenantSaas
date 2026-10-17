import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'test') return 'test-only-secret-that-is-at-least-32-chars';
  throw new Error('JWT_SECRET must contain at least 32 characters');
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  const [, salt, expected] = (stored || '').split(':');
  const actual = await scrypt(password, salt || 'invalid-account-dummy-salt', 64) as Buffer;
  const target = Buffer.from(expected || '00'.repeat(64), 'hex');
  return Boolean(stored) && actual.length === target.length && timingSafeEqual(actual, target);
}
export const sessionCookie = 'saas_session';
export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 8 * 3600 * 1000 };
}
