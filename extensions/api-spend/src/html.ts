/**
 * Self-contained HTML dashboard for API spend.
 * Inline CSS/JS — no external dependencies.
 */

export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Spend Dashboard</title>
<style>
  :root {
    --bg: #fff; --fg: #1a1a2e; --card-bg: #f8f9fa; --card-border: #e0e0e0;
    --accent: #4361ee; --muted: #6c757d; --ok: #2d6a4f; --err: #d00000;
    --warn: #e6a817; --unsupported: #6c757d;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a2e; --fg: #e0e0e0; --card-bg: #16213e; --card-border: #333;
      --accent: #7b8cde; --muted: #999; --ok: #52b788; --err: #ff6b6b;
      --warn: #ffd166; --unsupported: #888;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); padding: 1.5rem; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.25rem; }
  .controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .controls select, .controls input, .controls button { font-size: 0.85rem; padding: 0.35rem 0.6rem; border: 1px solid var(--card-border); border-radius: 6px; background: var(--card-bg); color: var(--fg); }
  .controls button { cursor: pointer; background: var(--accent); color: #fff; border-color: var(--accent); }
  .controls button:hover { opacity: 0.85; }
  .custom-range { display: none; gap: 0.4rem; align-items: center; }
  .custom-range.visible { display: flex; }
  .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 1rem; }
  .card h2 { font-size: 1rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
  .badge { font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 500; }
  .badge.ok { background: var(--ok); color: #fff; }
  .badge.error { background: var(--err); color: #fff; }
  .badge.no_key { background: var(--warn); color: #000; }
  .badge.unsupported { background: var(--unsupported); color: #fff; }
  .cost { font-size: 1.6rem; font-weight: 700; margin: 0.5rem 0; }
  .breakdown { width: 100%; font-size: 0.8rem; border-collapse: collapse; margin-top: 0.5rem; }
  .breakdown td { padding: 0.2rem 0; border-bottom: 1px solid var(--card-border); }
  .breakdown td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .note { font-size: 0.78rem; color: var(--muted); margin-top: 0.5rem; word-break: break-word; }
  .note a { color: var(--accent); }
  .error-text { color: var(--err); font-size: 0.8rem; margin-top: 0.25rem; }
  .meta { color: var(--muted); font-size: 0.78rem; margin-top: 1rem; }
  .loading { text-align: center; padding: 2rem; color: var(--muted); }
  .total-bar { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 0.8rem 1rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; }
  .total-bar .amount { font-size: 1.3rem; font-weight: 700; }
  .total-bar .label { color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>
<h1>API Spend Dashboard</h1>
<p class="subtitle">Billing overview across configured AI providers</p>

<div class="controls">
  <select id="range">
    <option value="today">Today</option>
    <option value="7d" selected>Last 7 days</option>
    <option value="30d">Last 30 days</option>
    <option value="billing">Billing period</option>
    <option value="custom">Custom range</option>
  </select>
  <div class="custom-range" id="customRange">
    <input type="date" id="startDate">
    <span>to</span>
    <input type="date" id="endDate">
  </div>
  <button id="refreshBtn">Refresh</button>
</div>

<div id="totalBar" class="total-bar" style="display:none">
  <span class="label">Total (available providers)</span>
  <span class="amount" id="totalAmount">$0.00</span>
</div>

<div id="content" class="loading">Loading...</div>
<p class="meta" id="meta"></p>

<script>
(function() {
  const rangeEl = document.getElementById('range');
  const customEl = document.getElementById('customRange');
  const contentEl = document.getElementById('content');
  const metaEl = document.getElementById('meta');
  const totalBarEl = document.getElementById('totalBar');
  const totalAmountEl = document.getElementById('totalAmount');
  const refreshBtn = document.getElementById('refreshBtn');
  const startDateEl = document.getElementById('startDate');
  const endDateEl = document.getElementById('endDate');

  // Set default custom date range
  const now = new Date();
  endDateEl.value = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  startDateEl.value = weekAgo.toISOString().slice(0, 10);

  rangeEl.addEventListener('change', function() {
    customEl.classList.toggle('visible', rangeEl.value === 'custom');
    if (rangeEl.value !== 'custom') fetchData();
  });
  refreshBtn.addEventListener('click', fetchData);
  startDateEl.addEventListener('change', function() { if (rangeEl.value === 'custom') fetchData(); });
  endDateEl.addEventListener('change', function() { if (rangeEl.value === 'custom') fetchData(); });

  function getRange() {
    if (rangeEl.value === 'custom') {
      return startDateEl.value + '..' + endDateEl.value;
    }
    return rangeEl.value;
  }

  function fmtUsd(n) { return '$' + n.toFixed(2); }

  function linkify(text) {
    return text.replace(/(https?:\\/\\/[^\\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function renderCard(r) {
    var html = '<div class="card"><h2>' + esc(r.provider) + ' <span class="badge ' + r.status + '">' + esc(r.status) + '</span></h2>';
    if (r.status === 'ok') {
      html += '<div class="cost">' + fmtUsd(r.totalCostUsd || 0) + '</div>';
      if (r.breakdown && r.breakdown.length) {
        html += '<table class="breakdown">';
        for (var i = 0; i < r.breakdown.length; i++) {
          html += '<tr><td>' + esc(r.breakdown[i].label) + '</td><td>' + fmtUsd(r.breakdown[i].costUsd) + '</td></tr>';
        }
        html += '</table>';
      }
    }
    if (r.error) html += '<p class="error-text">' + esc(r.error) + '</p>';
    if (r.note) html += '<p class="note">' + linkify(esc(r.note)) + '</p>';
    html += '</div>';
    return html;
  }

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fetchData() {
    contentEl.className = 'loading';
    contentEl.textContent = 'Loading...';
    totalBarEl.style.display = 'none';

    fetch('./api/usage?range=' + encodeURIComponent(getRange()))
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var results = data.results || [];
        if (!results.length) {
          contentEl.className = '';
          contentEl.textContent = 'No provider data available.';
          return;
        }
        contentEl.className = 'cards';
        contentEl.innerHTML = results.map(renderCard).join('');

        var total = 0;
        var hasOk = false;
        for (var i = 0; i < results.length; i++) {
          if (results[i].status === 'ok') {
            total += results[i].totalCostUsd || 0;
            hasOk = true;
          }
        }
        if (hasOk) {
          totalBarEl.style.display = 'flex';
          totalAmountEl.textContent = fmtUsd(total);
        }
        metaEl.textContent = 'Last refreshed: ' + new Date().toLocaleTimeString();
      })
      .catch(function(err) {
        contentEl.className = '';
        contentEl.textContent = 'Failed to fetch data: ' + err.message;
      });
  }

  fetchData();
})();
</script>
</body>
</html>`;
}
