import { getLocations, getProducts, getSalesFiltered, createSale, updateSale, deleteSale } from '../db.js';
import { fmtRp } from '../print.js';
import { exportSalesList } from '../excel.js';

let filters = { locationId: 'all', month: '', invoiced: 'all', search: '' };
let loadedRows = [];
let currentOffset = 0;
const PAGE_SIZE = 50;

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products] = await Promise.all([getLocations(), getProducts()]);
    const consignees = locations.filter(l => l.type === 'Consignment Store');

    currentOffset = 0;
    const { rows, total } = await getSalesFiltered({ ...filters, limit: 10000, offset: 0 });
    loadedRows = rows;

    let totalUnits = 0;
    let totalValue = 0;
    let invoicedValue = 0;
    let uninvoicedValue = 0;
    const skuMap = {};

    rows.forEach(s => {
      const val = s.qty * s.unit_price;
      totalUnits += s.qty;
      totalValue += val;
      if (s.invoiced) invoicedValue += val;
      else uninvoicedValue += val;

      const skuKey = s.products?.sku || 'UNKNOWN';
      if (!skuMap[skuKey]) {
        skuMap[skuKey] = {
          sku: skuKey,
          name: `${s.products?.style_name} — ${s.products?.color} ${s.products?.size}`,
          qty: 0,
          value: 0
        };
      }
      skuMap[skuKey].qty += s.qty;
      skuMap[skuKey].value += val;
    });

    const skuBreakdown = Object.values(skuMap).sort((a, b) => b.qty - a.qty);

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Log a Sale</h3></div>
        <form class="entry-form" id="cartForm">
          <label>Location<select id="logLoc">${consignees.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select></label>
          <label>Product<select id="logProd">${products.map(p => `<option value="${p.id}" data-price="${p.price}" data-name="${p.style_name} — ${p.color} ${p.size}">${p.style_name} — ${p.color} ${p.size}</option>`).join('')}</select></label>
          <label>Qty<input type="number" id="logQty" value="1" min="1"></label>
          <label>Unit Price<input type="text" id="logPrice" style="text-align:right;"></label>
          <label>Sale Date <span style="color:var(--accent);">(back-dated OK)</span><input type="date" id="logDate" value="${new Date().toISOString().slice(0,10)}"></label>
          <label class="full">Notes<input type="text" id="logNote" placeholder="Optional (e.g., 'Weekend Promo')"></label>
          <div class="full" style="display:flex;gap:10px;">
            <button type="button" class="btn secondary" id="addBatchBtn">+ Add to Batch</button>
          </div>
        </form>
      </div>

      <div class="panel" id="cartArea" style="display:none; margin-top:16px;">
        <div class="panel-head"><h3>Batch Items</h3></div>
        <table>
          <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Subtotal</th><th></th></tr></thead>
          <tbody id="cartBody"></tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:700;">Total</td>
              <td class="num" style="font-weight:700;" id="cartTotal">Rp 0</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div style="padding:16px;">
          <button class="btn" id="saveBatchBtn">💾 Save Batch</button>
        </div>
      </div>

      <div style="height:16px"></div>

      <div class="panel">
        <div class="panel-head" style="display:flex; justify-content:space-between; align-items:center;">
          <h3>Sales Log & SKU Breakdown</h3>
          <button class="btn secondary" id="exportSalesBtn" style="margin-right:16px;">⬇️ Export to Excel</button>
        </div>
        
        <div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border);">
          <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
            Partner
            <select id="fltLoc" style="min-width:160px;">
              <option value="all">All partners</option>
              ${consignees.map(l => `<option value="${l.id}" ${filters.locationId===l.id?'selected':''}>${l.name}</option>`).join('')}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
            Month
            <input type="month" id="fltMonth" value="${filters.month || ''}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
            Invoiced
            <select id="fltInv">
              <option value="all" ${filters.invoiced==='all'?'selected':''}>All</option>
              <option value="uninvoiced" ${filters.invoiced==='uninvoiced'?'selected':''}>Uninvoiced only</option>
              <option value="invoiced" ${filters.invoiced==='invoiced'?'selected':''}>Invoiced only</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);flex:1;min-width:200px;">
            Search (ref / product / SKU)
            <input type="text" id="fltSearch" value="${filters.search || ''}" placeholder="SAL-... or product name">
          </label>
          <label style="display:flex;align-items:flex-end;">
            <button type="button" class="btn secondary" id="fltClear">Clear</button>
          </label>
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border-bottom:1px solid var(--border);">
          <div style="padding:14px 16px;background:var(--panel);">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Sales Logged</div>
            <div style="font-size:18px;font-weight:700;">${rows.length}</div>
          </div>
          <div style="padding:14px 16px;background:var(--panel);">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Units</div>
            <div style="font-size:18px;font-weight:700;">${totalUnits}</div>
          </div>
          <div style="padding:14px 16px;background:var(--panel);">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Total Value</div>
            <div style="font-size:18px;font-weight:700;">${fmtRp(totalValue)}</div>
          </div>
          <div style="padding:14px 16px;background:var(--panel);">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Invoiced</div>
            <div style="font-size:18px;font-weight:700;color:var(--good);">${fmtRp(invoicedValue)}</div>
          </div>
          <div style="padding:14px 16px;background:var(--panel);">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Uninvoiced</div>
            <div style="font-size:18px;font-weight:700;color:#e0603d;">${fmtRp(uninvoicedValue)}</div>
          </div>
        </div>

        ${skuBreakdown.length > 0 ? `
          <div style="padding:16px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border);">
            <h4 style="margin:0 0 12px 0; font-size:13px; text-transform:uppercase; color:var(--muted);">SKU Breakdown (Filtered)</h4>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px;">
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead style="position:sticky; top:0; background:#1e1e1e; z-index:1;">
                  <tr>
                    <th style="padding:8px; text-align:left;">SKU</th>
                    <th style="padding:8px; text-align:left;">Product</th>
                    <th style="padding:8px; text-align:right;">Qty Sold</th>
                    <th style="padding:8px; text-align:right;">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${skuBreakdown.map(s => `
                    <tr>
                      <td style="padding:8px; border-bottom:1px solid var(--border);">${s.sku}</td>
                      <td style="padding:8px; border-bottom:1px solid var(--border);">${s.name}</td>
                      <td style="padding:8px; text-align:right; border-bottom:1px solid var(--border); font-weight:700;">${s.qty}</td>
                      <td style="padding:8px; text-align:right; border-bottom:1px solid var(--border);">${fmtRp(s.value)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <table>
          <thead><tr>
            <th>Ref</th><th>Date</th><th>Location</th><th>Product</th><th class="num">Qty</th><th class="num">Value</th><th>Invoiced</th>
          </tr></thead>
          <tbody id="salesBody">
            ${rows.length === 0
              ? '<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:20px;">No sales match these filters.</td></tr>'
              : rows.slice(0, 50).map(s => `
                <tr class="hoverable" data-id="${s.id}">
                  <td>${s.ref || '—'}</td>
                  <td>${s.sale_date}</td>
                  <td>${s.locations.name}</td>
                  <td>${s.products.style_name} — ${s.products.color} ${s.products.size}</td>
                  <td class="num">${s.qty}</td>
                  <td class="num">${fmtRp(s.qty * s.unit_price)}</td>
                  <td>${s.invoiced ? '<span class="badge sent">✔</span>' : '<span class="badge draft">—</span>'}</td>
                </tr>`).join('')}
          </tbody>
        </table>
        <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--muted);font-size:12px;">Showing first 50 of ${rows.length} filtered sales.</span>
        </div>
      </div>
      <div id="editArea"></div>
    `;

    const priceInput = root.querySelector('#logPrice');
    const prodSelect = root.querySelector('#logProd');
    const qtyInput = root.querySelector('#logQty');
    const noteInput = root.querySelector('#logNote');
    
    let cart = [];

    function updatePrice() {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      const rawPrice = opt ? Number(opt.dataset.price) : 0;
      priceInput.value = rawPrice.toLocaleString('en-US');
    }
    
    prodSelect.addEventListener('change', updatePrice);
    updatePrice();

    priceInput.addEventListener('focus', () => {
      priceInput.value = priceInput.value.replace(/[^0-9]/g, '');
    });
    priceInput.addEventListener('blur', () => {
      const val = parseFloat(priceInput.value.replace(/[^0-9]/g, '')) || 0;
      priceInput.value = val.toLocaleString('en-US');
    });

    function renderCart() {
      const cartArea = root.querySelector('#cartArea');
      const cartBody = root.querySelector('#cartBody');
      const cartTotal = root.querySelector('#cartTotal');

      if (cart.length === 0) {
        cartArea.style.display = 'none';
        return;
      }

      cartArea.style.display = 'block';
      let total = 0;

      cartBody.innerHTML = cart.map((item, index) => {
        const sub = item.qty * item.unit_price;
        total += sub;
        return `<tr>
          <td>${item.name}</td>
          <td class="num">${item.qty}</td>
          <td class="num">${item.unit_price.toLocaleString('en-US')}</td>
          <td class="num">${sub.toLocaleString('en-US')}</td>
          <td><button type="button" class="btn secondary" data-remove="${index}" style="padding:2px 8px;font-size:11px;">✕</button></td>
        </tr>`;
      }).join('');

      cartTotal.textContent = 'Rp ' + total.toLocaleString('en-US');

      cartBody.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.remove, 10);
          cart.splice(idx, 1);
          renderCart();
        });
      });
    }

    root.querySelector('#addBatchBtn').addEventListener('click', () => {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      if (!opt) return;
      
      const qty = parseInt(qtyInput.value, 10) || 1;
      const rawPrice = parseFloat(priceInput.value.replace(/[^0-9]/g, '')) || 0;

      if (qty < 1) { alert('Qty must be at least 1'); return; }
      if (rawPrice <= 0) { alert('Enter a valid price'); return; }

      cart.push({
        product_id: opt.value,
        name: opt.dataset.name,
        qty: qty,
        unit_price: rawPrice,
      });

      qtyInput.value = 1;
      updatePrice();
      renderCart();
    });

    root.querySelector('#saveBatchBtn').addEventListener('click', async () => {
      if (cart.length === 0) return;
      
      const location_id = root.querySelector('#logLoc').value;
      const sale_date = root.querySelector('#logDate').value;
      const baseNote = noteInput.value.trim();
      
      const batchTag = 'BATCH-' + Math.floor(1000 + Math.random() * 9000);
      const finalNote = baseNote ? `[${batchTag}] ${baseNote}` : `[${batchTag}]`;

      const btn = root.querySelector('#saveBatchBtn');
      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        for (const item of cart) {
          await createSale({
            location_id,
            product_id: item.product_id,
            qty: item.qty,
            unit_price: item.unit_price,
            sale_date,
            note: finalNote,
          });
        }
        alert(`Batch ${batchTag} saved successfully!`);
        await render(root);
      } catch (err) {
        alert('Failed to save batch: ' + err.message);
        btn.textContent = '💾 Save Batch';
        btn.disabled = false;
      }
    });

    root.querySelector('#exportSalesBtn').addEventListener('click', () => {
      exportSalesList(rows);
    });

    root.querySelector('#fltLoc').addEventListener('change', e => { filters.locationId = e.target.value; render(root); });
    root.querySelector('#fltMonth').addEventListener('change', e => { filters.month = e.target.value; render(root); });
    root.querySelector('#fltInv').addEventListener('change', e => { filters.invoiced = e.target.value; render(root); });

    let searchTimer;
    root.querySelector('#fltSearch').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { filters.search = e.target.value; render(root); }, 400);
    });

    root.querySelector('#fltClear').addEventListener('click', () => {
      filters = { locationId: 'all', month: '', invoiced: 'all', search: '' };
      render(root);
    });

    root.querySelectorAll('#salesBody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const sale = loadedRows.find(s => s.id === row.dataset.id);
        renderEdit(root, sale, locations);
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load sales: ${err.message}</div>`;
  }
}

function renderEdit(root, sale, locations) {
  const editArea = root.querySelector('#editArea');
  if (!sale) return;
  editArea.innerHTML = `
    <div class="builder show" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;">
      <div style="background:var(--panel);max-width:600px;width:100%;border-radius:8px;padding:20px;">
        <div class="toolbar" style="justify-content:space-between;margin-bottom:12px;">
          <div style="font-weight:700;">Edit ${sale.ref || 'Sale'}</div>
          <button class="btn secondary" id="closeEdit">✕ Close</button>
        </div>
        ${sale.invoiced ? '<div style="background:rgba(224,96,61,0.15);border-left:3px solid #e0603d;padding:10px 12px;margin-bottom:12px;font-size:12px;">⚠ This sale is on an invoice. Editing it won\'t change that invoice. To re-bill, void the invoice from the Invoices page, then create a new one.</div>' : ''}
        <form class="entry-form">
          <label>Location<select id="editLoc">${locations.filter(l=>l.type==='Consignment Store').map(l => `<option value="${l.id}" ${l.id===sale.location_id?'selected':''}>${l.name}</option>`).join('')}</select></label>
          <label>Qty<input type="number" id="editQty" value="${sale.qty}" min="1"></label>
          <label>Date<input type="date" id="editDate" value="${sale.sale_date}"></label>
          <label class="full">Notes<input type="text" id="editNote" value="${sale.note || ''}"></label>
          <div class="full" style="display:flex;gap:10px;">
            <button type="button" class="btn" id="saveEdit">Save Changes</button>
            <button type="button" class="btn secondary danger" id="deleteEdit">Delete Entry</button>
          </div>
        </form>
      </div>
    </div>
  `;
  editArea.querySelector('#closeEdit').addEventListener('click', () => { editArea.innerHTML = ''; });
  editArea.querySelector('#saveEdit').addEventListener('click', async () => {
    try {
      await updateSale(sale.id, {
        location_id: editArea.querySelector('#editLoc').value,
        qty: parseInt(editArea.querySelector('#editQty').value, 10) || 1,
        sale_date: editArea.querySelector('#editDate').value,
        note: editArea.querySelector('#editNote').value || null,
      });
      await render(root);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  });
  editArea.querySelector('#deleteEdit').addEventListener('click', async () => {
    if (!confirm('Delete this sale entry?')) return;
    try {
      await deleteSale(sale.id);
      await render(root);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  });
}
