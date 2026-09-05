import './style.css';
import * as summary from './views/summary.js';
import * as stock from './views/stock.js';
import * as deliveries from './views/deliveries.js';
import * as incoming from './views/incoming.js';
import * as sales from './views/sales.js';
import * as invoices from './views/invoices.js';
import * as opname from './views/opname.js';
import * as master from './views/master.js';

const views = {
  summary: { mod: summary, title: 'Summary', sub: 'Consignment stock overview across all locations' },
  stock: { mod: stock, title: 'Stock by Location', sub: 'Current on-hand quantity per store' },
  deliveries: { mod: deliveries, title: 'Deliveries & Returns', sub: 'Draft → Approved → Sent, in both directions' },
  incoming: { mod: incoming, title: 'Incoming (Supplier)', sub: 'New stock arriving from your supplier into a warehouse' },
  sales: { mod: sales, title: 'Sales Entry', sub: 'Log sales per location, back-dating allowed' },
  invoices: { mod: invoices, title: 'Invoices', sub: 'Monthly consignee invoices, tallied from Sales Entry' },
  opname: { mod: opname, title: 'Stock Opname', sub: 'Physical stock count per location' },
  master: { mod: master, title: 'Master Data', sub: 'Products, locations, and commission rates' },
};

const content = document.getElementById('content');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');

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

activate('summary');
