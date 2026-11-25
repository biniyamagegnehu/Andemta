/**
 * Centralized, strongly typed permission catalog for the Andemta RBAC system.
 *
 * Convention: resource.action (underscores within resource names, dots as separators)
 * These codes are the single source of truth and must exactly match the database values
 * seeded by prisma/rbac-data.ts.
 *
 * @module permissions
 */

export const PERMISSION = {
  // ---------------------------------------------------------------------------
  // Platform & User Management
  // ---------------------------------------------------------------------------
  /** View user accounts and platform identity profiles. */
  USERS_READ: 'users.read',
  /** Manage platform user statuses and system-level restrictions. */
  USERS_MANAGE: 'users.manage',
  /** Full platform administrative control and configuration. */
  PLATFORM_ADMIN: 'platform.admin',
  /** Inspect platform-wide audit and security event logs. */
  PLATFORM_AUDIT_READ: 'platform.audit.read',
  /** Monitor platform-level operational and research volume metrics. */
  PLATFORM_METRICS_READ: 'platform.metrics.read',

  // ---------------------------------------------------------------------------
  // Organization Management
  // ---------------------------------------------------------------------------
  /** View organization details, public profile, and status. */
  ORGANIZATION_READ: 'organization.read',
  /** Update organization profile, branding, and preferences. */
  ORGANIZATION_UPDATE: 'organization.update',
  /** Permanently decommission or delete an organization. */
  ORGANIZATION_DELETE: 'organization.delete',
  /** Manage organization subscription tiers, invoices, and billing instruments. */
  ORGANIZATION_BILLING_MANAGE: 'organization.billing.manage',

  // ---------------------------------------------------------------------------
  // Organization Membership Management
  // ---------------------------------------------------------------------------
  /** View member rosters and roles within an organization. */
  ORGANIZATION_MEMBERS_READ: 'organization.members.read',
  /** Invite new members and researchers into an organization. */
  ORGANIZATION_MEMBERS_INVITE: 'organization.members.invite',
  /** Modify member roles and statuses within an organization. */
  ORGANIZATION_MEMBERS_UPDATE: 'organization.members.update',
  /** Revoke membership and remove members from an organization. */
  ORGANIZATION_MEMBERS_REMOVE: 'organization.members.remove',

  // ---------------------------------------------------------------------------
  // Research Project Management
  // ---------------------------------------------------------------------------
  /** Create new research studies and project scopes. */
  RESEARCH_CREATE: 'research.create',
  /** View research study designs, targets, and criteria. */
  RESEARCH_READ: 'research.read',
  /** Edit and maintain research study configurations. */
  RESEARCH_UPDATE: 'research.update',
  /** Delete draft or archived research studies. */
  RESEARCH_DELETE: 'research.delete',
  /** Launch or publish research studies into active field status. */
  RESEARCH_PUBLISH: 'research.publish',

  // ---------------------------------------------------------------------------
  // Survey Management
  // ---------------------------------------------------------------------------
  /** Author questionnaires, survey logic, and response forms. */
  SURVEY_CREATE: 'survey.create',
  /** View survey instruments and questions. */
  SURVEY_READ: 'survey.read',
  /** Edit survey structures and parameters. */
  SURVEY_UPDATE: 'survey.update',
  /** Remove draft or unlaunched surveys. */
  SURVEY_DELETE: 'survey.delete',
  /** Activate surveys for participant data collection. */
  SURVEY_PUBLISH: 'survey.publish',
  /** Submit responses to active research surveys as a participant. */
  SURVEY_RESPOND: 'survey.respond',

  // ---------------------------------------------------------------------------
  // Participant Management
  // ---------------------------------------------------------------------------
  /** View anonymized participant pool demographics and availability. */
  PARTICIPANTS_READ: 'participants.read',
  /** Screen, recruit, and assign targeted participants to studies. */
  PARTICIPANTS_RECRUIT: 'participants.recruit',

  // ---------------------------------------------------------------------------
  // Product Testing
  // ---------------------------------------------------------------------------
  /** Create product testing campaigns, briefs, and logistics. */
  PRODUCT_TESTING_CREATE: 'product_testing.create',
  /** View product testing briefs, requirements, and protocols. */
  PRODUCT_TESTING_READ: 'product_testing.read',
  /** Modify product testing campaign configurations. */
  PRODUCT_TESTING_UPDATE: 'product_testing.update',
  /** Delete draft or archived product testing campaigns. */
  PRODUCT_TESTING_DELETE: 'product_testing.delete',
  /** Participate in physical or digital product testing sessions. */
  PRODUCT_TESTING_PARTICIPATE: 'product_testing.participate',

  // ---------------------------------------------------------------------------
  // Reports and Analytics
  // ---------------------------------------------------------------------------
  /** View aggregated research analytics, insights, and summaries. */
  REPORTS_READ: 'reports.read',
  /** Export anonymized raw survey datasets and analytical reports. */
  REPORTS_EXPORT: 'reports.export',

  // ---------------------------------------------------------------------------
  // Payments and Rewards
  // ---------------------------------------------------------------------------
  /** Authorize incentive allocations and participant payouts. */
  REWARDS_DISTRIBUTE: 'rewards.distribute',
  /** View incentive transaction records, escrow logs, and payout histories. */
  REWARDS_READ: 'rewards.read',
  /** Claim earned incentives and initiate participant reward withdrawals. */
  REWARDS_CLAIM: 'rewards.claim',
} as const;

/**
 * Union type of all valid permission code strings.
 * Derived from the PERMISSION constant to ensure compile-time consistency.
 */
export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION];

/**
 * Array of all permission codes — useful for validation and iteration.
 */
export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(
  PERMISSION,
) as PermissionCode[];

/**
 * Type guard: returns true if the given string is a valid PermissionCode.
 */
export function isValidPermissionCode(value: string): value is PermissionCode {
  return ALL_PERMISSION_CODES.includes(value as PermissionCode);
}
