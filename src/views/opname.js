import { getLocations, getProducts, getCurrentStock, createOpname } from '../db.js';
import { printOpname } from '../print.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, stock] = await Promise.all([getLocations(), getProducts(), getCurrentStock()]);
    const productsById = {};
    products.forEach(p => productsById[p.id] = p);

    root.innerHTML = `
      <div class="toolbar">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;">
          Location<select id="opnLoc">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;">
          Count Date<input type="date" id="opnDate" value="${new Date().toISOString().slice(0,10)}">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;">
          Counted By<input type="text" id="opnBy" placeholder="Staff name">
        </label>
      </div>
      <div class="cards" id="opnCards">
        <div class="card"><div class="label">Items</div><div class="value" id="opnItems">0</div></div>
        <div class="card"><div class="label">System Total</div><div class="value" id="opnSystem">0</div></div>
        <div class="card"><div class="label">Counted Total</div><div class="value" id="opnCounted">0</div></div>
        <div class="card"><div class="label">Variance</div><div class="value" id="opnVariance">0</div></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Physical Count</h3>
          <button class="btn secondary" id="printOpnBtn">🖨️ Print Count Sheet</button>
        </div>
        <table><thead><tr><th>Product</th><th>System Qty</th><th>Counted Qty</th><th>Variance</th><th>Notes</th></tr></thead><tbody id="opnBody"></tbody></table>
      </div>
      <button class="btn" id="submitOpnBtn" style="margin-top:14px;">Submit Stock Opname</button>
    `;

    let currentItems = [];
    function renderForLocation(locationId) {
      currentItems = stock
        .filter(r => r.location_id === locationId)
        .map(r => ({ product_id: r.product_id, product: productsById[r.product_id], system_qty: r.qty }))
        .filter(r => r.product);
      const body = root.querySelector('#opnBody');
      body.innerHTML = currentItems.map((item, idx) => `
        <tr data-idx="${idx}">
          <td>${item.product.style_name} — ${item.product.color} ${item.product.size}</td>
          <td>${item.system_qty}</td>
          <td><input type="number" class="countInput" data-idx="${idx}" value="${item.system_qty}" min="0" style="width:70px;"></td>
          <td class="varCell">0</td>
          <td><input type="text" class="noteInput" data-idx="${idx}" placeholder="Optional"></td>
        </tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted);text-align:center;">No stock at this location.</td></tr>';
      body.querySelectorAll('.countInput').forEach(inp => inp.addEventListener('input', updateSummary));
      updateSummary();
    }

    function updateSummary() {
      let sys = 0, counted = 0;
      root.querySelectorAll('#opnBody tr[data-idx]').forEach(row => {
        const idx = row.dataset.idx;
        const item = currentItems[idx];
        const countedQty = parseInt(row.querySelector('.countInput').value, 10) || 0;
        sys += item.system_qty;
        counted += countedQty;
        const variance = countedQty - item.system_qty;
        const cell = row.querySelector('.varCell');
        cell.textContent = (variance > 0 ? '+' : '') + variance;
        cell.style.color = variance === 0 ? 'var(--muted)' : variance > 0 ? 'var(--good)' : 'var(--bad)';
      });
      root.querySelector('#opnItems').textContent = currentItems.length;
      root.querySelector('#opnSystem').textContent = sys;
      root.querySelector('#opnCounted').textContent = counted;
      const v = counted - sys;
      const vEl = root.querySelector('#opnVariance');
      vEl.textContent = (v > 0 ? '+' : '') + v;
      vEl.style.color = v === 0 ? 'var(--text)' : v > 0 ? 'var(--good)' : 'var(--bad)';
    }

    root.querySelector('#opnLoc').addEventListener('change', (e) => renderForLocation(e.target.value));
    if (locations[0]) renderForLocation(locations[0].id);

    root.querySelector('#printOpnBtn').addEventListener('click', () => {
      const locName = root.querySelector('#opnLoc').selectedOptions[0].textContent;
      printOpname({
        locationName: locName,
        countDate: root.querySelector('#opnDate').value,
        countedBy: root.querySelector('#opnBy').value,
        items: currentItems.map(i => ({ name: `${i.product.style_name} — ${i.product.color} ${i.product.size}`, system_qty: i.system_qty })),
      });
    });

    root.querySelector('#submitOpnBtn').addEventListener('click', async () => {
      const items = [...root.querySelectorAll('#opnBody tr[data-idx]')].map(row => {
        const idx = row.dataset.idx;
        const item = currentItems[idx];
        return {
          product_id: item.product_id,
          system_qty: item.system_qty,
          counted_qty: parseInt(row.querySelector('.countInput').value, 10) || 0,
          note: row.querySelector('.noteInput').value || null,
        };
      });
      try {
        await createOpname({
          location_id: root.querySelector('#opnLoc').value,
          count_date: root.querySelector('#opnDate').value,
          counted_by: root.querySelector('#opnBy').value || null,
          items,
        });
        alert('Stock opname submitted.');
        await render(root);
      } catch (err) {
        alert('Failed to submit: ' + err.message);
      }
    });
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load stock opname: ${err.message}</div>`;
  }
}
