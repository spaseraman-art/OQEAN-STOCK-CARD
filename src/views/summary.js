import { getLocations, getProducts, getCurrentStock, getSales, getDeliveries, getInvoices } from '../db.js';
import { fmtRp } from '../print.js';

let historyView = 'qty'; // 'qty' — reserved for future 'value' toggle

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, stock, sales, deliveries, invoices] = await Promise.all([
      getLocations(), getProducts(), getCurrentStock(), getSales(), getDeliveries(), getInvoices(),
    ]);

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

    const stockByProduct = {};
    stock.forEach(r => { stockByProduct[r.product_id] = (stockByProduct[r.product_id] || 0) + r.qty; });

    const totalStock = Object.values(stockByLoc).reduce((s, v) => s + v, 0);
    const totalStockValue = Object.values(valueByLoc).reduce((s, v) => s + v, 0);

    // ---- dates ----
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;
    const monthPrefix = now.toISOString().slice(0, 7);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const threeMonthPrefix = threeMonthsAgo.toISOString().slice(0, 7);

    // ---- sales MTD ----
    const salesThisMonth = sales.filter(s => s.sale_date.startsWith(monthPrefix));
    const salesValueMTD = salesThisMonth.reduce((s, r) => s + r.qty * r.unit_price, 0);
    const unitsSoldMTD = salesThisMonth.reduce((s, r) => s + r.qty, 0);

    const soldByLoc = {};
    const soldValueByLoc = {};
    salesThisMonth.forEach(s => {
      soldByLoc[s.location_id] = (soldByLoc[s.location_id] || 0) + s.qty;
      soldValueByLoc[s.location_id] = (soldValueByLoc[s.location_id] || 0) + s.qty * s.unit_price;
    });

    // ---- pending ----
    const pendingDeliveries = deliveries.filter(d => d.status === 'Approved' && d.type !== 'Return').length;
    const pendingReturns = deliveries.filter(d => d.status === 'Approved' && d.type === 'Return').length;

    const unpaidInvoices = invoices.filter(inv => inv.status === 'Unpaid' || inv.status === 'Overdue');
    const unpaidCount = unpaidInvoices.length;
    const unpaidTotal = unpaidInvoices.reduce((s, inv) => s + (inv.net_amount || 0), 0);

    // ---- broken sizes ----
    const groups = {};
    products.forEach(p => {
      const key = `${p.style_name}||${p.material}||${p.color}`;
      if (!groups[key]) groups[key] = { style_name: p.style_name, material: p.material, color: p.color, sizes: [] };
      groups[key].sizes.push({ sku: p.sku, size: p.size, qty: stockByProduct[p.id] || 0 });
    });
    const brokenSizes = [];
    Object.values(groups).forEach(g => {
      if (g.sizes.length < 2) return;
      const hasStock = g.sizes.some(s => s.qty > 0);
      const hasZero = g.sizes.some(s => s.qty === 0);
      if (hasStock && hasZero) {
        brokenSizes.push({ ...g, sizes: g.sizes.sort((a,b) => a.size.localeCompare(b.size)) });
      }
    });

    // ---- top sellers ----
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

    // ---- historical sales pivot by store × month (qty only) ----
    function buildPivot(year) {
      const byLoc = {};
      // init every location
      locations.forEach(l => {
        byLoc[l.id] = { name: l.name, months: new Array(12).fill(0), total: 0 };
      });
      sales.forEach(s => {
        if (!s.sale_date.startsWith(String(year))) return;
        const m = parseInt(s.sale_date.slice(5, 7), 10) - 1;
        if (!byLoc[s.location_id]) return;
        byLoc[s.location_id].months[m] += s.qty;
        byLoc[s.location_id].total += s.qty;
      });
      // monthly totals row
      const monthTotals = new Array(12).fill(0);
      let grandTotal = 0;
      Object.values(byLoc).forEach(row => {
        row.months.forEach((v, i) => monthTotals[i] += v);
        grandTotal += row.total;
      });
      return { byLoc, monthTotals, grandTotal };
    }

    const pivotThisYear = buildPivot(currentYear);
    const pivotLastYear = buildPivot(lastYear);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function renderPivotTable(year, pivot) {
      const rows = Object.values(pivot.byLoc).filter(r => r.total > 0 || true); // keep all
      return `
        <div class="panel" style="margin-bottom:16px;overflow-x:auto;">
          <div class="panel-head"><h3>${year} — Sales Qty by Store &amp; Month</h3></div>
          <table style="min-width:900px;">
            <thead>
              <tr>
                <th style="position:sticky;left:0;background:var(--panel);z-index:1;">Store</th>
                ${monthNames.map(m => `<th class="num">${m}</th>`).join('')}
                <th class="num" style="font-weight:700;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td style="position:sticky;left:0;background:var(--panel);">${r.name}</td>
                ${r.months.map(v => `<td class="num">${v || '–'}</td>`).join('')}
                <td class="num" style="font-weight:700;">${r.total || '–'}</td>
              </tr>`).join('')}
              <tr style="border-top:2px solid var(--border);">
                <td style="position:sticky;left:0;background:var(--panel);font-weight:700;">Total</td>
                ${pivot.monthTotals.map(v => `<td class="num" style="font-weight:700;">${v || '–'}</td>`).join('')}
                <td class="num" style="font-weight:700;">${pivot.grandTotal || '–'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    root.innerHTML = `
      <style>
        .dash-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }
        .dash-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px 18px;
        }
        .dash-card .lbl {
          color: var(--muted);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .dash-card .val {
          font-size: 22px;
          font-weight: 700;
          line-height: 1.15;
          word-break: break-word;
        }
        .dash-card .sub {
          color: var(--muted);
          font-size: 12px;
          margin-top: 6px;
        }
        .dash-card.wide .val { font-size: 26px; }
        .dash-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        @media (max-width: 900px) {
          .dash-grid { grid-template-columns: 1fr; }
        }
        .dash-grid th, .dash-grid td,
        .pivot-table th, .pivot-table td {
          padding: 9px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .dash-grid th, .pivot-table th {
          color: var(--muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 500;
        }
        .dash-grid tr:last-child td { border-bottom: none; }
        .dash-grid .num, .pivot-table .num { text-align: right; }
        .size-pill {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
          margin: 2px 4px 2px 0;
          background: rgba(255,255,255,0.05);
        }
        .size-pill.out { color: #e0603d; background: rgba(224,96,61,0.12); }
        .size-pill.ok  { color: #4ec97a; background: rgba(78,201,122,0.12); }
      </style>

      <div class="dash-cards">
        <div class="dash-card"><div class="lbl">Total Units in Stock</div><div class="val">${totalStock}</div></div>
        <div class="dash-card wide"><div class="lbl">Total Stock Value</div><div class="val">${fmtRp(totalStockValue)}</div></div>
        <div class="dash-card wide"><div class="lbl">Sales This Month</div><div class="val">${fmtRp(salesValueMTD)}</div><div class="sub">${unitsSoldMTD} units sold</div></div>
        <div class="dash-card"><div class="lbl">Pending Deliveries</div><div class="val">${pendingDeliveries}</div></div>
        <div class="dash-card"><div class="lbl">Pending Returns</div><div class="val">${pendingReturns}</div></div>
        <div class="dash-card"><div class="lbl">Unpaid Invoices</div><div class="val">${unpaidCount}</div><div class="sub">${fmtRp(unpaidTotal)}</div></div>
        <div class="dash-card"><div class="lbl">Broken Size Runs</div><div class="val">${brokenSizes.length}</div></div>
      </div>

      <div class="dash-grid">
        <div class="panel">
          <div class="panel-head"><h3>Stock by Location</h3></div>
          <table>
            <thead><tr><th>Location</th><th class="num">On Hand</th><th class="num">Stock Value</th><th class="num">Sold (MTD)</th><th class="num">Sold Value</th></tr></thead>
            <tbody>
              ${locations.map(l => `<tr>
                <td>${l.name}</td>
                <td class="num">${stockByLoc[l.id] || 0}</td>
                <td class="num">${fmtRp(valueByLoc[l.id] || 0)}</td>
                <td class="num">${soldByLoc[l.id] || 0}</td>
                <td class="num">${fmtRp(soldValueByLoc[l.id] || 0)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Top 5 Best Sellers (Last 3 Months)</h3></div>
          <table>
            <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Value</th></tr></thead>
            <tbody>
              ${topSellers.length === 0
                ? '<tr><td colspan="3" style="color:var(--muted);text-align:center;">No sales in this period.</td></tr>'
                : topSellers.map(t => `<tr>
                    <td>${t.product.style_name} — ${t.product.color} ${t.product.size}</td>
                    <td class="num">${t.qty}</td>
                    <td class="num">${fmtRp(t.value)}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="margin-top:16px;">
        <div class="panel-head"><h3>Broken Size Runs (${brokenSizes.length})</h3></div>
        <table>
          <thead><tr><th>Style</th><th>Colour</th><th>Size availability</th></tr></thead>
          <tbody>
            ${brokenSizes.length === 0
              ? '<tr><td colspan="3" style="color:var(--muted);text-align:center;">All size runs complete.</td></tr>'
              : brokenSizes.map(g => `<tr>
                  <td>${g.style_name}</td>
                  <td>${g.color}</td>
                  <td>${g.sizes.map(s => `<span class="size-pill ${s.qty > 0 ? 'ok' : 'out'}">${s.size}: ${s.qty}</span>`).join('')}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top:24px;">
        <h3 style="margin:0 0 12px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);">Historical Sales — Qty by Store &amp; Month</h3>
        ${renderPivotTable(currentYear, pivotThisYear)}
        ${renderPivotTable(lastYear, pivotLastYear)}
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load summary: ${err.message}</div>`;
  }
}
