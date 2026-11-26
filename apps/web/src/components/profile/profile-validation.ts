import type {
  ProfileLanguage,
  UpdateProfileDto,
  UserProfile,
} from '@/lib/api';

export const PROFILE_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: ProfileLanguage;
  label: string;
}> = [
  { value: 'en', label: 'English' },
  { value: 'am', label: 'Amharic (አማርኛ)' },
  { value: 'om', label: 'Afaan Oromo' },
  { value: 'ti', label: 'Tigrinya (ትግርኛ)' },
];

export const PHONE_NUMBER_REGEX = /^\+?[1-9]\d{6,14}$/;

export interface ProfileFormValues {
  fullName: string;
  phoneNumber: string;
  preferredLanguage: ProfileLanguage;
  bio: string;
}

export interface ProfileFormErrors {
  fullName?: string;
  phoneNumber?: string;
  preferredLanguage?: string;
  bio?: string;
}

export function getProfileLanguageLabel(code: string): string {
  const match = PROFILE_LANGUAGE_OPTIONS.find((opt) => opt.value === code);
  return match ? match.label : code;
}

export function toProfileFormValues(profile: UserProfile): ProfileFormValues {
  return {
    fullName: profile.fullName ?? '',
    phoneNumber: profile.phoneNumber ?? '',
    preferredLanguage: profile.preferredLanguage ?? 'en',
    bio: profile.bio ?? '',
  };
}

export function normalizeProfileValues(
  values: ProfileFormValues,
): Required<UpdateProfileDto> {
  const trimmedName = values.fullName.trim();
  const trimmedPhone = values.phoneNumber.trim();
  const trimmedBio = values.bio.trim();

  return {
    fullName: trimmedName === '' ? null : trimmedName,
    phoneNumber: trimmedPhone === '' ? null : trimmedPhone,
    preferredLanguage: values.preferredLanguage,
    bio: trimmedBio === '' ? null : trimmedBio,
  };
}

/**
 * Validates profile form values against the exact backend UpdateProfileDto limits.
 */
export function validateProfileForm(values: ProfileFormValues): {
  valid: boolean;
  errors: ProfileFormErrors;
} {
  const errors: ProfileFormErrors = {};
  const normalized = normalizeProfileValues(values);

  if (normalized.fullName !== null) {
    if (normalized.fullName.length < 2) {
      errors.fullName = 'Full name must be at least 2 characters long.';
    } else if (normalized.fullName.length > 120) {
      errors.fullName = 'Full name must be at most 120 characters long.';
    }
  }

  if (normalized.phoneNumber !== null) {
    if (!PHONE_NUMBER_REGEX.test(normalized.phoneNumber)) {
      errors.phoneNumber =
        'Enter a valid international phone number (7–15 digits, e.g. +251911223344).';
    }
  }

  const allowedLangs = PROFILE_LANGUAGE_OPTIONS.map((o) => o.value);
  if (!allowedLangs.includes(normalized.preferredLanguage)) {
    errors.preferredLanguage =
      'Preferred language must be English, Amharic, Afaan Oromo, or Tigrinya.';
  }

  if (normalized.bio !== null && normalized.bio.length > 500) {
    errors.bio = 'Bio must be at most 500 characters long.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Computes a minimal PATCH payload containing only modified fields.
 * Returns null if no values changed, preventing unnecessary API requests.
 */
export function buildChangedProfilePayload(
  original: UserProfile,
  draft: ProfileFormValues,
): UpdateProfileDto | null {
  const normalized = normalizeProfileValues(draft);
  const payload: UpdateProfileDto = {};

  if (normalized.fullName !== (original.fullName ?? null)) {
    payload.fullName = normalized.fullName;
  }
  if (normalized.phoneNumber !== (original.phoneNumber ?? null)) {
    payload.phoneNumber = normalized.phoneNumber;
  }
  if (normalized.preferredLanguage !== original.preferredLanguage) {
    payload.preferredLanguage = normalized.preferredLanguage;
  }
  if (normalized.bio !== (original.bio ?? null)) {
    payload.bio = normalized.bio;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}
