import { getLocations, getProducts, getCurrentStock } from '../db.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, stock] = await Promise.all([getLocations(), getProducts(), getCurrentStock()]);

    const productsById = {};
    products.forEach(p => productsById[p.id] = p);

    // stock matrix: stockByProductLoc[product_id][location_id] = qty
    const stockByProductLoc = {};
    stock.forEach(r => {
      if (!stockByProductLoc[r.product_id]) stockByProductLoc[r.product_id] = {};
      stockByProductLoc[r.product_id][r.location_id] = (stockByProductLoc[r.product_id][r.location_id] || 0) + r.qty;
    });

    // Home store first (type === 'Main Warehouse'), then others alphabetically
    const homeStores = locations.filter(l => l.type === 'Main Warehouse').sort((a,b) => a.name.localeCompare(b.name));
    const consignees = locations.filter(l => l.type !== 'Main Warehouse').sort((a,b) => a.name.localeCompare(b.name));

    root.innerHTML = `
      <div class="toolbar">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;">
          Location
          <select id="locSelect">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
        </label>
      </div>
      <div class="panel" style="overflow-x:auto;">
        <table id="stockTable" style="min-width:800px;">
          <thead id="stockHead"></thead>
          <tbody id="stockBody"></tbody>
        </table>
      </div>
    `;

    function renderForLocation(locationId) {
      const filteredLoc = locations.find(l => l.id === locationId);
      // build column order: filtered first, then Home Stores, then other consignees (excluding filtered)
      const orderedLocations = [];
      if (filteredLoc) orderedLocations.push(filteredLoc);
      homeStores.forEach(l => { if (l.id !== locationId) orderedLocations.push(l); });
      consignees.forEach(l => { if (l.id !== locationId) orderedLocations.push(l); });

      // header
      root.querySelector('#stockHead').innerHTML = `
        <tr>
          <th style="position:sticky;left:0;background:var(--panel);z-index:1;">Product / Variant</th>
          ${orderedLocations.map(l => `<th class="num" style="${l.id === locationId ? 'background:rgba(255,255,255,0.03);font-weight:700;' : ''}">${l.name}${l.id === locationId ? ' ★' : ''}</th>`).join('')}
          <th class="num" style="font-weight:700;">Total</th>
        </tr>
      `;

      // rows: only products with qty != 0 at the filtered location
      const rows = stock.filter(r => r.location_id === locationId && r.qty !== 0);
      const body = root.querySelector('#stockBody');
      if (rows.length === 0) {
        body.innerHTML = `<tr><td colspan="${orderedLocations.length + 2}" style="color:var(--muted);text-align:center;">No stock at this location.</td></tr>`;
        return;
      }

      // dedupe: same product might appear multiple times in `stock` (unlikely but safe)
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
          const isFiltered = l.id === locationId;
          const style = isFiltered ? 'background:rgba(255,255,255,0.03);font-weight:700;' : '';
          return `<td class="num" style="${style}">${qty || ''}</td>`;
        }).join('');
        return `<tr>
          <td style="position:sticky;left:0;background:var(--panel);">${p.style_name} — ${p.color} ${p.size}</td>
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
