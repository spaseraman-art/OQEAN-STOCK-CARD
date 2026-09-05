import { getLocations, getCurrentStock, getSales, getDeliveries } from '../db.js';
import { fmtRp } from '../print.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, stock, sales, deliveries] = await Promise.all([
      getLocations(), getCurrentStock(), getSales(), getDeliveries(),
    ]);

    const stockByLoc = {};
    locations.forEach(l => stockByLoc[l.id] = 0);
    stock.forEach(r => { stockByLoc[r.location_id] = (stockByLoc[r.location_id] || 0) + r.qty; });

    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const salesThisMonth = sales.filter(s => s.sale_date.startsWith(monthPrefix));
    const salesValue = salesThisMonth.reduce((s, r) => s + r.qty * r.unit_price, 0);
    const totalStock = Object.values(stockByLoc).reduce((s, v) => s + v, 0);
    const pendingDeliveries = deliveries.filter(d => d.status !== 'Sent').length;

    const soldByLoc = {};
    salesThisMonth.forEach(s => { soldByLoc[s.location_id] = (soldByLoc[s.location_id] || 0) + s.qty; });

    root.innerHTML = `
      <div class="cards">
        <div class="card"><div class="label">Total Units in Stock</div><div class="value">${totalStock}</div></div>
        <div class="card"><div class="label">Sales This Month</div><div class="value">${fmtRp(salesValue)}</div><div style="color:var(--muted);font-size:12px;margin-top:4px;">${salesThisMonth.reduce((s,r)=>s+r.qty,0)} units sold</div></div>
        <div class="card"><div class="label">Pending Deliveries</div><div class="value">${pendingDeliveries}</div></div>
      </div>
      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h3>Stock by Location</h3></div>
          <table>
            <thead><tr><th>Location</th><th>On Hand</th><th>Sold (MTD)</th></tr></thead>
            <tbody>
              ${locations.map(l => `<tr><td>${l.name}</td><td>${stockByLoc[l.id] || 0}</td><td>${soldByLoc[l.id] || 0}</td></tr>`).join('')}
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
    `;
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load summary: ${err.message}</div>`;
  }
}
