export function printDelivery(full) {
  document.getElementById('p-doctitle').textContent = full.type === 'Return' ? 'Return Order' : 'Delivery Order';
  document.getElementById('p-ref').textContent = full.ref;
  document.getElementById('p-status').textContent = full.status;

  setMeta([
    ['From', full.from_location?.name || '—'],
    ['To', full.to_location?.name || '—'],
    ['Date', full.delivery_date || '—'],
    ['Status', full.status],
  ]);

  // Notes row (below meta, above the items table)
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

  document.getElementById('p-thead-row').innerHTML =
    '<th>SKU</th><th>Product</th><th>Color</th><th>Size</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Subtotal</th>';

  document.getElementById('p-items').innerHTML = full.delivery_items.map(i => `
    <tr>
      <td>${i.products.sku}</td>
      <td>${i.products.style_name}</td>
      <td>${i.products.color}</td>
      <td>${i.products.size}</td>
      <td class="num">${i.qty}</td>
      <td class="num">${fmtRp(i.unit_price || 0)}</td>
      <td class="num">${fmtRp(i.qty * (i.unit_price || 0))}</td>
    </tr>
  `).join('');

  const totalQty = full.delivery_items.reduce((s, i) => s + i.qty, 0);
  const totalValue = full.delivery_items.reduce((s, i) => s + i.qty * (i.unit_price || 0), 0);

  document.getElementById('p-tfoot').innerHTML =
    `<tr>
      <td colspan="4" style="text-align:right;font-weight:700;">Total</td>
      <td class="num" style="font-weight:700;">${totalQty}</td>
      <td class="num"></td>
      <td class="num" style="font-weight:700;">${fmtRp(totalValue)}</td>
    </tr>`;

  document.getElementById('p-sign-1').textContent = 'Prepared By';
  document.getElementById('p-sign-2').textContent = full.type === 'Return' ? 'Returned By' : 'Sent By';
  document.getElementById('p-sign-3').textContent = 'Received By';
  window.print();
}
