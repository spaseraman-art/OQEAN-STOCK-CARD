function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('en-US');
}

function setMeta(fields) {
  const box = document.getElementById('p-meta');
  box.innerHTML = fields.map(([label, value]) =>
    `<div><b style="display:block;font-size:9.5px;text-transform:uppercase;color:#666;margin-bottom:2px;">${label}</b>${value}</div>`
  ).join('');
}

export function printDelivery(full) {
  document.getElementById('p-doctitle').textContent = full.type === 'Return' ? 'Return Order' : 'Delivery Order';
  document.getElementById('p-ref').textContent = full.ref;
  document.getElementById('p-status').textContent = full.status;
  setMeta([
    ['From', full.from_location.name],
    ['To', full.to_location.name],
    ['Scheduled Date', full.scheduled_date],
    ['Status', full.status],
  ]);
  document.getElementById('p-thead-row').innerHTML =
    '<th>SKU</th><th>Product</th><th>Color</th><th>Size</th><th>Qty</th>';
  document.getElementById('p-items').innerHTML = full.delivery_items.map(i =>
    `<tr><td>${i.products.sku}</td><td>${i.products.style_name}</td><td>${i.products.color}</td><td>${i.products.size}</td><td>${i.qty}</td></tr>`
  ).join('');
  const total = full.delivery_items.reduce((s, i) => s + i.qty, 0);
  document.getElementById('p-tfoot').innerHTML =
    `<tr><td colspan="4" style="text-align:right;">Total Units</td><td>${total}</td></tr>`;
  document.getElementById('p-sign-1').textContent = 'Prepared By';
  document.getElementById('p-sign-2').textContent = full.type === 'Return' ? 'Returned By' : 'Sent By';
  document.getElementById('p-sign-3').textContent = 'Received By';
  window.print();
}

export function printOpname({ locationName, countDate, countedBy, items }) {
  document.getElementById('p-doctitle').textContent = 'Stock Count Sheet';
  document.getElementById('p-ref').textContent = locationName;
  document.getElementById('p-status').textContent = 'Pending Count';
  const systemTotal = items.reduce((s, i) => s + i.system_qty, 0);
  setMeta([
    ['Location', locationName],
    ['Count Date', countDate],
    ['Counted By', countedBy || '________________'],
    ['Total System Qty', systemTotal],
  ]);
  document.getElementById('p-thead-row').innerHTML =
    '<th>Product / Variant</th><th>System Qty</th><th>Counted Qty</th><th>Notes</th>';
  document.getElementById('p-items').innerHTML = items.map(i =>
    `<tr><td>${i.name}</td><td>${i.system_qty}</td><td></td><td></td></tr>`
  ).join('');
  document.getElementById('p-tfoot').innerHTML =
    `<tr><td>Total Items</td><td>${items.length}</td><td></td><td></td></tr>`;
  document.getElementById('p-sign-1').textContent = 'Counted By';
  document.getElementById('p-sign-2').textContent = 'Verified By';
  document.getElementById('p-sign-3').textContent = 'Approved By';
  window.print();
}

export function printInvoice(full) {
  document.getElementById('p-doctitle').textContent = 'Consignment Invoice';
  document.getElementById('p-ref').textContent = full.ref;
  document.getElementById('p-status').textContent = full.status;
  setMeta([
    ['Bill To', full.locations.name],
    ['Period', full.period_month],
    ['Issue Date', full.issue_date],
    ['Due Date', full.due_date],
  ]);
  document.getElementById('p-thead-row').innerHTML =
    '<th>Date</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th>';
  document.getElementById('p-items').innerHTML = full.invoice_items.map(i =>
    `<tr><td>${i.sale_date}</td><td>${i.products.style_name} — ${i.products.color} ${i.products.size}</td><td>${i.qty}</td><td>${fmtRp(i.unit_price)}</td><td>${fmtRp(i.qty * i.unit_price)}</td></tr>`
  ).join('');
  document.getElementById('p-tfoot').innerHTML =
    `<tr><td colspan="4" style="text-align:right;">Total Sales</td><td>${fmtRp(full.total_sales)}</td></tr>` +
    `<tr><td colspan="4" style="text-align:right;">Consignee Commission (${full.commission_pct}%)</td><td>-${fmtRp(full.commission_amt)}</td></tr>` +
    `<tr><td colspan="4" style="text-align:right;font-weight:800;">Net Payable to OQEAN</td><td style="font-weight:800;">${fmtRp(full.net_amount)}</td></tr>`;
  document.getElementById('p-sign-1').textContent = 'Issued By';
  document.getElementById('p-sign-2').textContent = 'Consignee Acknowledged';
  document.getElementById('p-sign-3').textContent = 'Payment Received';
  window.print();
}

export { fmtRp };
