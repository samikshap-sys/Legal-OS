import { describe, it, expect } from 'vitest';

describe('Mogambo VITE token', () => {
  it('VITE_KAILY_APP_TOKEN is set and non-empty', () => {
    const token = process.env.VITE_KAILY_APP_TOKEN;
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThan(0);
  });
});
