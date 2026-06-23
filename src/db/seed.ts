import { db } from "./index";
import {
  projects,
  specDomains,
  specs,
  requirements,
  scenarios,
  changes,
  artifacts,
  tasks,
  schemas,
  schemaArtifacts,
  contextStores,
  initiatives,
  workspaces,
  workspaceLinks,
} from "./schema";

async function seed() {
  console.log("🌱 Seeding database...");

  // ─── Projects ──────────────────────────────────────────────────────────────
  // The first project uses a deterministic id ("seed-project-1") so CI
  // perf probes (k6 read-latency, index-freshness) can target it by a stable
  // identifier via K6_PROJECT_ID / FRESHNESS_PROJECT_ID env.
  const [proj] = await db
    .insert(projects)
    .values({
      id: "seed-project-1",
      name: "E-Commerce Platform",
      description: "Main e-commerce application with product catalog, cart, checkout, and user management.",
      rootPath: "/repos/ecommerce-platform",
      defaultSchema: "spec-driven",
      context: `Tech stack: TypeScript, Next.js 15, React 19, PostgreSQL, Tailwind CSS
API style: RESTful with OpenAPI specs
Testing: Jest + Playwright
We value performance, accessibility, and backwards compatibility.`,
      configYaml: `schema: spec-driven
context: |
  Tech stack: TypeScript, Next.js 15, React 19, PostgreSQL
rules:
  proposal:
    - Include rollback plan
    - Identify affected teams
  specs:
    - Use Given/When/Then format
    - Reference existing patterns`,
    })
    .returning();

  const [proj2] = await db
    .insert(projects)
    .values({
      name: "Auth Service",
      description: "Centralized authentication and authorization microservice.",
      rootPath: "/repos/auth-service",
      defaultSchema: "spec-driven",
      context: `Tech stack: Go, gRPC, Redis, PostgreSQL
Auth: OAuth2, OIDC, JWT
Rate limiting: 1000 req/s per tenant`,
    })
    .returning();

  // ─── Spec Domains ──────────────────────────────────────────────────────────
  const [authDomain] = await db
    .insert(specDomains)
    .values({ projectId: proj.id, name: "auth", purpose: "Authentication and session management" })
    .returning();

  const [uiDomain] = await db
    .insert(specDomains)
    .values({ projectId: proj.id, name: "ui", purpose: "UI behavior, theming, and accessibility" })
    .returning();

  const [paymentsDomain] = await db
    .insert(specDomains)
    .values({ projectId: proj.id, name: "payments", purpose: "Payment processing and billing" })
    .returning();

  const [apiDomain] = await db
    .insert(specDomains)
    .values({ projectId: proj2.id, name: "api", purpose: "REST API contracts and endpoints" })
    .returning();

  // ─── Specs ─────────────────────────────────────────────────────────────────
  const [authSpec] = await db
    .insert(specs)
    .values({
      domainId: authDomain.id,
      content: `# Auth Specification

## Purpose
Authentication and session management for the application.

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

### Requirement: Session Expiration
The system MUST expire sessions after 30 minutes of inactivity.

### Requirement: Password Policy
The system SHALL enforce minimum password complexity requirements.`,
    })
    .returning();

  const [uiSpec] = await db
    .insert(specs)
    .values({
      domainId: uiDomain.id,
      content: `# UI Specification

## Purpose
User interface behavior, theming, and accessibility standards.

## Requirements

### Requirement: Responsive Layout
The system SHALL adapt to all screen sizes from 320px to 2560px.

### Requirement: Keyboard Navigation
The system MUST support full keyboard navigation for all interactive elements.`,
    })
    .returning();

  const [paymentsSpec] = await db
    .insert(specs)
    .values({
      domainId: paymentsDomain.id,
      content: `# Payments Specification

## Purpose
Payment processing, invoicing, and billing management.

## Requirements

### Requirement: Payment Processing
The system SHALL process credit card, debit card, and digital wallet payments.

### Requirement: Refund Handling
The system MUST support full and partial refunds within 90 days of purchase.`,
    })
    .returning();

  // ─── Requirements ──────────────────────────────────────────────────────────
  const [req1] = await db
    .insert(requirements)
    .values({ specId: authSpec.id, title: "User Authentication", body: "The system SHALL issue a JWT token upon successful login.", strength: "SHALL", orderIndex: 1 })
    .returning();

  const [req2] = await db
    .insert(requirements)
    .values({ specId: authSpec.id, title: "Session Expiration", body: "The system MUST expire sessions after 30 minutes of inactivity.", strength: "MUST", orderIndex: 2 })
    .returning();

  const [req3] = await db
    .insert(requirements)
    .values({ specId: authSpec.id, title: "Password Policy", body: "The system SHALL enforce minimum password complexity: 12+ characters, uppercase, lowercase, number, special char.", strength: "SHALL", orderIndex: 3 })
    .returning();

  const [req4] = await db
    .insert(requirements)
    .values({ specId: uiSpec.id, title: "Responsive Layout", body: "The system SHALL adapt to all screen sizes from 320px to 2560px using fluid layouts.", strength: "SHALL", orderIndex: 1 })
    .returning();

  const [req5] = await db
    .insert(requirements)
    .values({ specId: uiSpec.id, title: "Keyboard Navigation", body: "The system MUST support full keyboard navigation for all interactive elements including WCAG 2.1 AA compliance.", strength: "MUST", orderIndex: 2 })
    .returning();

  const [req6] = await db
    .insert(requirements)
    .values({ specId: paymentsSpec.id, title: "Payment Processing", body: "The system SHALL process credit card, debit card, and digital wallet payments via Stripe.", strength: "SHALL", orderIndex: 1 })
    .returning();

  // ─── Scenarios ─────────────────────────────────────────────────────────────
  await db.insert(scenarios).values([
    { requirementId: req1.id, title: "Valid credentials", given: "a user with valid email and password", when: "the user submits the login form", then: "a JWT token is returned and the user is redirected to dashboard", orderIndex: 1 },
    { requirementId: req1.id, title: "Invalid credentials", given: "a user with invalid credentials", when: "the user submits the login form", then: "an error message is displayed and no token is issued", orderIndex: 2 },
    { requirementId: req2.id, title: "Idle timeout", given: "an authenticated session", when: "30 minutes pass without activity", then: "the session is invalidated and the user must re-authenticate", orderIndex: 1 },
    { requirementId: req4.id, title: "Mobile viewport", given: "a user on a 375px wide device", when: "the page loads", then: "all content is visible and usable without horizontal scrolling", orderIndex: 1 },
    { requirementId: req5.id, title: "Tab navigation", given: "a user on any page", when: "the user presses Tab repeatedly", then: "focus moves through all interactive elements in logical order", orderIndex: 1 },
    { requirementId: req6.id, title: "Successful card payment", given: "a user with a valid credit card", when: "the user submits payment at checkout", then: "the payment is processed and an order confirmation is shown", orderIndex: 1 },
  ]);

  // ─── Changes ───────────────────────────────────────────────────────────────
  const [change1] = await db
    .insert(changes)
    .values({ projectId: proj.id, name: "add-dark-mode", schema: "spec-driven", status: "in-progress", description: "Add dark mode theme support across the entire application" })
    .returning();

  const [change2] = await db
    .insert(changes)
    .values({ projectId: proj.id, name: "add-2fa-auth", schema: "spec-driven", status: "proposed", description: "Implement two-factor authentication using TOTP" })
    .returning();

  const [change3] = await db
    .insert(changes)
    .values({ projectId: proj.id, name: "fix-checkout-bug", schema: "spec-driven", status: "completed", description: "Fix cart total miscalculation when applying multiple discount codes" })
    .returning();

  const [change4] = await db
    .insert(changes)
    .values({ projectId: proj2.id, name: "add-oauth2-pkce", schema: "spec-driven", status: "proposed", description: "Add PKCE flow to OAuth2 implementation for public clients" })
    .returning();

  // ─── Artifacts ─────────────────────────────────────────────────────────────
  await db.insert(artifacts).values([
    { changeId: change1.id, type: "proposal", content: `# Proposal: Add Dark Mode

## Intent
Users have requested a dark mode option to reduce eye strain during nighttime usage and match system preferences.

## Scope
**In scope:**
- Theme toggle in settings page
- System preference detection
- Persist preference in localStorage
- Update all components to use CSS variables

**Out of scope:**
- Custom color themes (future work)
- Per-page theme overrides

## Approach
Use CSS custom properties for theming with a React Context for state management. Detect system preference on first load, allow manual override.`, status: "done", outputPath: "proposal.md" },
    { changeId: change1.id, type: "specs", content: `# Delta for UI

## ADDED Requirements

### Requirement: Theme Selection
The system SHALL allow users to choose between light and dark themes.

#### Scenario: Manual toggle
- GIVEN a user on any page
- WHEN the user clicks the theme toggle
- THEN the theme switches immediately
- AND the preference persists across sessions`, status: "done", outputPath: "specs/ui/spec.md" },
    { changeId: change1.id, type: "design", content: `# Design: Add Dark Mode

## Technical Approach
Theme state managed via React Context to avoid prop drilling. CSS custom properties enable runtime switching without class toggling.

## Architecture Decisions
- Context over Redux: Simple binary state
- CSS Custom Properties: Browser-native, no runtime overhead`, status: "done", outputPath: "design.md" },
    { changeId: change1.id, type: "tasks", content: `# Tasks

## 1. Theme Infrastructure
- [x] 1.1 Create ThemeContext with light/dark state
- [x] 1.2 Add CSS custom properties for colors
- [ ] 1.3 Implement localStorage persistence
- [ ] 1.4 Add system preference detection

## 2. UI Components
- [ ] 2.1 Create ThemeToggle component
- [ ] 2.2 Add toggle to settings page
- [ ] 2.3 Update Header to include quick toggle

## 3. Styling
- [ ] 3.1 Define dark theme color palette
- [ ] 3.2 Update components to use CSS variables`, status: "draft", outputPath: "tasks.md" },
    { changeId: change2.id, type: "proposal", content: `# Proposal: Add Two-Factor Authentication

## Intent
Improve account security by requiring a second authentication factor.

## Scope
**In scope:**
- TOTP-based 2FA enrollment
- 2FA challenge during login
- Backup recovery codes

**Out of scope:**
- SMS-based 2FA
- Hardware key support`, status: "done", outputPath: "proposal.md" },
    { changeId: change2.id, type: "design", content: `# Design: Two-Factor Authentication

## Technical Approach
Use \`otplib\` for TOTP generation/validation. Store encrypted secrets per user. Generate 10 recovery codes on enrollment.`, status: "ready", outputPath: "design.md" },
    { changeId: change3.id, type: "proposal", content: `# Proposal: Fix Checkout Bug

## Intent
Fix cart total miscalculation when multiple discount codes are applied simultaneously.

## Scope
Fix the discount stacking logic in \`calculateCartTotal()\`.`, status: "done", outputPath: "proposal.md" },
    { changeId: change3.id, type: "tasks", content: `# Tasks

## 1. Fix Discount Logic
- [x] 1.1 Identify the root cause in calculateCartTotal
- [x] 1.2 Fix the discount stacking algorithm
- [x] 1.3 Add unit tests for edge cases`, status: "done", outputPath: "tasks.md" },
  ]);

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  await db.insert(tasks).values([
    // Change 1 - add-dark-mode tasks
    { changeId: change1.id, projectId: proj.id, groupTitle: "1. Theme Infrastructure", taskNumber: "1.1", title: "Create ThemeContext with light/dark state", description: "Create a React Context that manages theme state (light/dark/system) with provider component.", status: "done", assignee: "Alice", priority: "high", labels: JSON.stringify(["frontend", "core"]), orderIndex: 1, checked: true },
    { changeId: change1.id, projectId: proj.id, groupTitle: "1. Theme Infrastructure", taskNumber: "1.2", title: "Add CSS custom properties for colors", description: "Define CSS variables for all color tokens in both light and dark themes.", status: "done", assignee: "Alice", priority: "high", labels: JSON.stringify(["frontend", "styling"]), orderIndex: 2, checked: true },
    { changeId: change1.id, projectId: proj.id, groupTitle: "1. Theme Infrastructure", taskNumber: "1.3", title: "Implement localStorage persistence", description: "Save user theme preference to localStorage and restore on page load.", status: "in-progress", assignee: "Alice", priority: "medium", labels: JSON.stringify(["frontend"]), orderIndex: 3, checked: false },
    { changeId: change1.id, projectId: proj.id, groupTitle: "1. Theme Infrastructure", taskNumber: "1.4", title: "Add system preference detection", description: "Use prefers-color-scheme media query to detect OS-level theme preference.", status: "backlog", assignee: "Bob", priority: "medium", labels: JSON.stringify(["frontend"]), orderIndex: 4, checked: false },
    { changeId: change1.id, projectId: proj.id, groupTitle: "2. UI Components", taskNumber: "2.1", title: "Create ThemeToggle component", description: "Build a reusable toggle switch component for theme switching.", status: "backlog", assignee: "Carol", priority: "high", labels: JSON.stringify(["frontend", "component"]), orderIndex: 5, checked: false },
    { changeId: change1.id, projectId: proj.id, groupTitle: "2. UI Components", taskNumber: "2.2", title: "Add toggle to settings page", description: "Integrate ThemeToggle into the user settings/preferences page.", status: "backlog", assignee: "Carol", priority: "medium", labels: JSON.stringify(["frontend"]), orderIndex: 6, checked: false },
    { changeId: change1.id, projectId: proj.id, groupTitle: "2. UI Components", taskNumber: "2.3", title: "Update Header to include quick toggle", description: "Add a theme toggle icon in the application header for quick access.", status: "backlog", assignee: "Carol", priority: "low", labels: JSON.stringify(["frontend", "ui"]), orderIndex: 7, checked: false },
    { changeId: change1.id, projectId: proj.id, groupTitle: "3. Styling", taskNumber: "3.1", title: "Define dark theme color palette", description: "Create the complete dark color palette ensuring WCAG AA contrast ratios.", status: "backlog", assignee: "Alice", priority: "high", labels: JSON.stringify(["design", "accessibility"]), orderIndex: 8, checked: false },
    { changeId: change1.id, projectId: proj.id, groupTitle: "3. Styling", taskNumber: "3.2", title: "Update components to use CSS variables", description: "Refactor all component styles to use CSS custom properties instead of hardcoded colors.", status: "backlog", assignee: "Bob", priority: "medium", labels: JSON.stringify(["frontend", "refactor"]), orderIndex: 9, checked: false },
    // Change 2 - add-2fa-auth tasks
    { changeId: change2.id, projectId: proj.id, groupTitle: "1. Backend", taskNumber: "1.1", title: "Add TOTP secret generation endpoint", description: "Create API endpoint that generates and returns a TOTP secret with QR code.", status: "backlog", assignee: "Dave", priority: "high", labels: JSON.stringify(["backend", "security"]), orderIndex: 1, checked: false },
    { changeId: change2.id, projectId: proj.id, groupTitle: "1. Backend", taskNumber: "1.2", title: "Implement TOTP verification middleware", description: "Add middleware that validates TOTP codes during login when 2FA is enabled.", status: "backlog", assignee: "Dave", priority: "high", labels: JSON.stringify(["backend", "security"]), orderIndex: 2, checked: false },
    { changeId: change2.id, projectId: proj.id, groupTitle: "1. Backend", taskNumber: "1.3", title: "Generate recovery codes", description: "Generate 10 cryptographically secure recovery codes on 2FA enrollment.", status: "backlog", assignee: "Dave", priority: "medium", labels: JSON.stringify(["backend"]), orderIndex: 3, checked: false },
    { changeId: change2.id, projectId: proj.id, groupTitle: "2. Frontend", taskNumber: "2.1", title: "Create 2FA enrollment UI", description: "Build QR code display and verification code input UI.", status: "backlog", assignee: "Eve", priority: "high", labels: JSON.stringify(["frontend"]), orderIndex: 4, checked: false },
    { changeId: change2.id, projectId: proj.id, groupTitle: "2. Frontend", taskNumber: "2.2", title: "Add 2FA challenge to login flow", description: "Insert OTP input step in login flow when user has 2FA enabled.", status: "backlog", assignee: "Eve", priority: "high", labels: JSON.stringify(["frontend"]), orderIndex: 5, checked: false },
    // Change 3 - fix-checkout-bug tasks
    { changeId: change3.id, projectId: proj.id, groupTitle: "1. Fix Discount Logic", taskNumber: "1.1", title: "Identify the root cause in calculateCartTotal", description: "Debug and trace the discount stacking logic to find where miscalculation occurs.", status: "done", assignee: "Frank", priority: "urgent", labels: JSON.stringify(["bug", "backend"]), orderIndex: 1, checked: true },
    { changeId: change3.id, projectId: proj.id, groupTitle: "1. Fix Discount Logic", taskNumber: "1.2", title: "Fix the discount stacking algorithm", description: "Correct the logic so multiple percentage discounts don't compound incorrectly.", status: "done", assignee: "Frank", priority: "urgent", labels: JSON.stringify(["bug", "backend"]), orderIndex: 2, checked: true },
    { changeId: change3.id, projectId: proj.id, groupTitle: "1. Fix Discount Logic", taskNumber: "1.3", title: "Add unit tests for edge cases", description: "Add tests for: multiple percentage discounts, mixed percentage + fixed, maximum discount cap.", status: "done", assignee: "Frank", priority: "high", labels: JSON.stringify(["testing"]), orderIndex: 3, checked: true },
    // Change 4 - add-oauth2-pkce tasks
    { changeId: change4.id, projectId: proj2.id, groupTitle: "1. OAuth2 PKCE", taskNumber: "1.1", title: "Add code_verifier and code_challenge generation", description: "Implement PKCE code verifier and challenge generation per RFC 7636.", status: "backlog", assignee: "Grace", priority: "high", labels: JSON.stringify(["backend", "security"]), orderIndex: 1, checked: false },
    { changeId: change4.id, projectId: proj2.id, groupTitle: "1. OAuth2 PKCE", taskNumber: "1.2", title: "Update token endpoint to validate PKCE", description: "Modify token exchange to require and validate code_verifier.", status: "backlog", assignee: "Grace", priority: "high", labels: JSON.stringify(["backend"]), orderIndex: 2, checked: false },
    { changeId: change4.id, projectId: proj2.id, groupTitle: "1. OAuth2 PKCE", taskNumber: "1.3", title: "Update API documentation", description: "Document PKCE flow in OpenAPI spec with examples.", status: "backlog", assignee: "Grace", priority: "medium", labels: JSON.stringify(["docs"]), orderIndex: 3, checked: false },
  ]);

  // ─── Schemas ───────────────────────────────────────────────────────────────
  const [schema1] = await db
    .insert(schemas)
    .values({
      projectId: proj.id,
      name: "spec-driven",
      description: "The default spec-driven development workflow",
      source: "built-in",
      definition: `name: spec-driven\nversion: 1\nartifacts:\n  - id: proposal\n    generates: proposal.md\n    requires: []\n  - id: specs\n    generates: specs/**/*.md\n    requires: [proposal]\n  - id: design\n    generates: design.md\n    requires: [proposal]\n  - id: tasks\n    generates: tasks.md\n    requires: [specs, design]\n    apply:\n      requires: [tasks]\n      tracks: tasks.md`,
      isActive: true,
    })
    .returning();

  const [schema2] = await db
    .insert(schemas)
    .values({
      projectId: proj.id,
      name: "research-first",
      description: "Research before proposal, skip specs/design",
      source: "project",
      definition: `name: research-first\nversion: 1\nartifacts:\n  - id: research\n    generates: research.md\n    requires: []\n  - id: proposal\n    generates: proposal.md\n    requires: [research]\n  - id: tasks\n    generates: tasks.md\n    requires: [proposal]`,
      isActive: false,
    })
    .returning();

  // ─── Schema Artifacts ──────────────────────────────────────────────────────
  await db.insert(schemaArtifacts).values([
    { schemaId: schema1.id, artifactId: "proposal", generates: "proposal.md", requires: "[]", instruction: "Create a proposal that explains WHY this change is needed.", orderIndex: 0 },
    { schemaId: schema1.id, artifactId: "specs", generates: "specs/**/*.md", requires: '["proposal"]', orderIndex: 1 },
    { schemaId: schema1.id, artifactId: "design", generates: "design.md", requires: '["proposal"]', orderIndex: 2 },
    { schemaId: schema1.id, artifactId: "tasks", generates: "tasks.md", requires: '["specs", "design"]', instruction: "Create an implementation checklist with numbered tasks.", orderIndex: 3 },
    { schemaId: schema2.id, artifactId: "research", generates: "research.md", requires: "[]", instruction: "Research the problem space before proposing solutions.", orderIndex: 0 },
    { schemaId: schema2.id, artifactId: "proposal", generates: "proposal.md", requires: '["research"]', orderIndex: 1 },
    { schemaId: schema2.id, artifactId: "tasks", generates: "tasks.md", requires: '["proposal"]', orderIndex: 2 },
  ]);

  // ─── Context Stores & Initiatives ──────────────────────────────────────────
  const [cs1] = await db
    .insert(contextStores)
    .values({ name: "platform-context", path: "/repos/platform-context", hasGit: true })
    .returning();

  const [init1] = await db
    .insert(initiatives)
    .values({ contextStoreId: cs1.id, title: "Q1 Platform Launch", summary: "Core platform features for Q1 2025 release including auth, payments, and UI overhaul." })
    .returning();

  // ─── Workspace ─────────────────────────────────────────────────────────────
  const [ws1] = await db
    .insert(workspaces)
    .values({ name: "platform", opener: "github-copilot" })
    .returning();

  await db.insert(workspaceLinks).values([
    { workspaceId: ws1.id, projectId: proj.id, linkName: "ecommerce", localPath: "/repos/ecommerce-platform" },
    { workspaceId: ws1.id, projectId: proj2.id, linkName: "auth", localPath: "/repos/auth-service" },
  ]);

  console.log("✅ Seed complete!");
  console.log(`  Projects: 2`);
  console.log(`  Spec Domains: 4`);
  console.log(`  Requirements: 6`);
  console.log(`  Scenarios: 6`);
  console.log(`  Changes: 4`);
  console.log(`  Artifacts: 8`);
  console.log(`  Tasks: 18`);
  console.log(`  Schemas: 2`);
  console.log(`  Workspaces: 1`);
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
