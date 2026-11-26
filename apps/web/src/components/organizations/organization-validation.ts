import type {
  CreateOrganizationDto,
  OrganizationType,
  UpdateOrganizationDto,
  UserOrganization,
} from '@/lib/api';

export const ORGANIZATION_TYPE_OPTIONS: ReadonlyArray<{
  value: OrganizationType;
  label: string;
}> = [
  { value: 'BUSINESS', label: 'Business' },
  { value: 'UNIVERSITY', label: 'University' },
  { value: 'OTHER', label: 'Other' },
];

export const ORGANIZATION_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CreateOrganizationFormValues {
  name: string;
  slug: string;
  type: OrganizationType;
}

export interface CreateOrganizationFormErrors {
  name?: string;
  slug?: string;
  type?: string;
}

export interface UpdateOrganizationFormValues {
  name: string;
  type: OrganizationType;
}

export interface UpdateOrganizationFormErrors {
  name?: string;
  type?: string;
}

export function formatOrganizationTypeLabel(type: OrganizationType): string {
  const match = ORGANIZATION_TYPE_OPTIONS.find((opt) => opt.value === type);
  return match ? match.label : type;
}

export function validateCreateOrganizationForm(
  values: CreateOrganizationFormValues,
): {
  valid: boolean;
  errors: CreateOrganizationFormErrors;
  payload: CreateOrganizationDto;
} {
  const errors: CreateOrganizationFormErrors = {};
  const trimmedName = values.name.trim();
  const trimmedSlug = values.slug.trim().toLowerCase();

  if (!trimmedName) {
    errors.name = 'Organization name is required.';
  } else if (trimmedName.length < 2) {
    errors.name = 'Organization name must be at least 2 characters long.';
  } else if (trimmedName.length > 120) {
    errors.name = 'Organization name must be at most 120 characters long.';
  }

  if (trimmedSlug.length > 0) {
    if (trimmedSlug.length < 2) {
      errors.slug = 'Slug must be at least 2 characters long.';
    } else if (trimmedSlug.length > 80) {
      errors.slug = 'Slug must be at most 80 characters long.';
    } else if (!ORGANIZATION_SLUG_REGEX.test(trimmedSlug)) {
      errors.slug =
        'Slug must contain only lowercase letters, numbers, and single hyphens.';
    }
  }

  const allowedTypes = ORGANIZATION_TYPE_OPTIONS.map((o) => o.value);
  if (!allowedTypes.includes(values.type)) {
    errors.type = 'Organization type must be Business, University, or Other.';
  }

  const payload: CreateOrganizationDto = {
    name: trimmedName,
    type: values.type,
    ...(trimmedSlug.length > 0 ? { slug: trimmedSlug } : {}),
  };

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    payload,
  };
}

export function validateUpdateOrganizationForm(
  values: UpdateOrganizationFormValues,
): {
  valid: boolean;
  errors: UpdateOrganizationFormErrors;
} {
  const errors: UpdateOrganizationFormErrors = {};
  const trimmedName = values.name.trim();

  if (!trimmedName) {
    errors.name = 'Organization name is required.';
  } else if (trimmedName.length < 2) {
    errors.name = 'Organization name must be at least 2 characters long.';
  } else if (trimmedName.length > 120) {
    errors.name = 'Organization name must be at most 120 characters long.';
  }

  const allowedTypes = ORGANIZATION_TYPE_OPTIONS.map((o) => o.value);
  if (!allowedTypes.includes(values.type)) {
    errors.type = 'Organization type must be Business, University, or Other.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildChangedOrganizationPayload(
  original: UserOrganization,
  draft: UpdateOrganizationFormValues,
): UpdateOrganizationDto | null {
  const trimmedName = draft.name.trim();
  const payload: UpdateOrganizationDto = {};

  if (trimmedName !== original.name) {
    payload.name = trimmedName;
  }
  if (draft.type !== original.type) {
    payload.type = draft.type;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}
