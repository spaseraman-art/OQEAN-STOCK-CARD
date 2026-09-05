import { getLocations, getProducts, getCurrentStock, getIncomingShipments, getIncomingShipmentWithItems, createIncomingShipment, updateIncomingItemQty, updateIncomingDetails, addIncomingItem, deleteIncomingItem, markIncomingReceived } from '../db.js';

let locationsCache = [];
let productsCache = [];
let stockCache = [];

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    [locationsCache, productsCache, stockCache] = await Promise.all([getLocations(), getProducts(), getCurrentStock()]);
    const shipments = await getIncomingShipments();
    renderList(root, shipments);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load incoming shipments: ${err.message}</div>`;
  }
}

function renderList(root, shipments) {
  root.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="newIncomingBtn">+ New Incoming</button>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Ref</th><th>Warehouse</th><th>Supplier</th><th>Expected Date</th><th>Items</th><th>Status</th></tr></thead>
        <tbody>
          ${shipments.map(s => `
            <tr class="hoverable" data-id="${s.id}">
              <td>${s.ref}</td><td>${s.locations.name}</td><td>${s.supplier_name || '—'}</td><td>${s.expected_date}</td>
              <td>${s.incoming_shipment_items.reduce((sum,i)=>sum+i.qty,0)}</td>
              <td><span class="badge ${s.status === 'Received' ? 'sent' : 'draft'}">${s.status}</span></td>
            </tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted);text-align:center;">No incoming shipments yet.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="note">Use this for new stock arriving from your supplier/manufacturer — not for stock moving between your own locations (that's Deliveries &amp; Returns).</div>
    <div id="builderArea"></div>
    <div id="viewArea"></div>
  `;
  root.querySelector('#newIncomingBtn').addEventListener('click', () => renderBuilder(root));
  root.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => renderDetail(root, row.dataset.id));
  });
}

function renderBuilder(root) {
  const warehouses = locationsCache.filter(l => l.type === 'Main Warehouse');
  const builderArea = root.querySelector('#builderArea');

  builderArea.innerHTML = `
    <div class="builder show">
      <div class="toolbar" style="justify-content:space-between;">
        <div style="font-weight:700;">New Incoming Shipment</div>
        <button class="btn secondary" id="cancelBuilder">✕ Cancel</button>
      </div>
      <div class="builder-section">
        <h4>1. Details</h4>
        <form class="entry-form" style="grid-template-columns:repeat(3,1fr);">
          <label>Warehouse
            <select id="whSel">${warehouses.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
          </label>
          <label>Supplier<input type="text" id="supplierInput" placeholder="e.g. factory / manufacturer name"></label>
          <label>Expected Date<input type="date" id="dateSel" value="${new Date().toISOString().slice(0,10)}"></label>
        </form>
      </div>
      <div class="builder-section">
        <h4>2. Items &amp; Quantities</h4>
        <div class="toolbar">
          <input type="text" class="grow" id="stockSearch" placeholder="Search product or SKU...">
        </div>
        <div class="panel">
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th>Current On Hand</th><th>Qty Arriving</th></tr></thead>
            <tbody id="stockListBody">
              ${productsCache.map(p => {
                const onHand = stockCache.filter(s => s.product_id === p.id).reduce((s,r)=>s+r.qty,0);
                return `<tr data-id="${p.id}" data-search="${(p.sku + ' ' + p.style_name + ' ' + p.color + ' ' + p.size).toLowerCase()}">
                  <td>${p.sku}</td>
                  <td>${p.style_name} — ${p.color} ${p.size}</td>
                  <td>${onHand}</td>
                  <td><input type="number" class="qty-input" data-id="${p.id}" min="0" placeholder="0" style="width:70px;"></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="note">Type a quantity in any row to include it — press Enter to jump to the next row's Qty field.</div>
      </div>
      <button class="btn" id="createBtn">Create Incoming (Draft)</button>
    </div>
  `;

  builderArea.querySelector('#cancelBuilder').addEventListener('click', () => { builderArea.innerHTML = ''; });

  builderArea.querySelector('#stockSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    builderArea.querySelectorAll('#stockListBody tr').forEach(row => {
      row.style.display = row.dataset.search.includes(q) ? '' : 'none';
    });
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
      const shipment = await createIncomingShipment({
        location_id: builderArea.querySelector('#whSel').value,
        supplier_name: builderArea.querySelector('#supplierInput').value,
        expected_date: builderArea.querySelector('#dateSel').value,
        items,
      });
      alert(`${shipment.ref} created as Draft.`);
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
    const full = await getIncomingShipmentWithItems(id);
    const isDraft = full.status === 'Draft';
    const usedProductIds = new Set(full.incoming_shipment_items.map(i => i.product_id));
    const availableProducts = productsCache.filter(p => !usedProductIds.has(p.id));

    viewArea.innerHTML = `
      <div class="builder show">
        <div class="toolbar" style="justify-content:space-between;">
          <div style="font-weight:700;">${full.ref} <span class="badge ${full.status === 'Received' ? 'sent' : 'draft'}">${full.status}</span></div>
          <button class="btn secondary" id="closeDetail">✕ Close</button>
        </div>
        ${isDraft ? '<div class="note">Draft — items, quantities, and details below are editable. Nothing affects stock until you Mark as Received.</div>' : ''}
        <div class="panel" style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
          <div><b style="color:var(--muted);font-size:11px;">Warehouse</b><div>${full.locations.name}</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Supplier</b><div>${
            isDraft ? `<input type="text" id="editSupplier" value="${full.supplier_name || ''}">` : (full.supplier_name || '—')
          }</div></div>
          <div><b style="color:var(--muted);font-size:11px;">Expected Date</b><div>${
            isDraft ? `<input type="date" id="editDate" value="${full.expected_date}">` : full.expected_date
          }</div></div>
        </div>
        <div class="panel">
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th>${isDraft ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${full.incoming_shipment_items.map(i => `
                <tr>
                  <td>${i.products.sku}</td><td>${i.products.style_name} — ${i.products.color} ${i.products.size}</td>
                  <td>${isDraft ? `<input type="number" class="edit-qty" data-item-id="${i.id}" value="${i.qty}" min="1" style="width:70px;">` : i.qty}</td>
                  ${isDraft ? `<td><button class="btn secondary danger remove-item-btn" data-item-id="${i.id}" style="padding:4px 10px;">✕ Remove</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
          ${isDraft ? `
            <div style="padding:14px 16px; border-top:1px solid var(--line); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <select id="addProductSel" style="min-width:220px;">
                ${availableProducts.length
                  ? availableProducts.map(p => `<option value="${p.id}">${p.sku} — ${p.style_name} — ${p.color} ${p.size}</option>`).join('')
                  : '<option value="">No more products to add</option>'}
              </select>
              <input type="number" id="addQtyInput" min="1" value="1" style="width:80px;" placeholder="Qty">
              <button class="btn secondary" id="addItemBtn">+ Add Item</button>
            </div>
          ` : ''}
        </div>
        <div class="toolbar">
          ${isDraft ? '<button class="btn secondary" id="saveChanges">💾 Save Changes</button>' : ''}
          ${isDraft ? '<button class="btn" id="receiveBtn">Mark as Received</button>' : ''}
        </div>
      </div>
    `;
    viewArea.querySelector('#closeDetail').addEventListener('click', () => { viewArea.innerHTML = ''; });

    viewArea.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (full.incoming_shipment_items.length <= 1) { alert('A shipment needs at least one item.'); return; }
        if (!confirm('Remove this item?')) return;
        try {
          await deleteIncomingItem(btn.dataset.itemId);
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
          await addIncomingItem(full.id, sel.value, qty);
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
          await updateIncomingDetails(full.id, {
            supplier_name: viewArea.querySelector('#editSupplier').value || null,
            expected_date: viewArea.querySelector('#editDate').value,
          });
          for (const input of viewArea.querySelectorAll('.edit-qty')) {
            await updateIncomingItemQty(input.dataset.itemId, parseInt(input.value, 10) || 1);
          }
          alert('Saved.');
          renderDetail(root, id);
        } catch (err) {
          alert('Failed to save: ' + err.message);
        }
      });
    }

    const receiveBtn = viewArea.querySelector('#receiveBtn');
    if (receiveBtn) {
      receiveBtn.addEventListener('click', async () => {
        if (!confirm(`Mark ${full.ref} as Received? This will add the quantities to ${full.locations.name}'s stock.`)) return;
        try {
          await markIncomingReceived(full);
          alert('Received — stock updated.');
          await render(root);
        } catch (err) {
          alert('Failed to mark as received: ' + err.message);
        }
      });
    }
  } catch (err) {
    viewArea.innerHTML = `<div class="error-msg">Failed to load: ${err.message}</div>`;
  }
}
