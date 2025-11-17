import os, sys, time, shlex, subprocess, yaml

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
USER_DIR = os.path.join(ROOT_DIR, "User")
MACROS_CONF = os.path.join(USER_DIR, "Scripts", "Macros", "macros.yml")

_CFG = None
_MTIME = None

def _safe_yaml(path):
    try:
        if not os.path.exists(path): return None
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return None

def load_config():
    global _CFG, _MTIME
    try:
        m = os.path.getmtime(MACROS_CONF) if os.path.exists(MACROS_CONF) else None
    except Exception:
        m = None
    if _CFG is not None and _MTIME == m:
        return _CFG
    d = _safe_yaml(MACROS_CONF) or {}
    if not isinstance(d, dict): d = {}
    _CFG = {
        'enable_macros': bool(d.get('enable_macros', False)),
        'default_timeout_ms': int(d.get('default_timeout_ms', 15000) or 15000),
        'before_command': d.get('before_command') or {},
        'after_command': d.get('after_command') or {},
    }
    _MTIME = m
    return _CFG

def _gather(mapd, cmd):
    out = []
    try:
        if not isinstance(mapd, dict): return out
        v = mapd.get('*');  out += v if isinstance(v, list) else []
        v = mapd.get(cmd);  out += v if isinstance(v, list) else []
    except Exception:
        pass
    return out

def _expand_token(s):
    try:
        from Modules import Variables as V
        return V.expand_token(s)
    except Exception:
        return s

def _expand_list(lst):
    try:
        from Modules import Variables as V
        return V.expand_list(lst)
    except Exception:
        return lst

def _set_var(name, val):
    try:
        from Modules import Variables as V
        V.set_var(name, val)
    except Exception:
        pass

def _run_cli(argv, timeout_ms):
    try:
        env = os.environ.copy(); env['CHRONOS_SUPPRESS_MACROS'] = '1'
        py = sys.executable or 'python'
        console = os.path.join(ROOT_DIR, 'Modules', 'Console.py')
        return subprocess.run([py, console, ' '.join(shlex.quote(x) for x in argv)],
                              capture_output=True, text=True,
                              timeout=max(1, timeout_ms/1000), env=env)
    except Exception:
        return None

def _run_chs(path, timeout_ms):
    try:
        env = os.environ.copy(); env['CHRONOS_SUPPRESS_MACROS'] = '1'
        py = sys.executable or 'python'
        console = os.path.join(ROOT_DIR, 'Modules', 'Console.py')
        return subprocess.run([py, console, path], capture_output=True, text=True,
                              timeout=max(1, timeout_ms/1000), env=env)
    except Exception:
        return None

def _run_step(step, cmd, args, props, timeout_ms):
    # normalize
    if isinstance(step, str):
        step = {'chs': step} if step.lower().endswith('.chs') else {'cli': shlex.split(step)}
    if not isinstance(step, dict) or not step: return
    kind = next(iter(step.keys())); payload = step[kind]; kind = str(kind).lower()
    if kind == 'noop':
        return
    if kind == 'setvar':
        if isinstance(payload, dict):
            name = str(payload.get('name') or '').strip()
            val = payload.get('value'); val = _expand_token(str(val)) if isinstance(val, str) else ('' if val is None else str(val))
            if name: _set_var(name, val)
        return
    if kind == 'cli':
        argv = payload if isinstance(payload, list) else shlex.split(str(payload))
        argv = [str(x) for x in argv]
        argv = _expand_list(argv)
        _run_cli(argv, timeout_ms)
        return
    if kind == 'chs':
        p = str(payload)
        p = _expand_token(p)
        if not os.path.isabs(p): p = os.path.join(ROOT_DIR, p)
        _run_chs(p, timeout_ms)
        return

def _suppress(props):
    try:
        if os.environ.get('CHRONOS_SUPPRESS_MACROS'): return True
        if props and str(props.get('no_macros')).lower() in ('1','true','yes'): return True
    except Exception:
        pass
    return False

def run_before(cmd, args, props):
    cfg = load_config()
    if not cfg.get('enable_macros') or _suppress(props): return
    steps = _gather(cfg.get('before_command') or {}, cmd)
    if not steps: return
    t = int(cfg.get('default_timeout_ms') or 15000)
    for st in steps: _run_step(st, cmd, args or [], props or {}, t)

def run_after(cmd, args, props, result):
    cfg = load_config()
    if not cfg.get('enable_macros') or _suppress(props): return
    steps = _gather(cfg.get('after_command') or {}, cmd)
    if not steps: return
    t = int(cfg.get('default_timeout_ms') or 15000)
    for st in steps: _run_step(st, cmd, args or [], props or {}, t)

