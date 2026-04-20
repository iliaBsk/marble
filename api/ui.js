/**
 * Marble Profile UI
 *
 * Exports buildUiHtml(audienceId, kgFile) which returns a complete SPA HTML
 * string for the Marble profile visualisation and chat interface.
 *
 * Layout:
 *   Left 30%  — LLM-powered chat panel
 *   Right 70% — Graph / Query tabs with vis-network
 */

/**
 * Escape special characters to prevent XSS in template substitution.
 * Only used for audienceId and kgFile which are server-side values, not user input.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the full SPA HTML for the Marble profile UI.
 *
 * @param {string} audienceId
 * @param {string} kgFile
 * @returns {string}
 */
export function buildUiHtml(audienceId, kgFile) {
  const safeAudienceId = escHtml(audienceId);
  const safeKgFile = escHtml(kgFile);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marble — ${safeAudienceId}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    /* Ensure vis-network canvas fills its container */
    #graph-canvas { width: 100%; height: 100%; }
    /* Custom scrollbar for dark theme */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #64748b; }
    /* Vis-network tooltip */
    .vis-tooltip { background: #1e293b !important; color: #e2e8f0 !important; border: 1px solid #334155 !important; border-radius: 6px !important; font-size: 12px !important; }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 h-screen flex flex-col overflow-hidden">

  <!-- Top bar -->
  <header class="flex items-center px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
    <span class="text-indigo-400 font-bold text-lg mr-2">Marble</span>
    <span class="bg-indigo-900 text-indigo-300 text-xs font-semibold px-2 py-0.5 rounded-full mr-4">${safeAudienceId}</span>
    <span class="text-slate-500 text-xs truncate">${safeKgFile}</span>
    <div class="ml-auto flex gap-3 text-xs text-slate-400">
      <a href="/onboarding" target="_blank" class="hover:text-violet-400 transition-colors font-medium text-violet-500">⟳ Onboarding</a>
      <a href="/user-profile/graph/summary" target="_blank" class="hover:text-indigo-400 transition-colors">JSON summary</a>
      <a href="/user-profile/graph/debug" target="_blank" class="hover:text-indigo-400 transition-colors">JSON debug</a>
      <a href="/healthz" target="_blank" class="hover:text-indigo-400 transition-colors">healthz</a>
    </div>
  </header>

  <!-- Main layout: Chat | Main Panel -->
  <div class="flex flex-1 overflow-hidden">

    <!-- ── Chat Panel (30%) ──────────────────────────────────────── -->
    <aside class="w-[30%] min-w-[260px] flex flex-col bg-slate-800 border-r border-slate-700">

      <!-- Chat header -->
      <div class="px-4 py-3 border-b border-slate-700 shrink-0">
        <h2 class="text-sm font-semibold text-slate-200">Profile Chat <span class="text-slate-500 font-normal">· ${safeAudienceId}</span></h2>
        <p class="text-xs text-slate-500 mt-0.5">LLM-powered profile assistant</p>
      </div>

      <!-- Message history -->
      <div id="chat-messages" class="flex-1 overflow-y-auto px-3 py-3 space-y-3"></div>

      <!-- Error display -->
      <div id="chat-error" class="hidden mx-3 mb-2 px-3 py-2 text-xs text-red-300 bg-red-900/40 border border-red-700/50 rounded-lg"></div>

      <!-- Input row -->
      <div class="px-3 py-3 border-t border-slate-700 shrink-0">
        <div class="flex gap-2">
          <input
            id="chat-input"
            type="text"
            placeholder="Ask about this profile…"
            class="flex-1 bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
          />
          <button
            id="chat-send"
            class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >Send</button>
        </div>
      </div>
    </aside>

    <!-- ── Main Panel (70%) ──────────────────────────────────────── -->
    <main class="flex-1 flex flex-col overflow-hidden">

      <!-- Tab bar -->
      <div class="flex items-center px-4 py-0 bg-slate-850 border-b border-slate-700 shrink-0" style="background:#0f172a">
        <button id="tab-graph" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-indigo-500 text-indigo-400 transition-colors" onclick="switchTab('graph')">Graph</button>
        <button id="tab-query" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-colors" onclick="switchTab('query')">Query</button>
        <button id="tab-review" class="tab-btn px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-colors" onclick="switchTab('review')">Review <span id="review-badge" class="hidden ml-1 bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full"></span></button>
        <div class="ml-auto pr-1">
          <button id="refresh-graph-btn" onclick="loadGraph()" class="text-xs text-slate-400 hover:text-indigo-400 px-2 py-1 rounded transition-colors" title="Refresh graph">↺ Refresh</button>
        </div>
      </div>

      <!-- Graph tab -->
      <div id="panel-graph" class="flex-1 relative overflow-hidden">
        <div id="graph-canvas" class="absolute inset-0"></div>
        <!-- Node detail overlay -->
        <div id="node-detail" class="hidden absolute top-3 right-3 w-64 bg-slate-800 border border-slate-600 rounded-xl p-3 text-xs text-slate-300 shadow-xl z-10">
          <div class="flex items-center justify-between mb-2">
            <span id="node-detail-label" class="font-semibold text-slate-100"></span>
            <button onclick="document.getElementById('node-detail').classList.add('hidden')" class="text-slate-500 hover:text-slate-300 text-base leading-none">&times;</button>
          </div>
          <table id="node-detail-table" class="w-full border-collapse"></table>
        </div>
        <!-- Graph loading indicator -->
        <div id="graph-loading" class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
          Loading graph…
        </div>
      </div>

      <!-- Review tab -->
      <div id="panel-review" class="hidden flex-1 flex flex-col overflow-hidden">

        <!-- Review top bar -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0 bg-slate-800/50">
          <button id="enrichment-run-btn" onclick="runEnrichment()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
            <span id="enrichment-spinner" class="hidden animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
            Run Enrichment
          </button>
          <span id="enrichment-status" class="text-xs text-slate-400"></span>
          <div id="enrichment-error" class="hidden text-xs text-red-300 bg-red-900/40 border border-red-700/50 rounded px-2 py-1"></div>
        </div>

        <!-- Review content area (scrollable) -->
        <div id="review-content" class="flex-1 overflow-y-auto px-4 py-4 space-y-4"></div>
      </div>

      <!-- Query tab -->
      <div id="panel-query" class="hidden flex-1 flex flex-col overflow-hidden p-4 gap-3">

        <!-- Example query chips -->
        <div class="flex flex-wrap gap-2">
          <span class="text-xs text-slate-500 self-center mr-1">Examples:</span>
          <button class="chip" onclick="setQuery('MATCH (n) RETURN n')">MATCH (n) RETURN n</button>
          <button class="chip" onclick="setQuery('MATCH (n:Interest) RETURN n')">MATCH (n:Interest) RETURN n</button>
          <button class="chip" onclick="setQuery(&quot;CREATE (:Interest {topic: \&quot;yoga\&quot;, weight: 0.6})&quot;)">CREATE (:Interest {topic: "yoga", weight: 0.6})</button>
          <button class="chip" onclick="setQuery(&quot;MATCH (n:Interest {topic: \&quot;football\&quot;}) SET n.weight = 0.9&quot;)">SET n.weight = 0.9</button>
          <button class="chip" onclick="setQuery(&quot;MATCH (n:Interest {topic: \&quot;yoga\&quot;}) DELETE n&quot;)">DELETE yoga</button>
        </div>

        <!-- Query textarea -->
        <textarea
          id="query-input"
          rows="4"
          placeholder="Enter Cypher query…"
          class="bg-slate-800 text-slate-100 text-sm font-mono rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
          spellcheck="false"
        ></textarea>

        <!-- Run button -->
        <div class="flex gap-2 items-center">
          <button id="query-run-btn" onclick="runQuery()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">Run</button>
          <span id="query-summary" class="text-xs text-slate-400"></span>
        </div>

        <!-- Results area -->
        <div id="query-results" class="flex-1 overflow-auto rounded-lg border border-slate-700 bg-slate-800/50 text-xs"></div>
      </div>
    </main>
  </div>

  <!-- ── Styles for chips and tab buttons ─────────────────────────── -->
  <style>
    .chip {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 9999px;
      padding: 2px 10px;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      font-family: monospace;
    }
    .chip:hover { background: #334155; color: #e2e8f0; }
  </style>

  <!-- ── Client-side JavaScript ─────────────────────────────────── -->
  <script>
  // ── State ─────────────────────────────────────────────────────────────────
  const chatHistory = [];  // [{ role, content }]
  let network = null;

  // ── Tab switching ─────────────────────────────────────────────────────────
  function switchTab(tab) {
    const tabs = ['graph', 'query', 'review'];
    tabs.forEach(t => {
      const btn = document.getElementById('tab-' + t);
      const panel = document.getElementById('panel-' + t);
      if (t === tab) {
        btn.classList.add('border-indigo-500', 'text-indigo-400');
        btn.classList.remove('border-transparent', 'text-slate-400');
        panel.classList.remove('hidden');
      } else {
        btn.classList.remove('border-indigo-500', 'text-indigo-400');
        btn.classList.add('border-transparent', 'text-slate-400');
        panel.classList.add('hidden');
      }
    });
    if (tab === 'graph' && network) {
      network.redraw();
      network.fit();
    }
    if (tab === 'review') {
      loadPending();
    }
  }

  // ── Graph ─────────────────────────────────────────────────────────────────
  const GROUP_COLORS = {
    user:       { background: '#4f46e5', border: '#6366f1', highlight: { background: '#6366f1', border: '#818cf8' } },
    interest:   { background: '#7c3aed', border: '#8b5cf6', highlight: { background: '#8b5cf6', border: '#a78bfa' } },
    belief:     { background: '#065f46', border: '#10b981', highlight: { background: '#10b981', border: '#34d399' } },
    identity:   { background: '#9f1239', border: '#f43f5e', highlight: { background: '#f43f5e', border: '#fb7185' } },
    preference: { background: '#92400e', border: '#f59e0b', highlight: { background: '#f59e0b', border: '#fcd34d' } },
  };

  async function loadGraph() {
    const loading = document.getElementById('graph-loading');
    const detail = document.getElementById('node-detail');
    loading.classList.remove('hidden');
    detail.classList.add('hidden');

    try {
      const res = await fetch('/user-profile/graph/nodes');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { nodes, edges } = await res.json();

      const visNodes = new vis.DataSet(nodes.map(n => ({
        id: n.id,
        label: n.label,
        title: n.title || n.id,
        color: GROUP_COLORS[n.group] || GROUP_COLORS.user,
        font: { color: '#e2e8f0', size: 12 },
        shape: n.group === 'user' ? 'ellipse' : 'box',
        borderWidth: 1.5,
        _data: n.data,
        _group: n.group,
      })));

      const visEdges = new vis.DataSet(edges.map(e => ({
        from: e.from,
        to: e.to,
        label: e.label,
        color: { color: '#475569', highlight: '#94a3b8', hover: '#94a3b8' },
        font: { color: '#64748b', size: 10, background: 'transparent' },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        smooth: { type: 'curvedCW', roundness: 0.1 },
      })));

      const container = document.getElementById('graph-canvas');
      const data = { nodes: visNodes, edges: visEdges };
      const options = {
        layout: { improvedLayout: true },
        physics: {
          enabled: true,
          stabilization: { iterations: 100 },
          barnesHut: { gravitationalConstant: -8000, springConstant: 0.04, springLength: 120 },
        },
        interaction: { hover: true, tooltipDelay: 200, navigationButtons: false, keyboard: false },
        nodes: { margin: 6 },
        edges: { width: 1 },
      };

      if (network) network.destroy();
      network = new vis.Network(container, data, options);

      network.on('click', (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const node = visNodes.get(nodeId);
          showNodeDetail(node);
        } else {
          document.getElementById('node-detail').classList.add('hidden');
        }
      });

      loading.classList.add('hidden');
    } catch (err) {
      loading.textContent = 'Error loading graph: ' + err.message;
    }
  }

  function showNodeDetail(node) {
    const detail = document.getElementById('node-detail');
    document.getElementById('node-detail-label').textContent = (node._group || '') + ': ' + node.id;
    const table = document.getElementById('node-detail-table');
    const data = node._data || {};
    const rows = Object.entries(data).map(([k, v]) => {
      const val = v === null || v === undefined ? '—' : JSON.stringify(v).replace(/^"|"$/g, '');
      return \`<tr><td class="text-slate-500 pr-2 py-0.5 align-top">\${escHtml(k)}</td><td class="text-slate-200 break-all">\${escHtml(String(val))}</td></tr>\`;
    }).join('');
    table.innerHTML = rows || '<tr><td class="text-slate-500">No properties</td></tr>';
    detail.classList.remove('hidden');
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  function setQuery(q) {
    document.getElementById('query-input').value = q;
    switchTab('query');
  }

  async function runQuery() {
    const input = document.getElementById('query-input');
    const btn = document.getElementById('query-run-btn');
    const results = document.getElementById('query-results');
    const summary = document.getElementById('query-summary');
    const query = input.value.trim();
    if (!query) return;

    btn.disabled = true;
    results.innerHTML = '<div class="p-3 text-slate-400">Running…</div>';
    summary.textContent = '';

    try {
      const res = await fetch('/user-profile/graph/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (!res.ok) {
        results.innerHTML = \`<div class="p-3 text-red-400">\${escHtml(data.error || 'Unknown error')}</div>\`;
        summary.textContent = '';
      } else {
        summary.textContent = data.summary || '';
        renderQueryResults(data, results);

        // If mutation, refresh graph
        const mutating = /^(CREATE|MATCH.*\\b(SET|DELETE)\\b|SET\\s+CONTEXT)/i.test(query);
        if (mutating) loadGraph();
      }
    } catch (err) {
      results.innerHTML = \`<div class="p-3 text-red-400">\${escHtml(err.message)}</div>\`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderQueryResults({ columns, rows }, container) {
    if (!columns || columns.length === 0 || !rows || rows.length === 0) {
      container.innerHTML = '<div class="p-3 text-slate-500">No results</div>';
      return;
    }
    const headerCells = columns.map(c => \`<th class="text-left px-3 py-2 text-slate-400 font-medium border-b border-slate-700">\${escHtml(String(c))}</th>\`).join('');
    const bodyRows = rows.map(row =>
      '<tr class="border-b border-slate-700/50 hover:bg-slate-700/30">' +
      row.map(cell => {
        const display = cell === null || cell === undefined ? '<span class="text-slate-600">null</span>' : escHtml(JSON.stringify(cell).replace(/^"|"$/g, ''));
        return \`<td class="px-3 py-2 text-slate-300 font-mono">\${display}</td>\`;
      }).join('') +
      '</tr>'
    ).join('');
    container.innerHTML = \`
      <table class="w-full border-collapse text-xs">
        <thead><tr>\${headerCells}</tr></thead>
        <tbody>\${bodyRows}</tbody>
      </table>
    \`;
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  function appendMessage(role, content, toolCalls) {
    const container = document.getElementById('chat-messages');
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = isUser ? 'flex justify-end' : 'flex justify-start';

    const bubble = document.createElement('div');
    bubble.className = isUser
      ? 'bg-indigo-700 text-slate-100 rounded-2xl rounded-tr-sm px-3 py-2 text-sm max-w-[85%]'
      : 'bg-slate-700 text-slate-200 rounded-2xl rounded-tl-sm px-3 py-2 text-sm max-w-[85%]';

    // Render content with newlines
    bubble.innerHTML = escHtml(content).replace(/\\n/g, '<br>');

    wrapper.appendChild(bubble);

    // Tool call apply buttons
    if (toolCalls && toolCalls.length > 0) {
      const toolWrapper = document.createElement('div');
      toolWrapper.className = 'mt-2 flex flex-col gap-1 max-w-[85%]';
      toolCalls.forEach((tc, i) => {
        const btn = document.createElement('button');
        btn.className = 'text-left text-xs bg-indigo-900/60 border border-indigo-700/60 hover:bg-indigo-800/60 text-indigo-300 rounded-lg px-2 py-1.5 transition-colors';
        const preview = tc.action === 'facts'
          ? 'Apply: ' + JSON.stringify(tc.data).slice(0, 60) + (JSON.stringify(tc.data).length > 60 ? '…' : '')
          : 'Apply reaction: ' + (tc.data?.reaction || '?');
        btn.textContent = preview;
        btn.onclick = () => applyToolCall(tc, btn);
        toolWrapper.appendChild(btn);
      });
      const outerWrap = document.createElement('div');
      outerWrap.className = isUser ? 'flex justify-end' : 'flex justify-start';
      outerWrap.appendChild(toolWrapper);
      container.appendChild(wrapper);
      container.appendChild(outerWrap);
      container.scrollTop = container.scrollHeight;
      return;
    }

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
  }

  async function applyToolCall(tc, btn) {
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
      const endpoint = tc.action === 'facts'
        ? '/user-profile/profile/facts'
        : '/user-profile/profile/decisions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tc.data),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      btn.textContent = 'Applied ✓';
      btn.className = btn.className.replace(/indigo/g, 'green').replace('hover:bg-green-800\\/60', '');
      loadGraph();
    } catch (err) {
      btn.textContent = 'Error: ' + err.message;
      btn.disabled = false;
    }
  }

  async function sendChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const errorDiv = document.getElementById('chat-error');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;
    errorDiv.classList.add('hidden');

    chatHistory.push({ role: 'user', content: text });
    appendMessage('user', text);

    // Typing indicator
    const typingId = 'typing-' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'flex justify-start';
    typingEl.innerHTML = '<div class="bg-slate-700 text-slate-400 rounded-2xl rounded-tl-sm px-3 py-2 text-sm animate-pulse">Thinking…</div>';
    document.getElementById('chat-messages').appendChild(typingEl);
    document.getElementById('chat-messages').scrollTop = 99999;

    try {
      const res = await fetch('/user-profile/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
      });
      const data = await res.json();
      typingEl.remove();

      if (!res.ok) {
        throw new Error(data.error || 'HTTP ' + res.status);
      }

      chatHistory.push({ role: 'assistant', content: data.reply });
      appendMessage('assistant', data.reply, data.toolCalls);
    } catch (err) {
      typingEl.remove();
      // Remove the user message we added to history on failure
      chatHistory.pop();
      errorDiv.textContent = 'Error: ' + err.message;
      errorDiv.classList.remove('hidden');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // Enter key in chat input
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  document.getElementById('chat-send').addEventListener('click', sendChat);

  // Enter key in query textarea (Shift+Enter = newline, Ctrl+Enter = run)
  document.getElementById('query-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
  });

  // ── Review / Enrichment ───────────────────────────────────────────────────

  // Track pending count for badge
  let pendingCount = 0;

  function updateReviewBadge(count) {
    pendingCount = count;
    const badge = document.getElementById('review-badge');
    const tabBtn = document.getElementById('tab-review');
    if (count > 0) {
      badge.textContent = String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
    // Update tab label text (badge is a child span, label text is the text node before it)
    // Badge is already a child span so no extra label update needed.
  }

  async function loadPending() {
    const content = document.getElementById('review-content');
    const statusEl = document.getElementById('enrichment-status');
    content.innerHTML = '<div class="text-slate-500 text-sm">Loading…</div>';

    try {
      const res = await fetch('/user-profile/enrichment/pending');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { categories } = await res.json();

      // Count total pending
      const total = categories.reduce((sum, cat) => sum + cat.items.length, 0);
      updateReviewBadge(total);
      statusEl.textContent = total + ' item' + (total !== 1 ? 's' : '') + ' pending review';

      if (total === 0) {
        content.innerHTML = '<div class="text-slate-500 text-sm py-4">No pending items — run enrichment to generate suggestions.</div>';
        return;
      }

      content.innerHTML = '';
      for (const cat of categories) {
        content.appendChild(buildCategorySection(cat));
      }
    } catch (err) {
      content.innerHTML = '<div class="text-red-400 text-sm">' + escHtml('Error loading pending: ' + err.message) + '</div>';
    }
  }

  function buildCategorySection(cat) {
    const section = document.createElement('div');
    section.id = 'cat-section-' + cat.id;
    section.className = 'bg-slate-800 rounded-xl border border-slate-700 overflow-hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-750 cursor-pointer select-none';
    header.style.background = '#1a2744';
    header.innerHTML =
      '<div>' +
        '<span class="font-semibold text-slate-100 text-sm">' + escHtml(cat.label) + '</span>' +
        (cat.reasoning ? '<span class="ml-2 text-xs text-slate-400">' + escHtml(cat.reasoning) + '</span>' : '') +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        '<span id="cat-count-' + escHtml(cat.id) + '" class="text-xs text-slate-400">' + cat.items.length + ' items</span>' +
        '<button class="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 rounded transition-colors" onclick="approveAll(' + JSON.stringify(cat.id) + ')">Approve All</button>' +
        '<span class="text-slate-500 text-xs collapse-toggle">▼</span>' +
      '</div>';

    const itemsContainer = document.createElement('div');
    itemsContainer.id = 'cat-items-' + cat.id;
    itemsContainer.className = 'divide-y divide-slate-700/50';

    // Toggle collapse
    header.addEventListener('click', (e) => {
      // Don't toggle when clicking the Approve All button
      if (e.target.tagName === 'BUTTON') return;
      itemsContainer.classList.toggle('hidden');
      const toggle = header.querySelector('.collapse-toggle');
      toggle.textContent = itemsContainer.classList.contains('hidden') ? '▶' : '▼';
    });

    for (const item of cat.items) {
      itemsContainer.appendChild(buildItemRow(item));
    }

    section.appendChild(header);
    section.appendChild(itemsContainer);
    return section;
  }

  function buildItemRow(item) {
    const row = document.createElement('div');
    row.id = 'item-row-' + item.id;
    row.className = 'flex items-start gap-3 px-4 py-3 hover:bg-slate-700/30 transition-colors';

    const tags = (item.tags ?? []).map(t =>
      '<span class="bg-slate-700 text-slate-300 text-xs px-1.5 py-0.5 rounded">' + escHtml(t) + '</span>'
    ).join(' ');

    row.innerHTML =
      '<div class="flex-1 min-w-0">' +
        '<div class="font-semibold text-slate-100 text-sm">' + escHtml(item.label) + '</div>' +
        (item.description ? '<div class="text-xs text-slate-400 mt-0.5 leading-relaxed">' + escHtml(item.description) + '</div>' : '') +
        (tags ? '<div class="flex flex-wrap gap-1 mt-1.5">' + tags + '</div>' : '') +
      '</div>' +
      '<div class="flex gap-1.5 shrink-0 mt-0.5">' +
        '<button class="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1 rounded transition-colors" onclick="decideItem(' + JSON.stringify(item.id) + ', ' + JSON.stringify(item.category) + ', \\'approve\\')">✓ Approve</button>' +
        '<button class="text-xs bg-rose-800 hover:bg-rose-700 text-white px-2.5 py-1 rounded transition-colors" onclick="decideItem(' + JSON.stringify(item.id) + ', ' + JSON.stringify(item.category) + ', \\'reject\\')">✗ Reject</button>' +
      '</div>';

    return row;
  }

  function removeItemFromView(id, categoryId) {
    // Remove the item row
    const row = document.getElementById('item-row-' + id);
    if (row) row.remove();

    // Update count in category header
    const container = document.getElementById('cat-items-' + categoryId);
    const countEl = document.getElementById('cat-count-' + categoryId);
    if (container && countEl) {
      const remaining = container.querySelectorAll('[id^="item-row-"]').length;
      countEl.textContent = remaining + ' item' + (remaining !== 1 ? 's' : '');
      if (remaining === 0) {
        const section = document.getElementById('cat-section-' + categoryId);
        if (section) section.remove();
      }
    }

    // Update pending count
    updateReviewBadge(Math.max(0, pendingCount - 1));
    const statusEl = document.getElementById('enrichment-status');
    const newCount = Math.max(0, pendingCount - 1);
    statusEl.textContent = newCount + ' item' + (newCount !== 1 ? 's' : '') + ' pending review';

    // If no categories left, show empty state
    const content = document.getElementById('review-content');
    if (content && content.querySelectorAll('[id^="cat-section-"]').length === 0) {
      content.innerHTML = '<div class="text-slate-500 text-sm py-4">No pending items — run enrichment to generate suggestions.</div>';
    }
  }

  async function decideItem(id, categoryId, decision) {
    // Optimistic: remove from view immediately
    removeItemFromView(id, categoryId);

    // Post decision in background
    try {
      const res = await fetch('/user-profile/enrichment/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      if (!res.ok) {
        console.error('[enrichment] decide failed:', await res.text());
      }
      if (decision === 'approve') {
        // Refresh graph to show the new preference node
        loadGraph();
      }
    } catch (err) {
      console.error('[enrichment] decide error:', err.message);
    }
  }

  async function approveAll(categoryId) {
    const container = document.getElementById('cat-items-' + categoryId);
    if (!container) return;

    const rows = Array.from(container.querySelectorAll('[id^="item-row-"]'));
    const ids = rows.map(r => r.id.replace('item-row-', ''));

    // Optimistic: remove all items from view
    for (const id of ids) {
      removeItemFromView(id, categoryId);
    }

    if (ids.length === 0) return;

    // Batch POST
    try {
      const res = await fetch('/user-profile/enrichment/decide-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: ids.map(id => ({ id, decision: 'approve' })) }),
      });
      if (!res.ok) {
        console.error('[enrichment] decide-batch failed:', await res.text());
      }
      // Refresh graph to show new preference nodes
      loadGraph();
    } catch (err) {
      console.error('[enrichment] decide-batch error:', err.message);
    }
  }

  async function runEnrichment() {
    const btn = document.getElementById('enrichment-run-btn');
    const spinner = document.getElementById('enrichment-spinner');
    const statusEl = document.getElementById('enrichment-status');
    const errorEl = document.getElementById('enrichment-error');

    btn.disabled = true;
    spinner.classList.remove('hidden');
    statusEl.textContent = 'Running enrichment…';
    errorEl.classList.add('hidden');

    try {
      const res = await fetch('/user-profile/enrichment/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'HTTP ' + res.status);
      }

      statusEl.textContent = 'Added ' + data.added + ' suggestion' + (data.added !== 1 ? 's' : '') + '.';
      // Reload pending items
      await loadPending();
    } catch (err) {
      statusEl.textContent = '';
      errorEl.textContent = 'Error: ' + err.message;
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  loadGraph();
  // Pre-fetch pending count for badge without rendering full panel
  fetch('/user-profile/enrichment/pending')
    .then(r => r.json())
    .then(({ categories }) => {
      const total = (categories ?? []).reduce((sum, cat) => sum + (cat.items?.length ?? 0), 0);
      updateReviewBadge(total);
      const statusEl = document.getElementById('enrichment-status');
      if (statusEl) statusEl.textContent = total + ' item' + (total !== 1 ? 's' : '') + ' pending review';
    })
    .catch(() => { /* badge stays hidden */ });
  </script>
</body>
</html>`;
}
