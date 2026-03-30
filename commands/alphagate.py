from modules import alpha_gate as AlphaGate


def _normalize_token(value):
    return str(value or "").strip().lower().replace("-", "_")


def _parse_bool_token(value):
    token = _normalize_token(value)
    if token in {"1", "true", "yes", "on", "show", "visible"}:
        return True
    if token in {"0", "false", "no", "off", "hide", "hidden"}:
        return False
    return None


def _print_status():
    snapshot = AlphaGate.settings_snapshot()
    print("Alpha Gate")
    print("----------")
    print(f"release_profile: {snapshot['release_profile']}")
    print(f"show_hidden_items: {str(snapshot['show_hidden_items']).lower()}")
    print(f"disable_hidden_features: {str(snapshot['disable_hidden_features']).lower()}")
    print(f"show_alpha_gate_toggle: {str(snapshot['show_alpha_gate_toggle']).lower()}")
    print("")
    print("Effective mode")
    print("--------------")
    print(f"full_dev: {str(AlphaGate.is_full_dev()).lower()}")
    print(f"hidden commands disabled: {str(AlphaGate.disable_hidden_features() and not AlphaGate.is_full_dev()).lower()}")


def _print_profiles():
    names = AlphaGate.get_profile_names()
    if not names:
        print("No alpha gate profiles discovered.")
        return
    print("Profiles")
    print("--------")
    for name in names:
        marker = "*" if name == AlphaGate.get_release_profile() else " "
        print(f"{marker} {name}")


def run(args, properties):
    tokens = list(args or [])
    op = _normalize_token(tokens[0]) if tokens else "status"

    if op in {"status", "state"}:
        _print_status()
        return

    if op in {"profiles", "list_profiles"}:
        _print_profiles()
        return

    if op in {"alpha", "alpha_v0_3"}:
        snapshot = AlphaGate.update_settings(release_profile="alpha_v0_3")
        print(f"Alpha gate profile set to {snapshot['release_profile']}.")
        return

    if op in {"full", "full_dev"}:
        snapshot = AlphaGate.update_settings(release_profile="full_dev")
        print(f"Alpha gate profile set to {snapshot['release_profile']}.")
        return

    if op == "profile":
        target = str(tokens[1] if len(tokens) > 1 else "").strip()
        names = set(AlphaGate.get_profile_names())
        if not target:
            print("Usage: alphagate profile <name>")
            _print_profiles()
            return
        if names and target not in names:
            print(f"Unknown alpha gate profile: {target}")
            _print_profiles()
            return
        snapshot = AlphaGate.update_settings(release_profile=target)
        print(f"Alpha gate profile set to {snapshot['release_profile']}.")
        return

    if op in {"show", "hide"}:
        show_hidden = op == "show"
        snapshot = AlphaGate.update_settings(show_hidden_items=show_hidden)
        print(f"show_hidden_items set to {str(snapshot['show_hidden_items']).lower()}.")
        return

    if op in {"enable", "disable"}:
        disable_hidden = op == "disable"
        snapshot = AlphaGate.update_settings(disable_hidden_features=disable_hidden)
        print(f"disable_hidden_features set to {str(snapshot['disable_hidden_features']).lower()}.")
        return

    if op in {"hidden", "show_hidden", "show_hidden_items"}:
        value = _parse_bool_token(tokens[1] if len(tokens) > 1 else "")
        if value is None:
            print("Usage: alphagate hidden <on|off>")
            return
        snapshot = AlphaGate.update_settings(show_hidden_items=value)
        print(f"show_hidden_items set to {str(snapshot['show_hidden_items']).lower()}.")
        return

    if op in {"disabled", "disable_hidden", "disable_hidden_features"}:
        value = _parse_bool_token(tokens[1] if len(tokens) > 1 else "")
        if value is None:
            print("Usage: alphagate disable_hidden <on|off>")
            return
        snapshot = AlphaGate.update_settings(disable_hidden_features=value)
        print(f"disable_hidden_features set to {str(snapshot['disable_hidden_features']).lower()}.")
        return

    if op in {"dev", "dev_toggle", "show_alpha_gate_toggle", "toggle"}:
        value = _parse_bool_token(tokens[1] if len(tokens) > 1 else "")
        if value is None:
            print("Usage: alphagate dev <on|off>")
            return
        snapshot = AlphaGate.update_settings(show_alpha_gate_toggle=value)
        print(f"show_alpha_gate_toggle set to {str(snapshot['show_alpha_gate_toggle']).lower()}.")
        return

    if op == "reset":
        snapshot = AlphaGate.save_settings({
            "release_profile": AlphaGate.get_default_profile(),
            "show_hidden_items": False,
            "disable_hidden_features": True,
            "show_alpha_gate_toggle": False,
        })
        print("Alpha gate reset to default local operator state.")
        print(f"release_profile: {snapshot['release_profile']}")
        return

    print(f"Unknown alphagate operation: {op}")
    print("Supported operations: status, profiles, alpha, full, profile, show, hide, enable, disable, hidden, disable_hidden, dev, reset")
