import { getLocations, getProducts, getCurrentStock, getDeliveries, getDeliveryWithItems, createDelivery, updateDeliveryItemQty, updateDeliveryDetails, advanceDeliveryStatus, addDeliveryItem, deleteDeliveryItem } from '../db.js';
import { printDelivery } from '../print.js';
import { exportDeliveriesList, exportDeliveryDetail, parseDeliveryImportFile } from '../excel.js';

let locationsCache = [];
let productsCache = [];
let stockCache = [];

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

function renderList(root, deliveries) {
  root.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="newDeliveryBtn">+ New Delivery</button>
      <button class="btn secondary" id="newReturnBtn">+ New Return</button>
      <button class="btn secondary" id="exportListBtn">⬇️ Export to Excel</button>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Type</th><th>Ref</th><th>From</th><th>To</th><th>Date</th><th>Items</th><th>Status</th></tr></thead>
        <tbody>
          ${deliveries.map(d => `
            <tr class="hoverable" data-id="${d.id}">
              <td><span class="badge approved">${d.type}</span></td><td>${d.ref}</td>
              <td>${d.from_location.name}</td><td>${d.to_location.name}</td><td>${d.scheduled_date}</td>
              <td>${d.delivery_items.reduce((s,i)=>s+i.qty,0)}</td>
              <td><span class="badge ${d.status.toLowerCase()}">${d.status}</span></td>
            </tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted);text-align:center;">No deliveries yet.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div id="builderArea"></div>
    <div id="viewArea"></div>
  `;
  root.querySelector('#newDeliveryBtn').addEventListener('click', () => renderBuilder(root, 'Delivery'));
  root.querySelector('#newReturnBtn').addEventListener('click', () => renderBuilder(root, 'Return'));
  root.querySelector('#exportListBtn').addEventListener('click', () => exportDeliveriesList(deliveries));
  root.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => renderDetail(root, row.dataset.id));
  });
}

function renderBuilder(root, type) {
  const consignees = locationsCache.filter(l => l.type === 'Consignment Store');
  const warehouses = locationsCache.filter(l => l.type === 'Main Warehouse');
  const builderArea = root.querySelector('#builderArea');

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
            <select id="fromSel">${(type === 'Return' ? consignees : warehouses).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
          </label>
          <label>To
            <select id="toSel">${(type === 'Return' ? warehouses : consignees).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
          </label>
          <label>Date<input type="date" id="dateSel" value="${new Date().toISOString().slice(0,10)}"></label>
        </form>
      </div>
      <div class="builder-section">
        <h4>2. Items &amp; Quantities</h4>
        <div class="toolbar">
          <input type="text" class="grow" id="stockSearch" placeholder="Search product or SKU...">
          <label class="btn secondary" style="cursor:pointer;">
            ⬆️ Import from Excel
            <input type="file" id="importFile" accept=".xlsx,.xls,.csv" style="display:none;">
          </label>
        </div>
        <div class="note" style="margin-top:0;margin-bottom:14px;">Import expects a file with "SKU" and "Qty" columns — matches by SKU and fills in the quantities below.</div>
        <div class="panel">
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th>On Hand</th><th>Qty</th></tr></thead>
            <tbody id="stockListBody">
              ${productsCache.map(p => {
                const onHand = stockCache.filter(s => s.product_id === p.id).reduce((s,r)=>s+r.qty,0);
                return `<tr data-id="${p.id}" data-search="${(p.sku + ' ' + p.name + ' ' + p.color + ' ' + p.size).toLowerCase()}">
                  <td>${p.sku}</td>
                  <td>${p.name} — ${p.color} ${p.size}</td>
                  <td>${onHand}</td>
                  <td><input type="number" class="qty-input" data-id="${p.id}" min="0" placeholder="0" style="width:70px;"></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="note">Type a quantity in any row to include it — press Enter to jump straight to the next row's Qty field.</div>
      </div>
      <button class="btn" id="createBtn">Create ${type} (Draft)</button>
    </div>
  `;

  builderArea.querySelector('#cancelBuilder').addEventListener('click', () => { builderArea.innerHTML = ''; });

  builderArea.querySelector('#stockSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    builderArea.querySelectorAll('#stockListBody tr').forEach(row => {
      row.style.display = row.dataset.search.includes(q) ? '' : 'none';
    });
  });

  builderArea.querySelector('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseDeliveryImportFile(file);
      const notFound = [];
      rows.forEach(({ sku, qty }) => {
        const product = productsCache.find(p => p.sku.toLowerCase() === sku.toLowerCase());
        if (!product) { notFound.push(sku); return; }
        const input = builderArea.querySelector(`.qty-input[data-id="${product.id}"]`);
        if (input) input.value = qty;
      });
      let msg = `Imported ${rows.length - notFound.length} of ${rows.length} row(s).`;
      if (notFound.length) msg += `\nSKUs not found: ${notFound.join(', ')}`;
      alert(msg);
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
    e.target.value = '';
  });

  const qtyInputs = () => [...builderArea.querySelectorAll('.qty-input')].filter(i => i.closest('tr').style.display !== 'none');
  builderArea.querySelectorAll('.qty-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const visible = qtyInputs();
      const idx = visible.indexOf(input);
      const next = visible[idx + 1];
      if (next) { next.focus(); next.select(); }
    });
  });

  builderArea.querySelector('#createBtn').addEventListener('click', async () => {
    const items = [];
    builderArea.querySelectorAll('.qty-input').forEach(input => {
      const qty = parseInt(input.value, 10) || 0;
      if (qty > 0) items.push({ product_id: input.dataset.id, qty });
    });
    if (items.length === 0) { alert('Enter a quantity for at least one item.'); return; }
    try {
      const delivery = await createDelivery({
        type,
        from_location_id: builderArea.querySelector('#fromSel').value,
        to_location_id: builderArea.querySelector('#toSel').value,
        scheduled_date: builderArea.querySelector('#dateSel').value,
        items,
      });
      alert(`${delivery.ref} created as Draft.`);
      await render(root);
    } catch (err) {
      alert('Failed to create: ' + err.message);
    }
  });
}

async function renderDetail(root, id) {
  const viewArea = root.querySelector('#viewArea');
  viewArea.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const full = await getDeliveryWithItems(id);
    const isDraft = full.status === 'Draft';
    const usedProductIds = new Set(full.delivery_items.map(i => i.product_id));
    const availableProducts = productsCache.filter(p => !usedProductIds.has(p.id));

    viewArea.innerHTML = `
      <div class="builder show">
        <div class="toolbar" style="justify-content:space-between;">
          <div style="font-weight:700;">${full.ref} <span class="badge ${full.status.toLowerCase()}">${full.status}</span></div>
          <button class="btn secondary" id="closeDetail">✕ Close</button>
        </div>
        ${isDraft ? '<div class="note">Draft — quantities, items, and details below are editable.</div>' : ''}
        <div class="panel" style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
          <div><b style="color:var(--muted);font-size:11px;">From</b><div>${full.from_location.name}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">To</b><div>${full.to_location.name}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Date</b><div>${
            isDraft ? `<input type="date" id="editDate" value="${full.scheduled_date}">` : full.scheduled_date
          }</div></div>
        </div>
        <div class="panel">
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th>${isDraft ? '<th></th>' : ''}</tr></thead>
            <tbody id="itemsBody">
              ${full.delivery_items.map(i => `
                <tr data-item-row="${i.id}">
                  <td>${i.products.sku}</td><td>${i.products.name} — ${i.products.color} ${i.products.size}</td>
                  <td>${isDraft ? `<input type="number" class="edit-qty" data-item-id="${i.id}" value="${i.qty}" min="1" style="width:70px;">` : i.qty}</td>
                  ${isDraft ? `<td><button class="btn secondary danger remove-item-btn" data-item-id="${i.id}" style="padding:4px 10px;">✕ Remove</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
          ${isDraft ? `
            <div style="padding:14px 16px; border-top:1px solid var(--line); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <select id="addProductSel" style="min-width:220px;">
                ${availableProducts.length
                  ? availableProducts.map(p => `<option value="${p.id}">${p.sku} — ${p.name} — ${p.color} ${p.size}</option>`).join('')
                  : '<option value="">No more products to add</option>'}
              </select>
              <input type="number" id="addQtyInput" min="1" value="1" style="width:80px;" placeholder="Qty">
              <button class="btn secondary" id="addItemBtn">+ Add Item</button>
            </div>
          ` : ''}
        </div>
        <div class="toolbar">
          ${isDraft ? '<button class="btn secondary" id="saveChanges">💾 Save Changes</button>' : ''}
          ${full.status !== 'Sent' ? `<button class="btn" id="advanceBtn">${full.status === 'Draft' ? 'Approve' : 'Mark as Sent'}</button>` : ''}
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
        if (full.delivery_items.length <= 1) { alert('A delivery needs at least one item — remove the whole delivery instead if it should be empty.'); return; }
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
        const qty = parseInt(viewArea.querySelector('#addQtyInput').value, 10) || 1;
        try {
          await addDeliveryItem(full.id, sel.value, qty);
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
        try {
          await advanceDeliveryStatus(full);
          await render(root);
        } catch (err) {
          alert('Failed to update status: ' + err.message);
        }
      });
    }
  } catch (err) {
    viewArea.innerHTML = `<div class="error-msg">Failed to load: ${err.message}</div>`;
  }
}
