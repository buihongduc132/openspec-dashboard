# Requirements 07 — Dashboard & Analytics

> Read-mostly surfaces over the audit log + filesystem state. **All analytics depend on the
> audit log shipping in Phase 0** (per plan). INV-8 applies to activity feeds.

## 7.1 Project overview dashboard

**Shall:** Single project landing: active changes count, specs count, archived changes
count, task completion %, validation status, last activity, top contributors.

**AC:**
- (a) Counts reconcile with the file system within the refresh window.
- (b) Click-through from any tile to the scoped list view.

## 7.2 Multi-project overview

**Shall:** Cross-project dashboard: per-project cards with the same metrics, plus org-level
rollups.

**AC:**
- (a) Sort/filter by health, activity, owner.
- (b) Heatmap of activity by day.

## 7.3 Change activity timeline

**Shall:** Chronological feed within a project: change created, artifact edited, task
completed, validation run, archive, restore. Sourced from the audit log.

**AC:**
- (a) Each event deep-links to the affected entity.
- (b) Filter by event type, actor, change.

## 7.4 Spec coverage

**Shall:** Heatmap of spec domains × metric (requirement count, scenario count, active
changes touching, validation errors). Identifies over- and under-specified domains.

**AC:**
- (a) Drill-down to the domain's spec view.
- (b) "Cold spots" (zero requirements) and "hot spots" (>10 active changes) flagged.

## 7.5 Task velocity

**Shall:** Burn-down / burn-up chart per change and per project. Velocity = tasks completed
per day/week.

**AC:**
- (a) Sourced from audit-log completion events (Phase 0).
- (b) Configurable window (last 7/30/90 days).

## 7.6 Archive analytics

**Shall:** Archive frequency, average change duration (creation → archive), most-modified
spec domains across archives.

**AC:**
- (a) Sourced from `changes/archive/` + git history.
- (b) "Slowest changes" leaderboard to surface bottlenecks.

## 7.7 Contributor analytics

**Shall:** Per-user: tasks completed, changes archived, specs authored, validation errors
introduced vs resolved.

**AC:**
- (a) Attribution from audit log; "unattributed" bucket for CLI-only actions.
- (b) Privacy-respecting: configurable anonymity mode for display.

**Non-goals:** performance reviews, gamification badges.
