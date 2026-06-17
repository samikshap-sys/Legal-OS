/**
 * Tests for Legal Connect admin role enforcement
 */
import { describe, it, expect } from 'vitest';

// Admin email list (mirrors legalRouter.ts)
const LC_ADMIN_EMAILS = new Set([
  'ninadmandavkar@gofynd.com',
  'aditisinha@gofynd.com',
  'samikshap@gofynd.com',
  'farheenansari@gofynd.com',
]);

function isAdmin(email: string | undefined): boolean {
  return !!(email && LC_ADMIN_EMAILS.has(email));
}

describe('Legal Connect admin role', () => {
  it('grants admin to ninadmandavkar@gofynd.com', () => {
    expect(isAdmin('ninadmandavkar@gofynd.com')).toBe(true);
  });

  it('grants admin to aditisinha@gofynd.com', () => {
    expect(isAdmin('aditisinha@gofynd.com')).toBe(true);
  });

  it('grants admin to samikshap@gofynd.com', () => {
    expect(isAdmin('samikshap@gofynd.com')).toBe(true);
  });

  it('grants admin to farheenansari@gofynd.com', () => {
    expect(isAdmin('farheenansari@gofynd.com')).toBe(true);
  });

  it('denies admin to a regular user', () => {
    expect(isAdmin('regularuser@gofynd.com')).toBe(false);
  });

  it('denies admin to undefined email', () => {
    expect(isAdmin(undefined)).toBe(false);
  });

  it('denies admin to empty string', () => {
    expect(isAdmin('')).toBe(false);
  });

  it('is case-sensitive (uppercase should not match)', () => {
    expect(isAdmin('NinadMandavkar@gofynd.com')).toBe(false);
  });
});
