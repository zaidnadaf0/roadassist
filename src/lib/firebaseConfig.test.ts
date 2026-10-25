import { describe, expect, it } from 'vitest';
import { isConfigComplete, readWebConfig } from '@/lib/firebase';

describe('firebase env configuration', () => {
  it('reads exactly the documented VITE_ variable names', () => {
    const cfg = readWebConfig({
      VITE_FIREBASE_API_KEY: 'k',
      VITE_FIREBASE_AUTH_DOMAIN: 'd',
      VITE_FIREBASE_PROJECT_ID: 'p',
      VITE_FIREBASE_STORAGE_BUCKET: 'b',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 's',
      VITE_FIREBASE_APP_ID: 'a',
      VITE_FIREBASE_MEASUREMENT_ID: 'm',
      SOME_OTHER_VAR: 'ignored',
    });
    expect(cfg).toEqual({
      apiKey: 'k',
      authDomain: 'd',
      projectId: 'p',
      storageBucket: 'b',
      messagingSenderId: 's',
      appId: 'a',
      measurementId: 'm',
    });
  });

  it('requires apiKey + authDomain + projectId + appId', () => {
    const full = { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' };
    expect(isConfigComplete(full)).toBe(true);
    expect(isConfigComplete({ ...full, appId: undefined })).toBe(false);
    expect(isConfigComplete({ ...full, projectId: '' })).toBe(false);
    expect(isConfigComplete({})).toBe(false);
  });
});
