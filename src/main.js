import './style.css';
import * as summary from './views/summary.js';
import * as stock from './views/stock.js';
import * as deliveries from './views/deliveries.js';
import * as incoming from './views/incoming.js';
import * as sales from './views/sales.js';
import * as invoices from './views/invoices.js';
import * as opname from './views/opname.js';
import * as master from './views/master.js';
import { getBrands, currentBrandId, setBrandId } from './db.js';

const views = {
  summary: { mod: summary, title: 'Summary', sub: 'Consignment stock overview across all locations' },
  stock: { mod: stock, title: 'Stock by Location', sub: 'Current on-hand quantity per store' },
  deliveries: { mod: deliveries, title: 'Deliveries & Returns', sub: 'Draft → Approved → Sent, in both directions' },
  incoming: { mod: incoming, title: 'Incoming (Supplier)', sub: 'New stock arriving from your supplier into a warehouse' },
  sales: { mod: sales, title: 'Sales Entry', sub: 'Log sales per location, back-dating allowed' },
  invoices: { mod: invoices, title: 'Invoices', sub: 'Monthly consignee invoices, tallied from Sales Entry' },
  opname: { mod: opname, title: 'Stock Opname', sub: 'Physical stock count per location' },
  master: { mod: master, title: 'Master Data', sub: 'Products, locations, and commission rates' }
};

const content = document.getElementById('content');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');
const topbar = document.querySelector('.topbar');

// 1. Inject the Brand Switcher into the top bar
topbar.style.display = 'flex';
topbar.style.justifyContent = 'space-between';
topbar.innerHTML += `
  <div style="display:flex; gap:10px; align-items:center; margin-right:20px;">
    <span style="font-size:12px; color:var(--muted); font-weight:600;">Brand:</span>
    <select id="brandSelector" style="padding:6px 12px; border-radius:6px; background:var(--panel); color:var(--text); border:1px solid var(--border); font-weight:700;"></select>
    <button class="btn secondary" id="addBrandBtn" style="padding:6px 12px; font-size:12px;">+ Add Brand</button>
  </div>
`;

async function loadBrands() {
  const brands = await getBrands();
  const selector = document.getElementById('brandSelector');
  
  selector.innerHTML = brands.map(b => `<option value="${b.id}" ${b.id === currentBrandId ? 'selected' : ''}>${b.name}</option>`).join('');
  
  if (!currentBrandId && brands.length > 0) {
    setBrandId(brands[0].id);
    selector.value = brands[0].id;
  }

  selector.addEventListener('change', (e) => {
    setBrandId(e.target.value);
    activate('summary'); // Refresh the page when switching brands
  });
}

document.getElementById('addBrandBtn').addEventListener('click', async () => {
  const name = prompt("Enter new brand name:");
  if (!name) return;
  try {
    const newBrand = await createBrand(name);
    alert(`Brand "${name}" created with empty data!`);
    await loadBrands();
  } catch (err) {
    alert("Failed to create brand: " + err.message);
  }
});

async function activate(viewKey) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewKey));
  const view = views[viewKey];
  pageTitle.textContent = view.title;
  pageSub.textContent = view.sub;
  content.innerHTML = '<div class="loading">Loading…</div>';
  await view.mod.render(content);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => activate(item.dataset.view));
});

// Boot up
loadBrands().then(() => activate('summary'));
