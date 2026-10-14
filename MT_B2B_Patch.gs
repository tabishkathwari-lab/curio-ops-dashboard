// =============================================================================
// MT / B2B separation — invoice line items, rollup, receivables
// Append to Curio_Backend.gs. Requires existing: zohoFetch_(), SS, respond()
// =============================================================================

// Seed data — the ONLY customers in each category. Everyone else is Consumer / QC / Discontinued.
const MT_SEED = [
  // [Zoho entity name, Chain label, Short name, Notes]
  ['NEW MODERN BAZAAR DEPARTMENTAL STORES PRIVATE LIMITED', 'Modern Bazaar', 'Modern Bazaar', ''],
  ['FOOD SQUARE-LANDCRAFT RETAIL PRIVATE LIMITED',          'Food Square',    'Food Square',    ''],
  ['PICK-N-CHOOSE SUPERMARKET BAGAAT',                       'Pick & Choose',  'Pick & Choose',  ''],
];

const B2B_SEED = [
  // [Zoho entity name, Short name, Account type, Notes]
  ['Kissansay Agtech Private Limited',          'Kissansay',          'Distributor', 'Was mis-categorized as Le Marche earlier'],
  ['Lulu Hypermarket CL India',                  'Lulu',               'Distributor', ''],
  ['DAULAT RAM ENGINEERING SERVICES LIMITED',    'Daulat Ram',         'Corporate',   ''],
  ['Metamorphosis Engitch India Pvt Ltd',        'Metamorphosis',      'Corporate',   ''],
  ['Udhampur Apple Store',                        'Udhampur Apple',     'Reseller',    ''],
  ['Baba Ghulam Traders',                         'Baba Ghulam',        'Reseller',    ''],
];

const DISCONTINUED_SEED = [
  'JLV Innovations Private Limited',
  'MLVC Innovations Pvt Ltd',
];

// -----------------------------------------------------------------------------
// One-time: seed MT_Customers / B2B_Customers / Discontinued_Customers sheets.
// Idempotent — re-running does not duplicate.
// -----------------------------------------------------------------------------
function seedMtB2bCustomers() {
  const seed = (name, headers, rows) => {
    let sh = SS.getSheetByName(name);
    if (!sh) sh = SS.insertSheet(name);
    const existing = sh.getLastRow() > 0 ? sh.getRange(1,1,sh.getLastRow(),1).getValues().flat().map(String) : [];
    if (existing.length === 0) sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    const seenKeys = new Set(sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues().flat().map(String) : []);
    rows.forEach(r => {
      if (!seenKeys.has(String(r[0]))) {
        sh.appendRow([r[0], ...r.slice(1), 'TRUE', new Date()]);
      }
    });
  };
  seed('MT_Customers',  ['Zoho_Name','Chain','Short_Name','Notes','Active','Added'], MT_SEED);
  seed('B2B_Customers', ['Zoho_Name','Short_Name','Account_Type','Notes','Active','Added'], B2B_SEED);
  seed('Discontinued_Customers', ['Zoho_Name','Added'], DISCONTINUED_SEED.map(n => [n]));
  return { mt: MT_SEED.length, b2b: B2B_SEED.length, discontinued: DISCONTINUED_SEED.length };
}

function getMtCustomers_() {
  const sh = SS.getSheetByName('MT_Customers'); if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow()-1, 6).getValues();
  return rows.filter(r => String(r[4]).toUpperCase() === 'TRUE').map(r => ({
    zoho_name: r[0], chain: r[1], short_name: r[2], notes: r[3]
  }));
}
function getB2bCustomers_() {
  const sh = SS.getSheetByName('B2B_Customers'); if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow()-1, 6).getValues();
  return rows.filter(r => String(r[4]).toUpperCase() === 'TRUE').map(r => ({
    zoho_name: r[0], short_name: r[1], account_type: r[2], notes: r[3]
  }));
}

// -----------------------------------------------------------------------------
// Fetch invoice detail (with line_items) from Zoho for a given list of customer names.
// Writes to Zoho_Invoice_Lines sheet with one row per line item.
// -----------------------------------------------------------------------------
function syncZohoInvoiceLinesForCustomers_(customerNames, scopeLabel) {
  const invSheet = SS.getSheetByName('Zoho_Invoices');
  if (!invSheet || invSheet.getLastRow() < 2) throw new Error('Zoho_Invoices sheet is empty. Run syncZohoInvoices first.');
  const hdr = invSheet.getRange(1,1,1,invSheet.getLastColumn()).getValues()[0];
  const idx = {}; hdr.forEach((h,i) => idx[String(h).toLowerCase()] = i);
  const all = invSheet.getRange(2,1,invSheet.getLastRow()-1,invSheet.getLastColumn()).getValues();
  const whitelist = new Set(customerNames.map(n => String(n).toLowerCase()));
  const target = all.filter(r => whitelist.has(String(r[idx.customer_name] || '').toLowerCase()));

  // Prepare lines sheet
  let linesSh = SS.getSheetByName('Zoho_Invoice_Lines');
  if (!linesSh) linesSh = SS.insertSheet('Zoho_Invoice_Lines');
  if (linesSh.getLastRow() === 0) {
    linesSh.getRange(1,1,1,13).setValues([[
      'Invoice_ID','Invoice_Number','Invoice_Date','Customer_Name','Scope',
      'Line_Item_ID','SKU','Item_Name','HSN','Qty','Rate','Discount','Line_Total'
    ]]).setFontWeight('bold');
  }
  // Drop existing rows for this scope so we re-sync cleanly
  if (linesSh.getLastRow() > 1) {
    const existing = linesSh.getRange(2, 5, linesSh.getLastRow()-1, 1).getValues().flat();
    const rowsToDelete = [];
    existing.forEach((s, i) => { if (String(s) === scopeLabel) rowsToDelete.push(i + 2); });
    // Delete from bottom up
    for (let i = rowsToDelete.length - 1; i >= 0; i--) linesSh.deleteRow(rowsToDelete[i]);
  }

  let okCount = 0, errCount = 0, lineCount = 0;
  const out = [];
  target.forEach(row => {
    const invoiceId = row[idx.invoice_id];
    const invoiceNum = row[idx.invoice_number];
    const invoiceDate = row[idx.date];
    const custName = row[idx.customer_name];
    if (!invoiceId) return;
    try {
      const detail = zohoFetch_(`/invoices/${invoiceId}`);
      const items = (detail && detail.invoice && detail.invoice.line_items) || [];
      items.forEach(li => {
        out.push([
          invoiceId, invoiceNum, invoiceDate, custName, scopeLabel,
          li.line_item_id || '', li.sku || '', li.name || '', li.hsn_or_sac || '',
          +li.quantity || 0, +li.rate || 0, +li.discount_amount || 0, +li.item_total || 0
        ]);
        lineCount++;
      });
      okCount++;
    } catch (e) {
      errCount++;
      Logger.log('Failed invoice ' + invoiceNum + ': ' + e.message);
    }
  });
  if (out.length) linesSh.getRange(linesSh.getLastRow()+1, 1, out.length, 13).setValues(out);
  return { scope: scopeLabel, invoices_processed: okCount, failed: errCount, lines_added: lineCount };
}

function syncMtInvoiceLines() {
  const mtNames = getMtCustomers_().map(c => c.zoho_name);
  return syncZohoInvoiceLinesForCustomers_(mtNames, 'MT');
}
function syncB2bInvoiceLines() {
  const b2bNames = getB2bCustomers_().map(c => c.zoho_name);
  return syncZohoInvoiceLinesForCustomers_(b2bNames, 'B2B');
}
function syncMtB2bAll() {
  return { mt: syncMtInvoiceLines(), b2b: syncB2bInvoiceLines() };
}

// -----------------------------------------------------------------------------
// Rollup: per-customer shipped (from lines) vs secondary (from reports) vs outstanding
// -----------------------------------------------------------------------------
function getRollup_(scope) {
  const customers = scope === 'MT' ? getMtCustomers_() : getB2bCustomers_();
  const custByName = {}; customers.forEach(c => custByName[c.zoho_name.toLowerCase()] = c);

  // Pull invoice headers for these customers
  const invSheet = SS.getSheetByName('Zoho_Invoices');
  const hdr = invSheet.getRange(1,1,1,invSheet.getLastColumn()).getValues()[0];
  const idx = {}; hdr.forEach((h,i) => idx[String(h).toLowerCase()] = i);
  const rows = invSheet.getRange(2,1,invSheet.getLastRow()-1,invSheet.getLastColumn()).getValues();

  const perCust = {};
  customers.forEach(c => {
    perCust[c.zoho_name] = {
      zoho_name: c.zoho_name, chain: c.chain, short_name: c.short_name, account_type: c.account_type,
      invoices: 0, shipped_qty: 0, shipped_value: 0, outstanding: 0, last_invoice_date: '',
      by_sku: {}, invoice_list: []
    };
  });

  rows.forEach(r => {
    const cname = String(r[idx.customer_name] || '').trim();
    const c = custByName[cname.toLowerCase()]; if (!c) return;
    const bucket = perCust[c.zoho_name];
    const total = +r[idx.total] || 0;
    const balance = +r[idx.balance] || 0;
    const date = String(r[idx.date] || '').slice(0, 10);
    bucket.invoices++;
    bucket.shipped_value += total;
    bucket.outstanding += balance;
    if (date > bucket.last_invoice_date) bucket.last_invoice_date = date;
    bucket.invoice_list.push({
      invoice_number: r[idx.invoice_number], date: date, total: total, balance: balance,
      status: r[idx.status] || '', due_date: r[idx.due_date] || ''
    });
  });

  // Line-item breakdown
  const linesSh = SS.getSheetByName('Zoho_Invoice_Lines');
  if (linesSh && linesSh.getLastRow() > 1) {
    const lhdr = linesSh.getRange(1,1,1,linesSh.getLastColumn()).getValues()[0];
    const li = {}; lhdr.forEach((h,i) => li[String(h).toLowerCase()] = i);
    const lrows = linesSh.getRange(2,1,linesSh.getLastRow()-1,linesSh.getLastColumn()).getValues();
    lrows.forEach(lr => {
      if (String(lr[li.scope]) !== scope) return;
      const cname = String(lr[li.customer_name] || '').trim();
      const c = custByName[cname.toLowerCase()]; if (!c) return;
      const bucket = perCust[c.zoho_name];
      const sku = String(lr[li.item_name] || lr[li.sku] || '').trim(); if (!sku) return;
      const qty = +lr[li.qty] || 0;
      const val = +lr[li.line_total] || 0;
      if (!bucket.by_sku[sku]) bucket.by_sku[sku] = { sku, shipped_qty: 0, shipped_value: 0, secondary_qty: 0 };
      bucket.by_sku[sku].shipped_qty += qty;
      bucket.by_sku[sku].shipped_value += val;
      bucket.shipped_qty += qty;
    });
  }

  // MT secondary — pull from Sales_MT_Promoter + Sales_MT_Store_Reports if they exist.
  // Keyed by store name; map store name → chain → MT customer bucket.
  if (scope === 'MT') {
    const addSecondary = (sheetName, isPromoter) => {
      const sh = SS.getSheetByName(sheetName); if (!sh || sh.getLastRow() < 2) return;
      const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      const ix = {}; h.forEach((hh,i) => ix[String(hh).toLowerCase()] = i);
      const rr = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
      rr.forEach(row => {
        const chain = String(row[ix.chain] || '').trim();
        const sku = String(row[ix.sku] || row[ix.sku_name] || '').trim();
        const qty = +(row[ix.sold] || row[ix.qty] || row[ix.units] || 0);
        if (!chain || !sku || !qty) return;
        // Match chain to MT customer by chain label (case-insensitive)
        const bucket = customers.find(c => c.chain && c.chain.toLowerCase() === chain.toLowerCase());
        if (!bucket) return;
        const b = perCust[bucket.zoho_name];
        if (!b.by_sku[sku]) b.by_sku[sku] = { sku, shipped_qty: 0, shipped_value: 0, secondary_qty: 0 };
        b.by_sku[sku].secondary_qty += qty;
      });
    };
    addSecondary('Sales_MT_Promoter', true);
    addSecondary('Sales_MT_Store_Reports', false);
    addSecondary('Log_Store_Reports', false);  // historical sheet
    addSecondary('Log_Promoter_Sales', true);  // historical sheet
  }

  // Final shape — compute in_hand
  const out = Object.values(perCust).map(c => {
    const skus = Object.values(c.by_sku).map(s => ({
      ...s,
      in_hand: Math.max(0, s.shipped_qty - s.secondary_qty)
    }));
    const secondary_qty = skus.reduce((a,s) => a + s.secondary_qty, 0);
    return {
      ...c,
      by_sku: skus,
      secondary_qty,
      in_hand: Math.max(0, c.shipped_qty - secondary_qty),
    };
  });
  return out;
}

function getMtRollup_() { return getRollup_('MT'); }
function getB2bRollup_() { return getRollup_('B2B'); }

// -----------------------------------------------------------------------------
// MT store report upload — office-side secondary sales
// -----------------------------------------------------------------------------
function saveMtStoreReport(ts, user, p) {
  p = p || {};
  const date = String(p.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Missing or invalid date (YYYY-MM-DD).');
  const chain = String(p.chain || '').trim();
  const store = String(p.store || '').trim();
  if (!chain || !store) throw new Error('Missing chain or store.');
  let sh = SS.getSheetByName('Sales_MT_Store_Reports');
  if (!sh) {
    sh = SS.insertSheet('Sales_MT_Store_Reports');
    sh.getRange(1,1,1,8).setValues([['Timestamp','Date','User','Chain','Store','SKU','Sold','Source']]).setFontWeight('bold');
  }
  const items = p.items || [];
  const rows = items.filter(i => i.sku && (+i.sold >= 0)).map(i => [ts, date, user, chain, store, i.sku, +i.sold, p.source || 'manual']);
  if (rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, 8).setValues(rows);
  return { id: 'mtsr-' + ts.getTime(), message: rows.length + ' SKU rows added for ' + chain + ' / ' + store };
}

// =============================================================================
// Wire the dispatchers — add these cases to the EXISTING switch blocks
// =============================================================================
// In doPost switch(action), ADD:
//   case 'sync_mt_invoice_lines':  result = syncMtInvoiceLines(); break;
//   case 'sync_b2b_invoice_lines': result = syncB2bInvoiceLines(); break;
//   case 'sync_mt_b2b_all':        result = syncMtB2bAll(); break;
//   case 'seed_mt_b2b_customers':  result = seedMtB2bCustomers(); break;
//   case 'mt_store_report':        result = saveMtStoreReport(ts, user, payload); break;
//
// In doGet switch(q), ADD:
//   case 'mt_customers':  return respond({ ok: true, data: { customers: getMtCustomers_() } });
//   case 'b2b_customers': return respond({ ok: true, data: { customers: getB2bCustomers_() } });
//   case 'mt_rollup':     return respond({ ok: true, data: { rollup: getMtRollup_() } });
//   case 'b2b_rollup':    return respond({ ok: true, data: { rollup: getB2bRollup_() } });
//   case 'sync_mt_b2b_all':  return respond({ ok: true, data: syncMtB2bAll() });  // GET helper for easy trigger
//   case 'seed_mt_b2b_customers': return respond({ ok: true, data: seedMtB2bCustomers() });
