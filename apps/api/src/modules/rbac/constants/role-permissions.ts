import { RoleScope } from '@prisma/client';
import { PERMISSION, PermissionCode } from './permissions';

/**
 * Strongly typed mapping of built-in roles to their granted permissions.
 *
 * Key format: `${RoleScope}:${roleCode}` — e.g., 'SYSTEM:PARTICIPANT'.
 *
 * Rules enforced here:
 * - Principle of least privilege: each role gets only what it needs.
 * - System roles never include organization-only permissions.
 * - Organization roles never include platform-administration permissions.
 * - VIEWER has only read-class permissions.
 * - PARTICIPANT has only participant-activity permissions.
 *
 * This mapping is the application-layer source of truth.
 * The idempotent sync (RolePermissionService.syncBuiltInRolePermissions) uses it to
 * upsert into the database without deleting custom additions.
 */
export const BUILT_IN_ROLE_PERMISSION_MAPPINGS: Record<
  `${RoleScope}:${string}`,
  PermissionCode[]
> = {
  // ---------------------------------------------------------------------------
  // SYSTEM ROLES
  // ---------------------------------------------------------------------------

  /**
   * PARTICIPANT — General consumer research participant.
   * Grants only the permissions needed to participate in studies and claim rewards.
   * No organization, research-client, or platform administration privileges.
   */
  'SYSTEM:PARTICIPANT': [
    PERMISSION.SURVEY_RESPOND,
    PERMISSION.PRODUCT_TESTING_PARTICIPATE,
    PERMISSION.REWARDS_CLAIM,
  ],

  /**
   * Platform ADMIN — Global platform administrator.
   * Oversees users, platform configuration, audit logs, and metrics.
   * Does NOT automatically grant organization-level authority.
   * Does NOT grant research creation; that belongs to org roles.
   */
  'SYSTEM:ADMIN': [
    PERMISSION.USERS_READ,
    PERMISSION.USERS_MANAGE,
    PERMISSION.PLATFORM_ADMIN,
    PERMISSION.PLATFORM_AUDIT_READ,
    PERMISSION.PLATFORM_METRICS_READ,
    PERMISSION.ORGANIZATION_READ,
    PERMISSION.RESEARCH_READ,
    PERMISSION.SURVEY_READ,
    PERMISSION.REPORTS_READ,
    PERMISSION.REWARDS_READ,
  ],

  // ---------------------------------------------------------------------------
  // ORGANIZATION ROLES
  // ---------------------------------------------------------------------------

  /**
   * OWNER — Full organizational authority.
   * Has all organization-scoped permissions including billing, deletion, and member management.
   * Does NOT automatically become a platform ADMIN.
   */
  'ORGANIZATION:OWNER': [
    // Organization
    PERMISSION.ORGANIZATION_READ,
    PERMISSION.ORGANIZATION_UPDATE,
    PERMISSION.ORGANIZATION_DELETE,
    PERMISSION.ORGANIZATION_BILLING_MANAGE,
    // Membership
    PERMISSION.ORGANIZATION_MEMBERS_READ,
    PERMISSION.ORGANIZATION_MEMBERS_INVITE,
    PERMISSION.ORGANIZATION_MEMBERS_UPDATE,
    PERMISSION.ORGANIZATION_MEMBERS_REMOVE,
    // Research
    PERMISSION.RESEARCH_CREATE,
    PERMISSION.RESEARCH_READ,
    PERMISSION.RESEARCH_UPDATE,
    PERMISSION.RESEARCH_DELETE,
    PERMISSION.RESEARCH_PUBLISH,
    // Survey
    PERMISSION.SURVEY_CREATE,
    PERMISSION.SURVEY_READ,
    PERMISSION.SURVEY_UPDATE,
    PERMISSION.SURVEY_DELETE,
    PERMISSION.SURVEY_PUBLISH,
    // Participants & Product Testing
    PERMISSION.PARTICIPANTS_READ,
    PERMISSION.PARTICIPANTS_RECRUIT,
    PERMISSION.PRODUCT_TESTING_CREATE,
    PERMISSION.PRODUCT_TESTING_READ,
    PERMISSION.PRODUCT_TESTING_UPDATE,
    PERMISSION.PRODUCT_TESTING_DELETE,
    // Reports & Rewards
    PERMISSION.REPORTS_READ,
    PERMISSION.REPORTS_EXPORT,
    PERMISSION.REWARDS_DISTRIBUTE,
    PERMISSION.REWARDS_READ,
  ],

  /**
   * Organization ADMIN — Delegated organizational management.
   * Full operational authority except: cannot delete the organization, cannot manage billing.
   * Can manage members, research, surveys, participants, and rewards.
   */
  'ORGANIZATION:ADMIN': [
    // Organization (cannot delete, cannot manage billing)
    PERMISSION.ORGANIZATION_READ,
    PERMISSION.ORGANIZATION_UPDATE,
    // Membership
    PERMISSION.ORGANIZATION_MEMBERS_READ,
    PERMISSION.ORGANIZATION_MEMBERS_INVITE,
    PERMISSION.ORGANIZATION_MEMBERS_UPDATE,
    PERMISSION.ORGANIZATION_MEMBERS_REMOVE,
    // Research
    PERMISSION.RESEARCH_CREATE,
    PERMISSION.RESEARCH_READ,
    PERMISSION.RESEARCH_UPDATE,
    PERMISSION.RESEARCH_DELETE,
    PERMISSION.RESEARCH_PUBLISH,
    // Survey
    PERMISSION.SURVEY_CREATE,
    PERMISSION.SURVEY_READ,
    PERMISSION.SURVEY_UPDATE,
    PERMISSION.SURVEY_DELETE,
    PERMISSION.SURVEY_PUBLISH,
    // Participants & Product Testing
    PERMISSION.PARTICIPANTS_READ,
    PERMISSION.PARTICIPANTS_RECRUIT,
    PERMISSION.PRODUCT_TESTING_CREATE,
    PERMISSION.PRODUCT_TESTING_READ,
    PERMISSION.PRODUCT_TESTING_UPDATE,
    PERMISSION.PRODUCT_TESTING_DELETE,
    // Reports & Rewards
    PERMISSION.REPORTS_READ,
    PERMISSION.REPORTS_EXPORT,
    PERMISSION.REWARDS_DISTRIBUTE,
    PERMISSION.REWARDS_READ,
  ],

  /**
   * RESEARCHER — Research practitioner.
   * Can create, update, publish research and surveys.
   * Cannot delete research, cannot manage organization membership, billing, or rewards.
   * Cannot delete product tests (only create/read/update them).
   */
  'ORGANIZATION:RESEARCHER': [
    // Organization (read-only org & member list)
    PERMISSION.ORGANIZATION_READ,
    PERMISSION.ORGANIZATION_MEMBERS_READ,
    // Research (no delete)
    PERMISSION.RESEARCH_CREATE,
    PERMISSION.RESEARCH_READ,
    PERMISSION.RESEARCH_UPDATE,
    PERMISSION.RESEARCH_PUBLISH,
    // Survey (no delete)
    PERMISSION.SURVEY_CREATE,
    PERMISSION.SURVEY_READ,
    PERMISSION.SURVEY_UPDATE,
    PERMISSION.SURVEY_PUBLISH,
    // Participants & Product Testing (no delete)
    PERMISSION.PARTICIPANTS_READ,
    PERMISSION.PARTICIPANTS_RECRUIT,
    PERMISSION.PRODUCT_TESTING_CREATE,
    PERMISSION.PRODUCT_TESTING_READ,
    PERMISSION.PRODUCT_TESTING_UPDATE,
    // Reports (read + export)
    PERMISSION.REPORTS_READ,
    PERMISSION.REPORTS_EXPORT,
  ],

  /**
   * VIEWER — Read-only stakeholder.
   * Can only observe; cannot create, update, delete, publish, invite, or manage anything.
   */
  'ORGANIZATION:VIEWER': [
    PERMISSION.ORGANIZATION_READ,
    PERMISSION.ORGANIZATION_MEMBERS_READ,
    PERMISSION.RESEARCH_READ,
    PERMISSION.SURVEY_READ,
    PERMISSION.PRODUCT_TESTING_READ,
    PERMISSION.REPORTS_READ,
  ],
};
