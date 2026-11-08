function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('en-US');
}

function setMeta(fields) {
  const box = document.getElementById('p-meta');
  box.innerHTML = fields.map(([label, value]) =>
    `<div><b style="display:block;font-size:9.5px;text-transform:uppercase;color:#666;margin-bottom:2px;">${label}</b>${value}</div>`
  ).join('');
}

export function printDelivery(full, commPct = 40) {
  document.getElementById('p-doctitle').textContent = full.type === 'Return' ? 'Return Order' : 'Delivery Order';
  document.getElementById('p-ref').textContent = full.ref;
  document.getElementById('p-status').textContent = full.status;

  setMeta([
    ['From', full.from_location?.name || '—'],
    ['To', full.to_location?.name || '—'],
    ['Date', full.delivery_date || '—'],
    ['Status', full.status],
  ]);

  const metaBox = document.getElementById('p-meta');
  let notesRow = document.getElementById('p-notes-row');
  if (!notesRow) {
    notesRow = document.createElement('div');
    notesRow.id = 'p-notes-row';
    notesRow.style.cssText = 'margin-bottom:14px;padding:10px 12px;background:#f3f3f3;border-left:3px solid #e0603d;font-size:12px;';
    metaBox.parentNode.insertBefore(notesRow, metaBox.nextSibling);
  }
  if (full.notes) {
    notesRow.style.display = 'block';
    notesRow.innerHTML = `<b style="display:block;font-size:9.5px;text-transform:uppercase;color:#666;margin-bottom:4px;">Notes</b>${full.notes}`;
  } else {
    notesRow.style.display = 'none';
  }

  // REORDERED HEADERS: Retail Price -> Qty -> OQEAN Price -> Total OQEAN
  document.getElementById('p-thead-row').innerHTML =
    '<th>SKU</th><th>Product</th><th>Color</th><th>Size</th><th class="num">Retail Price</th><th class="num">Qty</th><th class="num">OQEAN Price</th><th class="num">Total</th>';

  const oqeanPct = (100 - commPct) / 100;

  document.getElementById('p-items').innerHTML = full.delivery_items.map(i => {
    const retail = i.unit_price || 0;
    const oqeanUnitPrice = retail * oqeanPct; // OQEAN share per piece
    const totalLine = oqeanUnitPrice * i.qty; // Total OQEAN share for the line
    
    return `
    <tr>
      <td>${i.products.sku}</td>
      <td>${i.products.style_name}</td>
      <td>${i.products.color}</td>
      <td>${i.products.size}</td>
      <td class="num">${fmtRp(retail)}</td>
      <td class="num">${i.qty}</td>
      <td class="num">${fmtRp(oqeanUnitPrice)}</td>
      <td class="num">${fmtRp(totalLine)}</td>
    </tr>
  `}).join('');

  const totalQty = full.delivery_items.reduce((s, i) => s + i.qty, 0);
  const totalOqean = full.delivery_items.reduce((s, i) => {
    const retail = i.unit_price || 0;
    const oqeanUnitPrice = retail * oqeanPct;
    return s + (oqeanUnitPrice * i.qty);
  }, 0);

  document.getElementById('p-tfoot').innerHTML =
    `<tr>
      <td colspan="4" style="text-align:right;font-weight:700;">Total</td>
      <td class="num"></td>
      <td class="num" style="font-weight:700;">${totalQty}</td>
      <td class="num"></td>
      <td class="num" style="font-weight:700;">${fmtRp(totalOqean)}</td>
    </tr>`;

  document.getElementById('p-sign-1').textContent = 'Prepared By';
  document.getElementById('p-sign-2').textContent = full.type === 'Return' ? 'Returned By' : 'Sent By';
  document.getElementById('p-sign-3').textContent = 'Received By';
  window.print();
}

export function printOpname({ locationName, countDate, countedBy, items }) {
  document.getElementById('p-doctitle').textContent = 'Stock Count Sheet';
  document.getElementById('p-ref').textContent = locationName;
  document.getElementById('p-status').textContent = 'Pending Count';
  
  const totalSystemQty = items.reduce((s, i) => s + (Number(i.system_qty) || 0), 0);
  
  setMeta([
    ['Location', locationName],
    ['Count Date', countDate],
    ['Counted By', countedBy || '________________'],
    ['Total System Qty', totalSystemQty],
  ]);

  const staleNotes = document.getElementById('p-notes-row');
  if (staleNotes) staleNotes.style.display = 'none';

  document.getElementById('p-thead-row').innerHTML =
    '<th>Product / Variant</th><th class="num">System Qty</th><th class="num">Counted Qty</th><th>Notes</th>';
    
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('p-items').innerHTML = sortedItems.map(i =>
    `<tr>
      <td>${i.name}</td>
      <td class="num">${i.system_qty}</td>
      <td class="num"></td>
      <td></td>
    </tr>`
  ).join('');
  
  document.getElementById('p-tfoot').innerHTML =
    `<tr>
      <td style="font-weight:700;">Total Qty</td>
      <td class="num" style="font-weight:700;">${totalSystemQty}</td>
      <td></td>
      <td></td>
    </tr>`;
    
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

  const staleNotes = document.getElementById('p-notes-row');
  if (staleNotes) staleNotes.style.display = 'none';

  document.getElementById('p-thead-row').innerHTML =
    '<th>Date</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Subtotal</th>';
  document.getElementById('p-items').innerHTML = full.invoice_items.map(i =>
    `<tr>
      <td>${i.sale_date}</td>
      <td>${i.products.style_name} — ${i.products.color} ${i.products.size}</td>
      <td class="num">${i.qty}</td>
      <td class="num">${fmtRp(i.unit_price)}</td>
      <td class="num">${fmtRp(i.qty * i.unit_price)}</td>
    </tr>`
  ).join('');
  document.getElementById('p-tfoot').innerHTML =
    `<tr><td colspan="4" style="text-align:right;">Total Sales</td><td class="num">${fmtRp(full.total_sales)}</td></tr>` +
    `<tr><td colspan="4" style="text-align:right;">Consignee Commission (${full.commission_pct}%)</td><td class="num">-${fmtRp(full.commission_amt)}</td></tr>` +
    `<tr><td colspan="4" style="text-align:right;font-weight:800;">Net Payable to OQEAN</td><td class="num" style="font-weight:800;">${fmtRp(full.net_amount)}</td></tr>`;
  document.getElementById('p-sign-1').textContent = 'Issued By';
  document.getElementById('p-sign-2').textContent = 'Consignee Acknowledged';
  document.getElementById('p-sign-3').textContent = 'Payment Received';
  window.print();
}

export function printOfficialInvoice(full) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const invNo = `${yy}${mm}${dd}OM`;
  const displayDate = now.toLocaleDateString('en-US');

  const itemsHtml = full.invoice_items.map((item, i) => `
    <tr>
      <td style="text-align:center;">${i + 1}</td>
      <td></td>
      <td>Edited - Oqean ${item.products?.style_name} ${item.products?.color} ${item.products?.size}</td>
      <td style="text-align:right;">${item.unit_price.toLocaleString('en-US')}</td>
      <td style="text-align:center;">${item.qty} PCS</td>
      <td style="text-align:right;">${(item.qty * item.unit_price).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
    </tr>
  `).join('');

  const total = full.invoice_items.reduce((s, i) => s + (i.qty * i.unit_price), 0);

  const html = `
    <div style="font-family: Arial, sans-serif; color: #000; padding: 20px; font-size: 12px; max-width: 800px; margin: auto;">
      <div style="text-align: right; font-size: 18px; letter-spacing: 5px; margin-bottom: 20px;">I N V O I C E</div>
      
      <table style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
        <tr>
          <td style="width: 15%; vertical-align: top;"><b>Company:</b></td>
          <td style="width: 35%; vertical-align: top;">${full.locations?.name || ''}<br>
              ${full.locations?.attn || ''}<br>
              ${full.locations?.address || ''}</td>
          <td style="width: 20%; vertical-align: top; text-align: right;">
            Original<br>Copy 1<br>Copy 2<br>Copy 3
          </td>
          <td style="width: 30%; vertical-align: top; padding-left: 20px;">
            Customer<br>Accounting<br>Shipping<br>File
          </td>
        </tr>
      </table>

      <table style="width: 50%; margin-bottom: 20px; border-collapse: collapse;">
        <tr><td style="width: 30%;"><b>INV No.:</b></td><td>${invNo}</td></tr>
        <tr><td><b>Date:</b></td><td>${displayDate}</td></tr>
        <tr><td><b>P.O. No.:</b></td><td></td></tr>
        <tr><td><b>Delivery Date:</b></td><td></td></tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 1px solid #000; border-top: 1px solid #000;">
            <th style="width: 5%;">No.</th>
            <th style="width: 10%;">Code</th>
            <th style="width: 45%; text-align: left;">Description</th>
            <th style="width: 15%; text-align: right;">Unit Price</th>
            <th style="width: 10%; text-align: center;">Quantity</th>
            <th style="width: 15%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="width: 50%; vertical-align: top;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td><b>Payment Details</b></td><td>BANK PERMATA BANK</td></tr>
              <tr><td>Cash</td><td>PT. OCC BALI CURATED</td></tr>
              <tr><td>Check</td><td>1237860256</td></tr>
              <tr><td>X Transfer</td><td>SWIFT CODE : BBBAIDJA</td></tr>
            </table>
          </td>
          <td style="width: 50%; vertical-align: top;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="text-align: right; padding-right: 20px;">Sub Total</td><td style="text-align: right;">${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
              <tr><td style="text-align: right; padding-right: 20px;">Discount</td><td></td></tr>
              <tr><td style="text-align: right; padding-right: 20px;">Deposit</td><td></td></tr>
              <tr><td style="text-align: right; padding-right: 20px;">Shipping Fee</td><td></td></tr>
              <tr style="border-top: 1px solid #000;">
                <td style="text-align: right; padding-right: 20px; font-weight: bold;">Total</td>
                <td style="text-align: right; font-weight: bold;">IDR ${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-top: 40px;">
        <tr>
          <td style="width: 33%;">
            <div>Payment Terms :</div>
            <br><br><br><br>
            <div>Goods Received</div>
          </td>
          <td style="width: 33%;"></td>
          <td style="width: 33%; text-align: right; vertical-align: bottom;">
            <div>Prepared By :</div>
            <br><br><br><br>
            <div>Yosie</div>
          </td>
        </tr>
      </table>

      <div style="margin-top: 20px; font-size: 10px;">
        <b>TERMS & CONDITIONS</b><br>
        1.<br>2.<br>3.<br>4.<br>5.
      </div>
    </div>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

export { fmtRp };
