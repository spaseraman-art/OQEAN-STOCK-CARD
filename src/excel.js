import * as XLSX from 'xlsx';

export function exportDeliveriesList(deliveries) {
  const rows = deliveries.map(d => ({
    Type: d.type,
    Reference: d.ref,
    From: d.from_location.name,
    To: d.to_location.name,
    Date: d.scheduled_date,
    'Total Items': d.delivery_items.reduce((s, i) => s + i.qty, 0),
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
    Product: i.products.name,
    Color: i.products.color,
    Size: i.products.size,
    Qty: i.qty,
  }));
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
