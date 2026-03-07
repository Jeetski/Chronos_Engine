# Task Checklist - Scheduler 2.0 (Kairos)
_Truth-sync validated: 2026-02-28_

Notes:
- Split DB work is implemented, but not exactly as early planning phrased it.
- Actual implementation uses `modules/Sequence/*_builder.py` + registry wiring, not a single monolithic migration step.

## Phase 1: Infrastructure (The Foundation)
- [x] Implement `modules/Sequence/sync_core.py` / core builder pipeline to populate `chronos_core.db` <!-- id: 1 -->
- [x] Add startup core sync hook to `modules/Console.py` <!-- id: 2 -->
- [x] Add reactive core upsert hook to `ItemManager.write_item_data` <!-- id: 3 -->
- [ ] Verify DB Synchronization (Manual Test + checklist artifact) <!-- id: 4 -->
- [x] Split memory responsibilities into `chronos_behavior.db` + `chronos_journal.db` builders (implemented via Sequence builders/registry) <!-- id: 20 -->

## Phase 2: The Item Classes (The Bricks)
- [x] Create `modules/Chore` (Merged into `Habit` module) <!-- id: 5 -->
- [x] Refactor `modules/Commitment` to observer-only rules (no generated instances) <!-- id: 6 -->
- [x] Implement `modules/Timeblock` with `consumable_by` properties <!-- id: 7 -->
- [x] Create `modules/Window` definition and helper functions <!-- id: 8 -->

## Phase 3: The Engine (The Builder)
- [x] Scaffold `modules/Scheduler/Kairos.py` <!-- id: 9 -->
- [x] Implement `Step 1: Gather & Filter` (Physics & Context) <!-- id: 10 -->
- [x] Implement `Step 2: Scoring Engine` (Weights) <!-- id: 11 -->
- [ ] **CRITICAL**: Fix Import Collision naming ambiguity (`Scheduler.py` vs `modules/Scheduler/`) / document final canonical import style <!-- id: 21 -->
- [x] Implement `Step 3: Construction` (Integrated with Day Templates) <!-- id: 12 -->
- [x] Implement `Step 4: Explanation` (Decision Log + YAML companion log) <!-- id: 13 -->

## Phase 3.5: The Weekly Skeleton (The Forecast)
- [x] Implement `modules/Scheduler/WeeklyGenerator.py` <!-- id: 17 -->
- [x] Create `generate_skeleton(days=7)` logic <!-- id: 18 -->
- [x] Implement Load Balancer for Commitments (recommended day distribution) <!-- id: 19 -->

## Phase 4: Integration (The UI)
- [x] Add `kairos` mode to `Commands/Today.py` (plus Kairos-first default path when not `legacy`) <!-- id: 14 -->
- [x] Implement prioritize/ignore-trends controls (token + property parser paths) <!-- id: 15 -->
- [x] Verify End-to-End Scheduler Generation (tests + active dashboard wiring) <!-- id: 16 -->
