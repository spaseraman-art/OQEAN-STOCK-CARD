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
  
  const displayDate = now.toISOString().slice(0, 10);

  const ws = XLSX.utils.aoa_to_sheet([]);

  const headerData = [
    [], [], [], [], [], [], [],
    [], ['', '', '', '', '', '', '', 'I N V O I C E'],
    [], [],
    ['', 'Company:', 'CV.NICONICO', full.locations?.name || '', '', 'Original', '', 'Customer'],
    ['', 'Dept. / Attn.:', 'Mrs. Septi', full.locations?.attn || '', '', 'Copy 1', 'x', 'Accounting'],
    ['', 'Address:', 'JL Gunung Salak Gg.Shangrila No.1B', full.locations?.address || '', '', 'Copy 2', '', 'Shipping'],
    ['', '', 'Bali', '', '', 'Copy 3', '', 'File'],
    ['', '', '80361', '', '', '', '', ''],
    ['', '', '', '', 'INV No.:', invNo, '', ''],
    ['', '', '', '', 'Date:', displayDate, '', ''],
    ['', '', '', '', 'P.O. No.', '', '', ''],
    ['', '', '', '', 'Delivery Date:', '', '', ''],
    [],
  ];

  const itemRows = [
    ['No.', 'Code', 'Unit Volume', 'Description', 'Unit Price', 'Quantity', '', 'Amount']
  ];

  full.invoice_items.forEach((item, index) => {
    const rowNum = 21 + index;
    itemRows.push([
      index + 1,
      '',
      item.products?.size || '',
      `Edited Oqean - ${item.products?.style_name} / ${item.products?.color} / ${item.products?.size}`,
      item.unit_price,
      item.qty,
      'PCS',
      { t: 'n', f: `E${rowNum}*F${rowNum}` }
    ]);
  });

  while (itemRows.length < 19) {
    itemRows.push(['', '', '', '', '', '', '', '']);
  }

  const startRow = 21;
  const endRow = startRow + itemRows.length - 2; 
  const subtotalRow = endRow + 3;

  const footerData = [
    [], [], [], [], [], [], [],
    ['', '', '', '', '', '', '', 'Sub Total', { t: 'n', f: `SUM(H${startRow}:H${endRow})` }],
    ['', '', '', '', '', '', '', 'Discount', ''],
    ['Payment Details', '', '', 'BANK PERMATA BANK', '', '', '', 'Deposit', ''],
    ['', 'Cash', '', 'PT. OCC BALI CURATED', '', '', '', 'Shipping Fee', ''],
    ['', 'Check', '', '1237860256', '', '', '', '', ''],
    ['X', 'Transfer', '', 'SWIFT CODE : BBBAIDJA', '', '', '', '', { t: 'n', f: `SUM(H${subtotalRow}:H${subtotalRow + 3})` }],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['Payment Terms :', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', 'Goods Received', '', '', '', '', '', 'Prepared By :', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', 'Yosie'],
    ['', '', '', '', '', '', '', '', ''],
    ['TERMS & CONDITIONS', '', '', '', '', '', '', '', ''],
    ['1.', '', '', '', '', '', '', '', ''],
    ['2.', '', '', '', '', '', '', '', ''],
    ['3.', '', '', '', '', '', '', '', ''],
    ['4.', '', '', '', '', '', '', '', ''],
    ['5.', '', '', '', '', '', '', '', '']
  ];

  const allData = headerData.concat(itemRows).concat(footerData);

  XLSX.utils.sheet_add_aoa(ws, allData, { origin: 'A1' });
  ws['!cols'] = [
    { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 45 }, { wch: 15 }, { wch: 10 }, { wch: 5 }, { wch: 15 }
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'INV');
  XLSX.writeFile(book, `Invoice-${invNo}.xlsx`);
}
