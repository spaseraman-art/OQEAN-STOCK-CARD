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

  // blank row + totals row at the bottom
  const totalQty = full.delivery_items.reduce((s, i) => s + i.qty, 0);
  const totalValue = full.delivery_items.reduce((s, i) => s + i.qty * (i.unit_price || 0), 0);
  rows.push({});
  rows.push({ Qty: totalQty, Subtotal: totalValue });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, full.ref.replace(/\//g, '-'));
  XLSX.writeFile(book, `${full.ref.replace(/\//g, '-')}.xlsx`);
}

// Expects a file with columns "SKU" and "Qty" (case-insensitive, extra columns ignored).
// Returns [{ sku, qty }, ...]. Throws if the file has no readable rows.
export function parseDeliveryImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = (e) => {
      try {
        const book = XLSX.read(e.target.result, { type: 'array' });
        const sheet = book.Sheets[book.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        if (rows.length === 0) throw new Error('No rows found in the file.');
        const parsed = rows.map(r => {
          const keys = Object.keys(r);
          const skuKey = keys.find(k => k.toLowerCase().trim() === 'sku');
          const qtyKey = keys.find(k => k.toLowerCase().trim() === 'qty' || k.toLowerCase().trim() === 'quantity');
          if (!skuKey || !qtyKey) throw new Error('File must have "SKU" and "Qty" columns.');
          return { sku: String(r[skuKey]).trim(), qty: parseInt(r[qtyKey], 10) || 0 };
        }).filter(r => r.sku && r.qty > 0);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
export function exportStockMatrix(products, stock, locations) {
  // Group stock: { product_id: { location_id: qty } }
  const stockByProductLoc = {};
  stock.forEach(r => {
    if (!stockByProductLoc[r.product_id]) stockByProductLoc[r.product_id] = {};
    stockByProductLoc[r.product_id][r.location_id] = (stockByProductLoc[r.product_id][r.location_id] || 0) + r.qty;
  });

  // Column order: Home Stores first, then consignees alphabetically (matches app)
  const homeStores = locations.filter(l => l.type === 'Main Warehouse').sort((a, b) => a.name.localeCompare(b.name));
  const consignees = locations.filter(l => l.type !== 'Main Warehouse').sort((a, b) => a.name.localeCompare(b.name));
  const orderedLocations = [...homeStores, ...consignees];

  // Only products with qty > 0 somewhere
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

  // Even with 0 products, produce a header row
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
