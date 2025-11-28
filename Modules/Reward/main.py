import os
import yaml
from datetime import datetime, timedelta
from Modules.ItemManager import (
    generic_handle_new, generic_handle_append, generic_handle_delete,
    read_item_data, write_item_data, open_item_in_editor, get_item_path
)

ITEM_TYPE = "reward"


def handle_new(name, properties):
    """Create a new reward using the generic handler."""
    generic_handle_new(ITEM_TYPE, name, properties)


def handle_command(command, item_type, item_name, text_to_append, properties):
    """Route reward commands. Supports generic item lifecycle commands plus redeem/info."""
    normalized = (command or '').strip().lower()

    if normalized in ('new', 'create'):
        generic_handle_new(item_type, item_name, properties)
        return

    if normalized == 'append':
        if not text_to_append:
            print("Info: Nothing to append. Provide text after the reward name.")
            return
        generic_handle_append(item_type, item_name, text_to_append, properties)
        return

    if normalized == 'delete':
        generic_handle_delete(item_type, item_name, properties)
        return

    if normalized in ('redeem', 'complete'):
        _redeem_reward(item_name, properties)
        return

    if normalized in ('info', 'view', 'track'):
        _info_reward(item_name)
        return

    print(f"Unsupported command for reward: {command}")


def _info_reward(name: str):
    data = read_item_data('reward', name)
    if not data:
        print(f"Reward '{name}' not found.")
        return
    cost = ((data.get('cost') or {}) if isinstance(data.get('cost'), dict) else {})
    cooldown = data.get('cooldown_minutes') or 0
    last = data.get('last_redeemed') or 'N/A'
    times = int(data.get('redemptions') or 0)
    target = data.get('target') or {}
    print(f"--- Reward ---\n  Name: {name}\n  Cost: {cost.get('points','N/A')} points\n  Cooldown: {cooldown} min\n  Redemptions: {times}\n  Last: {last}\n  Target: {target}")


def _redeem_reward(name: str, props: dict):
    reward = read_item_data('reward', name)
    if not reward:
        print(f"Reward '{name}' not found.")
        return

    # Validate cost
    cost = ((reward.get('cost') or {}) if isinstance(reward.get('cost'), dict) else {})
    points_cost = int(cost.get('points') or 0)
    cooldown = int(reward.get('cooldown_minutes') or 0)
    max_red = reward.get('max_redemptions')
    last = reward.get('last_redeemed')
    red_count = int(reward.get('redemptions') or 0)

    # Cooldown check
    if cooldown and last:
        try:
            last_dt = datetime.strptime(str(last), '%Y-%m-%d %H:%M:%S')
            if datetime.now() < last_dt + timedelta(minutes=cooldown):
                print(f"❌ Reward '{name}' is on cooldown until {(last_dt + timedelta(minutes=cooldown)).strftime('%H:%M')}.")
                return
        except Exception:
            pass

    if isinstance(max_red, int) and max_red > 0 and red_count >= max_red:
        print(f"❌ Reward '{name}' reached max redemptions.")
        return

    # Points check and deduction
    from Utilities import points as Points
    if points_cost > 0:
        if not Points.ensure_balance(points_cost):
            print(f"❌ Not enough points. Need {points_cost}.")
            return
        Points.add_points(-points_cost, reason=f"redeem:{name}")

    # Deliver target
    target = reward.get('target') or {}
    mode = str(target.get('mode') or 'instantiate').lower()
    t_type = target.get('type')
    t_name = target.get('name')
    t_props = target.get('properties') if isinstance(target.get('properties'), dict) else {}

    try:
        if mode == 'instantiate':
            if t_type and t_name:
                generic_handle_new(t_type, t_name, t_props)
        elif mode == 'reference':
            if t_type and t_name:
                data = read_item_data(t_type, t_name) or {}
                data['unlocked'] = True
                write_item_data(t_type, t_name, data)
                print(f"✅ Unlocked {t_type} '{t_name}'.")
        elif mode == 'schedule':
            # Minimal viable: instantiate; scheduling can be customized by user afterwards
            if t_type and t_name:
                generic_handle_new(t_type, t_name, t_props)
                print(f"🗓️ Created '{t_name}'. Use 'today reschedule' to integrate if needed.")
        elif mode == 'open':
            # Open item in editor if exists
            if t_type and t_name:
                open_item_in_editor(t_type, t_name, None)
        else:
            print(f"⚠️ Unknown reward target mode: {mode}")
    except Exception as e:
        print(f"❌ Delivery error for reward '{name}': {e}")
        return

    # Update reward state
    reward['last_redeemed'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    reward['redemptions'] = red_count + 1
    write_item_data('reward', name, reward)
    print(f"🎉 Redeemed reward '{name}'.")
