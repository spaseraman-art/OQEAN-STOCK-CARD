import { getLocations, getProducts, getSalesFiltered, createSale, updateSale, deleteSale } from '../db.js';

let filters = { locationId: 'all', month: '', invoiced: 'all', search: '' };
let loadedRows = [];
let currentOffset = 0;
const PAGE_SIZE = 50;

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products] = await Promise.all([getLocations(), getProducts()]);
    const consignees = locations.filter(l => l.type === 'Consignment Store');

    // reset pagination when doing a full render
    currentOffset = 0;
    const { rows, total } = await getSalesFiltered({ ...filters, limit: PAGE_SIZE, offset: 0 });
    loadedRows = rows;

    root.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Log a Sale</h3></div>
        <form class="entry-form">
          <label>Location<select id="logLoc">${consignees.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select></label>
          <label>Product<select id="logProd">${products.map(p => `<option value="${p.id}" data-price="${p.price}">${p.style_name} — ${p.color} ${p.size}</option>`).join('')}</select></label>
          <label>Qty<input type="number" id="logQty" value="1" min="1"></label>
          <label>Unit Price<input type="text" id="logPrice" readonly></label>
          <label>Sale Date <span style="color:var(--accent);">(back-dated OK)</span><input type="date" id="logDate" value="${new Date().toISOString().slice(0,10)}"></label>
          <label class="full">Notes<input type="text" id="logNote" placeholder="Optional"></label>
          <div class="full"><button type="button" class="btn" id="logSave">Save Sale</button></div>
        </form>
      </div>

      <div style="height:16px"></div>

      <div class="panel">
        <div class="panel-head"><h3>Sales</h3></div>
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
        <table>
          <thead><tr>
            <th>Ref</th><th>Date</th><th>Location</th><th>Product</th><th>Qty</th><th>Invoiced</th>
          </tr></thead>
          <tbody id="salesBody">
            ${rows.length === 0
              ? '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:20px;">No sales match these filters.</td></tr>'
              : rows.map(s => `
                <tr class="hoverable" data-id="${s.id}">
                  <td>${s.ref || '—'}</td>
                  <td>${s.sale_date}</td>
                  <td>${s.locations.name}</td>
                  <td>${s.products.style_name} — ${s.products.color} ${s.products.size}</td>
                  <td>${s.qty}</td>
                  <td>${s.invoiced ? '<span class="badge sent">✔</span>' : '<span class="badge draft">—</span>'}</td>
                </tr>`).join('')}
          </tbody>
        </table>
        <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--muted);font-size:12px;">Showing ${loadedRows.length}${total ? ' of ' + total : ''}</span>
          ${rows.length === PAGE_SIZE
            ? `<button class="btn secondary" id="loadMore">Load 50 more</button>`
            : ''}
        </div>
      </div>
      <div id="editArea"></div>
    `;

    // ----- price autofill -----
    const priceInput = root.querySelector('#logPrice');
    const prodSelect = root.querySelector('#logProd');
    function updatePrice() {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      priceInput.value = opt ? 'Rp ' + Number(opt.dataset.price).toLocaleString('en-US') : '';
    }
    prodSelect.addEventListener('change', updatePrice);
    updatePrice();

    // ----- create sale -----
    root.querySelector('#logSave').addEventListener('click', async () => {
      try {
        await createSale({
          location_id: root.querySelector('#logLoc').value,
          product_id: prodSelect.value,
          qty: parseInt(root.querySelector('#logQty').value, 10) || 1,
          unit_price: parseFloat(prodSelect.options[prodSelect.selectedIndex].dataset.price),
          sale_date: root.querySelector('#logDate').value,
          note: root.querySelector('#logNote').value || null,
        });
        await render(root);
      } catch (err) {
        alert('Failed to log sale: ' + err.message);
      }
    });

    // ----- filters -----
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

    // ----- load more -----
    const loadMoreBtn = root.querySelector('#loadMore');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.textContent = 'Loading…';
        loadMoreBtn.disabled = true;
        currentOffset += PAGE_SIZE;
        const { rows: more } = await getSalesFiltered({ ...filters, limit: PAGE_SIZE, offset: currentOffset });
        // append
        const body = root.querySelector('#salesBody');
        more.forEach(s => {
          const tr = document.createElement('tr');
          tr.className = 'hoverable';
          tr.dataset.id = s.id;
          tr.innerHTML = `<td>${s.ref || '—'}</td><td>${s.sale_date}</td><td>${s.locations.name}</td><td>${s.products.style_name} — ${s.products.color} ${s.products.size}</td><td>${s.qty}</td><td>${s.invoiced ? '<span class="badge sent">✔</span>' : '<span class="badge draft">—</span>'}</td>`;
          tr.addEventListener('click', () => {
            const sale = [...loadedRows, ...more].find(x => x.id === s.id);
            renderEdit(root, sale, locations);
          });
          body.appendChild(tr);
        });
        loadedRows = [...loadedRows, ...more];
        loadMoreBtn.disabled = false;
        if (more.length < PAGE_SIZE) loadMoreBtn.style.display = 'none';
        else loadMoreBtn.textContent = 'Load 50 more';
        root.querySelector('span[style*="Showing"]').textContent = `Showing ${loadedRows.length}`;
      });
    }

    // ----- row click → edit -----
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
