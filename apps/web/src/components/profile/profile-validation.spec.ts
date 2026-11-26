import type { UserProfile } from '@/lib/api';
import {
  PROFILE_LANGUAGE_OPTIONS,
  buildChangedProfilePayload,
  getProfileLanguageLabel,
  normalizeProfileValues,
  toProfileFormValues,
  validateProfileForm,
} from './profile-validation';

describe('Profile Validation & Form Helpers', () => {
  const baseProfile: UserProfile = {
    id: 'user-1',
    email: 'biniyam@andemta.et',
    emailVerifiedAt: '2026-11-20T00:00:00.000Z',
    fullName: 'Biniyam Tesfaye',
    phoneNumber: '+251911223344',
    preferredLanguage: 'en',
    bio: 'Market researcher',
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
  };

  it('exposes the exact 4 backend-supported languages', () => {
    expect(PROFILE_LANGUAGE_OPTIONS.map((o) => o.value)).toEqual([
      'en',
      'am',
      'om',
      'ti',
    ]);
    expect(getProfileLanguageLabel('am')).toContain('Amharic');
  });

  it('maps nullable profile fields to empty form strings and normalizes back to null', () => {
    const emptyProfile: UserProfile = {
      ...baseProfile,
      fullName: null,
      phoneNumber: null,
      bio: null,
    };
    const values = toProfileFormValues(emptyProfile);
    expect(values).toEqual({
      fullName: '',
      phoneNumber: '',
      preferredLanguage: 'en',
      bio: '',
    });

    expect(normalizeProfileValues(values)).toEqual({
      fullName: null,
      phoneNumber: null,
      preferredLanguage: 'en',
      bio: null,
    });
  });

  it('validates fullName, phoneNumber, preferredLanguage, and bio', () => {
    expect(
      validateProfileForm({
        fullName: 'A',
        phoneNumber: 'invalid-phone',
        preferredLanguage: 'fr' as 'en',
        bio: 'x'.repeat(501),
      }),
    ).toEqual({
      valid: false,
      errors: {
        fullName: expect.any(String),
        phoneNumber: expect.any(String),
        preferredLanguage: expect.any(String),
        bio: expect.any(String),
      },
    });

    expect(
      validateProfileForm({
        fullName: '  Biniyam Tesfaye  ',
        phoneNumber: '+251911223344',
        preferredLanguage: 'am',
        bio: 'Valid bio',
      }).valid,
    ).toBe(true);
  });

  it('buildChangedProfilePayload returns null when unchanged and only changed fields when modified', () => {
    const unchanged = toProfileFormValues(baseProfile);
    expect(buildChangedProfilePayload(baseProfile, unchanged)).toBeNull();

    const modified = {
      ...unchanged,
      fullName: 'Biniyam T.',
      preferredLanguage: 'ti' as const,
    };
    expect(buildChangedProfilePayload(baseProfile, modified)).toEqual({
      fullName: 'Biniyam T.',
      preferredLanguage: 'ti',
    });
  });
});
