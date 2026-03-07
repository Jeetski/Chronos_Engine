from modules import sound_fx as SoundFX


def _to_bool_token(token):
    t = str(token or "").strip().lower()
    if t in {"on", "true", "1", "yes"}:
        return True
    if t in {"off", "false", "0", "no"}:
        return False
    return None


def _print_status():
    st = SoundFX.get_status()
    global_state = "on" if st.get("enabled", True) else "off"
    print(f"Sounds (global): {global_state}")
    sounds = st.get("sounds", {})
    for name in SoundFX.list_sound_names():
        state = "on" if sounds.get(name, False) else "off"
        print(f"- {name}: {state}")


def run(args, properties):
    # `sounds` alias is handled by Console aliases.
    if not args:
        _print_status()
        return

    a0 = str(args[0]).strip().lower()
    a1 = str(args[1]).strip().lower() if len(args) > 1 else ""

    if a0 in {"list", "status"}:
        _print_status()
        return

    # sound on/off  OR  sounds on/off (via alias)
    global_toggle = _to_bool_token(a0)
    if global_toggle is not None:
        SoundFX.set_all_enabled(global_toggle)
        print(f"All sounds turned {'on' if global_toggle else 'off'}.")
        return

    # sound all on/off
    if a0 in {"all", "*"}:
        val = _to_bool_token(a1)
        if val is None:
            print("Usage: sound all <on|off>")
            return
        SoundFX.set_all_enabled(val)
        print(f"All sounds turned {'on' if val else 'off'}.")
        return

    # sound <name> [on/off]
    sound_name = a0
    known = set(SoundFX.list_sound_names())
    if sound_name not in known:
        print(f"Unknown sound '{sound_name}'. Available: {', '.join(sorted(known))}")
        return

    if not a1:
        st = SoundFX.get_status()
        state = "on" if (st.get("sounds", {}).get(sound_name, False)) else "off"
        print(f"Sound '{sound_name}' is {state}.")
        return

    val = _to_bool_token(a1)
    if val is None:
        print("Usage: sound <startup|done|error|exit> [on|off]")
        return

    ok = SoundFX.set_sound_enabled(sound_name, val)
    if not ok:
        print(f"Could not update sound '{sound_name}'.")
        return
    print(f"Sound '{sound_name}' turned {'on' if val else 'off'}.")


def get_help_message():
    return """
Usage:
  sound
  sound <startup|done|error|exit>
  sound <startup|done|error|exit> <on|off>
  sound <on|off>
  sound all <on|off>
  sounds <on|off>

Description:
  Configure CLI sound effects and global sound enable/disable.
"""
