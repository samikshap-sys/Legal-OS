import { describe, it, expect } from 'vitest';

describe('GCS_SERVICE_ACCOUNT_JSON env var', () => {
  it('should be set and parseable', () => {
    const saJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
    expect(saJson, 'GCS_SERVICE_ACCOUNT_JSON must be set').toBeTruthy();
    
    let creds: any;
    expect(() => { creds = JSON.parse(saJson!); }).not.toThrow();
    
    expect(creds.type).toBe('service_account');
    expect(creds.project_id).toBe('fynd-prod-393805');
    expect(creds.client_email).toBe('planmaker@fynd-prod-393805.iam.gserviceaccount.com');
    expect(creds.private_key).toContain('BEGIN PRIVATE KEY');
  });
});
