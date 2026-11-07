import { getLocations, getProducts, getCurrentStock, getProductBreakdown, createLocation, createProduct, updateCommission, getProductLedger } from '../db.js';

let currentSub = 'products';

export async function render(root) {
  root.innerHTML = `
    <div class="pill-toggle" style="margin-bottom:16px;">
      <button class="sub-btn ${currentSub==='products'?'active':''}" data-sub="products">Products</button>
      <button class="sub-btn ${currentSub==='locations'?'active':''}" data-sub="locations">Locations</button>
    </div>
    <div id="masterSubContent"><div class="loading">Loading…</div></div>
  `;
  root.querySelectorAll('.sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSub = btn.dataset.sub;
      render(root);
    });
  });
  const subContainer = root.querySelector('#masterSubContent');
  if (currentSub === 'products') await renderProducts(subContainer);
  else await renderLocations(subContainer);
}

/* ---------- SKU helpers ---------- */
function nameCode(name) {
  const first = (name || '').trim().toUpperCase().split(/\s+/)[0] || '';
  return first.slice(0, 4);
}

function matOrColCode(input) {
  const cleaned = (input || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 3);
  if (words.length === 2) return words[0].slice(0, 2) + words[1][0];
  return words.map(w => w[0]).join('').slice(0, 3);
}

function sizeCode(size) {
  return (size || '').trim().toUpperCase().replace(/[\s\/]/g, '');
}

function makeSku(name, material, colour, size) {
  const n = nameCode(name);
  const m = matOrColCode(material);
  const c = matOrColCode(colour);
  const s = sizeCode(size);
  if (!n || !m || !c || !s) return '';
  return `${n}-${m}-${c}-${s}`;
}

/* ---------- Products ---------- */
async function renderProducts(container) {
  try {
    const [products, stock] = await Promise.all([getProducts(), getCurrentStock()]);
    const totalByProduct = {};
    stock.forEach(r => { totalByProduct[r.product_id] = (totalByProduct[r.product_id] || 0) + r.qty; });

    container.innerHTML = `
      <div class="toolbar">
        <button class="btn" id="newProdBtn">+ New Product</button>
        <input type="text" class="grow" id="prodSearch" placeholder="Search product name or SKU...">
      </div>
      <div class="panel" id="newProdForm" style="display:none;margin-bottom:16px;">
        <div class="panel-head"><h3>Add New Product</h3></div>
        <form class="entry-form">
          <label>Style Name<input type="text" id="np-name" placeholder="e.g. Eula Short"></label>
          <label>Material<input type="text" id="np-material" placeholder="e.g. Linen"></label>
          <label>Colour<input type="text" id="np-color" placeholder="e.g. Off White"></label>
          <label>Size<input type="text" id="np-size" placeholder="e.g. M/L"></label>
          <label>Price (Rp)<input type="number" id="np-price" min="0"></label>
          <label>SKU (auto-generated)<input type="text" id="np-sku" readonly style="background:var(--panel-2,#222);color:var(--muted);"></label>
          <div class="full" style="display:flex;gap:10px;align-items:center;">
            <button type="button" class="btn" id="np-save">Add Product</button>
            <button type="button" class="btn secondary" id="np-cancel">Cancel</button>
            <span id="np-warn" style="color:#e0603d;font-size:12px;"></span>
          </div>
        </form>
      </div>
      <div class="panel">
        <table>
          <thead><tr><th>SKU</th><th>Product</th><th>Material</th><th>Color</th><th>Size</th><th>Total On Hand</th><th>Price</th><th>Status</th></tr></thead>
          <tbody id="prodBody">
            ${products.map(p => `
              <tr class="hoverable" data-id="${p.id}">
                <td>${p.sku}</td><td>${p.style_name}</td><td>${p.material}</td><td>${p.color}</td><td>${p.size}</td>
                <td>${totalByProduct[p.id] || 0}</td>
                <td>Rp ${Number(p.price).toLocaleString('en-US')}</td>
                <td><span class="badge ${p.status === 'Active' ? 'sent' : 'draft'}">${p.status}</span></td>
              </tr>`).join('') || '<tr><td colspan="8" style="color:var(--muted);text-align:center;">No products yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="note">Click a row to see its per-location breakdown and stock ledger.</div>
      <div class="builder" id="breakdownPanel">
        <div class="toolbar" style="justify-content:space-between;">
          <div style="font-weight:700;" id="bd-title"></div>
          <button class="btn secondary" id="bd-close">✕ Close</button>
        </div>
        <div class="panel">
          <table><thead><tr><th>Location</th><th>On Hand</th></tr></thead><tbody id="bd-body"></tbody></table>
        </div>
      </div>
    `;

    // --- SKU Auto-generation logic ---
    const nameEl = container.querySelector('#np-name');
    const matEl = container.querySelector('#np-material');
    const colEl = container.querySelector('#np-color');
    const sizeEl = container.querySelector('#np-size');
    const skuEl = container.querySelector('#np-sku');
    const warnEl = container.querySelector('#np-warn');
    const existingSkus = new Set(products.map(p => (p.sku || '').toUpperCase()));

    function refreshSku() {
      const sku = makeSku(nameEl.value, matEl.value, colEl.value, sizeEl.value);
      skuEl.value = sku;
      if (!sku) { warnEl.textContent = ''; return; }
      if (existingSkus.has(sku)) warnEl.textContent = '⚠ This SKU already exists.';
      else warnEl.textContent = '';
    }
    [nameEl, matEl, colEl, sizeEl].forEach(el => el.addEventListener('input', refreshSku));

    container.querySelector('#newProdBtn').addEventListener('click', () => {
      container.querySelector('#newProdForm').style.display = 'block';
    });
    container.querySelector('#np-cancel').addEventListener('click', () => {
      container.querySelector('#newProdForm').style.display = 'none';
      nameEl.value = ''; matEl.value = ''; colEl.value = ''; sizeEl.value = '';
      container.querySelector('#np-price').value = '';
      skuEl.value = ''; warnEl.textContent = '';
    });

    container.querySelector('#np-save').addEventListener('click', async () => {
      const name = nameEl.value.trim();
      const material = matEl.value.trim();
      const color = colEl.value.trim();
      const size = sizeEl.value.trim();
      const price = parseFloat(container.querySelector('#np-price').value);
      const sku = makeSku(name, material, color, size);

      if (!name || !material || !color || !size) { alert('Please fill in Name, Material, Colour, and Size.'); return; }
      if (!price || price <= 0) { alert('Please enter a valid price.'); return; }
      if (!sku) { alert('Could not generate SKU. Check the fields.'); return; }
      if (existingSkus.has(sku)) { alert(`SKU ${sku} already exists. Change one of the fields.`); return; }

      try {
        await createProduct({ sku, style_name: name, material, color, size, price, status: 'Active' });
        await renderProducts(container);
      } catch (err) {
        alert('Failed to add product: ' + err.message);
      }
    });

    container.querySelector('#prodSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('#prodBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // --- Row Click Logic (Fixed) ---
    container.querySelectorAll('#prodBody tr[data-id]').forEach(row => {
      row.addEventListener('click', async () => {
        const product = products.find(p => p.id === row.dataset.id);
        if (!product) return;

        const breakdown = await getProductBreakdown(product.id);
        container.querySelector('#bd-title').textContent = `${product.style_name} — ${product.color} ${product.size} (${product.sku})`;
        
        // Build the breakdown table
        container.querySelector('#bd-body').innerHTML = breakdown.map(b => `
          <tr>
            <td>
              <button class="btn secondary view-ledger-btn" data-loc-id="${b.locationId}" style="padding: 4px 10px; font-size: 11px;">
                📄 View Ledger
              </button>
              <span style="margin-left: 8px;">${b.location}</span>
            </td>
            <td class="num">${b.qty}</td>
          </tr>
        `).join('') || '<tr><td colspan="2" style="color:var(--muted);text-align:center;">No stock movements yet.</td></tr>';
        
        container.querySelector('#breakdownPanel').classList.add('show');

        // Bind the new View Ledger buttons
        container.querySelectorAll('.view-ledger-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const locId = btn.dataset.locId;
            // Find the location name from the row text
            const locName = btn.parentElement.querySelector('span').textContent;
            const ledger = await getProductLedger(product.id, locId);
            renderLedgerModal(product, locName, ledger);
          });
        });
      });
    });

    container.querySelector('#bd-close').addEventListener('click', () => {
      container.querySelector('#breakdownPanel').classList.remove('show');
    });
  } catch (err) {
    container.innerHTML = `<div class="error-msg">Failed to load products: ${err.message}</div>`;
  }
}

/* ---------- Locations ---------- */
async function renderLocations(container) {
  try {
    const locations = await getLocations();
    container.innerHTML = `
      <div class="toolbar"><button class="btn" id="newLocBtn">+ New Location</button></div>
      <div class="panel" id="newLocForm" style="display:none;margin-bottom:16px;">
        <div class="panel-head"><h3>Onboard New Location</h3></div>
        <form class="entry-form">
          <label>Name<input type="text" id="nl-name"></label>
          <label>Type
            <select id="nl-type"><option>Consignment Store</option><option>Main Warehouse</option></select>
          </label>
          <label>Contact<input type="text" id="nl-contact"></label>
          <label>Commission %<input type="number" id="nl-commission" value="40"></label>
          <div class="full" style="display:flex;gap:10px;">
            <button type="button" class="btn" id="nl-save">Add</button>
            <button type="button" class="btn secondary" id="nl-cancel">Cancel</button>
          </div>
        </form>
      </div>
      <div class="panel">
        <table>
          <thead><tr><th>Location</th><th>Type</th><th>Contact</th><th>Commission %</th><th>Status</th></tr></thead>
          <tbody>
            ${locations.map(l => `
              <tr>
                <td>${l.name}</td><td>${l.type}</td><td>${l.contact || '—'}</td>
                <td><input type="number" class="comm-input" data-id="${l.id}" value="${l.commission_pct ?? ''}" placeholder="—" min="0" max="100" style="width:70px;"> %</td>
                <td><span class="badge sent">${l.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="note">Commission % is editable directly. Adding a location here makes it available in every dropdown across the app immediately.</div>
    `;

    container.querySelector('#newLocBtn').addEventListener('click', () => {
      container.querySelector('#newLocForm').style.display = 'block';
    });
    container.querySelector('#nl-cancel').addEventListener('click', () => {
      container.querySelector('#newLocForm').style.display = 'none';
    });
    container.querySelector('#nl-save').addEventListener('click', async () => {
      const name = container.querySelector('#nl-name').value.trim();
      if (!name) { alert('Enter a name.'); return; }
      const type = container.querySelector('#nl-type').value;
      const contact = container.querySelector('#nl-contact').value.trim();
      const commission_pct = parseFloat(container.querySelector('#nl-commission').value) || 0;
      try {
        await createLocation({ name, type, contact, commission_pct });
        await renderLocations(container);
      } catch (err) {
        alert('Failed to add location: ' + err.message);
      }
    });
    container.querySelectorAll('.comm-input').forEach(input => {
      input.addEventListener('change', async () => {
        try {
          await updateCommission(input.dataset.id, parseFloat(input.value) || 0);
        } catch (err) {
          alert('Failed to update commission: ' + err.message);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="error-msg">Failed to load locations: ${err.message}</div>`;
  }
}

/* ---------- Stock Ledger Modal ---------- */
function renderLedgerModal(product, locationName, movements) {
  const existing = document.getElementById('ledgerModal');
  if (existing) existing.remove();

  let runningBalance = 0;
  const rows = movements.map(m => {
    runningBalance += m.qty_change;
    const date = new Date(m.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
    const typeLabel = m.movement_type.replace(/_/g, ' ').toUpperCase();
    
    return `<tr>
      <td style="font-size:11px; color:var(--muted); white-space:nowrap;">${date}</td>
      <td><span class="badge draft" style="font-size:10px;">${typeLabel}</span></td>
      <td class="num" style="color:${m.qty_change > 0 ? 'var(--good)' : '#e0603d'}; font-weight:700;">${m.qty_change > 0 ? '+' : ''}${m.qty_change}</td>
      <td class="num" style="font-weight:700;">${runningBalance}</td>
      <td style="font-size:11px; color:var(--muted);">${m.note || ''}</td>
    </tr>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'ledgerModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
  
  modal.innerHTML = `
    <div style="background:var(--panel); width:100%; max-width:900px; border-radius:8px; display:flex; flex-direction:column; max-height:90vh;">
      <div class="toolbar" style="justify-content:space-between; padding:16px; border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:700; font-size:16px;">Stock Ledger</div>
          <div style="font-size:12px; color:var(--muted);">${product.style_name} — ${product.color} ${product.size} (${product.sku}) at <b>${locationName}</b></div>
        </div>
        <button class="btn secondary" id="closeLedger">✕ Close</button>
      </div>
      
      <div style="overflow:auto; padding:16px;">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Notes</th></tr></thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:20px;">No movements found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#closeLedger').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
