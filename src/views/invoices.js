import { getLocations, getInvoices, getInvoiceWithItems, getSalesForPeriod, createInvoice, updateInvoiceStatus, voidInvoice } from '../db.js';
import { printInvoice, printOfficialInvoice, fmtRp } from '../print.js';
import { exportOfficialInvoiceExcel } from '../excel.js';

let invFilters = { status: 'all', consignee: 'all', period: '', search: '' };

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, invoices] = await Promise.all([getLocations(), getInvoices()]);
    const consignees = locations.filter(l => l.type === 'Consignment Store');
    renderList(root, invoices, consignees);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load invoices: ${err.message}</div>`;
  }
}

function renderList(root, invoices, consignees) {
  let filtered = invoices;
  if (invFilters.status !== 'all') filtered = filtered.filter(i => i.status === invFilters.status);
  if (invFilters.consignee !== 'all') filtered = filtered.filter(i => i.consignee_id === invFilters.consignee);
  if (invFilters.period) filtered = filtered.filter(i => (i.period_month || '').startsWith(invFilters.period));
  if (invFilters.search.trim()) {
    const q = invFilters.search.trim().toLowerCase();
    filtered = filtered.filter(i =>
      (i.ref || '').toLowerCase().includes(q) ||
      (i.locations?.name || '').toLowerCase().includes(q)
    );
  }

  const nonVoid = filtered.filter(i => i.status !== 'Void');
  const totalSales = nonVoid.reduce((s, i) => s + (i.total_sales || 0), 0);
  const totalComm = nonVoid.reduce((s, i) => s + (i.commission_amt || 0), 0);
  const owed = filtered
    .filter(i => i.status === 'Unpaid' || i.status === 'Overdue')
    .reduce((s, i) => s + (i.net_amount || 0), 0);

  root.innerHTML = `
    <div class="toolbar"><button class="btn" id="newInvBtn">+ New Invoice</button></div>

    <div class="panel" style="margin-bottom:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:12px 16px;">
        <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
          Status
          <select id="invFltStatus">
            <option value="all" ${invFilters.status === 'all' ? 'selected' : ''}>All</option>
            <option value="Unpaid" ${invFilters.status === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
            <option value="Overdue" ${invFilters.status === 'Overdue' ? 'selected' : ''}>Overdue</option>
            <option value="Paid" ${invFilters.status === 'Paid' ? 'selected' : ''}>Paid</option>
            <option value="Void" ${invFilters.status === 'Void' ? 'selected' : ''}>Void</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
          Consignee
          <select id="invFltConsignee" style="min-width:160px;">
            <option value="all">All</option>
            ${consignees.map(c => `<option value="${c.id}" ${invFilters.consignee === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
          Period
          <input type="month" id="invFltPeriod" value="${invFilters.period || ''}">
        </label>
        <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);flex:1;min-width:200px;">
          Search (ref / consignee)
          <input type="text" id="invFltSearch" value="${invFilters.search || ''}" placeholder="INV-... or store name">
        </label>
        <button class="btn secondary" id="invFltClear" style="margin-bottom:1px;">Clear</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border-top:1px solid var(--border);">
        <div style="padding:14px 16px;background:var(--panel);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Invoices Shown</div>
          <div style="font-size:18px;font-weight:700;">${filtered.length}</div>
        </div>
        <div style="padding:14px 16px;background:var(--panel);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Sales</div>
          <div style="font-size:18px;font-weight:700;">${fmtRp(totalSales)}</div>
        </div>
        <div style="padding:14px 16px;background:var(--panel);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Commission</div>
          <div style="font-size:18px;font-weight:700;">${fmtRp(totalComm)}</div>
        </div>
        <div style="padding:14px 16px;background:var(--panel);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Owed to OQEAN</div>
          <div style="font-size:18px;font-weight:700;color:var(--good);">${fmtRp(owed)}</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <table>
        <thead><tr><th>Ref</th><th>Consignee</th><th>Period</th><th class="num">Total Sales</th><th class="num">Commission</th><th class="num">Net to OQEAN</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.map(inv => `
            <tr class="hoverable" data-id="${inv.id}" ${inv.status === 'Void' ? 'style="opacity:0.5;"' : ''}>
              <td>${inv.ref}</td>
              <td>${inv.locations?.name || '—'}</td>
              <td>${(inv.period_month || '').slice(0, 7)}</td>
              <td class="num">${fmtRp(inv.total_sales)}</td>
              <td class="num">${inv.commission_pct}%</td>
              <td class="num">${fmtRp(inv.net_amount)}</td>
              <td>${inv.due_date || '—'}</td>
              <td><span class="badge ${inv.status === 'Paid' ? 'sent' : inv.status === 'Overdue' ? 'pending' : 'draft'}">${inv.status}</span></td>
            </tr>`).join('') || '<tr><td colspan="8" style="color:var(--muted);text-align:center;padding:20px;">No invoices match these filters.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div id="builderArea"></div>
    <div id="viewArea"></div>
  `;

  root.querySelector('#newInvBtn').addEventListener('click', () => renderBuilder(root, consignees));

  root.querySelector('#invFltStatus').addEventListener('change', (e) => { invFilters.status = e.target.value; renderList(root, invoices, consignees); });
  root.querySelector('#invFltConsignee').addEventListener('change', (e) => { invFilters.consignee = e.target.value; renderList(root, invoices, consignees); });
  root.querySelector('#invFltPeriod').addEventListener('change', (e) => { invFilters.period = e.target.value; renderList(root, invoices, consignees); });

  let searchTimer;
  root.querySelector('#invFltSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { invFilters.search = e.target.value; renderList(root, invoices, consignees); }, 400);
  });

  root.querySelector('#invFltClear').addEventListener('click', () => {
    invFilters = { status: 'all', consignee: 'all', period: '', search: '' };
    renderList(root, invoices, consignees);
  });

  root.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => renderDetail(root, row.dataset.id));
  });
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function renderBuilder(root, consignees) {
  const builderArea = root.querySelector('#builderArea');
  const thisMonth = new Date().toISOString().slice(0, 7);
  builderArea.innerHTML = `
    <div class="builder show">
      <div class="toolbar" style="justify-content:space-between;">
        <div style="font-weight:700;">New Invoice</div>
        <button class="btn secondary" id="cancelInv">✕ Cancel</button>
      </div>
      <div class="builder-section">
        <form class="entry-form" style="grid-template-columns:repeat(4,1fr);">
          <label>Consignee<select id="invConsignee">${consignees.map(c => `<option value="${c.id}" data-pct="${c.commission_pct}">${c.name}</option>`).join('')}</select></label>
          <label>Period<input type="month" id="invPeriod" value="${thisMonth}"></label>
          <label>Issue Date<input type="date" id="invIssue" value="${new Date().toISOString().slice(0,10)}"></label>
          <label>Due Date<input type="date" id="invDue" value="${new Date().toISOString().slice(0,10)}"></label>
        </form>
        <div style="padding:0 16px 16px;"><button class="btn secondary" id="pullBtn">Pull Sales for This Period →</button></div>
      </div>
      <div class="builder-section">
        <
