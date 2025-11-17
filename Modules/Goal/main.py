import os
import yaml
from datetime import datetime
from Modules.ItemManager import (
    generic_handle_new, read_item_data, write_item_data, list_all_items
)

# Define the item type for this module
ITEM_TYPE = "goal"


def handle_command(command, item_type, item_name, _text, properties):
    """
    Supports:
      - new: create a goal (delegates to generic handler)
      - track: show goal progress aggregated from milestones
    """
    if command == 'new':
        generic_handle_new(item_type, item_name, properties)
        return

    if command == 'track':
        _track_goal(item_name)
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
