import * as XLSX from 'xlsx';

export function exportDeliveriesList(deliveries) {
  const rows = deliveries.map(d => ({
    Type: d.type,
    Reference: d.ref,
    From: d.from_location?.name || '',
    To: d.to_location?.name || '',
    Date: d.delivery_date || '',
    'Total Items': d.delivery_items.reduce((s, i) => s + i.qty, 0),
    'Total Value': d.delivery_items.reduce((s, i) => s + i.qty * (i.unit_price || 0), 0),
    Status: d.status,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Deliveries & Returns');
  XLSX.writeFile(book, `deliveries-returns-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportDeliveryDetail(full) {
  const rows = full.delivery_items.map(i => ({
    SKU: i.products.sku,
    Product: i.products.style_name,
    Color: i.products.color,
    Size: i.products.size,
    Qty: i.qty,
    'Unit Price': i.unit_price || 0,
    Subtotal: i.qty * (i.unit_price || 0),
  }));

  const totalQty = full.delivery_items.reduce((s, i) => s + i.qty, 0);
  const totalValue = full.delivery_items.reduce((s, i) => s + i.qty * (i.unit_price || 0), 0);
  rows.push({});
  rows.push({ Qty: totalQty, Subtotal: totalValue });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, full.ref.replace(/\//g, '-'));
  XLSX.writeFile(book, `${full.ref.replace(/\//g, '-')}.xlsx`);
}

export function exportStockMatrix(products, stock, locations) {
  const stockByProductLoc = {};
  stock.forEach(r => {
    if (!stockByProductLoc[r.product_id]) stockByProductLoc[r.product_id] = {};
    stockByProductLoc[r.product_id][r.location_id] = (stockByProductLoc[r.product_id][r.location_id] || 0) + r.qty;
  });

  const homeStores = locations.filter(l => l.type === 'Main Warehouse').sort((a, b) => a.name.localeCompare(b.name));
  const consignees = locations.filter(l => l.type !== 'Main Warehouse').sort((a, b) => a.name.localeCompare(b.name));
  const orderedLocations = [...homeStores, ...consignees];

  const productsWithStock = products.filter(p => {
    const m = stockByProductLoc[p.id] || {};
    return Object.values(m).some(v => v > 0);
  });

  const rows = productsWithStock.map(p => {
    const m = stockByProductLoc[p.id] || {};
    const totalQty = Object.values(m).reduce((s, v) => s + v, 0);
    const row = {
      SKU: p.sku,
      Product: p.style_name,
      Material: p.material,
      Colour: p.color,
      Size: p.size,
      Price: p.price,
    };
    orderedLocations.forEach(l => {
      row[l.name] = m[l.id] || 0;
    });
    row['Total Qty'] = totalQty;
    row['Total Value'] = totalQty * (p.price || 0);
    return row;
  });

  const headerFallback = rows.length > 0 ? rows : [{
    SKU: '', Product: '', Material: '', Colour: '', Size: '', Price: '',
    ...Object.fromEntries(orderedLocations.map(l => [l.name, ''])),
    'Total Qty': '', 'Total Value': '',
  }];

  const sheet = XLSX.utils.json_to_sheet(headerFallback);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Stock Matrix');
  XLSX.writeFile(book, `stock-matrix-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportOfficialInvoiceExcel(full) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const invNo = `${yy}${mm}${dd}OM`;
  const displayDate = now.toLocaleDateString('en-US');

  const ws = {};
  const setCell = (cell, value, type = 's') => {
    ws[cell] = { v: value, t: type };
  };

  setCell('H8', 'I N V O I C E');
  
  setCell('B12', 'Company:');
  setCell('C12', full.locations?.name || '');
  setCell('F12', 'Original'); setCell('H12', 'Customer');
  
  setCell('B13', 'Dept. / Attn.:');
  setCell('C13', full.locations?.attn || '');
  setCell('F13', 'Copy 1'); setCell('G13', 'x'); setCell('H13', 'Accounting');
  
  setCell('B14', 'Address:');
  setCell('C14', full.locations?.address || '');
  setCell('F14', 'Copy 2'); setCell('H14', 'Shipping');
  
  setCell('C15', '');
  setCell('F15', 'Copy 3'); setCell('H15', 'File');

  setCell('E18', 'INV No.:'); setCell('F18', invNo);
  setCell('E19', 'Date:'); setCell('F19', displayDate);
  setCell('E20', 'P.O. No.');
  setCell('E21', 'Delivery Date:');

  const headers = ['No.', 'Code', 'Description', 'Unit Price', 'Quantity', '', 'Amount'];
  headers.forEach((h, i) => {
    const col = String.fromCharCode(65 + i); 
    setCell(`${col}22`, h);
  });

  let startRow = 23;
  full.invoice_items.forEach((item, index) => {
    const rowNum = startRow + index;
    setCell(`A${rowNum}`, index + 1, 'n');
    setCell(`C${rowNum}`, `Edited - Oqean ${item.products?.style_name || ''} ${item.products?.color || ''} ${item.products?.size || ''}`);
    setCell(`D${rowNum}`, item.unit_price, 'n');
    setCell(`E${rowNum}`, `${item.qty} PCS`);
    ws[`G${rowNum}`] = { t: 'n', f: `D${rowNum}*F${rowNum}` };
  });

  let currentRow = startRow + full.invoice_items.length;
  while (currentRow <= 38) { currentRow++; }

  setCell('F39', 'Sub Total'); ws['G39'] = { t: 'n', f: `SUM(G23:G38)` };
  setCell('F40', 'Discount');
  setCell('F41', 'Deposit');
  setCell('F42', 'Shipping Fee');
  ws['G43'] = { t: 'n', f: `SUM(G39:G42)` };

  setCell('A44', 'Payment Details');
  setCell('C44', 'BANK PERMATA BANK');
  setCell('B45', 'Cash'); setCell('C45', 'PT. OCC BALI CURATED');
  setCell('B46', 'Check'); setCell('C46', '1237860256');
  setCell('B47', 'X Transfer'); setCell('C47', 'SWIFT CODE : BBBAIDJA');

  setCell('B51', 'Payment Terms :');
  setCell('B55', 'Goods Received');
  setCell('F55', 'Prepared By :');
  setCell('F60', 'Yosie');

  setCell('A62', 'TERMS & CONDITIONS');
  for (let i = 1; i <= 5; i++) setCell(`A${62 + i}`, `${i}.`);

  ws['!ref'] = "A1:G70";
  ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 45 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'INV');
  XLSX.writeFile(book, `Official-Invoice-${invNo}.xlsx`);
}
