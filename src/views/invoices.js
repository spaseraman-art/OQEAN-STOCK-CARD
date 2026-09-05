import { getLocations, getInvoices, getInvoiceWithItems, getSalesForPeriod, createInvoice, updateInvoiceStatus } from '../db.js';
import { printInvoice, fmtRp } from '../print.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, invoices] = await Promise.all([getLocations(), getInvoices()]);
    const consignees = locations.filter(l => l.type === 'Consignment Store');

    root.innerHTML = `
      <div class="toolbar"><button class="btn" id="newInvBtn">+ New Invoice</button></div>
      <div class="panel">
        <table>
          <thead><tr><th>Ref</th><th>Consignee</th><th>Period</th><th>Total Sales</th><th>Commission</th><th>Net to OQEAN</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            ${invoices.map(inv => `
              <tr class="hoverable" data-id="${inv.id}">
                <td>${inv.ref}</td><td>${inv.locations.name}</td><td>${inv.period_month.slice(0,7)}</td>
                <td>${fmtRp(inv.total_sales)}</td><td>${inv.commission_pct}%</td><td>${fmtRp(inv.net_amount)}</td>
                <td>${inv.due_date}</td><td><span class="badge ${inv.status==='Paid'?'sent':inv.status==='Overdue'?'pending':'draft'}">${inv.status}</span></td>
              </tr>`).join('') || '<tr><td colspan="8" style="color:var(--muted);text-align:center;">No invoices yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div id="builderArea"></div>
      <div id="viewArea"></div>
    `;

    root.querySelector('#newInvBtn').addEventListener('click', () => renderBuilder(root, consignees));
    root.querySelectorAll('tbody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => renderDetail(root, row.dataset.id));
    });
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load invoices: ${err.message}</div>`;
  }
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
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
        <div class="panel"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead><tbody id="invItemsBody"><tr><td colspan="5" style="color:var(--muted);text-align:center;">Pull sales to populate.</td></tr></tbody></table></div>
      </div>
      <div class="builder-section">
        <div class="cards" style="margin-bottom:0;">
          <div class="card"><div class="label">Total Sales</div><div class="value" id="totSales">Rp 0</div></div>
          <div class="card"><div class="label">Commission %</div><div class="value"><input type="number" id="commRate" value="40" style="width:70px;background:transparent;border:none;color:var(--text);font-size:20px;font-weight:700;"></div></div>
          <div class="card"><div class="label">Commission Amt</div><div class="value" id="commAmt">Rp 0</div></div>
          <div class="card"><div class="label">Net to OQEAN</div><div class="value" id="netAmt" style="color:var(--good);">Rp 0</div></div>
        </div>
      </div>
      <button class="btn" id="createInvBtn">Create Invoice</button>
    </div>
  `;
  let pulledSales = [];
  builderArea.querySelector('#cancelInv').addEventListener('click', () => { builderArea.innerHTML = ''; });

  const consSelect = builderArea.querySelector('#invConsignee');
  const rateInput = builderArea.querySelector('#commRate');
  rateInput.value = consSelect.options[0]?.dataset.pct || 40;
  consSelect.addEventListener('change', () => {
    rateInput.value = consSelect.options[consSelect.selectedIndex].dataset.pct || 40;
  });

  function updateTotals() {
    const total = pulledSales.reduce((s, r) => s + r.qty * r.unit_price, 0);
    const rate = parseFloat(rateInput.value) || 0;
    const comm = Math.round(total * rate / 100);
    builderArea.querySelector('#totSales').textContent = fmtRp(total);
    builderArea.querySelector('#commAmt').textContent = fmtRp(comm);
    builderArea.querySelector('#netAmt').textContent = fmtRp(total - comm);
  }
  rateInput.addEventListener('input', updateTotals);

  builderArea.querySelector('#pullBtn').addEventListener('click', async () => {
    const { start, end } = monthBounds(builderArea.querySelector('#invPeriod').value);
    try {
      pulledSales = await getSalesForPeriod(consSelect.value, start, end);
      const body = builderArea.querySelector('#invItemsBody');
      body.innerHTML = pulledSales.map(s =>
        `<tr><td>${s.sale_date}</td><td>${s.products.name} — ${s.products.color} ${s.products.size}</td><td>${s.qty}</td><td>${fmtRp(s.unit_price)}</td><td>${fmtRp(s.qty*s.unit_price)}</td></tr>`
      ).join('') || `<tr><td colspan="5" style="color:var(--muted);text-align:center;">No sales found for this period.</td></tr>`;
      updateTotals();
    } catch (err) {
      alert('Failed to pull sales: ' + err.message);
    }
  });

  builderArea.querySelector('#createInvBtn').addEventListener('click', async () => {
    if (pulledSales.length === 0) { alert('Pull sales first — nothing to invoice.'); return; }
    try {
      const { start } = monthBounds(builderArea.querySelector('#invPeriod').value);
      const invoice = await createInvoice({
        consignee_id: consSelect.value,
        period_month: start,
        issue_date: builderArea.querySelector('#invIssue').value,
        due_date: builderArea.querySelector('#invDue').value,
        commission_pct: parseFloat(rateInput.value) || 0,
        sales: pulledSales,
      });
      alert(`${invoice.ref} created.`);
      await render(root);
    } catch (err) {
      alert('Failed to create invoice: ' + err.message);
    }
  });
}

async function renderDetail(root, id) {
  const viewArea = root.querySelector('#viewArea');
  viewArea.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const full = await getInvoiceWithItems(id);
    viewArea.innerHTML = `
      <div class="builder show">
        <div class="toolbar" style="justify-content:space-between;">
          <div style="font-weight:700;">${full.ref} <span class="badge ${full.status==='Paid'?'sent':full.status==='Overdue'?'pending':'draft'}">${full.status}</span></div>
          <button class="btn secondary" id="closeInvDetail">✕ Close</button>
        </div>
        <div class="panel" style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
          <div><b style="color:var(--muted);font-size:11px;">Consignee</b><div>${full.locations.name}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Period</b><div>${full.period_month.slice(0,7)}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Issue</b><div>${full.issue_date}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Due</b><div>${full.due_date}</div></div>
        </div>
        <div class="panel">
          <table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
          <tbody>${full.invoice_items.map(i => `<tr><td>${i.sale_date}</td><td>${i.products.name} — ${i.products.color} ${i.products.size}</td><td>${i.qty}</td><td>${fmtRp(i.unit_price)}</td><td>${fmtRp(i.qty*i.unit_price)}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="cards" style="margin-bottom:0;">
          <div class="card"><div class="label">Total Sales</div><div class="value">${fmtRp(full.total_sales)}</div></div>
          <div class="card"><div class="label">Commission</div><div class="value">${fmtRp(full.commission_amt)}</div></div>
          <div class="card"><div class="label">Net to OQEAN</div><div class="value" style="color:var(--good);">${fmtRp(full.net_amount)}</div></div>
        </div>
        <div class="panel" style="padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <select id="statusSel"><option ${full.status==='Unpaid'?'selected':''}>Unpaid</option><option ${full.status==='Overdue'?'selected':''}>Overdue</option><option ${full.status==='Paid'?'selected':''}>Paid</option></select>
          <input type="date" id="paymentDate" value="${full.payment_date || ''}">
          <button class="btn secondary" id="updateStatusBtn">Update Status</button>
        </div>
        <div class="toolbar"><button class="btn secondary" id="printInvBtn">🖨️ Print</button></div>
      </div>
    `;
    viewArea.querySelector('#closeInvDetail').addEventListener('click', () => { viewArea.innerHTML = ''; });
    viewArea.querySelector('#printInvBtn').addEventListener('click', () => printInvoice(full));
    viewArea.querySelector('#updateStatusBtn').addEventListener('click', async () => {
      try {
        await updateInvoiceStatus(full.id, viewArea.querySelector('#statusSel').value, viewArea.querySelector('#paymentDate').value);
        await render(root);
      } catch (err) {
        alert('Failed to update: ' + err.message);
      }
    });
  } catch (err) {
    viewArea.innerHTML = `<div class="error-msg">Failed to load invoice: ${err.message}</div>`;
  }
}
