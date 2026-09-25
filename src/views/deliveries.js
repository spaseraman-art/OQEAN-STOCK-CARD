import { getLocations, getProducts, getCurrentStock, getDeliveries, getDeliveryWithItems, createDelivery, updateDeliveryItemQty, updateDeliveryItemPrice, updateDeliveryDetails, advanceDeliveryStatus, addDeliveryItem, deleteDeliveryItem, deleteDelivery, voidDelivery } from '../db.js';
import { printDelivery, fmtRp } from '../print.js';
import { exportDeliveriesList, exportDeliveryDetail } from '../excel.js';

let locationsCache = [];
let productsCache = [];
let stockCache = [];
let listState = { month: '', expanded: false };

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    [locationsCache, productsCache, stockCache] = await Promise.all([getLocations(), getProducts(), getCurrentStock()]);
    const deliveries = await getDeliveries();
    renderList(root, deliveries);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load deliveries: ${err.message}</div>`;
  }
}

function totalQty(d) {
  return d.delivery_items.reduce((s, i) => s + i.qty, 0);
}
function totalValue(d) {
  return d.delivery_items.reduce((s, i) => s + i.qty * (i.unit_price || 0), 0);
}

function renderList(root, deliveries) {
  let filtered = deliveries;
  if (listState.month) {
    filtered = deliveries.filter(d => (d.delivery_date || '').startsWith(listState.month));
  }
  const total = filtered.length;
  const shown = listState.expanded ? filtered : filtered.slice(0, 5);
  const canExpand = filtered.length > 5;

  root.innerHTML = `
    <div class="toolbar" style="align-items:flex-end;flex-wrap:wrap;gap:12px;">
      <button class="btn" id="newDeliveryBtn">+ New Delivery</button>
      <button class="btn secondary" id="newReturnBtn">+ New Return</button>
      <button class="btn secondary" id="exportListBtn">⬇️ Export to Excel</button>
      <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);gap:4px;margin-left:auto;">
        Month
        <input type="month" id="listMonth" value="${listState.month || ''}">
      </label>
    </div>
    <div class="panel" style="overflow-x:auto;">
      <table>
        <thead><tr><th>Type</th><th>Ref</th><th>From</th><th>To</th><th>Date</th><th class="num">Items</th><th class="num">Value</th><th>Status</th></tr></thead>
        <tbody>
          ${shown.map(d => `
            <tr class="hoverable" data-id="${d.id}" ${d.status === 'Void' ? 'style="opacity:0.5;"' : ''}>
              <td><span class="badge approved">${d.type}</span></td>
              <td>${d.ref}</td>
              <td>${d.from_location?.name || '—'}</td>
              <td>${d.to_location?.name || '—'}</td>
              <td>${d.delivery_date || '—'}</td>
              <td class="num">${totalQty(d)}</td>
              <td class="num">${fmtRp(totalValue(d))}</td>
              <td><span class="badge ${(d.status || '').toLowerCase()}">${d.status}</span></td>
            </tr>`).join('') || `<tr><td colspan="8" style="color:var(--muted);text-align:center;padding:20px;">No deliveries${listState.month ? ' in ' + listState.month : ''}.</td></tr>`}
        </tbody>
      </table>
      ${canExpand ? `
        <div style="padding:12px 16px;text-align:center;">
          <button class="btn secondary" id="expandBtn">
            ${listState.expanded ? 'Show top 5' : `Show all ${total} (${total - 5} more)`}
          </button>
        </div>
      ` : ''}
    </div>
    <div id="builderArea"></div>
    <div id="viewArea"></div>
  `;

  root.querySelector('#newDeliveryBtn').addEventListener('click', () => renderBuilder(root, 'Delivery'));
  root.querySelector('#newReturnBtn').addEventListener('click', () => renderBuilder(root, 'Return'));
  root.querySelector('#exportListBtn').addEventListener('click', () => exportDeliveriesList(filtered));
  root.querySelector('#listMonth').addEventListener('change', (e) => {
    listState.month = e.target.value;
    listState.expanded = false;
    renderList(root, deliveries);
  });
  const expandBtn = root.querySelector('#expandBtn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      listState.expanded = !listState.expanded;
      renderList(root, deliveries);
    });
  }
  root.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => renderDetail(root, row.dataset.id));
  });
}

function renderBuilder(root, initialType) {
  const builderArea = root.querySelector('#builderArea');
  let type = initialType;
  let lines = [];
  // persisted selections across re-renders
  let fromId = locationsCache[0]?.id || '';
  let toId = locationsCache[1]?.id || locationsCache[0]?.id || '';
  let dateVal = new Date().toISOString().slice(0, 10);

  const productOptions = productsCache.map(p => ({
    id: p.id,
    sku: p.sku,
    style_name: p.style_name,
    color: p.color,
    size: p.size,
    price: p.price,
    label: `${p.style_name} — ${p.color} ${p.size}`,
    search: `${p.sku} ${p.style_name} ${p.color} ${p.size}`.toLowerCase(),
  }));
  const styleNames = [...new Set(productsCache.map(p => p.style_name))].sort();
  const colourNames = [...new Set(productsCache.map(p => p.color))].sort();

  function paint() {
    const tQty = lines.reduce((s, l) => s + l.qty, 0);
    const tVal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

    builderArea.innerHTML = `
      <div class="builder show">
        <div class="toolbar" style="justify-content:space-between;">
          <div style="font-weight:700;">New ${type}</div>
          <button class="btn secondary" id="cancelBuilder">✕ Cancel</button>
        </div>

        <div class="builder-section">
          <h4>1. Details</h4>
          <form class="entry-form" style="grid-template-columns:repeat(3,1fr);">
            <label>From
              <select id="fromSel">
                ${locationsCache.map(l => `<option value="${l.id}" ${l.id === fromId ? 'selected' : ''}>${l.name}</option>`).join('')}
              </select>
            </label>
            <label>To
              <select id="toSel">
                ${locationsCache.map(l => `<option value="${l.id}" ${l.id === toId ? 'selected' : ''}>${l.name}</option>`).join('')}
              </select>
            </label>
            <label>Date
              <input type="date" id="dateSel" value="${dateVal}">
            </label>
            <label class="full">Type
              <div class="pill-toggle" style="margin-top:6px;">
                <button type="button" class="sub-btn ${type === 'Delivery' ? 'active' : ''}" data-t="Delivery">Delivery</button>
                <button type="button" class="sub-btn ${type === 'Return' ? 'active' : ''}" data-t="Return">Return</button>
              </div>
            </label>
          </form>
        </div>

        <div class="builder-section">
          <h4>2. Add Items</h4>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
              Search
              <input type="text" id="fSearch" placeholder="SKU / product" style="min-width:160px;">
            </label>
            <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
              Style
              <select id="fStyle"><option value="">All styles</option>${styleNames.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
            </label>
            <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
              Colour
              <select id="fColor"><option value="">All colours</option>${colourNames.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
            </label>
            <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);flex:1;min-width:240px;">
              Product
              <select id="fProduct"></select>
            </label>
            <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
              Qty
              <input type="number" id="fQty" min="1" value="1" style="width:90px;">
            </label>
            <label style="display:flex;flex-direction:column;font-size:11px;color:var(--muted);">
              Unit Price
              <input type="text" id="fPrice" readonly style="min-width:140px;background:#1c1c1c;color:var(--muted);">
            </label>
            <button class="btn" id="addLineBtn" style="margin-bottom:1px;">+ Add</button>
          </div>
        </div>

        <div class="builder-section">
          <h4>3. Items in this ${type}</h4>
          <div class="panel">
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Subtotal</th><th></th></tr></thead>
              <tbody id="linesBody">
                ${lines.length === 0
                  ? '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:20px;">No items yet — add above.</td></tr>'
                  : lines.map((l, i) => `
                    <tr>
                      <td>${l.sku}</td>
                      <td>${l.label}</td>
                      <td class="num"><input type="number" min="1" value="${l.qty}" data-line-qty="${i}" style="width:70px;text-align:right;"></td>
                      <td class="num">${fmtRp(l.unit_price)}</td>
                      <td class="num">${fmtRp(l.qty * l.unit_price)}</td>
                      <td><button class="btn secondary" data-line-remove="${i}" style="padding:2px 8px;font-size:11px;">✕</button></td>
                    </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="text-align:right;font-weight:700;">Total</td>
                  <td class="num" style="font-weight:700;">${tQty}</td>
                  <td class="num"></td>
                  <td class="num" style="font-weight:700;">${fmtRp(tVal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <button class="btn" id="createBtn">Create ${type} (Draft)</button>
      </div>
    `;

    // bind persistence listeners
    builderArea.querySelector('#fromSel').addEventListener('change', (e) => { fromId = e.target.value; });
    builderArea.querySelector('#toSel').addEventListener('change', (e) => { toId = e.target.value; });
    builderArea.querySelector('#dateSel').addEventListener('change', (e) => { dateVal = e.target.value; });

    const searchEl = builderArea.querySelector('#fSearch');
    const styleEl = builderArea.querySelector('#fStyle');
    const colorEl = builderArea.querySelector('#fColor');
    const prodEl = builderArea.querySelector('#fProduct');
    const qtyEl = builderArea.querySelector('#fQty');
    const priceEl = builderArea.querySelector('#fPrice');

    function refreshProductOptions() {
      const q = searchEl.value.trim().toLowerCase();
      const s = styleEl.value;
      const c = colorEl.value;
      const filtered = productOptions.filter(p =>
        (!q || p.search.includes(q)) &&
        (!s || p.style_name === s) &&
        (!c || p.color === c)
      );
      prodEl.innerHTML = filtered.length
        ? filtered.map(p => `<option value="${p.id}" data-price="${p.price}">${p.label} (${p.sku})</option>`).join('')
        : '<option value="">No products match</option>';
      updatePrice();
    }
    function updatePrice() {
      const opt = prodEl.options[prodEl.selectedIndex];
      priceEl.value = opt && opt.dataset.price ? 'Rp ' + Number(opt.dataset.price).toLocaleString('en-US') : '—';
    }
    [searchEl, styleEl, colorEl].forEach(el => el.addEventListener('input', refreshProductOptions));
    prodEl.addEventListener('change', updatePrice);
    refreshProductOptions();

    builderArea.querySelector('#cancelBuilder').addEventListener('click', () => { builderArea.innerHTML = ''; });

    builderArea.querySelectorAll('[data-t]').forEach(btn => {
      btn.addEventListener('click', () => { type = btn.dataset.t; paint(); });
    });

    builderArea.querySelector('#addLineBtn').addEventListener('click', () => {
      const opt = prodEl.options[prodEl.selectedIndex];
      if (!opt || !opt.value) { alert('No product selected.'); return; }
      const product = productOptions.find(p => p.id === opt.value);
      if (!product) return;
      if (lines.some(l => l.product_id === product.id)) {
        alert(`⚠ ${product.style_name} — ${product.color} ${product.size} is already in this ${type}. Change its qty in the list below.`);
        return;
      }
      const qty = parseInt(qtyEl.value, 10) || 1;
      if (qty < 1) { alert('Qty must be at least 1.'); return; }
      lines.push({
        product_id: product.id,
        sku: product.sku,
        label: product.label,
        qty,
        unit_price: Number(product.price) || 0,
      });
      paint();
    });

    builderArea.querySelectorAll('[data-line-qty]').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.dataset.lineQty, 10);
        const v = parseInt(inp.value, 10) || 1;
        if (v < 1) { inp.value = lines[idx].qty; return; }
        lines[idx].qty = v;
        paint();
      });
    });
    builderArea.querySelectorAll('[data-line-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.lineRemove, 10);
        lines.splice(idx, 1);
        paint();
      });
    });

    builderArea.querySelector('#createBtn').addEventListener('click', async () => {
      if (lines.length === 0) { alert('Add at least one item.'); return; }
      if (fromId === toId) { alert('From and To must be different locations.'); return; }
      try {
        const delivery = await createDelivery({
          type,
          from_location_id: fromId,
          to_location_id: toId,
          scheduled_date: dateVal,
          items: lines,
        });
        alert(`${delivery.ref} created as Draft.`);
        await render(root);
      } catch (err) {
        alert('Failed to create: ' + err.message);
      }
    });
  }
  paint();
}

async function renderDetail(root, id) {
  const viewArea = root.querySelector('#viewArea');
  viewArea.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const full = await getDeliveryWithItems(id);
    const isDraft = full.status === 'Draft';
    const isApproved = full.status === 'Approved';
    const isVoid = full.status === 'Void';
    const isSent = full.status === 'Sent';
    const usedProductIds = new Set(full.delivery_items.map(i => i.product_id));
    const availableProducts = productsCache.filter(p => !usedProductIds.has(p.id));

    const totalQty = full.delivery_items.reduce((s, i) => s + i.qty, 0);
    const totalValue = full.delivery_items.reduce((s, i) => s + i.qty * (i.unit_price || 0), 0);

    viewArea.innerHTML = `
      <div class="builder show" ${isVoid ? 'style="opacity:0.75;"' : ''}>
        <div class="toolbar" style="justify-content:space-between;">
          <div style="font-weight:700;">${full.ref} <span class="badge ${full.status.toLowerCase()}">${full.status}</span></div>
          <button class="btn secondary" id="closeDetail">✕ Close</button>
        </div>
        ${isDraft ? '<div class="note">Draft — everything below is editable.</div>' : ''}
        ${isApproved ? '<div class="note">Approved — locked. Void it to cancel, or advance to Sent.</div>' : ''}
        ${isSent ? '<div class="note">Sent — stock has moved and store has accepted. Locked.</div>' : ''}
        ${isVoid ? `<div class="note" style="color:#e0603d;">Voided${full.voided_at ? ' on ' + new Date(full.voided_at).toLocaleDateString() : ''}${full.void_reason ? ' — ' + full.void_reason : ''}</div>` : ''}

        <div class="panel" style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
          <div><b style="color:var(--muted);font-size:11px;">From</b><div>${full.from_location?.name || '—'}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">To</b><div>${full.to_location?.name || '—'}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Date</b><div>${
            isDraft ? `<input type="date" id="editDate" value="${full.delivery_date || ''}">` : (full.delivery_date || '—')
          }</div></div>
        </div>

        <div class="panel">
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Subtotal</th>${isDraft ? '<th></th>' : ''}</tr></thead>
            <tbody id="itemsBody">
              ${full.delivery_items.map(i => `
                <tr data-item-row="${i.id}">
                  <td>${i.products.sku}</td>
                  <td>${i.products.style_name} — ${i.products.color} ${i.products.size}</td>
                  <td class="num">${isDraft ? `<input type="number" class="edit-qty" data-item-id="${i.id}" value="${i.qty}" min="1" style="width:70px;text-align:right;">` : i.qty}</td>
                  <td class="num">${fmtRp(i.unit_price || 0)}</td>
                  <td class="num">${fmtRp(i.qty * (i.unit_price || 0))}</td>
                  ${isDraft ? `<td><button class="btn secondary danger remove-item-btn" data-item-id="${i.id}" style="padding:4px 10px;">✕</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="text-align:right;font-weight:700;">Total</td>
                <td class="num" style="font-weight:700;">${totalQty}</td>
                <td class="num"></td>
                <td class="num" style="font-weight:700;">${fmtRp(totalValue)}</td>
                ${isDraft ? '<td></td>' : ''}
              </tr>
            </tfoot>
          </table>
          ${isDraft ? `
            <div style="padding:14px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <select id="addProductSel" style="min-width:240px;">
                ${availableProducts.length
                  ? availableProducts.map(p => `<option value="${p.id}" data-price="${p.price}">${p.sku} — ${p.style_name} — ${p.color} ${p.size}</option>`).join('')
                  : '<option value="">No more products to add</option>'}
              </select>
              <input type="number" id="addQtyInput" min="1" value="1" style="width:80px;" placeholder="Qty">
              <button class="btn secondary" id="addItemBtn">+ Add Item</button>
            </div>
          ` : ''}
        </div>

        <div class="toolbar" style="flex-wrap:wrap;">
          ${isDraft ? '<button class="btn secondary" id="saveChanges">💾 Save Changes</button>' : ''}
          ${isDraft ? '<button class="btn" id="advanceBtn">Approve</button>' : ''}
          ${isApproved ? '<button class="btn" id="advanceBtn">Mark as Sent</button>' : ''}
          ${isApproved ? '<button class="btn secondary" id="voidBtn" style="color:#e0603d;">🚫 Void</button>' : ''}
          ${isDraft ? '<button class="btn secondary" id="deleteBtn" style="color:#e0603d;">🗑️ Delete Draft</button>' : ''}
          <button class="btn secondary" id="printBtn">🖨️ Print</button>
          <button class="btn secondary" id="exportDetailBtn">⬇️ Export to Excel</button>
        </div>
      </div>
    `;
    viewArea.querySelector('#closeDetail').addEventListener('click', () => { viewArea.innerHTML = ''; });
    viewArea.querySelector('#printBtn').addEventListener('click', () => printDelivery(full));
    viewArea.querySelector('#exportDetailBtn').addEventListener('click', () => exportDeliveryDetail(full));

    viewArea.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (full.delivery_items.length <= 1) { alert('A delivery needs at least one item — delete the whole draft instead.'); return; }
        if (!confirm('Remove this item from the draft?')) return;
        try {
          await deleteDeliveryItem(btn.dataset.itemId);
          renderDetail(root, id);
        } catch (err) {
          alert('Failed to remove item: ' + err.message);
        }
      });
    });

    const addBtn = viewArea.querySelector('#addItemBtn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const sel = viewArea.querySelector('#addProductSel');
        if (!sel.value) { alert('No products left to add.'); return; }
        const opt = sel.options[sel.selectedIndex];
        const qty = parseInt(viewArea.querySelector('#addQtyInput').value, 10) || 1;
        const price = Number(opt.dataset.price) || 0;
        try {
          await addDeliveryItem(full.id, sel.value, qty, price);
          renderDetail(root, id);
        } catch (err) {
          alert('Failed to add item: ' + err.message);
        }
      });
    }

    const saveBtn = viewArea.querySelector('#saveChanges');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          await updateDeliveryDetails(full.id, { scheduled_date: viewArea.querySelector('#editDate').value });
          for (const input of viewArea.querySelectorAll('.edit-qty')) {
            await updateDeliveryItemQty(input.dataset.itemId, parseInt(input.value, 10) || 1);
          }
          alert('Saved.');
          renderDetail(root, id);
        } catch (err) {
          alert('Failed to save: ' + err.message);
        }
      });
    }

    const advanceBtn = viewArea.querySelector('#advanceBtn');
    if (advanceBtn) {
      advanceBtn.addEventListener('click', async () => {
        const nextLabel = full.status === 'Draft' ? 'Approved' : 'Sent';
        if (nextLabel === 'Sent') {
          if (!confirm(`Mark ${full.ref} as Sent? Stock will move from ${full.from_location.name} to ${full.to_location.name}. This is final.`)) return;
        }
        try {
          await advanceDeliveryStatus(full);
          await render(root);
        } catch (err) {
          alert('Failed to update status: ' + err.message);
        }
      });
    }

    const voidBtn = viewArea.querySelector('#voidBtn');
    if (voidBtn) {
      voidBtn.addEventListener('click', async () => {
        const reason = prompt(`Void ${full.ref}?\n\nThis cancels the delivery. No stock has moved yet (Approved state).\n\nOptional reason:`, '');
        if (reason === null) return;
        try {
          await voidDelivery(full.id, reason || null);
          viewArea.innerHTML = '';
          await render(root);
        } catch (err) {
          alert('Failed to void: ' + err.message);
        }
      });
    }

    const deleteBtn = viewArea.querySelector('#deleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Delete draft ${full.ref} permanently?`)) return;
        try {
          await deleteDelivery(full.id);
          viewArea.innerHTML = '';
          await render(root);
        } catch (err) {
          alert('Failed to delete: ' + err.message);
        }
      });
    }
  } catch (err) {
    viewArea.innerHTML = `<div class="error-msg">Failed to load: ${err.message}</div>`;
  }
}
