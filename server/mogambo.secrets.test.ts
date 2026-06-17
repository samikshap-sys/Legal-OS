import { describe, it, expect } from 'vitest';

describe('Mogambo secrets', () => {
  it('KAILY_APP_TOKEN is set and non-empty', () => {
    const token = process.env.KAILY_APP_TOKEN;
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThan(0);
  });

  it('SLACK_BOT_TOKEN is set and non-empty', () => {
    const token = process.env.SLACK_BOT_TOKEN;
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThan(0);
  });
});
