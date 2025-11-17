import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CMDS_DIR = os.path.join(ROOT, 'Commands')
SITE_CMDS_HTML = os.path.join(ROOT, '_site', 'pages', 'commands.html')

def list_commands():
    names = []
    for fn in os.listdir(CMDS_DIR):
        if not fn.lower().endswith('.py'):
            continue
        if fn == '__init__.py':
            continue
        names.append(os.path.splitext(fn)[0])
    uniq = sorted({n.lower() for n in names})
    return uniq

def get_help_for(cmd_name):
    try:
        proc = subprocess.Popen(
            [sys.executable, os.path.join(ROOT, 'Modules', 'Console.py'), 'help ' + cmd_name],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8'
        )
        out, err = proc.communicate(timeout=20)
    except Exception:
        return ''
    text = out or ''
    lines = text.splitlines()
    body = []
    started = False
    for ln in lines:
        if not started:
            if ln.strip().lower().startswith('command: '):
                started = True
            continue
        body.append(ln)
    body_text = '\n'.join(body).strip()
    # Extract short description and usage block when available
    usage_lines = []
    desc_line = ''
    for i, ln in enumerate(body):
        s = ln.strip()
        if s.lower().startswith('usage:'):
            usage_lines.append(s)
            j = i + 1
            while j < len(body):
                t = body[j].rstrip()
                if not t or t.lower().startswith(('example', 'examples', 'description:', 'command:')):
                    break
                usage_lines.append(t)
                j += 1
        if not desc_line and s.lower().startswith('description:'):
            desc_line = s[len('description:'):].strip()
    usage = '\n'.join(usage_lines).strip()
    return body_text, usage, desc_line

def html_escape(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def build_html():
    names = list_commands()
    items = []
    for name in names:
        body, usage, desc = get_help_for(name)
        items.append((name, body, usage, desc))

    head = '''<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chronos Engine - Commands</title>
    <link rel="icon" href="../public/favicon.ico" sizes="any" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="../index.html"><img class="brand-mark" src="../public/Logo_No_Background.png" alt="Chronos Engine" /><span class="brand-text">Chronos Engine</span></a>
        <nav class="nav" id="siteNav">
  <a href="/index.html#features">Features</a>
  <a href="/pages/docs.html">Docs</a>
  <div class="dropdown guides">
    <button class="menubtn" type="button">Guides</button>
    <div class="menu">
      <a href="/pages/setup.html">Setup</a>
      <a href="/pages/dashboard.html">Dashboard Guide</a>
      <a href="/pages/template-builder.html">Template Builder</a>
      <a href="/pages/macros.html">Macros</a>
      <a href="/pages/chs-scripting.html">CHS Scripting</a>
      <a href="/pages/conditions-cookbook.html">Conditions Cookbook</a>
      <a href="/pages/architecture.html">Architecture</a>
      <a href="/pages/settings.html">Settings</a>
      <a href="/pages/workflows.html">Workflows</a>
    </div>
  </div>
  <a href="/pages/agents.html">Agents</a>
  <a class="active" href="/pages/commands.html">Commands</a>
  <a href="/pages/license.html">License</a>
  <a href="/pages/setup.html" class="cta">Get Started</a>
</nav>
        <button id="navToggle" class="nav-toggle" aria-label="Toggle navigation">&#9776;</button>
      </div>
    </header>

    <main class="container doc">
      <h1>Commands (Alphabetical)</h1>
      <p>Usage and descriptions pulled from the CLI help.</p>
      <input id="cmdFilter" class="input" placeholder="Filter commands..." style="max-width:420px; margin:10px 0;"/>
      <div class="grid" id="cmdGrid">
'''
    parts = [head]
    for name, body, usage, desc in items:
        parts.append('        <div class="card" data-name="'+name+'">\n')
        parts.append('          <h3 style="margin-top:0">'+ html_escape(name) +'</h3>\n')
        if desc:
            parts.append('          <p>'+ html_escape(desc) +'</p>\n')
        if usage:
            parts.append('          <pre>'+ html_escape(usage) +'</pre>\n')
        if body:
            parts.append('          <details><summary>More</summary><pre>'+ html_escape(body) +'</pre></details>\n')
        parts.append('        </div>\n')
    parts.append('      </div>\n')
    tail = '''    </main>

    <footer class="site-footer">
      <div class="container footer-inner">
        <div>&copy; <span id="year"></span> Chronos Engine &mdash; Built by David Cody (Hivemind Studio)</div>
        <div class="footer-links">
          <a href="/pages/docs.html">Docs</a>
          <a href="/pages/agents.html">Agents</a>
          <a href="/pages/commands.html">Commands</a>
          <a href="/pages/setup.html">Setup</a>
          <a href="https://github.com/Jeetski/Chronos_Engine" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
    </footer>
    <script src="../script.js"></script>
    <script>
      (function(){
        var input = document.getElementById('cmdFilter');
        var grid = document.getElementById('cmdGrid');
        if (!input || !grid) return;
        input.addEventListener('input', function(){
          var q = (input.value || '').toLowerCase();
          grid.querySelectorAll('.card').forEach(function(c){
            var name = (c.getAttribute('data-name')||'') + ' ' + (c.textContent||'');
            c.style.display = name.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
          });
        });
      })();
    </script>
  </body>
</html>
'''
    parts.append(tail)
    html = ''.join(parts)
    os.makedirs(os.path.dirname(SITE_CMDS_HTML), exist_ok=True)
    with open(SITE_CMDS_HTML, 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == '__main__':
    build_html()
