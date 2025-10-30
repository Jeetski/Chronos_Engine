import os
import re
import yaml
from Modules.ItemManager import read_item_data, get_item_dir, get_item_path


class ConditionParseError(Exception):
    pass


_context_line = None


def set_context_line(n: int):
    global _context_line
    _context_line = n


def clear_context_line():
    global _context_line
    _context_line = None


def get_context_line():
    return _context_line


def load_status():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    status_path = os.path.join(root, 'User', 'current_status.yml')
    if not os.path.exists(status_path):
        return {}
    try:
        with open(status_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
            return {str(k).lower(): v for k, v in data.items()}
    except Exception:
        return {}


def coerce_numeric(val):
    try:
        if isinstance(val, bool) or val is None:
            return None
        s = str(val).strip()
        if s == '':
            return None
        return float(s)
    except Exception:
        return None


def compare(lhs, op, rhs):
    op = op.lower()
    mapping = {
        '==': 'eq', '=': 'eq', 'eq': 'eq',
        '!=': 'ne', 'ne': 'ne',
        '>': 'gt', 'gt': 'gt',
        '<': 'lt', 'lt': 'lt',
        '>=': 'ge', 'ge': 'ge',
        '<=': 'le', 'le': 'le',
        'matches': 'matches',
    }
    if op not in mapping:
        return False
    op = mapping[op]

    ln = coerce_numeric(lhs)
    rn = coerce_numeric(rhs)
    if ln is not None and rn is not None:
        if op == 'eq':
            return ln == rn
        if op == 'ne':
            return ln != rn
        if op == 'gt':
            return ln > rn
        if op == 'lt':
            return ln < rn
        if op == 'ge':
            return ln >= rn
        if op == 'le':
            return ln <= rn

    ls = '' if lhs is None else str(lhs)
    rs = '' if rhs is None else str(rhs)
    if op == 'eq':
        return ls.lower() == rs.lower()
    if op == 'ne':
        return ls.lower() != rs.lower()
    if op == 'gt':
        return ls > rs
    if op == 'lt':
        return ls < rs
    if op == 'ge':
        return ls >= rs
    if op == 'le':
        return ls <= rs
    if op == 'matches':
        try:
            return re.search(rs, ls) is not None
        except re.error:
            return False
    return False


def resolve_token(token):
    # status:key
    if isinstance(token, str) and token.lower().startswith('status:'):
        key = token.split(':', 1)[1].lower()
        return load_status().get(key)

    # type:name:property
    if isinstance(token, str) and ':' in token:
        parts = token.split(':')
        if len(parts) >= 3:
            item_type = parts[0].lower()
            name = parts[1]
            prop = parts[2].lower()
            data = read_item_data(item_type, name)
            if not data:
                return None
            return data.get(prop)

    return token


def exists_target(target: str) -> bool:
    if not isinstance(target, str) or target == '':
        return False

    # Support file:, dir:/folder:, env:
    tl = target.lower()
    # Project root
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    if tl.startswith('file:'):
        path = target[5:]
        # Normalize quotes if any leaked in
        path = path.strip().strip('"').strip("'")
        if not os.path.isabs(path):
            path = os.path.join(root, path)
        return os.path.exists(path)

    if tl.startswith('dir:') or tl.startswith('folder:'):
        path = target.split(':', 1)[1]
        path = path.strip().strip('"').strip("'")
        if not os.path.isabs(path):
            path = os.path.join(root, path)
        return os.path.isdir(path)

    if tl.startswith('env:'):
        name = target.split(':', 1)[1].strip()
        # Environment variable exists and is non-empty
        return bool(os.environ.get(name))

    parts = target.split(':')
    item_type = parts[0].lower()
    if len(parts) == 1:
        item_dir = get_item_dir(item_type)
        try:
            return any(fn.lower().endswith('.yml') for fn in os.listdir(item_dir))
        except Exception:
            return False

    name = parts[1]
    if len(parts) == 2:
        return os.path.exists(get_item_path(item_type, name))

    prop = parts[2].lower()
    data = read_item_data(item_type, name)
    if not data:
        return False
    return prop in data and data.get(prop) not in (None, "")


def evaluate_cond_tokens(tokens):
    """
    Evaluates a condition token list with optional logical and/or.
    Grammar (no parentheses):
      expr := term (or term)*
      term := factor (and factor)*
      factor := ['exists' target] | [lhs op rhs]
    """
    if not tokens:
        return False

    # Normalize tokens to strings and split out parentheses into separate tokens
    raw = [str(t) for t in tokens]
    toks = []
    open_parens = 0
    for tok in raw:
        if '(' in tok or ')' in tok:
            # Split by parentheses, keeping them
            parts = re.findall(r"\(|\)|[^()]+", tok)
            toks.extend([p for p in parts if p != ''])
        else:
            toks.append(tok)

    paren_error = False

    def parse_factor(i):
        if i >= len(toks):
            return False, i
        # Parenthesized expression
        if toks[i] == '(':
            val, i2 = parse_expr(i + 1)
            # Expect closing ')'
            if i2 < len(toks) and toks[i2] == ')':
                return val, i2 + 1
            # If missing, return what we have
            nonlocal paren_error
            paren_error = True
            return val, i2
        # Unary NOT
        if toks[i].lower() in ('not', '!'):
            v, j = parse_factor(i + 1)
            return (not v), j
        if toks[i].lower() == 'exists':
            target = toks[i+1] if i + 1 < len(toks) else ''
            return exists_target(target), min(i + 2, len(toks))
        # Need at least lhs op rhs
        if i + 2 >= len(toks):
            raise ConditionParseError("Incomplete condition: expected '<lhs> <op> <rhs>'")
        lhs, op, rhs = toks[i], toks[i+1], toks[i+2]
        return compare(resolve_token(lhs), op, resolve_token(rhs)), i + 3

    def parse_term(i):
        val, i = parse_factor(i)
        while i < len(toks) and toks[i].lower() == 'and':
            rhs, i = parse_factor(i + 1)
            val = val and rhs
        return val, i

    def parse_expr(i):
        val, i = parse_term(i)
        while i < len(toks) and toks[i].lower() in ('or', 'xor', 'nor'):
            op = toks[i].lower()
            rhs, i = parse_term(i + 1)
            if op == 'or':
                val = val or rhs
            elif op == 'xor':
                val = (val and not rhs) or (not val and rhs)
            elif op == 'nor':
                val = not (val or rhs)
        return val, i

    result, _ = parse_expr(0)
    if paren_error:
        raise ConditionParseError("Unmatched ')' or missing ')' in condition.")
    return result
