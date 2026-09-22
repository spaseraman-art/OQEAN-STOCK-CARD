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
              <select id="fromSel">${locationsCache.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
            </label>
            <label>To
              <select id="toSel">${locationsCache.map((l, i) => `<option value="${l.id}" ${i === 1 ? 'selected' : ''}>${l.name}</option>`).join('')}</select>
            </label>
            <label>Date<input type="date" id="dateSel" value="${new Date().toISOString().slice(0,10)}"></label>
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
      if (qty < 1) { alert('Qty must
