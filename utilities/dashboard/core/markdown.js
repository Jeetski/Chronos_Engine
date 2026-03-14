export function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;'
      : ch === '<' ? '&lt;'
      : ch === '>' ? '&gt;'
      : ch === '"' ? '&quot;'
      : '&#39;'
  ));
}

export function formatInlineMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}

export function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let code = [];
  let listType = null;
  let quoteOpen = false;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${formatInlineMarkdown(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (!listType) return;
    out.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };
  const closeQuote = () => {
    if (!quoteOpen) return;
    out.push('</blockquote>');
    quoteOpen = false;
  };

  for (const lineRaw of lines) {
    const line = lineRaw || '';
    const trim = line.trim();

    if (inCode) {
      if (/^```/.test(trim)) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        inCode = false;
        code = [];
      } else {
        code.push(line);
      }
      continue;
    }

    if (/^```/.test(trim)) {
      flushPara();
      closeList();
      closeQuote();
      inCode = true;
      code = [];
      continue;
    }

    if (!trim) {
      flushPara();
      closeList();
      closeQuote();
      continue;
    }

    const heading = trim.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushPara();
      closeList();
      closeQuote();
      const level = heading[1].length;
      out.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trim) || /^\*\*\*+$/.test(trim)) {
      flushPara();
      closeList();
      closeQuote();
      out.push('<hr/>');
      continue;
    }

    const quote = trim.match(/^>\s?(.*)$/);
    if (quote) {
      flushPara();
      closeList();
      if (!quoteOpen) {
        out.push('<blockquote>');
        quoteOpen = true;
      }
      out.push(`<p>${formatInlineMarkdown(quote[1])}</p>`);
      continue;
    }

    const ol = trim.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      closeQuote();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${formatInlineMarkdown(ol[1])}</li>`);
      continue;
    }

    const ul = trim.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushPara();
      closeQuote();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${formatInlineMarkdown(ul[1])}</li>`);
      continue;
    }

    closeList();
    closeQuote();
    para.push(trim);
  }

  flushPara();
  closeList();
  closeQuote();

  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return out.join('\n');
}
