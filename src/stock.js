import { getLocations, getProducts, getCurrentStock } from '../db.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, stock] = await Promise.all([getLocations(), getProducts(), getCurrentStock()]);

    root.innerHTML = `
      <div class="toolbar">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;">
          Location
          <select id="locSelect">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
        </label>
      </div>
      <div class="panel">
        <table>
          <thead><tr><th>Product / Variant</th><th>Qty On Hand</th></tr></thead>
          <tbody id="stockBody"></tbody>
        </table>
      </div>
    `;

    const productsById = {};
    products.forEach(p => productsById[p.id] = p);

    function renderForLocation(locationId) {
      const rows = stock.filter(r => r.location_id === locationId && r.qty !== 0);
      const body = root.querySelector('#stockBody');
      if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="2" style="color:var(--muted);text-align:center;">No stock at this location.</td></tr>';
        return;
      }
      body.innerHTML = rows.map(r => {
        const p = productsById[r.product_id];
        if (!p) return '';
        return `<tr><td>${p.name} — ${p.color} ${p.size}</td><td>${r.qty}</td></tr>`;
      }).join('');
    }

    root.querySelector('#locSelect').addEventListener('change', (e) => renderForLocation(e.target.value));
    if (locations[0]) renderForLocation(locations[0].id);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load stock: ${err.message}</div>`;
  }
}
