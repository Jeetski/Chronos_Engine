import os
import yaml
from datetime import datetime
from Modules.ItemManager import (
    generic_handle_new,
    generic_handle_append,
    generic_handle_delete,
    read_item_data,
    write_item_data,
    list_all_items,
    open_item_in_editor,
)

# Define the item type for this module
ITEM_TYPE = "goal"


def handle_command(command, item_type, item_name, text_to_append, properties):
    """
    Supports full lifecycle plus progress tracking.
    """
    normalized = (command or '').strip().lower()
    if normalized in ('new', 'create'):
        generic_handle_new(item_type, item_name, properties)
        return
    if normalized == 'append':
        if not text_to_append:
            print("Info: Nothing to append. Provide text after the goal name.")
            return
        generic_handle_append(item_type, item_name, text_to_append, properties)
        return
    if normalized == 'delete':
        generic_handle_delete(item_type, item_name, properties)
        return
    if normalized in ('info', 'view', 'track'):
        _track_goal(item_name)
        return
    if normalized in ('set', 'update', 'edit'):
        _update_goal(item_name, properties)
        return
    if normalized == 'open':
        open_item_in_editor(item_type, item_name, None)
        return

    print(f"Unsupported command for goal: {command}")


def _track_goal(goal_name: str):
    goal = read_item_data('goal', goal_name)
    if not goal:
        print(f"Goal '{goal_name}' not found.")
        return

    # Gather instantiated milestones for this goal
    milestones = list_all_items('milestone') or []
    ms_for_goal = [m for m in milestones if isinstance(m, dict) and str(m.get('goal', '')).strip().lower() == goal_name.strip().lower()]

    if not ms_for_goal:
        print(f"Goal: {goal_name}\n  No instantiated milestones. Use: set goal \"{goal_name}\" apply:true")
        return

    total_weight = 0
    weighted_sum = 0
    completed = 0
    pending = 0
    inprog = 0
    for m in ms_for_goal:
        wt = int(m.get('weight', 1) or 1)
        p = m.get('progress') or {}
        pct = float(p.get('percent', 0) or 0)
        weighted_sum += pct * wt
        total_weight += wt
        st = str(m.get('status', 'pending')).lower()
        if st == 'completed':
            completed += 1
        elif st == 'in-progress':
            inprog += 1
        else:
            pending += 1

    overall = (weighted_sum / total_weight) if total_weight > 0 else 0
    print(f"--- Goal Progress ---\n  Goal: {goal_name}\n  Milestones: {len(ms_for_goal)} (completed: {completed}, in-progress: {inprog}, pending: {pending})\n  Overall: {overall:.0f}%")


def _update_goal(goal_name: str, updates: dict):
    if not updates:
        print("No properties provided to update.")
        return
    goal = read_item_data('goal', goal_name)
    if not goal:
        print(f"Goal '{goal_name}' not found.")
        return
    for k, v in updates.items():
        if k is None:
            continue
        goal[str(k).lower()] = v
    write_item_data('goal', goal_name, goal)
    print(f"Goal '{goal_name}' updated.")
