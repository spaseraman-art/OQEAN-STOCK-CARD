import { getLocations, getProducts, getCurrentStock } from '../db.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, stock] = await Promise.all([getLocations(), getProducts(), getCurrentStock()]);

    const productsById = {};
    products.forEach(p => productsById[p.id] = p);

    const stockByProductLoc = {};
    stock.forEach(r => {
      if (!stockByProductLoc[r.product_id]) stockByProductLoc[r.product_id] = {};
      stockByProductLoc[r.product_id][r.location_id] = (stockByProductLoc[r.product_id][r.location_id] || 0) + r.qty;
    });

    const homeStores = locations.filter(l => l.type === 'Main Warehouse').sort((a,b) => a.name.localeCompare(b.name));
    const consignees = locations.filter(l => l.type !== 'Main Warehouse').sort((a,b) => a.name.localeCompare(b.name));

    root.innerHTML = `
      <style>
        .stock-panel {
          overflow: auto;
          max-height: 72vh;
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .stock-table {
          min-width: 800px;
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
        }
        .stock-table th, .stock-table td {
          padding: 10px 14px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .stock-table th {
          position: sticky;
          top: 0;
          background: var(--panel);
          z-index: 2;
          color: var(--muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 500;
          white-space: nowrap;
        }
        .stock-table th.product-col,
        .stock-table td.product-col {
          position: sticky;
          left: 0;
          background: var(--panel);
          z-index: 1;
        }
        .stock-table th.product-col {
          z-index: 3;
        }
        .stock-table td.num, .stock-table th.num {
          text-align: right;
        }
        .stock-table th.filtered-col {
          background: #232323;
          font-weight: 700;
        }
        .stock-table td.filtered-col {
          background: rgba(255,255,255,0.03);
          font-weight: 700;
        }
        .stock-table tr:last-child td {
          border-bottom: none;
        }
      </style>
            <div class="toolbar" style="display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;">
          Location
          <select id="locSelect">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
        </label>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:12px;color:var(--muted);font-weight:600;">Total Units</span>
          <span id="locTotal" style="font-size:22px;font-weight:700;">—</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:12px;color:var(--muted);font-weight:600;">Stock Value</span>
          <span id="locValue" style="font-size:22px;font-weight:700;">—</span>
        </div>
      </div>
      <div class="stock-panel">
        <table class="stock-table">
          <thead id="stockHead"></thead>
          <tbody id="stockBody"></tbody>
        </table>
      </div>
    `;

    function renderForLocation(locationId) {
      const filteredLoc = locations.find(l => l.id === locationId);
      const orderedLocations = [];
      if (filteredLoc) orderedLocations.push(filteredLoc);
      homeStores.forEach(l => { if (l.id !== locationId) orderedLocations.push(l); });
      consignees.forEach(l => { if (l.id !== locationId) orderedLocations.push(l); });

      // header
      root.querySelector('#stockHead').innerHTML = `
        <tr>
          <th class="product-col">Product / Variant</th>
          ${orderedLocations.map(l => `<th class="num ${l.id === locationId ? 'filtered-col' : ''}">${l.name}${l.id === locationId ? ' ★' : ''}</th>`).join('')}
          <th class="num" style="font-weight:700;">Total</th>
        </tr>
      `;

      // rows
      const rows = stock.filter(r => r.location_id === locationId && r.qty !== 0);
      const body = root.querySelector('#stockBody');
      if (rows.length === 0) {
        body.innerHTML = `<tr><td colspan="${orderedLocations.length + 2}" style="color:var(--muted);text-align:center;padding:20px;">No stock at this location.</td></tr>`;
        return;
      }

      const seenProducts = new Set();
      const uniqueRows = [];
      rows.forEach(r => {
        if (seenProducts.has(r.product_id)) return;
        seenProducts.add(r.product_id);
        uniqueRows.push(r);
      });

      body.innerHTML = uniqueRows.map(r => {
        const p = productsById[r.product_id];
        if (!p) return '';
        const productStock = stockByProductLoc[r.product_id] || {};
        const total = Object.values(productStock).reduce((s, v) => s + v, 0);
        const cells = orderedLocations.map(l => {
          const qty = productStock[l.id] || 0;
          const cls = l.id === locationId ? 'num filtered-col' : 'num';
          return `<td class="${cls}">${qty || ''}</td>`;
        }).join('');
        return `<tr>
          <td class="product-col">${p.style_name} — ${p.color} ${p.size}</td>
          ${cells}
          <td class="num" style="font-weight:700;">${total || ''}</td>
        </tr>`;
      }).join('');
    }

    root.querySelector('#locSelect').addEventListener('change', (e) => renderForLocation(e.target.value));
    if (locations[0]) renderForLocation(locations[0].id);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load stock: ${err.message}</div>`;
  }
}
