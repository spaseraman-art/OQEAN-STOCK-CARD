import { getLocations, getProducts, getCurrentStock, getSales, getDeliveries, getInvoices } from '../db.js';
import { fmtRp } from '../print.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, stock, sales, deliveries, invoices] = await Promise.all([
      getLocations(), getProducts(), getCurrentStock(), getSales(), getDeliveries(), getInvoices(),
    ]);

    // ---- product lookup by id ----
    const prodById = {};
    products.forEach(p => prodById[p.id] = p);

    // ---- stock & value per location ----
    const stockByLoc = {};
    const valueByLoc = {};
    locations.forEach(l => { stockByLoc[l.id] = 0; valueByLoc[l.id] = 0; });
    stock.forEach(r => {
      stockByLoc[r.location_id] = (stockByLoc[r.location_id] || 0) + r.qty;
      const p = prodById[r.product_id];
      valueByLoc[r.location_id] = (valueByLoc[r.location_id] || 0) + r.qty * (p?.price || 0);
    });

    // ---- stock per product (all locations) ----
    const stockByProduct = {};
    stock.forEach(r => { stockByProduct[r.product_id] = (stockByProduct[r.product_id] || 0) + r.qty; });

    const totalStock = Object.values(stockByLoc).reduce((s, v) => s + v, 0);
    const totalStockValue = Object.values(valueByLoc).reduce((s, v) => s + v, 0);

    // ---- date helpers ----
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7); // "2026-09"
    // last 3 months window (including current month)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const threeMonthPrefix = threeMonthsAgo.toISOString().slice(0, 7);

    // ---- sales aggregations ----
    const salesThisMonth = sales.filter(s => s.sale_date.startsWith(monthPrefix));
    const salesValueMTD = salesThisMonth.reduce((s, r) => s + r.qty * r.unit_price, 0);
    const unitsSoldMTD = salesThisMonth.reduce((s, r) => s + r.qty, 0);

    const soldByLoc = {};
    const soldValueByLoc = {};
    salesThisMonth.forEach(s => {
      soldByLoc[s.location_id] = (soldByLoc[s.location_id] || 0) + s.qty;
      soldValueByLoc[s.location_id] = (soldValueByLoc[s.location_id] || 0) + s.qty * s.unit_price;
    });

    // ---- deliveries & returns ----
    const pendingDeliveries = deliveries.filter(d => d.status === 'Approved' && d.type !== 'Return').length;
    const pendingReturns = deliveries.filter(d => d.status === 'Approved' && d.type === 'Return').length;

    // ---- unpaid invoices ----
    const unpaidInvoices = invoices.filter(inv => inv.status === 'Unpaid' || inv.status === 'Overdue');
    const unpaidCount = unpaidInvoices.length;
    const unpaidTotal = unpaidInvoices.reduce((s, inv) => s + (inv.net_amount || 0), 0);

    // ---- out of stock SKUs ----
    const outOfStock = products.filter(p => (stockByProduct[p.id] || 0) === 0);

    // ---- broken size runs ----
    // group by style_name + material + color
    const groups = {};
    products.forEach(p => {
      const key = `${p.style_name}||${p.material}||${p.color}`;
      if (!groups[key]) groups[key] = { style_name: p.style_name, material: p.material, color: p.color, sizes: [] };
      groups[key].sizes.push({ sku: p.sku, size: p.size, qty: stockByProduct[p.id] || 0 });
    });
    const brokenSizes = [];
    Object.values(groups).forEach(g => {
      if (g.sizes.length < 2) return; // need at least 2 sizes to be "broken"
      const hasStock = g.sizes.some(s => s.qty > 0);
      const hasZero = g.sizes.some(s => s.qty === 0);
      if (hasStock && hasZero) {
        brokenSizes.push({ ...g, sizes: g.sizes.sort((a,b) => a.size.localeCompare(b.size)) });
      }
    });

    // ---- top 5 sellers (last 3 months by qty) ----
    const sales3mo = sales.filter(s => s.sale_date >= threeMonthPrefix + '-01');
    const sellerAgg = {};
    sales3mo.forEach(s => {
      if (!sellerAgg[s.product_id]) sellerAgg[s.product_id] = { qty: 0, value: 0 };
      sellerAgg[s.product_id].qty += s.qty;
      sellerAgg[s.product_id].value += s.qty * s.unit_price;
    });
    const topSellers = Object.entries(sellerAgg)
      .map(([pid, v]) => ({ product: prodById[pid], ...v }))
      .filter(x => x.product)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    root.innerHTML = `
      <div class="cards">
        <div class="card"><div class="label">Total Units in Stock</div><div class="value">${totalStock}</div></div>
        <div class="card"><div class="label">Total Stock Value</div><div class="value">${fmtRp(totalStockValue)}</div></div>
        <div class="card"><div class="label">Sales This Month</div><div class="value">${fmtRp(salesValueMTD)}</div><div style="color:var(--muted);font-size:12px;margin-top:4px;">${unitsSoldMTD} units sold</div></div>
        <div class="card"><div class="label">Pending Deliveries</div><div class="value">${pendingDeliveries}</div></div>
        <div class="card"><div class="label">Pending Returns</div><div class="value">${pendingReturns}</div></div>
        <div class="card"><div class="label">Unpaid Invoices</div><div class="value">${unpaidCount}</div><div style="color:var(--muted);font-size:12px;margin-top:4px;">${fmtRp(unpaidTotal)}</div></div>
        <div class="card"><div class="label">Out of Stock SKUs</div><div class="value">${outOfStock.length}</div></div>
        <div class="card"><div class="label">Broken Size Runs</div><div class="value">${brokenSizes.length}</div></div>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h3>Stock by Location</h3></div>
          <table>
            <thead><tr><th>Location</th><th>On Hand</th><th>Stock Value</th><th>Sold (MTD)</th><th>Sold Value (MTD)</th></tr></thead>
            <tbody>
              ${locations.map(l => `<tr>
                <td>${l.name}</td>
                <td>${stockByLoc[l.id] || 0}</td>
                <td>${fmtRp(valueByLoc[l.id] || 0)}</td>
                <td>${soldByLoc[l.id] || 0}</td>
                <td>${fmtRp(soldValueByLoc[l.id] || 0)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Recent Deliveries</h3></div>
          <table>
            <thead><tr><th>Ref</th><th>Status</th></tr></thead>
            <tbody>
              ${deliveries.slice(0, 6).map(d => `<tr><td>${d.ref}</td><td><span class="badge ${d.status.toLowerCase()}">${d.status}</span></td></tr>`).join('') || '<tr><td colspan="2" style="color:var(--muted);text-align:center;">No activity yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h3>Top 5 Best Sellers (Last 3 Months)</h3></div>
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Value</th></tr></thead>
            <tbody>
              ${topSellers.length === 0
                ? '<tr><td colspan="3" style="color:var(--muted);text-align:center;">No sales in this period.</td></tr>'
                : topSellers.map(t => `<tr>
                    <td>${t.product.style_name} — ${t.product.color} ${t.product.size}</td>
                    <td>${t.qty}</td>
                    <td>${fmtRp(t.value)}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Broken Size Runs (partial stock)</h3></div>
          <table>
            <thead><tr><th>Style</th><th>Colour</th><th>Sizes</th></tr></thead>
            <tbody>
              ${brokenSizes.length === 0
                ? '<tr><td colspan="3" style="color:var(--muted);text-align:center;">All size runs complete.</td></tr>'
                : brokenSizes.map(g => `<tr>
                    <td>${g.style_name}</td>
                    <td>${g.color}</td>
                    <td>${g.sizes.map(s => `<span style="color:${s.qty > 0 ? 'var(--good)' : '#e0603d'};margin-right:8px;">${s.size}:${s.qty}</span>`).join('')}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Out of Stock SKUs (${outOfStock.length})</h3></div>
        <table>
          <thead><tr><th>SKU</th><th>Product</th><th>Material</th><th>Colour</th><th>Size</th><th>Price</th></tr></thead>
          <tbody>
            ${outOfStock.length === 0
              ? '<tr><td colspan="6" style="color:var(--muted);text-align:center;">No out-of-stock SKUs.</td></tr>'
              : outOfStock.slice(0, 20).map(p => `<tr>
                  <td>${p.sku}</td>
                  <td>${p.style_name}</td>
                  <td>${p.material}</td>
                  <td>${p.color}</td>
                  <td>${p.size}</td>
                  <td>${fmtRp(p.price)}</td>
                </tr>`).join('')}
            ${outOfStock.length > 20 ? `<tr><td colspan="6" style="color:var(--muted);text-align:center;">…and ${outOfStock.length - 20} more.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load summary: ${err.message}</div>`;
  }
}
