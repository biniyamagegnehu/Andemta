import { RoleScope } from '@prisma/client';

export interface RoleDefinition {
  scope: RoleScope;
  code: string;
  name: string;
  description: string;
}

export interface PermissionDefinition {
  code: string;
  name: string;
  description: string;
}

/**
 * Built-in platform system roles (apply platform-wide).
 */
export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    scope: RoleScope.SYSTEM,
    code: 'PARTICIPANT',
    name: 'Platform Participant',
    description:
      'General consumer research participant capable of taking surveys, participating in product tests, and claiming rewards.',
  },
  {
    scope: RoleScope.SYSTEM,
    code: 'ADMIN',
    name: 'Platform Administrator',
    description:
      'Global platform administrator with oversight, user moderation, and operational control.',
  },
];

/**
 * Built-in organization-scoped roles (apply strictly within an organization).
 */
export const ORGANIZATION_ROLES: RoleDefinition[] = [
  {
    scope: RoleScope.ORGANIZATION,
    code: 'OWNER',
    name: 'Organization Owner',
    description:
      'Full administrative, research, and financial ownership of the organization, projects, and rosters.',
  },
  {
    scope: RoleScope.ORGANIZATION,
    code: 'ADMIN',
    name: 'Organization Administrator',
    description:
      'Delegated organizational management across research studies, rosters, and operational settings.',
  },
  {
    scope: RoleScope.ORGANIZATION,
    code: 'RESEARCHER',
    name: 'Organization Researcher',
    description:
      'Research practitioner authorized to author, publish, and analyze research projects and surveys.',
  },
  {
    scope: RoleScope.ORGANIZATION,
    code: 'VIEWER',
    name: 'Organization Viewer',
    description:
      'Read-only stakeholder authorized to view organization projects, designs, and aggregated insights.',
  },
];

/**
 * Initial resource-action permission catalog.
 */
export const INITIAL_PERMISSIONS: PermissionDefinition[] = [
  // Platform & User Management
  {
    code: 'users.read',
    name: 'Read User Profiles',
    description: 'View user accounts and platform identity profiles.',
  },
  {
    code: 'users.manage',
    name: 'Manage Users',
    description: 'Manage platform user statuses and system-level restrictions.',
  },
  {
    code: 'platform.admin',
    name: 'Platform Administration',
    description: 'Full platform administrative control and configuration.',
  },
  {
    code: 'platform.audit.read',
    name: 'Read Audit Logs',
    description: 'Inspect platform-wide audit and security event logs.',
  },
  {
    code: 'platform.metrics.read',
    name: 'Read Platform Metrics',
    description: 'Monitor platform-level operational and research volume metrics.',
  },

  // Organization Management
  {
    code: 'organization.read',
    name: 'Read Organization',
    description: 'View organization details, public profile, and status.',
  },
  {
    code: 'organization.update',
    name: 'Update Organization',
    description: 'Update organization profile, branding, and preferences.',
  },
  {
    code: 'organization.delete',
    name: 'Delete Organization',
    description: 'Permanently decommission or delete an organization.',
  },
  {
    code: 'organization.billing.manage',
    name: 'Manage Billing',
    description: 'Manage organization subscription tiers, invoices, and billing instruments.',
  },

  // Organization Membership Management
  {
    code: 'organization.members.read',
    name: 'Read Members',
    description: 'View member rosters and roles within an organization.',
  },
  {
    code: 'organization.members.invite',
    name: 'Invite Members',
    description: 'Invite new members and researchers into an organization.',
  },
  {
    code: 'organization.members.update',
    name: 'Update Member Roles',
    description: 'Modify member roles and statuses within an organization.',
  },
  {
    code: 'organization.members.remove',
    name: 'Remove Members',
    description: 'Revoke membership and remove members from an organization.',
  },

  // Research Project Management
  {
    code: 'research.create',
    name: 'Create Research',
    description: 'Create new research studies and project scopes.',
  },
  {
    code: 'research.read',
    name: 'Read Research',
    description: 'View research study designs, targets, and criteria.',
  },
  {
    code: 'research.update',
    name: 'Update Research',
    description: 'Edit and maintain research study configurations.',
  },
  {
    code: 'research.delete',
    name: 'Delete Research',
    description: 'Delete draft or archived research studies.',
  },
  {
    code: 'research.publish',
    name: 'Publish Research',
    description: 'Launch or publish research studies into active field status.',
  },

  // Survey Management
  {
    code: 'survey.create',
    name: 'Create Survey',
    description: 'Author questionnaires, survey logic, and response forms.',
  },
  {
    code: 'survey.read',
    name: 'Read Survey',
    description: 'View survey instruments and questions.',
  },
  {
    code: 'survey.update',
    name: 'Update Survey',
    description: 'Edit survey structures and parameters.',
  },
  {
    code: 'survey.delete',
    name: 'Delete Survey',
    description: 'Remove draft or unlaunched surveys.',
  },
  {
    code: 'survey.publish',
    name: 'Publish Survey',
    description: 'Activate surveys for participant data collection.',
  },
  {
    code: 'survey.respond',
    name: 'Respond to Survey',
    description: 'Submit responses to active research surveys as a participant.',
  },

  // Participant Management
  {
    code: 'participants.read',
    name: 'Read Participants',
    description: 'View anonymized participant pool demographics and availability.',
  },
  {
    code: 'participants.recruit',
    name: 'Recruit Participants',
    description: 'Screen, recruit, and assign targeted participants to studies.',
  },

  // Product Testing
  {
    code: 'product_testing.create',
    name: 'Create Product Test',
    description: 'Create product testing campaigns, briefs, and logistics.',
  },
  {
    code: 'product_testing.read',
    name: 'Read Product Test',
    description: 'View product testing briefs, requirements, and protocols.',
  },
  {
    code: 'product_testing.update',
    name: 'Update Product Test',
    description: 'Modify product testing campaign configurations.',
  },
  {
    code: 'product_testing.delete',
    name: 'Delete Product Test',
    description: 'Delete draft or archived product testing campaigns.',
  },
  {
    code: 'product_testing.participate',
    name: 'Participate in Product Test',
    description: 'Participate in physical or digital product testing sessions.',
  },

  // Reports and Analytics
  {
    code: 'reports.read',
    name: 'Read Reports',
    description: 'View aggregated research analytics, insights, and summaries.',
  },
  {
    code: 'reports.export',
    name: 'Export Reports',
    description: 'Export anonymized raw survey datasets and analytical reports.',
  },

  // Payments and Rewards
  {
    code: 'rewards.distribute',
    name: 'Distribute Rewards',
    description: 'Authorize incentive allocations and participant payouts.',
  },
  {
    code: 'rewards.read',
    name: 'Read Rewards',
    description: 'View incentive transaction records, escrow logs, and payout histories.',
  },
  {
    code: 'rewards.claim',
    name: 'Claim Rewards',
    description: 'Claim earned incentives and initiate participant reward withdrawals.',
  },
];

/**
 * Mapping of initial roles to their granted permissions based on the Principle of Least Privilege.
 */
export const ROLE_PERMISSION_MAPPINGS: Record<
  string, // Key format: `${scope}:${code}`
  string[] // Array of permission codes
> = {
  // ---------------------------------------------------------------------------
  // SYSTEM ROLES
  // ---------------------------------------------------------------------------
  'SYSTEM:PARTICIPANT': [
    'survey.respond',
    'product_testing.participate',
    'rewards.claim',
  ],

  'SYSTEM:ADMIN': [
    'users.read',
    'users.manage',
    'platform.admin',
    'platform.audit.read',
    'platform.metrics.read',
    'organization.read',
    'research.read',
    'survey.read',
    'reports.read',
    'rewards.read',
  ],

  // ---------------------------------------------------------------------------
  // ORGANIZATION ROLES
  // ---------------------------------------------------------------------------
  'ORGANIZATION:OWNER': [
    // Organization
    'organization.read',
    'organization.update',
    'organization.delete',
    'organization.billing.manage',
    // Members
    'organization.members.read',
    'organization.members.invite',
    'organization.members.update',
    'organization.members.remove',
    // Research
    'research.create',
    'research.read',
    'research.update',
    'research.delete',
    'research.publish',
    // Survey
    'survey.create',
    'survey.read',
    'survey.update',
    'survey.delete',
    'survey.publish',
    // Participants & Product Testing
    'participants.read',
    'participants.recruit',
    'product_testing.create',
    'product_testing.read',
    'product_testing.update',
    'product_testing.delete',
    // Reports & Rewards
    'reports.read',
    'reports.export',
    'rewards.distribute',
    'rewards.read',
  ],

  'ORGANIZATION:ADMIN': [
    // Organization (cannot delete organization)
    'organization.read',
    'organization.update',
    'organization.billing.manage',
    // Members
    'organization.members.read',
    'organization.members.invite',
    'organization.members.update',
    'organization.members.remove',
    // Research
    'research.create',
    'research.read',
    'research.update',
    'research.delete',
    'research.publish',
    // Survey
    'survey.create',
    'survey.read',
    'survey.update',
    'survey.delete',
    'survey.publish',
    // Participants & Product Testing
    'participants.read',
    'participants.recruit',
    'product_testing.create',
    'product_testing.read',
    'product_testing.update',
    'product_testing.delete',
    // Reports & Rewards
    'reports.read',
    'reports.export',
    'rewards.distribute',
    'rewards.read',
  ],

  'ORGANIZATION:RESEARCHER': [
    // Organization (read-only member list and org profile)
    'organization.read',
    'organization.members.read',
    // Research
    'research.create',
    'research.read',
    'research.update',
    'research.publish',
    // Survey
    'survey.create',
    'survey.read',
    'survey.update',
    'survey.publish',
    // Participants & Product Testing
    'participants.read',
    'participants.recruit',
    'product_testing.create',
    'product_testing.read',
    'product_testing.update',
    // Reports
    'reports.read',
    'reports.export',
  ],

  'ORGANIZATION:VIEWER': [
    // Read-only observer
    'organization.read',
    'organization.members.read',
    'research.read',
    'survey.read',
    'product_testing.read',
    'reports.read',
  ],
};
