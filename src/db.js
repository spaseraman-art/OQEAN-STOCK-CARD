import { supabase } from './supabaseClient.js';

/* ---------- Locations ---------- */
export async function getLocations() {
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function createLocation({ name, type, contact, commission_pct }) {
  const { data, error } = await supabase
    .from('locations')
    .insert({ name, type, contact: contact || null, commission_pct: type === 'Main Warehouse' ? null : commission_pct })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCommission(locationId, pct) {
  const { error } = await supabase.from('locations').update({ commission_pct: pct }).eq('id', locationId);
  if (error) throw error;
}

/* ---------- Products ---------- */
export async function getProducts() {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function createProduct(p) {
  const { data, error } = await supabase.from('products').insert(p).select().single();
  if (error) throw error;
  return data;
}

/* ---------- Stock (derived from the movements ledger) ---------- */
// Returns [{ product_id, location_id, qty }]
export async function getCurrentStock() {
  const { data, error } = await supabase.from('v_current_stock').select('*');
  if (error) throw error;
  return data;
}

export async function getProductBreakdown(productId) {
  const { data, error } = await supabase
    .from('v_current_stock')
    .select('location_id, qty, locations(name)')
    .eq('product_id', productId);
  if (error) throw error;
  return data.map(r => ({ location: r.locations.name, qty: r.qty }));
}

export async function insertStockMovement({ product_id, location_id, qty_change, movement_type, reference_id, note }) {
  const { error } = await supabase
    .from('stock_movements')
    .insert({ product_id, location_id, qty_change, movement_type, reference_id, note });
  if (error) throw error;
}

/* ---------- Reference number counters ---------- */
export async function nextCounter(key) {
  const { data, error } = await supabase.rpc('next_counter', { counter_key: key });
  if (error) throw error;
  return data;
}

/* ---------- Deliveries & Returns ---------- */
export async function getDeliveries() {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, from_location:from_location_id(name), to_location:to_location_id(name), delivery_items(qty)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDeliveryWithItems(id) {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, from_location:from_location_id(name), to_location:to_location_id(name), delivery_items(id, qty, product_id, products(sku, name, color, size))')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createDelivery({ type, from_location_id, to_location_id, scheduled_date, items }) {
  const counterKey = type === 'Return' ? 'return' : 'delivery';
  const n = await nextCounter(counterKey);
  const ref = type === 'Return' ? `WH/IN/${String(n).padStart(5, '0')}` : `WH/OUT/${String(n).padStart(5, '0')}`;

  const { data: delivery, error } = await supabase
    .from('deliveries')
    .insert({ ref, type, from_location_id, to_location_id, scheduled_date, status: 'Draft' })
    .select()
    .single();
  if (error) throw error;

  const rows = items.map(i => ({ delivery_id: delivery.id, product_id: i.product_id, qty: i.qty }));
  const { error: itemsError } = await supabase.from('delivery_items').insert(rows);
  if (itemsError) throw itemsError;

  return delivery;
}

export async function updateDeliveryItemQty(itemId, qty) {
  const { error } = await supabase.from('delivery_items').update({ qty }).eq('id', itemId);
  if (error) throw error;
}

export async function addDeliveryItem(deliveryId, productId, qty) {
  const { error } = await supabase.from('delivery_items').insert({ delivery_id: deliveryId, product_id: productId, qty });
  if (error) throw error;
}

export async function deleteDeliveryItem(itemId) {
  const { error } = await supabase.from('delivery_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function updateDeliveryDetails(id, { to_location_id, from_location_id, scheduled_date }) {
  const patch = { scheduled_date };
  if (to_location_id) patch.to_location_id = to_location_id;
  if (from_location_id) patch.from_location_id = from_location_id;
  const { error } = await supabase.from('deliveries').update(patch).eq('id', id);
  if (error) throw error;
}

export async function advanceDeliveryStatus(delivery) {
  const nextStatus = delivery.status === 'Draft' ? 'Approved' : 'Sent';
  const { error } = await supabase.from('deliveries').update({ status: nextStatus }).eq('id', delivery.id);
  if (error) throw error;

  if (nextStatus === 'Sent') {
    const full = await getDeliveryWithItems(delivery.id);
    const outType = full.type === 'Return' ? 'return_out' : 'delivery_out';
    const inType = full.type === 'Return' ? 'return_in' : 'delivery_in';
    for (const item of full.delivery_items) {
      await insertStockMovement({
        product_id: item.product_id,
        location_id: full.from_location_id,
        qty_change: -item.qty,
        movement_type: outType,
        reference_id: full.id,
        note: full.ref,
      });
      await insertStockMovement({
        product_id: item.product_id,
        location_id: full.to_location_id,
        qty_change: item.qty,
        movement_type: inType,
        reference_id: full.id,
        note: full.ref,
      });
    }
  }
  return nextStatus;
}

/* ---------- Sales ---------- */
export async function getSales() {
  const { data, error } = await supabase
    .from('sales')
    .select('*, locations(name), products(sku, name, color, size)')
    .order('sale_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createSale({ location_id, product_id, qty, unit_price, sale_date, note }) {
  const { data: sale, error } = await supabase
    .from('sales')
    .insert({ location_id, product_id, qty, unit_price, sale_date, note })
    .select()
    .single();
  if (error) throw error;

  await insertStockMovement({
    product_id, location_id, qty_change: -qty,
    movement_type: 'sale', reference_id: sale.id, note: 'Sale',
  });
  return sale;
}

export async function updateSale(id, patch) {
  const { error } = await supabase.from('sales').update(patch).eq('id', id);
  if (error) throw error;

  // keep the stock ledger in sync: replace the old movement with one reflecting the new qty/location
  if ('qty' in patch || 'location_id' in patch) {
    const { data: sale, error: fetchError } = await supabase.from('sales').select('*').eq('id', id).single();
    if (fetchError) throw fetchError;
    await supabase.from('stock_movements').delete().eq('reference_id', id).eq('movement_type', 'sale');
    await insertStockMovement({
      product_id: sale.product_id, location_id: sale.location_id, qty_change: -sale.qty,
      movement_type: 'sale', reference_id: sale.id, note: 'Sale (edited)',
    });
  }
}

export async function deleteSale(id) {
  // remove the associated stock movement too, so deleting a sale doesn't leave stock permanently reduced
  await supabase.from('stock_movements').delete().eq('reference_id', id).eq('movement_type', 'sale');
  const { error } = await supabase.from('sales').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Stock Opname ---------- */
export async function createOpname({ location_id, count_date, counted_by, items }) {
  const { data: opname, error } = await supabase
    .from('stock_opname')
    .insert({ location_id, count_date, counted_by })
    .select()
    .single();
  if (error) throw error;

  const rows = items.map(i => ({
    opname_id: opname.id, product_id: i.product_id,
    system_qty: i.system_qty, counted_qty: i.counted_qty, note: i.note || null,
  }));
  const { error: itemsError } = await supabase.from('stock_opname_items').insert(rows);
  if (itemsError) throw itemsError;

  for (const i of items) {
    const variance = i.counted_qty - i.system_qty;
    if (variance !== 0) {
      await insertStockMovement({
        product_id: i.product_id, location_id, qty_change: variance,
        movement_type: 'opname_adjustment', reference_id: opname.id,
        note: `Opname ${count_date}`,
      });
    }
  }
  return opname;
}

/* ---------- Invoices ---------- */
export async function getInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, locations(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSalesForPeriod(locationId, monthStartIso, monthEndIso) {
  const { data, error } = await supabase
    .from('sales')
    .select('*, products(sku, name, color, size)')
    .eq('location_id', locationId)
    .gte('sale_date', monthStartIso)
    .lte('sale_date', monthEndIso);
  if (error) throw error;
  return data;
}

export async function createInvoice({ consignee_id, period_month, issue_date, due_date, commission_pct, sales }) {
  const totalSales = sales.reduce((s, r) => s + r.qty * r.unit_price, 0);
  const commissionAmt = Math.round(totalSales * commission_pct / 100);
  const netAmount = totalSales - commissionAmt;

  const yyyymm = period_month.slice(0, 7).replace('-', '');
  const n = await nextCounter('invoice_' + yyyymm);
  const ref = `INV-${yyyymm}-${String(n).padStart(3, '0')}`;

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      ref, consignee_id, period_month, issue_date, due_date,
      commission_pct, total_sales: totalSales, commission_amt: commissionAmt,
      net_amount: netAmount, status: 'Unpaid',
    })
    .select()
    .single();
  if (error) throw error;

  const rows = sales.map(s => ({
    invoice_id: invoice.id, sale_id: s.id, product_id: s.product_id,
    qty: s.qty, unit_price: s.unit_price, sale_date: s.sale_date,
  }));
  const { error: itemsError } = await supabase.from('invoice_items').insert(rows);
  if (itemsError) throw itemsError;

  return invoice;
}

export async function updateInvoiceStatus(id, status, payment_date) {
  const { error } = await supabase.from('invoices').update({ status, payment_date: payment_date || null }).eq('id', id);
  if (error) throw error;
}

export async function getInvoiceWithItems(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, locations(name), invoice_items(*, products(sku, name, color, size))')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/* ---------- Incoming (Supplier) shipments ---------- */
export async function getIncomingShipments() {
  const { data, error } = await supabase
    .from('incoming_shipments')
    .select('*, locations(name), incoming_shipment_items(qty)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getIncomingShipmentWithItems(id) {
  const { data, error } = await supabase
    .from('incoming_shipments')
    .select('*, locations(name), incoming_shipment_items(id, qty, product_id, products(sku, name, color, size))')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createIncomingShipment({ location_id, supplier_name, expected_date, items }) {
  const n = await nextCounter('incoming');
  const ref = `INC/${String(n).padStart(5, '0')}`;

  const { data: shipment, error } = await supabase
    .from('incoming_shipments')
    .insert({ ref, location_id, supplier_name: supplier_name || null, expected_date, status: 'Draft' })
    .select()
    .single();
  if (error) throw error;

  const rows = items.map(i => ({ shipment_id: shipment.id, product_id: i.product_id, qty: i.qty }));
  const { error: itemsError } = await supabase.from('incoming_shipment_items').insert(rows);
  if (itemsError) throw itemsError;

  return shipment;
}

export async function updateIncomingItemQty(itemId, qty) {
  const { error } = await supabase.from('incoming_shipment_items').update({ qty }).eq('id', itemId);
  if (error) throw error;
}

export async function addIncomingItem(shipmentId, productId, qty) {
  const { error } = await supabase.from('incoming_shipment_items').insert({ shipment_id: shipmentId, product_id: productId, qty });
  if (error) throw error;
}

export async function deleteIncomingItem(itemId) {
  const { error } = await supabase.from('incoming_shipment_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function updateIncomingDetails(id, patch) {
  const { error } = await supabase.from('incoming_shipments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function markIncomingReceived(shipment) {
  const { error } = await supabase.from('incoming_shipments').update({ status: 'Received' }).eq('id', shipment.id);
  if (error) throw error;

  const full = await getIncomingShipmentWithItems(shipment.id);
  for (const item of full.incoming_shipment_items) {
    await insertStockMovement({
      product_id: item.product_id,
      location_id: full.location_id,
      qty_change: item.qty,
      movement_type: 'incoming',
      reference_id: full.id,
      note: full.ref,
    });
  }
  return full;
}
