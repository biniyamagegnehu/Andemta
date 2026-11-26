# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: organization-management.spec.ts >> Phase 5.2 Organization Registration and Management E2E >> owner can update organization details and changes persist across reload
- Location: e2e\organization-management.spec.ts:81:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Test source

```ts
  136 |   });
  137 | 
  138 |   await prisma.userSystemRole.createMany({
  139 |     data: [
  140 |       { userId: biniyam.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
  141 |       { userId: viewerUser.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
  142 |       { userId: orgAdminUser.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
  143 |       { userId: platformAdminUser.id, roleId: sysAdmin.id, roleScope: RoleScope.SYSTEM },
  144 |       { userId: suspendedMemberUser.id, roleId: sysParticipant.id, roleScope: RoleScope.SYSTEM },
  145 |     ],
  146 |   });
  147 | 
  148 |   await prisma.organizationMembership.createMany({
  149 |     data: [
  150 |       // Biniyam: OWNER in Shewa Fashion, RESEARCHER in Debre Berhan University
  151 |       {
  152 |         organizationId: shewa.id,
  153 |         userId: biniyam.id,
  154 |         roleId: orgOwner.id,
  155 |         roleScope: RoleScope.ORGANIZATION,
  156 |         status: MembershipStatus.ACTIVE,
  157 |       },
  158 |       {
  159 |         organizationId: dbu.id,
  160 |         userId: biniyam.id,
  161 |         roleId: orgResearcher.id,
  162 |         roleScope: RoleScope.ORGANIZATION,
  163 |         status: MembershipStatus.ACTIVE,
  164 |       },
  165 |       // Viewer in Shewa Fashion
  166 |       {
  167 |         organizationId: shewa.id,
  168 |         userId: viewerUser.id,
  169 |         roleId: orgViewer.id,
  170 |         roleScope: RoleScope.ORGANIZATION,
  171 |         status: MembershipStatus.ACTIVE,
  172 |       },
  173 |       // Org Admin in Shewa Fashion
  174 |       {
  175 |         organizationId: shewa.id,
  176 |         userId: orgAdminUser.id,
  177 |         roleId: orgAdmin.id,
  178 |         roleScope: RoleScope.ORGANIZATION,
  179 |         status: MembershipStatus.ACTIVE,
  180 |       },
  181 |       // Suspended member in Shewa Fashion
  182 |       {
  183 |         organizationId: shewa.id,
  184 |         userId: suspendedMemberUser.id,
  185 |         roleId: orgOwner.id,
  186 |         roleScope: RoleScope.ORGANIZATION,
  187 |         status: MembershipStatus.SUSPENDED,
  188 |       },
  189 |     ],
  190 |   });
  191 | 
  192 |   const cleanup = async () => {
  193 |     await prisma.organizationMembership.deleteMany({
  194 |       where: { organizationId: { in: createdOrgIds } },
  195 |     });
  196 |     await prisma.organization.deleteMany({
  197 |       where: { id: { in: createdOrgIds } },
  198 |     });
  199 |     await prisma.session.deleteMany({
  200 |       where: { userId: { in: createdUserIds } },
  201 |     });
  202 |     await prisma.userSystemRole.deleteMany({
  203 |       where: { userId: { in: createdUserIds } },
  204 |     });
  205 |     await prisma.user.deleteMany({
  206 |       where: { id: { in: createdUserIds } },
  207 |     });
  208 |     await prisma.$disconnect();
  209 |   };
  210 | 
  211 |   return {
  212 |     biniyam,
  213 |     viewerUser,
  214 |     orgAdminUser,
  215 |     platformAdminUser,
  216 |     suspendedMemberUser,
  217 |     shewaFashionId: shewa.id,
  218 |     debreBerhanId: dbu.id,
  219 |     unrelatedOrgId: unrelated.id,
  220 |     cleanup,
  221 |   };
  222 | }
  223 | 
  224 | /**
  225 |  * Logs in a test user through the real /login UI form and waits for navigation.
  226 |  */
  227 | export async function loginViaUi(
  228 |   page: Page,
  229 |   user: TestUserFixture,
  230 |   expectedPathPrefix = '/dashboard',
  231 | ): Promise<void> {
  232 |   await page.goto(`/login?returnUrl=${encodeURIComponent(expectedPathPrefix)}`);
  233 |   await page.getByLabel('Email address').fill(user.email);
  234 |   await page.getByLabel('Password', { exact: true }).fill(user.password);
  235 |   await page.getByRole('button', { name: /sign in/i }).click();
> 236 |   await page.waitForURL((url) => url.pathname.startsWith(expectedPathPrefix), {
      |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  237 |     timeout: 15_000,
  238 |   });
  239 | }
  240 | 
```