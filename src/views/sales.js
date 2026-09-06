import { getLocations, getProducts, getSales, createSale, updateSale, deleteSale } from '../db.js';

export async function render(root) {
  root.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [locations, products, sales] = await Promise.all([getLocations(), getProducts(), getSales()]);
    const consignees = locations.filter(l => l.type === 'Consignment Store');

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
        <div class="panel-head"><h3>Recent Sales</h3></div>
        <table>
          <thead><tr><th>Date</th><th>Location</th><th>Product</th><th>Qty</th></tr></thead>
          <tbody id="salesBody">
            ${sales.map(s => `
              <tr class="hoverable" data-id="${s.id}">
                <td>${s.sale_date}</td><td>${s.locations.name}</td><td>${s.products.style_name} — ${s.products.color} ${s.products.size}</td><td>${s.qty}</td>
              </tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted);text-align:center;">No sales yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div id="editArea"></div>
    `;

    const priceInput = root.querySelector('#logPrice');
    const prodSelect = root.querySelector('#logProd');
    function updatePrice() {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      priceInput.value = opt ? 'Rp ' + Number(opt.dataset.price).toLocaleString('en-US') : '';
    }
    prodSelect.addEventListener('change', updatePrice);
    updatePrice();

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

    root.querySelectorAll('#salesBody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const sale = sales.find(s => s.id === row.dataset.id);
        renderEdit(root, sale, locations);
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="error-msg">Failed to load sales: ${err.message}</div>`;
  }
}

function renderEdit(root, sale, locations) {
  const editArea = root.querySelector('#editArea');
  editArea.innerHTML = `
    <div class="builder show">
      <div class="toolbar" style="justify-content:space-between;">
        <div style="font-weight:700;">Edit Sale</div>
        <button class="btn secondary" id="closeEdit">✕ Close</button>
      </div>
      <div class="panel">
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
