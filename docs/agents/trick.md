# TRICK Protocol (Tiny Remote Interface Control Kit)
Last verified: 2026-03-08

TRICK is the dashboard UI control protocol for familiars.

## 1) Identifier Schema

Use canonical UI identifiers:

`type.name.element_name`

- `type`: `widget | view | panel | popup | gadget`
- `name`: lower snake_case scope name
- `element_name`: lower snake_case element id

Examples:
- `widget.timer.start_button`
- `view.editor.textbox`

Container-only target (no element):
- `widget.timer`

## 2) DSL Commands (v1)

- `OPEN <type.name>`
  - Ensure a target surface is visible/open.
- `CLOSE <type.name>`
  - Hide/close a target surface.
- `LIST <type.name>`
  - Return available elements for that surface.
- `GET <type.name.element_name>`
  - Read text/value/state from an element.
- `SET <type.name.element_name> <value>`
  - Set an editable element value.
- `TYPE <type.name.element_name> <text>`
  - Append typed text into an editable element.
- `COPY <type.name.element_name>`
  - Copy text/value from an element into the TRICK session clipboard.
- `PASTE <type.name.element_name>`
  - Paste the TRICK session clipboard into an editable element.
- `PRESS <type.name.element_name> <key>`
  - Send a small supported key action to an interactive element.
- `CLICK <type.name.element_name>`
  - Trigger a click interaction.
- `WAIT <predicate> [timeout_ms]`
  - Wait for async UI state changes before continuing.

Supported `WAIT` predicates in v1:
- `exists <target>`
- `visible <target>`
- `enabled <target>`
- `value <target> <expected>`
- `text_contains <target> <expected>`
- `gone <target>`

Typical `PRESS` keys in current rollout:
- `Enter`
- `Backspace`
- `Escape`
- `Ctrl+L` (terminal only)

## 3) Behavioral Contract

- Prefer TRICK for dashboard UI actions before fallback paths.
- Treat IDs as stable API contracts; labels are not stable identifiers.
- Always `WAIT` after actions that trigger async updates.
- For destructive actions, ask confirmation first unless user explicitly asked.
- If an action fails, report:
  1. command attempted
  2. failure reason
  3. recovery step

## 4) Pilot Surfaces

Current rollout scope:
- `widget.timer`
- `widget.today`
- `widget.terminal`
- `widget.item_manager`
- `widget.status`
- `widget.goal_tracker`
- `widget.milestones`
- `widget.commitments`
- `widget.rewards`
- `widget.achievements`
- `widget.habit_tracker`
- `widget.review`
- `widget.variables`
- `widget.resolution_tracker`
- `widget.notes`
- `widget.inventory_manager`
- `widget.profile`
- `widget.settings`
- `widget.sleep_settings`
- `widget.link`
- `widget.trends`
- `widget.admin`
- `widget.cockpit_minimap`
- `widget.debug_console`
- `widget.clock`
- `widget.journal`
- `widget.mp3_player`
- `widget.sticky_notes`

### Timer

Container:
- `widget.timer`

Elements:
- `widget.timer.title`
- `widget.timer.minimize_button`
- `widget.timer.close_button`
- `widget.timer.phase_text`
- `widget.timer.cycle_text`
- `widget.timer.status_text`
- `widget.timer.clock_text`
- `widget.timer.progress_text`
- `widget.timer.block_text`
- `widget.timer.queue_text`
- `widget.timer.confirmation_banner`
- `widget.timer.confirmation_text`
- `widget.timer.confirm_yes_button`
- `widget.timer.confirm_skip_today_button`
- `widget.timer.confirm_later_button`
- `widget.timer.confirm_start_over_button`
- `widget.timer.confirm_stretch_button`
- `widget.timer.profile_select`
- `widget.timer.cycles_input`
- `widget.timer.auto_advance_checkbox`
- `widget.timer.bind_type_input`
- `widget.timer.bind_name_input`
- `widget.timer.start_button`
- `widget.timer.start_day_button`
- `widget.timer.pause_resume_button`
- `widget.timer.cancel_button`
- `widget.timer.refresh_button`

### Today / Scheduler

Container:
- `widget.today`

Elements:
- `widget.today.title`
- `widget.today.minimize_button`
- `widget.today.close_button`
- `widget.today.refresh_button`
- `widget.today.reschedule_button`
- `widget.today.environment_slider`
- `widget.today.category_slider`
- `widget.today.happiness_slider`
- `widget.today.due_date_slider`
- `widget.today.deadline_slider`
- `widget.today.status_slider`
- `widget.today.priority_slider`
- `widget.today.template_slider`
- `widget.today.custom_property_key_input`
- `widget.today.custom_property_slider`
- `widget.today.balance_slider`
- `widget.today.enforcer_environment_scope_select`
- `widget.today.enforcer_environment_input`
- `widget.today.enforcer_template_day_input`
- `widget.today.enforcer_template_input`
- `widget.today.schedule_state_select`
- `widget.today.buffers_checkbox`
- `widget.today.timer_breaks_checkbox`
- `widget.today.sprints_checkbox`
- `widget.today.ignore_trends_checkbox`
- `widget.today.repair_trim_checkbox`
- `widget.today.repair_cut_checkbox`
- `widget.today.timer_profile_input`
- `widget.today.template_override_input`
- `widget.today.quickwins_input`
- `widget.today.repair_min_duration_input`
- `widget.today.repair_cut_threshold_input`
- `widget.today.status_threshold_input`
- `widget.today.preset_safe_button`
- `widget.today.preset_balanced_button`
- `widget.today.preset_aggressive_button`
- `widget.today.preset_hint_text`
- `widget.today.window_filter_rows`
- `widget.today.add_window_filter_row_button`
- `widget.today.calendar_context`
- `widget.today.calendar_day_label`
- `widget.today.calendar_day_note`
- `widget.today.status_text`
- `widget.today.selection_hint`

### Terminal

Container:
- `widget.terminal`

Elements:
- `widget.terminal.title`
- `widget.terminal.copy_button`
- `widget.terminal.minimize_button`
- `widget.terminal.close_button`
- `widget.terminal.output_text`
- `widget.terminal.identity_text`
- `widget.terminal.input_field`
- `widget.terminal.ghost_text`
- `widget.terminal.run_button`
- `widget.terminal.expand_checkbox`
- `widget.terminal.status_text`

### Item Manager

Container:
- `widget.item_manager`

Elements:
- `widget.item_manager.title`
- `widget.item_manager.minimize_button`
- `widget.item_manager.close_button`
- `widget.item_manager.type_select`
- `widget.item_manager.search_input`
- `widget.item_manager.search_button`
- `widget.item_manager.refresh_button`
- `widget.item_manager.new_button`
- `widget.item_manager.count_text`
- `widget.item_manager.list_container`
- `widget.item_manager.item_name_input`
- `widget.item_manager.yaml_input`
- `widget.item_manager.save_button`
- `widget.item_manager.copy_button`
- `widget.item_manager.rename_button`
- `widget.item_manager.delete_button`
- `widget.item_manager.status_text`

### Status

Container:
- `widget.status`

Elements:
- `widget.status.title`
- `widget.status.minimize_button`
- `widget.status.close_button`
- `widget.status.fields_container`
- `widget.status.update_button`
- `widget.status.status_text`

### Goal Tracker

Container:
- `widget.goal_tracker`

Elements:
- `widget.goal_tracker.title`
- `widget.goal_tracker.minimize_button`
- `widget.goal_tracker.close_button`
- `widget.goal_tracker.search_input`
- `widget.goal_tracker.search_button`
- `widget.goal_tracker.recalc_button`
- `widget.goal_tracker.refresh_button`
- `widget.goal_tracker.list_container`
- `widget.goal_tracker.goal_list`
- `widget.goal_tracker.goal_title_text`
- `widget.goal_tracker.goal_progress_bar`
- `widget.goal_tracker.goal_meta_text`
- `widget.goal_tracker.complete_primary_button`
- `widget.goal_tracker.focus_primary_button`
- `widget.goal_tracker.milestones_container`
- `widget.goal_tracker.status_text`

### Milestones

Container:
- `widget.milestones`

Elements:
- `widget.milestones.title`
- `widget.milestones.minimize_button`
- `widget.milestones.close_button`
- `widget.milestones.total_text`
- `widget.milestones.completed_text`
- `widget.milestones.in_progress_text`
- `widget.milestones.list_toggle_button`
- `widget.milestones.list_section`
- `widget.milestones.search_input`
- `widget.milestones.status_filter_select`
- `widget.milestones.project_filter_select`
- `widget.milestones.goal_filter_select`
- `widget.milestones.refresh_button`
- `widget.milestones.complete_primary_button`
- `widget.milestones.reset_primary_button`
- `widget.milestones.status_text`
- `widget.milestones.list_container`

### Commitments

Container:
- `widget.commitments`

Elements:
- `widget.commitments.title`
- `widget.commitments.evaluate_button`
- `widget.commitments.minimize_button`
- `widget.commitments.close_button`
- `widget.commitments.total_text`
- `widget.commitments.met_text`
- `widget.commitments.violations_text`
- `widget.commitments.list_toggle_button`
- `widget.commitments.list_section`
- `widget.commitments.search_input`
- `widget.commitments.status_filter_select`
- `widget.commitments.refresh_button`
- `widget.commitments.met_primary_button`
- `widget.commitments.violation_primary_button`
- `widget.commitments.clear_primary_button`
- `widget.commitments.status_text`
- `widget.commitments.list_container`

### Rewards

Container:
- `widget.rewards`

Elements:
- `widget.rewards.title`
- `widget.rewards.minimize_button`
- `widget.rewards.close_button`
- `widget.rewards.balance_text`
- `widget.rewards.ledger_container`
- `widget.rewards.list_toggle_button`
- `widget.rewards.list_section`
- `widget.rewards.search_input`
- `widget.rewards.ready_only_checkbox`
- `widget.rewards.refresh_button`
- `widget.rewards.redeem_primary_button`
- `widget.rewards.status_text`
- `widget.rewards.list_container`

### Achievements

Container:
- `widget.achievements`

Elements:
- `widget.achievements.title`
- `widget.achievements.minimize_button`
- `widget.achievements.close_button`
- `widget.achievements.total_text`
- `widget.achievements.awarded_text`
- `widget.achievements.pending_text`
- `widget.achievements.level_ring`
- `widget.achievements.level_text`
- `widget.achievements.level_meta_text`
- `widget.achievements.list_toggle_button`
- `widget.achievements.list_section`
- `widget.achievements.search_input`
- `widget.achievements.status_filter_select`
- `widget.achievements.title_select`
- `widget.achievements.set_title_button`
- `widget.achievements.refresh_button`
- `widget.achievements.award_primary_button`
- `widget.achievements.archive_primary_button`
- `widget.achievements.status_text`
- `widget.achievements.list_container`

### Habit Tracker

Container:
- `widget.habit_tracker`

Elements:
- `widget.habit_tracker.title`
- `widget.habit_tracker.search_input`
- `widget.habit_tracker.polarity_select`
- `widget.habit_tracker.refresh_button`
- `widget.habit_tracker.minimize_button`
- `widget.habit_tracker.close_button`
- `widget.habit_tracker.done_primary_button`
- `widget.habit_tracker.incident_primary_button`
- `widget.habit_tracker.summary_text`
- `widget.habit_tracker.status_text`
- `widget.habit_tracker.list_container`

### Review

Container:
- `widget.review`

Elements:
- `widget.review.title`
- `widget.review.minimize_button`
- `widget.review.close_button`
- `widget.review.type_select`
- `widget.review.period_input`
- `widget.review.this_button`
- `widget.review.generate_button`
- `widget.review.open_button`
- `widget.review.export_button`
- `widget.review.prev_button`
- `widget.review.next_button`
- `widget.review.expand_checkbox`
- `widget.review.status_text`
- `widget.review.log_text`

### Variables

Container:
- `widget.variables`

Elements:
- `widget.variables.title`
- `widget.variables.minimize_button`
- `widget.variables.close_button`
- `widget.variables.add_button`
- `widget.variables.save_button`
- `widget.variables.refresh_button`
- `widget.variables.grid_container`
- `widget.variables.status_text`

### Resolution Tracker

Container:
- `widget.resolution_tracker`

Elements:
- `widget.resolution_tracker.title`
- `widget.resolution_tracker.refresh_button`
- `widget.resolution_tracker.minimize_button`
- `widget.resolution_tracker.close_button`
- `widget.resolution_tracker.stats_text`
- `widget.resolution_tracker.list_container`
- `widget.resolution_tracker.status_text`

### Notes

Container:
- `widget.notes`

Elements:
- `widget.notes.title`
- `widget.notes.minimize_button`
- `widget.notes.close_button`
- `widget.notes.title_input`
- `widget.notes.format_select`
- `widget.notes.preview_checkbox`
- `widget.notes.category_select`
- `widget.notes.priority_select`
- `widget.notes.tags_input`
- `widget.notes.path_hint_text`
- `widget.notes.content_input`
- `widget.notes.preview_text`
- `widget.notes.load_button`
- `widget.notes.to_sticky_button`
- `widget.notes.create_button`
- `widget.notes.status_text`

### Inventory Manager

Container:
- `widget.inventory_manager`

Elements:
- `widget.inventory_manager.title`
- `widget.inventory_manager.minimize_button`
- `widget.inventory_manager.close_button`
- `widget.inventory_manager.search_input`
- `widget.inventory_manager.place_filter_select`
- `widget.inventory_manager.search_button`
- `widget.inventory_manager.refresh_button`
- `widget.inventory_manager.new_name_input`
- `widget.inventory_manager.new_places_input`
- `widget.inventory_manager.new_tags_input`
- `widget.inventory_manager.create_button`
- `widget.inventory_manager.count_text`
- `widget.inventory_manager.list_container`
- `widget.inventory_manager.detail_container`
- `widget.inventory_manager.status_text`

### Profile

Container:
- `widget.profile`

Elements:
- `widget.profile.title`
- `widget.profile.minimize_button`
- `widget.profile.close_button`
- `widget.profile.nickname_input`
- `widget.profile.title_select`
- `widget.profile.available_titles_text`
- `widget.profile.welcome_line1_input`
- `widget.profile.welcome_line2_input`
- `widget.profile.welcome_line3_input`
- `widget.profile.exit_line1_input`
- `widget.profile.exit_line2_input`
- `widget.profile.avatar_preview`
- `widget.profile.save_button`
- `widget.profile.edit_preferences_button`
- `widget.profile.edit_preferences_settings_button`
- `widget.profile.edit_pilot_brief_button`
- `widget.profile.status_text`

### Settings

Container:
- `widget.settings`

Elements:
- `widget.settings.title`
- `widget.settings.minimize_button`
- `widget.settings.close_button`
- `widget.settings.file_select`
- `widget.settings.files_text`
- `widget.settings.reload_button`
- `widget.settings.form_mode_checkbox`
- `widget.settings.editor_input`
- `widget.settings.dynamic_content`
- `widget.settings.save_button`
- `widget.settings.status_text`

### Sleep Settings

Container:
- `widget.sleep_settings`

Elements:
- `widget.sleep_settings.title`
- `widget.sleep_settings.minimize_button`
- `widget.sleep_settings.close_button`
- `widget.sleep_settings.mode_select`
- `widget.sleep_settings.splits_input`
- `widget.sleep_settings.apply_mode_button`
- `widget.sleep_settings.blocks_container`
- `widget.sleep_settings.chart_container`
- `widget.sleep_settings.template_mode_select`
- `widget.sleep_settings.template_name_input`
- `widget.sleep_settings.templates_text`
- `widget.sleep_settings.add_segment_button`
- `widget.sleep_settings.add_sleep_in_button`
- `widget.sleep_settings.apply_sleep_button`
- `widget.sleep_settings.status_text`

### Link

Container:
- `widget.link`

Elements:
- `widget.link.title`
- `widget.link.minimize_button`
- `widget.link.close_button`
- `widget.link.peer_input`
- `widget.link.token_input`
- `widget.link.board_select`
- `widget.link.boards_text`
- `widget.link.connect_button`
- `widget.link.sync_button`
- `widget.link.invite_button`
- `widget.link.disconnect_button`
- `widget.link.status_text`
- `widget.link.peer_status_text`
- `widget.link.last_sync_text`
- `widget.link.invite_text`

### Trends

Container:
- `widget.trends`

Elements:
- `widget.trends.title`
- `widget.trends.refresh_button`
- `widget.trends.minimize_button`
- `widget.trends.close_button`
- `widget.trends.metrics_container`
- `widget.trends.status_text`

### Admin

Container:
- `widget.admin`

Elements:
- `widget.admin.title`
- `widget.admin.minimize_button`
- `widget.admin.close_button`
- `widget.admin.db_select`
- `widget.admin.dbs_text`
- `widget.admin.registry_select`
- `widget.admin.clear_logs_button`
- `widget.admin.clear_schedules_button`
- `widget.admin.clear_cache_button`
- `widget.admin.clear_temp_button`
- `widget.admin.clear_db_button`
- `widget.admin.clear_registry_button`
- `widget.admin.clear_archives_button`
- `widget.admin.status_text`

### Cockpit Minimap

Container:
- `widget.cockpit_minimap`

Elements:
- `widget.cockpit_minimap.title`
- `widget.cockpit_minimap.collapse_button`
- `widget.cockpit_minimap.track_container`
- `widget.cockpit_minimap.hint_text`

### Debug Console

Container:
- `widget.debug_console`

Elements:
- `widget.debug_console.title`
- `widget.debug_console.minimize_button`
- `widget.debug_console.clear_button`
- `widget.debug_console.close_button`
- `widget.debug_console.filter_select`
- `widget.debug_console.refresh_button`
- `widget.debug_console.open_editor_button`
- `widget.debug_console.copy_button`
- `widget.debug_console.output_text`
- `widget.debug_console.status_text`

### Clock

Container:
- `widget.clock`

Elements:
- `widget.clock.title`
- `widget.clock.minimize_button`
- `widget.clock.close_button`
- `widget.clock.mode_select`
- `widget.clock.time_text`
- `widget.clock.date_text`
- `widget.clock.appointment_button`
- `widget.clock.alarm_button`
- `widget.clock.reminder_button`
- `widget.clock.status_text`

### Journal

Container:
- `widget.journal`

Elements:
- `widget.journal.title`
- `widget.journal.minimize_button`
- `widget.journal.close_button`
- `widget.journal.type_filter_select`
- `widget.journal.search_input`
- `widget.journal.new_button`
- `widget.journal.save_button`
- `widget.journal.sticky_button`
- `widget.journal.entry_type_select`
- `widget.journal.date_input`
- `widget.journal.title_input`
- `widget.journal.tags_input`
- `widget.journal.content_input`
- `widget.journal.list_container`
- `widget.journal.status_text`

### MP3 Player

Container:
- `widget.mp3_player`

Elements:
- `widget.mp3_player.title`
- `widget.mp3_player.minimize_button`
- `widget.mp3_player.close_button`
- `widget.mp3_player.playlist_select`
- `widget.mp3_player.refresh_button`
- `widget.mp3_player.play_pause_button`
- `widget.mp3_player.prev_button`
- `widget.mp3_player.next_button`
- `widget.mp3_player.track_title_text`
- `widget.mp3_player.track_artist_text`
- `widget.mp3_player.library_container`
- `widget.mp3_player.playlist_container`
- `widget.mp3_player.status_text`

### Sticky Notes

Container:
- `widget.sticky_notes`

Elements:
- `widget.sticky_notes.title`
- `widget.sticky_notes.refresh_button`
- `widget.sticky_notes.minimize_button`
- `widget.sticky_notes.close_button`
- `widget.sticky_notes.new_content_input`
- `widget.sticky_notes.new_color_select`
- `widget.sticky_notes.create_button`
- `widget.sticky_notes.notes_container`
- `widget.sticky_notes.status_text`

## 5) Usage Pattern

1. `OPEN widget.timer`
2. `WAIT visible widget.timer 5000`
3. `LIST widget.timer`
4. `GET widget.timer.status_text`
5. `CLICK widget.timer.start_button`
6. `WAIT text_contains widget.timer.status_text running 5000`
7. `CLOSE widget.timer`
