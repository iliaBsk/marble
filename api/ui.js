/**
 * Server-side HTML builder for the Marble curation review UI.
 *
 * Exports a single function: buildUiHtml(items, stats)
 *   items  — array of scored content candidates
 *   stats  — { approved, rejected, pending } counts for the graph
 */

/**
 * Strip item_id to characters safe for double-quoted HTML attributes and
 * single-quoted JS strings without any additional escaping. This avoids the
 * HTML-attribute / JS-string escaping interaction entirely.
 * @param {unknown} raw
 * @returns {string}
 */
function safeId(raw) {
  return String(raw ?? '').replace(/[^A-Za-z0-9._-]/g, '_');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {object} item
 * @returns {string}
 */
function buildItemRow(item) {
  const id = safeId(item.item_id ?? item.id);
  const title = escapeHtml(item.title ?? 'Untitled');
  const source = escapeHtml(item.source ?? '');
  const score = typeof item.score === 'number' ? item.score.toFixed(3) : '—';

  // id contains only [A-Za-z0-9._-] so single-quote JS strings in the
  // double-quoted onclick attribute are safe with no additional escaping.
  return `
    <tr class="item-row" data-id="${id}">
      <td class="item-title">${title}</td>
      <td class="item-source">${source}</td>
      <td class="item-score">${score}</td>
      <td class="item-actions">
        <button class="btn-approve" onclick="decideItem('approve', '${id}')">Approve</button>
        <button class="btn-reject"  onclick="decideItem('reject',  '${id}')">Reject</button>
      </td>
    </tr>`;
}

/**
 * @param {object[]} items
 * @param {{ approved: number, rejected: number, pending: number }} stats
 * @returns {string}
 */
export function buildUiHtml(items = [], stats = { approved: 0, rejected: 0, pending: 0 }) {
  const rows = items.map(buildItemRow).join('');
  const totalItems = stats.approved + stats.rejected + stats.pending || 1;
  const approvedPct = Math.round((stats.approved / totalItems) * 100);
  const rejectedPct = Math.round((stats.rejected / totalItems) * 100);
  const pendingPct = 100 - approvedPct - rejectedPct;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marble — Curation Review</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #222; }
    header { background: #1a1a2e; color: #fff; padding: 14px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.2rem; font-weight: 600; letter-spacing: 0.05em; }

    /* Tabs */
    .tabs { display: flex; gap: 0; border-bottom: 2px solid #ddd; padding: 0 24px; background: #fff; }
    .tab { padding: 10px 20px; cursor: pointer; border: none; background: none; font-size: 0.95rem; color: #666; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: color 0.15s; }
    .tab:hover { color: #1a1a2e; }
    .tab.active { color: #1a1a2e; border-bottom-color: #1a1a2e; font-weight: 600; }

    /* Panels */
    .panel { display: none; padding: 24px; }
    .panel.active { display: block; }

    /* Graph */
    .graph-card { background: #fff; border-radius: 8px; padding: 20px; max-width: 520px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .graph-card h2 { font-size: 1rem; margin-bottom: 16px; color: #444; }
    .bar-group { display: flex; flex-direction: column; gap: 10px; }
    .bar-row { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
    .bar-label { width: 72px; text-align: right; color: #555; }
    .bar-track { flex: 1; background: #eee; border-radius: 4px; height: 18px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
    .bar-fill.approved { background: #22c55e; }
    .bar-fill.rejected { background: #ef4444; }
    .bar-fill.pending  { background: #f59e0b; }
    .bar-count { width: 32px; font-size: 0.8rem; color: #888; }

    /* Items table */
    .table-wrap { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; text-align: left; padding: 10px 14px; font-size: 0.82rem; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 10px 14px; border-top: 1px solid #eee; vertical-align: middle; }
    .item-title { max-width: 340px; font-size: 0.92rem; }
    .item-source { font-size: 0.8rem; color: #888; white-space: nowrap; }
    .item-score { font-variant-numeric: tabular-nums; font-size: 0.88rem; }
    .item-actions { white-space: nowrap; }
    .btn-approve, .btn-reject { padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.82rem; font-weight: 600; margin-right: 6px; transition: opacity 0.15s; }
    .btn-approve { background: #22c55e; color: #fff; }
    .btn-reject  { background: #ef4444; color: #fff; }
    .btn-approve:hover, .btn-reject:hover { opacity: 0.85; }
    .item-row.decided { opacity: 0.4; pointer-events: none; }

    /* Toast */
    #toast { position: fixed; bottom: 24px; right: 24px; background: #1a1a2e; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 0.88rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 999; }
    #toast.show { opacity: 1; }

    .empty { padding: 32px; text-align: center; color: #aaa; font-size: 0.95rem; }
  </style>
</head>
<body>
  <header>
    <h1>Marble — Curation Review</h1>
  </header>

  <div class="tabs">
    <button class="tab active" data-tab="items">Items (${items.length})</button>
    <button class="tab" data-tab="stats">Stats</button>
  </div>

  <div id="panel-items" class="panel active">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Source</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="items-body">
          ${rows || '<tr><td colspan="4" class="empty">No items to review</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div id="panel-stats" class="panel">
    <div class="graph-card">
      <h2>Decision breakdown</h2>
      <div class="bar-group">
        <div class="bar-row">
          <span class="bar-label">Approved</span>
          <div class="bar-track"><div class="bar-fill approved" style="width:${approvedPct}%"></div></div>
          <span class="bar-count">${stats.approved}</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">Rejected</span>
          <div class="bar-track"><div class="bar-fill rejected" style="width:${rejectedPct}%"></div></div>
          <span class="bar-count">${stats.rejected}</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">Pending</span>
          <div class="bar-track"><div class="bar-fill pending" style="width:${pendingPct}%"></div></div>
          <span class="bar-count">${stats.pending}</span>
        </div>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    // Tab switching
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Toast helper
    function showToast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, 2000);
    }

    // Decision handler — item ids are pre-sanitised to [A-Za-z0-9._-] server-side
    function decideItem(decision, itemId) {
      var row = document.querySelector('.item-row[data-id="' + CSS.escape(itemId) + '"]');
      if (row) { row.classList.add('decided'); }
      fetch('/ui/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decision, item_id: itemId })
      }).then(function(r) {
        return r.json();
      }).then(function(data) {
        showToast(data.message || (decision + ': ' + itemId));
      }).catch(function() {
        showToast('Request failed');
        if (row) { row.classList.remove('decided'); }
      });
    }
  </script>
</body>
</html>`;
}
