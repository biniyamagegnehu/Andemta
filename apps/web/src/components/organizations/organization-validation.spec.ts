import type { UserOrganization } from '@/lib/api';
import {
  buildChangedOrganizationPayload,
  formatOrganizationTypeLabel,
  validateCreateOrganizationForm,
  validateUpdateOrganizationForm,
} from './organization-validation';

describe('organization-validation', () => {
  const baseOrg: UserOrganization = {
    id: 'org-1',
    name: 'Addis Research Lab',
    slug: 'addis-research-lab',
    type: 'BUSINESS',
    status: 'ACTIVE',
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    roleCode: 'OWNER',
  };

  describe('validateCreateOrganizationForm', () => {
    it('accepts valid name, optional slug, and type', () => {
      const result = validateCreateOrganizationForm({
        name: '  Habesha Consumer Group  ',
        slug: '  habesha-consumer-group  ',
        type: 'UNIVERSITY',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.payload).toEqual({
        name: 'Habesha Consumer Group',
        slug: 'habesha-consumer-group',
        type: 'UNIVERSITY',
      });
    });

    it('omits slug from payload when left blank', () => {
      const result = validateCreateOrganizationForm({
        name: 'Ethio Survey Co',
        slug: '   ',
        type: 'OTHER',
      });

      expect(result.valid).toBe(true);
      expect(result.payload).toEqual({
        name: 'Ethio Survey Co',
        type: 'OTHER',
      });
      expect(result.payload.slug).toBeUndefined();
    });

    it('rejects missing or too-short name', () => {
      const empty = validateCreateOrganizationForm({
        name: ' ',
        slug: '',
        type: 'BUSINESS',
      });
      expect(empty.valid).toBe(false);
      expect(empty.errors.name).toBe('Organization name is required.');

      const short = validateCreateOrganizationForm({
        name: 'A',
        slug: '',
        type: 'BUSINESS',
      });
      expect(short.valid).toBe(false);
      expect(short.errors.name).toBe(
        'Organization name must be at least 2 characters long.',
      );
    });

    it('rejects invalid slug formats', () => {
      const invalid = validateCreateOrganizationForm({
        name: 'Valid Name',
        slug: 'bad--slug!',
        type: 'BUSINESS',
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.errors.slug).toBeDefined();
    });
  });

  describe('validateUpdateOrganizationForm', () => {
    it('accepts valid name and type', () => {
      const result = validateUpdateOrganizationForm({
        name: 'Updated Name',
        type: 'UNIVERSITY',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('rejects name shorter than 2 characters or longer than 120 characters', () => {
      const tooShort = validateUpdateOrganizationForm({
        name: 'X',
        type: 'BUSINESS',
      });
      expect(tooShort.valid).toBe(false);
      expect(tooShort.errors.name).toBeDefined();

      const tooLong = validateUpdateOrganizationForm({
        name: 'A'.repeat(121),
        type: 'BUSINESS',
      });
      expect(tooLong.valid).toBe(false);
      expect(tooLong.errors.name).toBeDefined();
    });
  });

  describe('buildChangedOrganizationPayload', () => {
    it('returns null when no fields changed', () => {
      const payload = buildChangedOrganizationPayload(baseOrg, {
        name: '  Addis Research Lab ',
        type: 'BUSINESS',
      });

      expect(payload).toBeNull();
    });

    it('includes only changed fields', () => {
      const nameOnly = buildChangedOrganizationPayload(baseOrg, {
        name: 'Addis Research Lab v2',
        type: 'BUSINESS',
      });
      expect(nameOnly).toEqual({ name: 'Addis Research Lab v2' });

      const typeOnly = buildChangedOrganizationPayload(baseOrg, {
        name: 'Addis Research Lab',
        type: 'UNIVERSITY',
      });
      expect(typeOnly).toEqual({ type: 'UNIVERSITY' });
    });
  });

  describe('formatOrganizationTypeLabel', () => {
    it('formats known organization types into human-readable labels', () => {
      expect(formatOrganizationTypeLabel('BUSINESS')).toBe('Business');
      expect(formatOrganizationTypeLabel('UNIVERSITY')).toBe('University');
      expect(formatOrganizationTypeLabel('OTHER')).toBe('Other');
    });
  });
});
