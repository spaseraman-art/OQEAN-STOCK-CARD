import { getLocations, getProducts, getCurrentStock, getProductBreakdown, createLocation, updateCommission } from '../db.js';

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

async function renderProducts(container) {
  try {
    const [products, stock] = await Promise.all([getProducts(), getCurrentStock()]);
    const totalByProduct = {};
    stock.forEach(r => { totalByProduct[r.product_id] = (totalByProduct[r.product_id] || 0) + r.qty; });

    container.innerHTML = `
      <div class="toolbar">
        <input type="text" class="grow" id="prodSearch" placeholder="Search product name or SKU...">
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
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="note">Click a row to see its per-location breakdown. For cross-location pivots and comparisons, export to Excel — this stays a catalog view.</div>
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

    container.querySelector('#prodSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('#prodBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    container.querySelectorAll('#prodBody tr').forEach(row => {
      row.addEventListener('click', async () => {
        const product = products.find(p => p.id === row.dataset.id);
        const breakdown = await getProductBreakdown(product.id);
        container.querySelector('#bd-title').textContent = `${product.style_name} — ${product.color} ${product.size} (${product.sku})`;
        container.querySelector('#bd-body').innerHTML = breakdown.map(b =>
          `<tr><td>${b.location}</td><td>${b.qty}</td></tr>`
        ).join('') || '<tr><td colspan="2" style="color:var(--muted);text-align:center;">No stock movements yet.</td></tr>';
        container.querySelector('#breakdownPanel').classList.add('show');
      });
    });
    container.querySelector('#bd-close').addEventListener('click', () => {
      container.querySelector('#breakdownPanel').classList.remove('show');
    });
  } catch (err) {
    container.innerHTML = `<div class="error-msg">Failed to load products: ${err.message}</div>`;
  }
}

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
                <td>${l.commission_pct != null
                  ? `<input type="number" class="comm-input" data-id="${l.id}" value="${l.commission_pct}" min="0" max="100" style="width:70px;"> %`
                  : '<span style="color:var(--muted);">N/A</span>'}</td>
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
