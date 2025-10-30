import os
import yaml

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROFILE_PATH = os.path.join(ROOT_DIR, 'User', 'profile.yml')


def _load_profile() -> dict:
    try:
        if os.path.exists(PROFILE_PATH):
            with open(PROFILE_PATH, 'r', encoding='utf-8') as f:
                d = yaml.safe_load(f) or {}
                if isinstance(d, dict):
                    return d
    except Exception:
        pass
    return {}


def _save_profile(data: dict) -> bool:
    try:
        os.makedirs(os.path.dirname(PROFILE_PATH), exist_ok=True)
        with open(PROFILE_PATH, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        return True
    except Exception:
        return False


def _ensure_welcome_block(p: dict) -> dict:
    if not isinstance(p.get('welcome'), dict):
        p['welcome'] = {}
    return p['welcome']


def _expand(val: str) -> str:
    try:
        from Modules import Variables as _V
        return _V.expand_token(str(val))
    except Exception:
        return str(val)


def run(args, properties):
    if not args or args[0].lower() in {"help", "-h", "--help"}:
        print(get_help_message())
        return

    sub = args[0].lower()
    prof = _load_profile()

    if sub == 'show':
        nick = prof.get('nickname') or ''
        block = prof.get('welcome') or prof.get('welcome_message') or {}
        line1 = block.get('line1') or '⌛ Chronos Engine v1'
        line2 = block.get('line2') or '🚀 Welcome, @nickname'
        line3 = block.get('line3') or '🌌 You are the navigator of your reality.'
        print(f"Nickname: {nick}")
        print("Welcome:")
        print(f"  1: {_expand(line1)}")
        print(f"  2: {_expand(line2)}")
        print(f"  3: {_expand(line3)}")
        return

    if sub == 'get':
        if len(args) < 2:
            print("Usage: profile get <nickname|line1|line2|line3>")
            return
        key = args[1].lower()
        if key == 'nickname':
            print(str(prof.get('nickname') or ''))
            return
        block = prof.get('welcome') or prof.get('welcome_message') or {}
        if key in {'line1','line2','line3'}:
            print(str(block.get(key) or ''))
            return
        print(f"Unknown key: {key}")
        return

    if sub == 'set':
        changed = False
        # nickname from properties
        if 'nickname' in properties:
            prof['nickname'] = str(properties.get('nickname'))
            changed = True
            try:
                from Modules import Variables as _V
                _V.set_var('nickname', prof['nickname'])
            except Exception:
                pass
        # lines from properties
        wb = _ensure_welcome_block(prof)
        for k in ('line1','line2','line3'):
            if k in properties:
                wb[k] = str(properties.get(k))
                changed = True
        # If shell broke quoted value into separate args (e.g., line2:"🚀 Welcome, @nickname" -> line2:🚀 Welcome, @nickname),
        # append any trailing non-property tokens to the last specified line key.
        try:
            tail_tokens = []
            for t in (args[1:] if len(args) > 1 else []):
                if isinstance(t, str) and (':' not in t):
                    tail_tokens.append(t)
            if tail_tokens:
                # Determine which line key to append to (prefer the highest-numbered line present)
                for key in ('line3','line2','line1'):
                    if key in wb and key in properties:
                        wb[key] = (wb.get(key) or '') + (' ' if wb.get(key) else '') + ' '.join(tail_tokens)
                        changed = True
                        break
        except Exception:
            pass
        if not changed:
            print("Nothing to set. Provide nickname:<value> and/or line1/line2/line3:")
            print("  profile set nickname:Alice line2:\"Welcome, @nickname\"")
            return
        ok = _save_profile(prof)
        if ok:
            print("Profile updated.")
        else:
            print("Failed to write profile.yml.")
        return

    if sub in {'set-line','setline'}:
        if len(args) < 3:
            print("Usage: profile set-line <1|2|3> <text...>")
            return
        idx = str(args[1]).strip()
        if idx not in {'1','2','3'}:
            print("Line index must be 1, 2, or 3.")
            return
        text = ' '.join(args[2:])
        wb = _ensure_welcome_block(prof)
        key = f'line{idx}'
        wb[key] = text
        if _save_profile(prof):
            print(f"Set {key}.")
        else:
            print("Failed to write profile.yml.")
        return

    print("Unknown subcommand.\n" + get_help_message())


def get_help_message():
    return """
Usage: profile show
       profile get <nickname|line1|line2|line3>
       profile set [nickname:<value>] [line1:"..."] [line2:"..."] [line3:"..."]
       profile set-line <1|2|3> <text...>

Description:
  Views or updates profile details stored in User/profile.yml. Supports a welcome block with line1/line2/line3.
  Variables like @nickname expand in the welcome lines.

Examples:
  profile show
  profile set nickname:Alice
  profile set line2:"🚀 Welcome, @nickname" line3:"🌌 Navigate your reality"
  profile set-line 2 🚀 Welcome, @nickname
"""
