// ====================================================================
// CURIO OPS BACKEND — Google Apps Script
// ====================================================================
// PASTE THIS ENTIRE FILE INTO Extensions → Apps Script → Code.gs
// (Delete the default "function myFunction() {}" first)
//
// After pasting:
//   1. Save (Ctrl+S / Cmd+S)
//   2. Deploy → New deployment → gear ⚙️ → WEB APP (not Library!)
//   3. Execute as: Me
//   4. Who has access: Anyone
//   5. Click Deploy → Authorize → copy the /exec URL
//
// TEST URL (after deploying):
//   https://script.google.com/macros/s/YOUR_ID_HERE/exec?secret=curio2026&q=skus
//   You should see JSON with your SKU list.
//
// TO CHANGE THE SECRET LATER:
//   Change line below → Save → Deploy → Manage deployments → pencil ✏️
//   → Version: New version → Deploy (this is REQUIRED to go live)
// ====================================================================

// SECRET removed — no auth check. Security relies on URL secrecy + frontend password gate.
const SS = SpreadsheetApp.getActive();

// -------------------- META ADS AUTO-SYNC --------------------
// Token + Ad Account ID are stored in Script Properties (Extensions → Apps Script → Project Settings → Script Properties)
// Add these two properties BEFORE running fetchMetaAds():
//   META_TOKEN        = <your permanent system user token>
//   META_AD_ACCOUNT   = act_247674175342904 (or your correct ad account id, prefixed with "act_")
//
// SETUP CRON (runs every 6 hours):
//   Apps Script → Triggers (clock icon on left sidebar) → + Add Trigger
//   Function: fetchMetaAds · Event source: Time-driven · Type: Hour timer · Every 6 hours
//
// FIRST RUN (backfill last 90 days):
//   From editor, function dropdown → fetchMetaAds → ▶ Run
function fetchMetaAds() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('META_TOKEN');
  const account = props.getProperty('META_AD_ACCOUNT');
  if (!token || !account) { Logger.log('ERROR: Missing META_TOKEN/META_AD_ACCOUNT'); return; }
  const sheet = SS.getSheetByName('Ads_Meta_Live') || createAdsMetaLiveTab();
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  const fields = 'campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,date_start,date_stop';
  const now = new Date();
  const ts = new Date();
  let totalRows = 0;
  const allRows = [];
  // Chunk by 90-day windows going back 36 months (avoids Meta's "too much data" 500 error)
  for (let m = 0; m < 36; m += 3) {
    const until = new Date(now.getFullYear(), now.getMonth() - m + 1, 0);
    const since = new Date(now.getFullYear(), now.getMonth() - m - 2, 1);
    const sinceStr = Utilities.formatDate(since, 'UTC', 'yyyy-MM-dd');
    const untilStr = Utilities.formatDate(until, 'UTC', 'yyyy-MM-dd');
    const tr = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));
    const url = 'https://graph.facebook.com/v20.0/' + account + '/insights?level=campaign&fields=' + fields + '&time_increment=monthly&time_range=' + tr + '&limit=500&access_token=' + token;
    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = res.getResponseCode();
      const json = JSON.parse(res.getContentText());
      if (code !== 200) { Logger.log('Chunk ' + sinceStr + ' err: ' + JSON.stringify(json).slice(0, 200)); continue; }
      const rows = json.data || [];
      totalRows += rows.length;
      rows.forEach(r => {
        const p = (r.actions || []).find(a => a.action_type === 'purchase');
        const pv = (r.action_values || []).find(a => a.action_type === 'purchase');
        allRows.push([
          ts, r.date_start, r.campaign_name || '',
          Number(r.spend || 0), Number(r.impressions || 0), Number(r.reach || 0),
          Number(r.clicks || 0), Number(r.ctr || 0), Number(r.cpc || 0), Number(r.cpm || 0),
          p ? Number(p.value) : 0, pv ? Number(pv.value) : 0,
          r.purchase_roas && r.purchase_roas[0] ? Number(r.purchase_roas[0].value) : 0
        ]);
      });
    } catch (e) { Logger.log('Chunk ' + sinceStr + ' fail: ' + e); }
  }
  if (allRows.length > 0) sheet.getRange(2, 1, allRows.length, allRows[0].length).setValues(allRows);
  Logger.log('Meta sync complete: ' + totalRows + ' campaign-month rows loaded');
  // Piggyback Shiprocket + Shopify syncs on the same 6-hour trigger — one wake-up serves all three
  try { fetchShiprocketShipments(); } catch(e) { Logger.log('Piggyback Shiprocket err: ' + e); }
  try { fetchShopifyOrders(); } catch(e) { Logger.log('Piggyback Shopify err: ' + e); }
}

// Run wrapper — so this appears in the Apps Script Run dropdown for manual first-time invocation
function runFetchShopifyOrders() { fetchShopifyOrders(); }

function debugMeta() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('META_TOKEN');
  const account = props.getProperty('META_AD_ACCOUNT');
  Logger.log('Account property: ' + account);
  // 1) Verify account access
  const infoUrl = `https://graph.facebook.com/v20.0/${account}?fields=name,account_status,currency,timezone_name,amount_spent&access_token=${token}`;
  const infoRes = UrlFetchApp.fetch(infoUrl, { muteHttpExceptions: true });
  Logger.log('Account info (' + infoRes.getResponseCode() + '): ' + infoRes.getContentText());
  // 2) List campaigns
  const campUrl = `https://graph.facebook.com/v20.0/${account}/campaigns?fields=name,status,created_time&limit=5&access_token=${token}`;
  const campRes = UrlFetchApp.fetch(campUrl, { muteHttpExceptions: true });
  Logger.log('First 5 campaigns (' + campRes.getResponseCode() + '): ' + campRes.getContentText());
  // 3) Insights with maximum range
  const insUrl = `https://graph.facebook.com/v20.0/${account}/insights?level=campaign&fields=campaign_name,spend,date_start,date_stop&date_preset=maximum&limit=5&access_token=${token}`;
  const insRes = UrlFetchApp.fetch(insUrl, { muteHttpExceptions: true });
  Logger.log('Insights sample (' + insRes.getResponseCode() + '): ' + insRes.getContentText());
}

// -------------------- SHIPROCKET AUTO-SYNC --------------------
// Script Properties needed: SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD
// Token is cached automatically in SHIPROCKET_TOKEN (JWT valid ~10 days)
function shiprocketToken_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('SHIPROCKET_TOKEN');
  const expiry = Number(props.getProperty('SHIPROCKET_TOKEN_EXPIRY') || 0);
  if (cached && Date.now() < expiry - 60000) return cached;
  const email = props.getProperty('SHIPROCKET_EMAIL');
  const password = props.getProperty('SHIPROCKET_PASSWORD');
  if (!email || !password) throw new Error('Missing SHIPROCKET_EMAIL/PASSWORD in Script Properties');
  const res = UrlFetchApp.fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ email: email, password: password }), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Shiprocket auth failed: ' + res.getContentText().slice(0, 200));
  const j = JSON.parse(res.getContentText());
  props.setProperty('SHIPROCKET_TOKEN', j.token);
  props.setProperty('SHIPROCKET_TOKEN_EXPIRY', String(Date.now() + 9 * 24 * 60 * 60 * 1000));
  return j.token;
}

// Manual-run wrapper so this appears in the Apps Script Run dropdown
function runFetchShiprocketOrders() { fetchShiprocketShipments(); }

// On-demand sync triggered by dashboard "Sync Now" button
function doSyncNow(ts, user, p) {
  const channel = String((p && p.channel) || 'all').toLowerCase();
  const out = { ok: true, ran: [], errors: [] };
  const run = (name, fn) => {
    try { fn(); out.ran.push(name); }
    catch (e) { out.errors.push(name + ': ' + (e && e.message ? e.message : String(e))); }
  };
  if (channel === 'shiprocket' || channel === 'all') run('shiprocket', fetchShiprocketShipments);
  if (channel === 'shopify'    || channel === 'all') run('shopify',    fetchShopifyOrders);
  if (channel === 'meta'       || channel === 'all') run('meta',       fetchMetaAds);
  if (channel === 'zoho'       || channel === 'all') run('zoho',       syncZohoBooks);
  const msg = 'ran:[' + out.ran.join(',') + ']' + (out.errors.length ? ' errors:' + out.errors.join('|') : '');
  return { ok: true, id: 'sync_' + Date.now(), message: msg };
}

// Pull all Shiprocket orders via the /orders endpoint (which includes product line items).
// Full replace of Shipments_Shiprocket_Live using the same raw-order schema the CSV uploader writes.
function fetchShiprocketShipments() {
  const token = shiprocketToken_();
  let sh = SS.getSheetByName('Shipments_Shiprocket_Live');
  const HEADERS = ['Uploaded_At','Uploaded_By','OrderID','Date','Channel','Status','SKU','Product','Qty',
      'Customer','City','State','Pincode','Payment','Order_Total','Product_Price','Weight',
      'Courier','AWB','Zone','Freight','COD_Payable','COD_Remitted','Delivered_Date','RTO_Date','RTO_Risk','EDD','Picked_Up'];
  if (!sh) sh = SS.insertSheet('Shipments_Shiprocket_Live');
  // Pagination through /orders endpoint
  const ts = new Date();
  const rows = [];
  let page = 1, totalFetched = 0, pagesWithData = 0;
  const slice10 = v => v ? String(v).slice(0, 10) : '';
  const n = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
  // FY27 full-history pull: Apr 1 2026 → today
  const FROM = '2026-04-01';
  const TO = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  while (page <= 200) {
    const url = 'https://apiv2.shiprocket.in/v1/external/orders?per_page=100&page=' + page +
                '&from=' + FROM + '&to=' + TO;
    const res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { Logger.log('Shiprocket /orders page ' + page + ' err: ' + res.getContentText().slice(0, 200)); break; }
    const body = JSON.parse(res.getContentText());
    const data = body.data || [];
    if (!data.length) break;
    data.forEach(o => {
      const products = o.products && o.products.length ? o.products : [{}];
      products.forEach(p => {
        rows.push([
          ts, 'shiprocket-api',
          o.channel_order_id || o.id || '',
          slice10(o.created_at),
          o.channel_name || '',
          String(o.status || '').toUpperCase(),
          p.channel_sku || p.sku || p.master_sku || '',
          p.name || p.product_name || '',
          Number(p.quantity || 0),
          o.customer_name || o.customer_first_name || '',
          o.customer_city || '',
          o.customer_state || '',
          o.customer_pincode || '',
          String(o.payment_method || '').toLowerCase(),
          n(o.total || o.order_total),
          n(p.price || p.selling_price),
          n(o.weight),
          o.courier_name || o.courier_company || '',
          o.awb_code || o.awb || '',
          o.zone || '',
          n(o.freight_charges || o.freight_total_amount),
          n(o.cod_charges || o.cod_payble_amount),
          n(o.remitted_amount),
          slice10(o.delivered_date),
          slice10(o.rto_delivered_date),
          String(o.rto_risk || '').toLowerCase(),
          slice10(o.edd || o.estimated_delivery_date),
          slice10(o.picked_up_date || o.pickup_scheduled_date)
        ]);
      });
    });
    totalFetched += data.length;
    pagesWithData++;
    page++;
    Utilities.sleep(300);
  }
  // Full replace: clear + rewrite headers + write all rows
  sh.clear();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('Shiprocket API sync: ' + totalFetched + ' orders -> ' + rows.length + ' order-lines across ' + pagesWithData + ' pages');
}

function createAdsMetaLiveTab() {
  const sh = SS.insertSheet('Ads_Meta_Live');
  const headers = ['Synced_At', 'Date', 'Campaign', 'Spend', 'Impressions', 'Reach', 'Clicks', 'CTR', 'CPC', 'CPM', 'Purchases', 'Purchase_Value', 'ROAS'];
  sh.appendRow(headers);
  sh.setFrozenRows(1);
  return sh;
}

// -------------------- SHOPIFY AUTO-SYNC (direct Admin API — no proxy) --------------------
// Script Properties needed:
//   SHOPIFY_ADMIN_TOKEN  = shpat_xxxxxxxxxxxxxxxxxxxxxxxx  (from Shopify custom app)
//   SHOPIFY_SHOP_DOMAIN  = curiolifestyle.myshopify.com    (or e6aff9-2.myshopify.com for dev)
//
// SETUP (one-time, in Shopify admin):
//   Settings → Apps and sales channels → Develop apps → Create app
//   Configure Admin API scopes: read_orders + read_all_orders (for orders older than 60 days)
//   Install app → Reveal token → copy shpat_... → paste into Script Properties
//
// This function is chained after fetchMetaAds on the 6h trigger (see the try/catch at the end of fetchMetaAds).
function fetchShopifyOrders() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('SHOPIFY_ADMIN_TOKEN');
  const shop = props.getProperty('SHOPIFY_SHOP_DOMAIN');
  if (!token || !shop) { Logger.log('Shopify: missing SHOPIFY_ADMIN_TOKEN or SHOPIFY_SHOP_DOMAIN'); return; }
  const endpoint = 'https://' + shop + '/admin/api/2024-10/graphql.json';
  let cursor = null;
  const all = [];
  for (let page = 0; page < 100; page++) {  // 100 * 100 = 10,000 order ceiling
    const afterClause = cursor ? ', after: "' + cursor + '"' : '';
    const q = '{ orders(first: 100, sortKey: CREATED_AT, reverse: true' + afterClause + ', query: "created_at:>2024-01-01") { edges { cursor node { id createdAt totalPriceSet { shopMoney { amount } } subtotalPriceSet { shopMoney { amount } } displayFinancialStatus currentSubtotalLineItemsQuantity } } pageInfo { hasNextPage } } }';
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Shopify-Access-Token': token },
      payload: JSON.stringify({ query: q }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) { Logger.log('Shopify page ' + page + ' HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300)); break; }
    const j = JSON.parse(res.getContentText());
    if (j.errors) { Logger.log('Shopify GraphQL errors: ' + JSON.stringify(j.errors).slice(0, 300)); break; }
    const edges = (j.data && j.data.orders && j.data.orders.edges) || [];
    if (!edges.length) break;
    edges.forEach(e => all.push(e.node));
    if (!j.data.orders.pageInfo.hasNextPage) break;
    cursor = edges[edges.length - 1].cursor;
    Utilities.sleep(250);  // stay under Shopify's rate limit
  }
  // Aggregate by month in Asia/Kolkata
  const monthly = {};
  all.forEach(o => {
    const ym = Utilities.formatDate(new Date(o.createdAt), 'Asia/Kolkata', 'yyyy-MM');
    if (!monthly[ym]) monthly[ym] = { orders: 0, revenue: 0, units: 0, paid: 0, pending: 0 };
    const b = monthly[ym];
    b.orders++;
    b.revenue += Number((o.subtotalPriceSet && o.subtotalPriceSet.shopMoney && o.subtotalPriceSet.shopMoney.amount) || 0);
    b.units += Number(o.currentSubtotalLineItemsQuantity || 0);
    const fs = String(o.displayFinancialStatus || '').toUpperCase();
    if (fs === 'PAID') b.paid++;
    else if (fs === 'PENDING' || fs === 'AUTHORIZED' || fs === 'PARTIALLY_PAID') b.pending++;
  });
  // Write to Sales_Shopify_Live (matches saveShopifyBulkLoad schema so the dashboard needs no changes)
  let sh = SS.getSheetByName('Sales_Shopify_Live');
  if (!sh) {
    sh = SS.insertSheet('Sales_Shopify_Live');
    sh.appendRow(['Synced_At', 'Month', 'Orders', 'Revenue', 'Units', 'Paid_Orders', 'Pending_Orders', 'AOV']);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const ts = new Date();
  const rows = Object.keys(monthly).sort().map(m => {
    const b = monthly[m];
    return [ts, m, b.orders, b.revenue, b.units, b.paid, b.pending, b.orders > 0 ? b.revenue / b.orders : 0];
  });
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('Shopify sync: ' + all.length + ' orders -> ' + rows.length + ' months');
}

// NOTE: `saveShopifyBulkLoad` below is kept as a backup POST endpoint (accepts payloads from any source).
// Preferred path is now the direct fetchShopifyOrders() above, chained on the 6h Meta trigger.

// -------------------- POST (writes) --------------------
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');

    const action = body.action;
    const payload = body.payload || {};
    const user = body.user || 'unknown';
    const ts = new Date();  // always fresh — never trust client-supplied timestamps

    let result;
    switch (action) {
      case 'promoter_checkin':      result = savePromoterCheckin(ts, user, payload); break;
      case 'promoter_stock':        result = savePromoterStock(ts, user, payload); break;
      case 'blinkit_sale':          result = saveBlinkitSale(ts, user, payload); break;
      case 'amazon_sale':           result = saveAmazonSale(ts, user, payload); break;
      case 'shopify_sale':          result = saveShopifySale(ts, user, payload); break;
      case 'b2b_order':             result = saveB2BOrder(ts, user, payload); break;
      case 'mt_office_entry':       result = saveMTOfficeEntry(ts, user, payload); break;
      case 'production_batch':      result = saveProductionBatch(ts, user, payload); break;
      case 'raw_material_intake':   result = saveRawMaterialIntake(ts, user, payload); break;
      case 'inventory_movement':    result = saveInventoryMovement(ts, user, payload); break;
      case 'requisition':           result = saveRequisition(ts, user, payload); break;
      case 'payment_received':      result = savePaymentReceived(ts, user, payload); break;
      case 'expense':               result = saveExpense(ts, user, payload); break;
      case 'shopify_bulk_load':     result = saveShopifyBulkLoad(ts, user, payload); break;
      case 'amazon_ads_bulk_load':  result = saveAmazonAdsBulkLoad(ts, user, payload); break;
      case 'blinkit_add_sku':       result = saveBlinkitAddSku(ts, user, payload); break;
      case 'blinkit_add_city':      result = saveBlinkitAddCity(ts, user, payload); break;
      case 'blinkit_availability_bulk_load': result = saveBlinkitAvailability(ts, user, payload); break;
      case 'blinkit_live_inventory_bulk_load': result = saveBlinkitLiveInventory(ts, user, payload); break;
      case 'shiprocket_bulk_load':  result = saveShiprocketBulkLoad(ts, user, payload); break;
      case 'sync_now':              result = doSyncNow(ts, user, payload); break;
      case 'mt_store_reports_bulk_load': result = saveMtStoreReportsBulk(ts, user, payload); break;
      case 'mt_store_report':            result = saveMtStoreReportCsv(ts, user, payload); break;
      case 'sku_add_alias':         result = saveSkuAddAlias(ts, user, payload); break;
      case 'mt_invoices_bulk_load': result = saveMtInvoicesBulkLoad(ts, user, payload); break;
      case 'factory_inventory_bulk_load': result = saveFactoryInventorySnapshot(ts, user, payload); break;
      case 'admin_purge_sheet_by_date':   result = adminPurgeSheetByDate(ts, user, payload); break;
      case 'admin_patch_empty_date':      result = adminPatchEmptyDate(ts, user, payload); break;
      case 'employee_checkin':            result = saveEmployeeCheckin(ts, user, payload); break;
      default:
        return respond({ ok: false, error: 'Unknown action: ' + action });
    }

    // Log every successful submission
    appendRow('Log_Submissions', [ts, user, body.app || 'unknown', action, JSON.stringify(payload), true, '']);
    return respond({ ok: true, id: result.id, message: result.message });

  } catch (err) {
    try { appendRow('Log_Submissions', [new Date(), '', '', 'ERROR', e.postData ? e.postData.contents : '', false, err.toString()]); } catch (e2) {}
    return respond({ ok: false, error: err.toString() });
  }
}

// -------------------- GET (reads for admin dashboard) --------------------
function doGet(e) {
  try {
    const q = e.parameter.q;
    switch (q) {
      // Master data
      case 'skus':                    return respond({ ok: true, data: readSheet('SKUs') });
      case 'stores':                  return respond({ ok: true, data: readSheet('Stores') });
      case 'employees':               return respond({ ok: true, data: readSheet('Employees') });
      case 'config':                  return respond({ ok: true, data: readSheet('Config') });
      // Today (live from log tabs)
      case 'todays_checkins':         return respond({ ok: true, data: filterByDate('Log_Promoter_Checkins', todayIST()) });
      case 'todays_sales':            return respond({ ok: true, data: gatherTodaysSales() });
      case 'todays_ops':              return respond({ ok: true, data: gatherTodaysOps() });
      case 'kpis':                    return respond({ ok: true, data: computeKPIs() });
      // Historical (from pre-loaded tabs — reflects sheet edits)
      case 'blinkit_monthly':         return respond({ ok: true, data: readSheet('Sales_Blinkit_Monthly') });
      case 'blinkit_product':         return respond({ ok: true, data: readSheet('Sales_Blinkit_Product') });
      case 'blinkit_city':            return respond({ ok: true, data: readSheet('Sales_Blinkit_City') });
      case 'blinkit_feeder':          return respond({ ok: true, data: readSheet('Blinkit_Feeder_Inventory') });
      case 'amazon_monthly':          return respond({ ok: true, data: readSheet('Sales_Amazon_Monthly') });
      case 'amazon_asin':             return respond({ ok: true, data: readSheet('Sales_Amazon_ASIN') });
      case 'amazon_fba_inventory':    return respond({ ok: true, data: readSheet('Amazon_FBA_Inventory') });
      case 'shopify_monthly':         return respond({ ok: true, data: readSheet('Sales_Shopify_Monthly') });
      case 'shopify_live':            return respond({ ok: true, data: readSheet('Sales_Shopify_Live') });
      case 'shopify_raw':             return respond({ ok: true, data: readSheet('Sales_Shopify') });
      case 'shiprocket_live':         return respond({ ok: true, data: readSheet('Shipments_Shiprocket_Live') });
      case 'google_ads_live':         return respond({ ok: true, data: readSheet('Ads_Google_Live') });
      case 'amazon_ads_live':         return respond({ ok: true, data: readSheet('Ads_Amazon_Live') });
      case 'blinkit_custom_skus':     return respond({ ok: true, data: readSheet('Blinkit_Custom_SKUs') });
      case 'blinkit_custom_cities':   return respond({ ok: true, data: readSheet('Blinkit_Custom_Cities') });
      case 'blinkit_availability':    return respond({ ok: true, data: readSheet('Blinkit_Availability') });
      case 'blinkit_live_inventory':  return respond({ ok: true, data: readSheet('Blinkit_Live_Inventory') });
      case 'mt_store_reports':        return respond({ ok: true, data: readSheet('MT_Store_Reports') });
      case 'zoho_invoices':           return respond({ ok: true, data: { invoices: readSheet('Zoho_Invoices'), count: (readSheet('Zoho_Invoices')||[]).length } });
      case 'zoho_sos':                return respond({ ok: true, data: readSheet('Zoho_SalesOrders') });
      case 'zoho_pos':                return respond({ ok: true, data: readSheet('Zoho_PurchaseOrders') });
      case 'zoho_items':              return respond({ ok: true, data: readSheet('Zoho_Items') });
      case 'zoho_bills':              return respond({ ok: true, data: readSheet('Zoho_Bills') });
      case 'zoho_expenses':           return respond({ ok: true, data: readSheet('Zoho_Expenses') });
      case 'zoho_invoice_lines':      return respond({ ok: true, data: readSheet('Zoho_Invoice_Lines') });
      case 'sync_zoho_all':           { try { syncZohoAllDeltas(); return respond({ ok: true, message: 'Zoho delta sync completed' }); } catch(e) { return respond({ ok: false, error: 'Zoho sync failed: ' + e.message }); } }
      case 'blinkit_raw':             return respond({ ok: true, data: readSheet('Sales_Blinkit') });
      case 'amazon_raw':              return respond({ ok: true, data: readSheet('Sales_Amazon') });
      case 'b2b_raw':                 return respond({ ok: true, data: readSheet('Sales_B2B') });
      case 'meta_monthly':            return respond({ ok: true, data: readSheet('Meta_Monthly') });
      case 'amazon_ads_live':         return respond({ ok: true, data: readSheet('Amazon_Ads') });
      case 'blinkit_business_metrics_daily': return respond({ ok: true, data: readSheet('Blinkit_Business_Metrics_Daily') });
      // Employee attendance (all non-promoter staff — Check IN / Check OUT with GPS + selfie)
      case 'employee_checkins_today': return respond({ ok: true, data: filterByDate('Log_Employee_Attendance', todayIST()) });
      case 'employee_checkins_all':   return respond({ ok: true, data: readSheet('Log_Employee_Attendance') });
      case 'employee_locations':      return respond({ ok: true, data: getEmployeeLocations_() });
      case 'factory_finished_inventory':  return respond({ ok: true, data: readSheet('Factory_Finished_Inventory') });
      case 'factory_raw_material':        return respond({ ok: true, data: readSheet('Factory_Raw_Material') });
      case 'factory_bottles':             return respond({ ok: true, data: readSheet('Factory_Bottles') });
      case 'factory_labels':              return respond({ ok: true, data: readSheet('Factory_Labels') });
      case 'factory_boxes':               return respond({ ok: true, data: readSheet('Factory_Boxes') });
      case 'factory_batchcodes':          return respond({ ok: true, data: readSheet('Factory_Batchcodes') });
      // Modern Trade primary sales — from parsed Zoho invoice PDFs
      case 'mt_invoices':             return respond({ ok: true, data: readSheet('MT_Invoices') });
      case 'mt_invoice_lines':        return respond({ ok: true, data: readSheet('MT_Invoice_Lines') });
      case 'mt_office_entries':       return respond({ ok: true, data: readSheet('Sales_MT') });
      // Full promoter stock history — powers sell-through computation (day-over-day deltas)
      case 'promoter_stock_all':      return respond({ ok: true, data: readSheet('Log_Promoter_Stock') });
      case 'promoter_checkins_all':   return respond({ ok: true, data: readSheet('Log_Promoter_Checkins') });
      // Sell-through pre-computed on backend for large datasets (falls back to frontend for small)
      case 'sell_through_computed': {
        const rows = readSheet('Log_Promoter_Stock');
        // Group by Store × SKU, sort by timestamp, compute deltas
        const byPair = {};
        rows.forEach(r => {
          const key = (r.Store_Code || '') + '|' + (r.SKU || '');
          if (!byPair[key]) byPair[key] = [];
          byPair[key].push(r);
        });
        const out = [];
        Object.keys(byPair).forEach(key => {
          const events = byPair[key].sort((a,b) => new Date(a.Timestamp) - new Date(b.Timestamp));
          for (let i = 1; i < events.length; i++) {
            const prev = events[i-1], curr = events[i];
            const received = Number(curr.Units_Received) || 0;
            const prevClose = Number(prev.Closing_Stock) || 0;
            const currClose = Number(curr.Closing_Stock) || 0;
            const rawSold = prevClose + received - currClose;
            const capped = Math.max(0, Math.min(rawSold, prevClose + received));
            out.push({
              Store_Code: curr.Store_Code, SKU: curr.SKU,
              From_Time: prev.Timestamp, To_Time: curr.Timestamp,
              Prev_Closing: prevClose, Received: received, Curr_Closing: currClose,
              Units_Sold: capped,
              Attributed_Promoter: curr.Promoter,
              Flag: rawSold < 0 ? 'UNEXPLAINED_INCREASE' : (rawSold > 100 ? 'SPIKE_CHECK' : (String(curr.Marked_OOS).toUpperCase() === 'Y' ? 'STOCKED_OUT' : ''))
            });
          }
        });
        return respond({ ok: true, data: out });
      }
      // SKU reconciliation
      case 'sku_master':              return respond({ ok: true, data: readSheet('SKU_Master') });
      case 'sku_aliases':             return respond({ ok: true, data: readSheet('SKU_Aliases') });
      case 'consolidated_sku_sales':  return respond({ ok: true, data: getConsolidatedSkuSales() });
      case 'unmapped_skus': {
        // Returns unique raw IDs that don't yet resolve to a canonical — for the "🚨 fix these" banner
        loadAliasCache_();
        const unmapped = {};
        const scan = (sheet, channel, idCol) => readSheet(sheet).forEach(r => {
          const raw = r[idCol];
          if (!raw) return;
          if (r.Canonical_SKU) return;
          if (resolveSku(channel, raw)) return;
          const key = channel + '|' + raw;
          if (!unmapped[key]) unmapped[key] = { channel: channel, external_id: raw, sample_label: r.SKU || r.Product_Name || '', count: 0 };
          unmapped[key].count++;
        });
        scan('Sales_Blinkit', 'blinkit', 'SKU');
        scan('Sales_Amazon',  'amazon',  'ASIN');
        scan('Sales_Shopify', 'shopify', 'SKU');
        scan('Sales_B2B',     'b2b',     'SKU_or_Description');
        return respond({ ok: true, data: Object.values(unmapped) });
      }
      case 'b2b_orders':              return respond({ ok: true, data: readSheet('Sales_B2B') });
      case 'customer_ledger':         return respond({ ok: true, data: readSheet('Customer_Ledger') });
      case 'expenses_monthly':        return respond({ ok: true, data: readSheet('Expenses_Monthly') });
      case 'ads_performance':         return respond({ ok: true, data: readSheet('Ads_Performance') });
      case 'ads_blinkit_monthly':     return respond({ ok: true, data: readSheet('Ads_Blinkit_Monthly') });
      case 'ads_meta_themes':         return respond({ ok: true, data: readSheet('Ads_Meta_Themes') });
      case 'ads_meta_live':           return respond({ ok: true, data: readSheet('Ads_Meta_Live') });
      case 'bank_accounts':           return respond({ ok: true, data: readSheet('Bank_Accounts') });
      case 'fy26_audited_fs':         return respond({ ok: true, data: readSheet('FY26_Audited_FS') });
      case 'gst_entities':            return respond({ ok: true, data: readSheet('GST_Entities') });
      // Diagnostic
      case 'health':                  return respond({ ok: true, data: { time: new Date().toISOString(), tabs: SS.getSheets().map(s => s.getName()) }});
      default:                        return respond({ ok: false, error: 'Unknown query: ' + q });
    }
  } catch (err) {
    return respond({ ok: false, error: err.toString() });
  }
}

// -------------------- DIAGNOSTIC (run from editor to verify setup) --------------------
function testSecret() {
  Logger.log('Auth: disabled (no secret required)');
  Logger.log('Active sheet: ' + SS.getName());
  Logger.log('Tabs found: ' + SS.getSheets().map(s => s.getName()).join(', '));
}

// -------------------- WRITE HANDLERS --------------------
function savePromoterCheckin(ts, user, p) {
  ts = toDate_(ts);  // guarantees a valid Date even if called manually from the editor
  user = user || 'unknown';
  p = p || {};
  const dist = distanceMeters(p.gps_lat, p.gps_lng, p.store_gps_lat, p.store_gps_lng);
  // If the app sent a base64-encoded photo, save it to Drive and store the shareable URL.
  // Falls back gracefully to the raw photo_url string if no base64 is present (backwards-compatible with old app builds).
  let photoUrl = p.photo_url || '';
  if (p.photo_base64) {
    try {
      photoUrl = savePromoterPhoto_(ts, user, p);
    } catch (err) {
      Logger.log('Photo upload failed for ' + user + ' at ' + (p.store_code || '?') + ': ' + err);
      // Keep the filename string as a fallback trail
      photoUrl = 'UPLOAD_FAILED:' + (p.photo_filename || p.photo_url || 'unknown');
    }
  }
  const session = String(p.session || '').toUpperCase() || (ts.getHours() < 15 ? 'AM' : 'PM');
  appendRow('Log_Promoter_Checkins', [ts, formatDate(ts), formatTime(ts), user, p.store_code, p.store_name, p.gps_lat, p.gps_lng, Math.round(dist), photoUrl, p.notes || '', session]);
  return { id: 'checkin-' + ts.getTime(), message: 'Check-in recorded (' + session + ' session · ' + Math.round(dist) + 'm from store)' };
}

// Save the base64 photo to a Google Drive folder (creates the folder on first use).
// Returns a direct-view Drive URL that renders inline in the admin dashboard.
function savePromoterPhoto_(ts, user, p) {
  ts = toDate_(ts);
  const FOLDER_NAME = 'Curio_Promoter_Photos';
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
  const mime = p.photo_mime || 'image/jpeg';
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const safe = String(user || 'unknown').replace(/[^\w-]/g, '_');
  const store = String(p.store_code || 'nostore').replace(/[^\w-]/g, '_');
  const stamp = Utilities.formatDate(ts, 'Asia/Kolkata', 'yyyyMMdd_HHmmss');
  const name = `${stamp}_${safe}_${store}.${ext}`;
  const bytes = Utilities.base64Decode(p.photo_base64);
  const blob = Utilities.newBlob(bytes, mime, name);
  const file = folder.createFile(blob);
  // Make it viewable by anyone with the link so the admin dashboard can render the thumbnail
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { Logger.log('Sharing failed: ' + e); }
  // Return the googleusercontent hotlink URL — this is the ONLY Drive URL format that renders
  // inline in <img> tags. The old drive.google.com/uc?export=view was deprecated in 2024.
  // Suffix "=w1200" caps render width; the dashboard can request other sizes on demand.
  return 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1200';
}
function savePromoterStock(ts, user, p) {
  p = p || {};
  const session = String(p.session || '').toUpperCase() || (ts.getHours() < 15 ? 'AM' : 'PM');
  (p.items || []).forEach(i => {
    appendRow('Log_Promoter_Stock', [ts, formatDate(ts), user, p.store_code, i.sku, i.closing_stock, i.received || 0, i.oos ? 'Y' : 'N', i.notes || '', session]);
  });
  return { id: 'stock-' + ts.getTime(), message: (p.items || []).length + ' SKUs recorded (' + session + ' session)' };
}
// Admin-only: delete rows in a given sheet whose Date column starts with a prefix (e.g. '2026-08').
// Optional source_exclude keeps rows whose Source column exactly matches (comma-separated list).
function adminPurgeSheetByDate(ts, user, p) {
  p = p || {};
  const sheetName = p.sheet;
  const datePrefix = p.date_prefix;
  const dateCol = p.date_col || 'Date';
  const sourceCol = p.source_col || 'Source';
  const excludeSources = (p.source_exclude || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!sheetName || !datePrefix) throw new Error('sheet + date_prefix required');
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const range = sh.getDataRange().getValues();
  const headers = range[0];
  const dIdx = headers.indexOf(dateCol);
  const sIdx = headers.indexOf(sourceCol);
  if (dIdx < 0) throw new Error('Column not found: ' + dateCol);
  const toDelete = [];
  for (let r = 1; r < range.length; r++) {
    const val = range[r][dIdx];
    if (!val) continue;
    let iso = '';
    if (val instanceof Date) {
      iso = Utilities.formatDate(val, 'GMT', 'yyyy-MM-dd');
    } else {
      iso = String(val).slice(0, 10);
    }
    if (!iso.startsWith(datePrefix)) continue;
    if (excludeSources.length && sIdx >= 0 && excludeSources.indexOf(String(range[r][sIdx])) >= 0) continue;
    toDelete.push(r + 1); // sheet row is 1-indexed
  }
  // delete bottom-up so indices don't shift
  toDelete.sort((a, b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
  return { id: 'purge-' + ts.getTime(), message: toDelete.length + ' rows purged from ' + sheetName };
}

// One-shot patch: find rows in a sheet with a blank Date column
// whose Timestamp starts with a given ISO prefix, and set Date to target_date.
// Payload: { sheet: 'Sales_Blinkit', ts_prefix: '2026-09-11', target_date: '2026-09-01' }
function adminPatchEmptyDate(ts, user, p) {
  p = p || {};
  const sheetName = p.sheet;
  const tsPrefix = p.ts_prefix;
  const target = p.target_date;
  if (!sheetName || !tsPrefix || !target) throw new Error('sheet + ts_prefix + target_date required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) throw new Error('target_date must be YYYY-MM-DD');
  const sh = SS.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const range = sh.getDataRange().getValues();
  const headers = range[0];
  const tsIdx = headers.indexOf(p.ts_col || 'Timestamp');
  const dIdx = headers.indexOf(p.date_col || 'Date');
  if (tsIdx < 0 || dIdx < 0) throw new Error('Timestamp/Date column missing');
  let patched = 0;
  for (let r = 1; r < range.length; r++) {
    const tsVal = range[r][tsIdx];
    const dVal = range[r][dIdx];
    if (dVal !== '' && dVal !== null && dVal !== undefined) continue;
    let tsStr = '';
    if (tsVal instanceof Date) tsStr = Utilities.formatDate(tsVal, 'GMT', 'yyyy-MM-dd');
    else tsStr = String(tsVal || '').slice(0, 10);
    if (!tsStr.startsWith(tsPrefix)) continue;
    sh.getRange(r + 1, dIdx + 1).setValue(target);
    patched++;
  }
  return { message: 'Patched ' + patched + ' row(s) in ' + sheetName + ' → Date=' + target };
}

// ---------------------- EMPLOYEE ATTENDANCE (non-promoter staff) ----------------------
// Location config lives inline so it deploys with the code. To change a coord/cutoff,
// edit here and redeploy. WFH staff have location=null → no geofence, no on-time check.
function getEmployeeLocations_() {
  // Anchor points
  const FACTORY   = { name: 'Curio Factory (Jammu)',    lat: 32.6709625, lng: 74.9289531 };
  const SRINAGAR  = { name: 'Curio Office (Srinagar)',  lat: 34.0626875, lng: 74.8091875 };
  const RADIUS_M  = 300;      // 300m geofence — accounts for GPS wander in urban areas
  const CUTOFF_H  = 10;       // 10:00 AM IST cutoff
  const CUTOFF_M  = 0;
  const LATE_MIN  = 30;       // 10:01–10:30 = LATE; after 10:30 = VERY_LATE
  return {
    default_cutoff: { hour: CUTOFF_H, minute: CUTOFF_M, late_grace_min: LATE_MIN },
    default_radius_m: RADIUS_M,
    employees: [
      // Emp_ID, Name, Site (null = WFH permanent, no geofence), can_wfh (whether "WFH today" is allowed)
      { emp_id: 'E001', name: 'Tabish Habib',       site: null,      role: 'CEO',                 wfh: true,  can_wfh: true },
      { emp_id: 'E002', name: 'Faraaz Mir',         site: null,      role: 'Manager (Sales)',     wfh: true,  can_wfh: true },
      { emp_id: 'E003', name: 'Saif Khan',          site: null,      role: 'Graphic Designer',    wfh: true,  can_wfh: true },
      { emp_id: 'E004', name: 'Jasmeen Kaur',       site: FACTORY,   role: 'Factory Manager',     can_wfh: false },
      { emp_id: 'E005', name: 'Dheeraj Kumar',      site: FACTORY,   role: 'Factory Staff (Data)', can_wfh: false },
      { emp_id: 'E006', name: 'Kamal Kishore',      site: FACTORY,   role: 'Factory Staff',       can_wfh: false },
      { emp_id: 'E007', name: 'Yasir Iqbal',        site: FACTORY,   role: 'Factory Staff',       can_wfh: false },
      { emp_id: 'E008', name: 'Maqbool Choudhary',  site: FACTORY,   role: 'Factory Staff',       can_wfh: false },
      { emp_id: 'E009', name: 'Mohammad Sahil',     site: SRINAGAR,  role: 'Factory Staff',       can_wfh: true },
      { emp_id: 'E010', name: 'Neelam Devi',        site: FACTORY,   role: 'Factory Staff',       can_wfh: false },
      { emp_id: 'E011', name: 'Rohni Devi',         site: FACTORY,   role: 'Factory Staff',       can_wfh: false },
      { emp_id: 'E012', name: 'Shahnaz Bano',       site: FACTORY,   role: 'Factory Staff',       can_wfh: false },
      { emp_id: 'E016', name: 'Mouzam Darwaish',    site: SRINAGAR,  role: 'Supply Chain Manager', can_wfh: true }
    ]
  };
}

// Payload: { emp_id, direction: 'IN'|'OUT', gps_lat, gps_lng, photo_base64, photo_mime, notes }
function saveEmployeeCheckin(ts, user, p) {
  ts = toDate_(ts);
  p = p || {};
  const direction = String(p.direction || '').toUpperCase();
  const ALLOWED = ['IN','OUT','HALF_DAY','LEAVE','WFH_DAY'];
  if (ALLOWED.indexOf(direction) < 0) throw new Error("direction must be one of: " + ALLOWED.join(', '));
  const cfg = getEmployeeLocations_();
  const emp = cfg.employees.find(e => e.emp_id === p.emp_id);
  if (!emp) throw new Error('Unknown emp_id: ' + p.emp_id);
  if (direction === 'WFH_DAY' && emp.can_wfh === false) {
    throw new Error(emp.name + ' cannot mark WFH — factory role requires on-site attendance.');
  }

  // Geofence + on-time evaluation
  let distM = null, withinGeofence = true, statusFlag = 'PRESENT', latenessMin = 0;
  if (direction === 'IN' || direction === 'OUT') {
    if (emp.site) {
      distM = Math.round(distanceMeters(p.gps_lat, p.gps_lng, emp.site.lat, emp.site.lng));
      withinGeofence = distM <= cfg.default_radius_m;
    }
  }
  if (direction === 'IN') {
    if (emp.wfh) {
      statusFlag = 'WFH';
    } else {
      // Timezone-aware: interpret ts in IST
      const istHours = Number(Utilities.formatDate(ts, 'Asia/Kolkata', 'H'));
      const istMins  = Number(Utilities.formatDate(ts, 'Asia/Kolkata', 'm'));
      const cutoffMinutes = cfg.default_cutoff.hour * 60 + cfg.default_cutoff.minute;
      const nowMinutes = istHours * 60 + istMins;
      latenessMin = nowMinutes - cutoffMinutes;
      if (latenessMin <= 0) statusFlag = 'ON_TIME';
      else if (latenessMin <= cfg.default_cutoff.late_grace_min) statusFlag = 'LATE';
      else statusFlag = 'VERY_LATE';
      if (!withinGeofence) statusFlag = 'OUT_OF_ZONE'; // overrides — if not at site, they're not present
    }
  } else if (direction === 'HALF_DAY') {
    statusFlag = 'HALF_DAY';
  } else if (direction === 'LEAVE') {
    statusFlag = 'LEAVE';
  } else if (direction === 'WFH_DAY') {
    statusFlag = 'WFH';
  }

  // Photo upload to Drive
  let photoUrl = p.photo_url || '';
  if (p.photo_base64) {
    try { photoUrl = saveEmployeePhoto_(ts, emp, p); }
    catch (err) { Logger.log('Emp photo upload fail: ' + err); photoUrl = 'UPLOAD_FAILED'; }
  }

  // Ensure sheet exists with header
  const headers = ['Timestamp','Date','Time','Emp_ID','Name','Role','Direction','Site',
                   'GPS_Lat','GPS_Lng','Distance_M','Within_Geofence','Status','Lateness_Min',
                   'Photo_URL','Notes'];
  ensureSheet_('Log_Employee_Attendance', headers);
  appendRow('Log_Employee_Attendance', [
    ts, formatDate(ts), formatTime(ts),
    emp.emp_id, emp.name, emp.role, direction,
    emp.site ? emp.site.name : 'WFH',
    p.gps_lat || '', p.gps_lng || '', distM, withinGeofence ? 'Y' : 'N',
    statusFlag, latenessMin, photoUrl, p.notes || ''
  ]);

  let msg;
  if (direction === 'IN') {
    msg = `Check-IN recorded · ${statusFlag}` + (latenessMin > 0 ? ` (${latenessMin} min late)` : '') + (distM !== null ? ` · ${distM}m from ${emp.site.name}` : '');
  } else if (direction === 'OUT') {
    msg = `Check-OUT recorded` + (distM !== null ? ` · ${distM}m from ${emp.site.name}` : '');
  } else if (direction === 'HALF_DAY') {
    msg = 'Half day recorded';
  } else if (direction === 'LEAVE') {
    msg = 'Leave recorded';
  } else if (direction === 'WFH_DAY') {
    msg = 'WFH day recorded';
  }
  return { id: 'empatt-' + ts.getTime(), message: msg };
}

function saveEmployeePhoto_(ts, emp, p) {
  ts = toDate_(ts);
  const FOLDER_NAME = 'Curio_Employee_Attendance_Photos';
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
  const mime = p.photo_mime || 'image/jpeg';
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const empId = String(emp.emp_id || 'unknown').replace(/[^\w-]/g, '_');
  const dir = String(p.direction || 'X').toUpperCase();
  const stamp = Utilities.formatDate(ts, 'Asia/Kolkata', 'yyyyMMdd_HHmmss');
  const name = `${stamp}_${empId}_${dir}.${ext}`;
  const bytes = Utilities.base64Decode(p.photo_base64);
  const blob = Utilities.newBlob(bytes, mime, name);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1200';
}

function saveBlinkitSale(ts, user, p) {
  p = p || {};
  // Reject submissions with a blank/invalid Date — this was a recurring bug:
  // the entry form allowed empty date, so rows landed in Sales_Blinkit with Date="".
  // (Fixed on the frontend too, but keep a server-side guard.)
  const dateStr = String(p.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Missing or invalid date (YYYY-MM-DD required). Nothing saved. Reopen the entry form, pick the correct date at the top, and resubmit.');
  }
  (p.items || []).forEach(i => {
    const canonical = resolveSku('blinkit', i.product_id || i.productId || i.sku_key || i.sku);
    appendRow('Sales_Blinkit', [ts, p.date, user, i.city || '', i.sku, i.units, i.net_sales || 0, i.total_sales || 0, i.ad_spend || 0, p.source || 'manual', canonical]);
  });
  // Also persist city breakdown, warehouse inventory, and metrics if the payload carries them.
  // These tabs are auxiliary — auto-create them on first write so a fresh backend doesn't crash.
  if ((p.cities || []).length) {
    ensureSheet_('Sales_Blinkit_City_Daily', ['Timestamp', 'Date', 'User', 'City', 'Units', 'Sales']);
    p.cities.forEach(c => appendRow('Sales_Blinkit_City_Daily', [ts, p.date, user, c.city, c.units || 0, c.sales || 0]));
  }
  if ((p.warehouse || []).length) {
    ensureSheet_('Blinkit_Warehouse_Daily', ['Timestamp', 'Date', 'User', 'Warehouse', 'SKU', 'Closing_Units']);
    p.warehouse.forEach(w => appendRow('Blinkit_Warehouse_Daily', [ts, p.date, user, w.warehouse, w.sku, w.closing_units || 0]));
  }
  if (p.metrics && typeof p.metrics === 'object' && Object.keys(p.metrics).length) {
    ensureSheet_('Blinkit_Business_Metrics_Daily', ['Timestamp', 'Date', 'User', 'Metric', 'Value']);
    Object.keys(p.metrics).forEach(k => appendRow('Blinkit_Business_Metrics_Daily', [ts, p.date, user, k, p.metrics[k]]));
  }
  return { id: 'blinkit-' + ts.getTime(), message: (p.items || []).length + ' rows added' };
}
function saveAmazonSale(ts, user, p) {
  p = p || {};
  (p.items || []).forEach(i => {
    const canonical = resolveSku('amazon', i.asin || i.sku);
    appendRow('Sales_Amazon', [ts, p.date, user, i.asin || '', i.sku, i.units, i.sessions || 0, i.buy_box_pct || 0, i.ordered_product_sales || 0, p.source || 'manual', canonical]);
  });
  return { id: 'amazon-' + ts.getTime(), message: (p.items || []).length + ' rows added' };
}
function saveShopifySale(ts, user, p) {
  p = p || {};
  (p.items || []).forEach(i => {
    const canonical = resolveSku('shopify', i.sku);
    appendRow('Sales_Shopify', [ts, p.order_date, i.order_id || '', user, p.customer_email || '', p.city || '', i.sku, i.units, i.unit_price, i.units * i.unit_price, p.payment_method || '', p.financial_status || '', p.source || 'manual', canonical]);
  });
  return { id: 'shopify-' + ts.getTime(), message: (p.items || []).length + ' line items added' };
}
function saveB2BOrder(ts, user, p) {
  p = p || {};
  const oid = 'B2B-' + ts.getTime();
  (p.items || []).forEach(i => {
    const canonical = resolveSku('b2b', i.sku_or_description);
    appendRow('Sales_B2B', [ts, p.order_date, oid, user, p.customer_name, p.customer_gstin || '', p.city || '', i.item_type || 'SKU', i.sku_or_description, i.quantity, i.unit_price, i.quantity * i.unit_price, p.status || 'quote', p.delivery_date || '', p.payment_terms || '', canonical]);
  });
  return { id: oid, message: 'B2B order ' + oid + ' saved' };
}
function saveMTOfficeEntry(ts, user, p) {
  p = p || {};
  (p.items || []).forEach(i => {
    appendRow('Sales_MT', [ts, p.date, p.store_code, p.store_name, p.entry_method || 'email', user, i.sku, i.units, i.revenue || 0, p.note || '']);
  });
  return { id: 'mt-' + ts.getTime(), message: 'MT entry saved for ' + p.store_code };
}
function saveProductionBatch(ts, user, p) {
  const bid = p.batch_id || 'BATCH-' + ts.getTime();
  appendRow('Production_Batches', [ts, bid, p.date, user, p.sku, p.quantity, p.qc_status || 'pending', p.raw_kg || 0, p.batch_cost || 0, p.notes || '']);
  return { id: bid, message: 'Batch ' + bid + ' logged' };
}
function saveRawMaterialIntake(ts, user, p) {
  appendRow('Raw_Material_Intake', [ts, p.date, user, p.material, p.vendor, p.qty_kg, p.unit_cost, p.qty_kg * p.unit_cost, p.invoice_ref || '', p.notes || '']);
  return { id: 'intake-' + ts.getTime(), message: 'Intake recorded' };
}
function saveInventoryMovement(ts, user, p) {
  appendRow('Inventory_Movements', [ts, p.date, user, p.movement_type, p.location || '', p.sku, p.quantity, p.balance_after || '', p.reference || '', p.notes || '']);
  return { id: 'inv-' + ts.getTime(), message: 'Movement recorded' };
}
function saveRequisition(ts, user, p) {
  const rid = 'REQ-' + ts.getTime();
  appendRow('Requisitions', [ts, rid, p.date, user, JSON.stringify(p.items || []), p.total_amount || 0, p.approver || '', p.status || 'pending', '', p.notes || '']);
  return { id: rid, message: 'Requisition ' + rid + ' submitted for approval' };
}
function savePaymentReceived(ts, user, p) {
  appendRow('Payments_Received', [ts, p.date, user, p.channel, p.customer, p.amount, p.payment_method, p.bank_ref || '', p.notes || '']);
  return { id: 'pay-' + ts.getTime(), message: 'Payment recorded' };
}
function saveExpense(ts, user, p) {
  appendRow('Expenses', [ts, p.date, user, p.category, p.vendor, p.amount, p.payment_method, p.invoice_ref || '', p.notes || '']);
  return { id: 'exp-' + ts.getTime(), message: 'Expense recorded' };
}

// Shopify sync — replaces contents of Sales_Shopify_Live tab with the pushed monthly aggregate.
// Payload shape: { months: [{ month: 'YYYY-MM', orders: N, revenue: R, units: U, paid_orders: P, pending_orders: PE }, ...],
//                  lifetime_orders: N, lifetime_revenue: R }
function saveShopifyBulkLoad(ts, user, p) {
  let sh = SS.getSheetByName('Sales_Shopify_Live');
  if (!sh) {
    sh = SS.insertSheet('Sales_Shopify_Live');
    sh.appendRow(['Synced_At', 'Month', 'Orders', 'Revenue', 'Units', 'Paid_Orders', 'Pending_Orders', 'AOV']);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const rows = (p.months || []).map(m => [
    ts, m.month, Number(m.orders || 0), Number(m.revenue || 0),
    Number(m.units || 0), Number(m.paid_orders || 0), Number(m.pending_orders || 0),
    Number(m.orders) > 0 ? Number(m.revenue) / Number(m.orders) : 0,
  ]);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { id: 'shopify-sync-' + ts.getTime(), message: 'Shopify sync: ' + rows.length + ' months loaded (lifetime ' + (p.lifetime_orders || '?') + ' orders)' };
}

// Amazon Ads bulk load — POSTed from Cowork scheduler after user drops weekly Sponsored Products CSV.
// Payload: { campaigns: [{ period, campaign, impressions, clicks, cost, sales, orders, acos, roas }, ...] }
function saveAmazonAdsBulkLoad(ts, user, p) {
  let sh = SS.getSheetByName('Ads_Amazon_Live');
  if (!sh) {
    sh = SS.insertSheet('Ads_Amazon_Live');
    sh.appendRow(['Synced_At', 'Period', 'Campaign', 'Impressions', 'Clicks', 'CTR', 'Cost', 'Sales', 'Orders', 'ACOS', 'ROAS', 'CPC', 'CVR']);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const rows = (p.campaigns || []).map(c => {
    const imp = Number(c.impressions || 0);
    const clk = Number(c.clicks || 0);
    const cost = Number(c.cost || 0);
    const sales = Number(c.sales || 0);
    const orders = Number(c.orders || 0);
    return [
      ts, c.period || '', c.campaign || '',
      imp, clk, imp > 0 ? clk / imp * 100 : 0,
      cost, sales, orders,
      sales > 0 ? cost / sales * 100 : 0,
      cost > 0 ? sales / cost : 0,
      clk > 0 ? cost / clk : 0,
      clk > 0 ? orders / clk * 100 : 0,
    ];
  });
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { id: 'amazon-ads-sync-' + ts.getTime(), message: 'Amazon Ads sync: ' + rows.length + ' campaigns loaded' };
}

// Add a user-created Blinkit SKU (appends to Blinkit_Custom_SKUs tab)
function saveBlinkitAddSku(ts, user, p) {
  let sh = SS.getSheetByName('Blinkit_Custom_SKUs');
  if (!sh) {
    sh = SS.insertSheet('Blinkit_Custom_SKUs');
    sh.appendRow(['Added_At', 'Added_By', 'Name', 'MRP', 'Level', 'Product_ID', 'Key']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([ts, user, p.name || '', Number(p.mrp || 0), p.level || '', p.productId || '', p.key || '']);
  return { id: 'blinkit-sku-' + ts.getTime(), message: 'SKU "' + p.name + '" saved' };
}

// Add a user-created Blinkit city (appends to Blinkit_Custom_Cities tab)
function saveBlinkitAddCity(ts, user, p) {
  let sh = SS.getSheetByName('Blinkit_Custom_Cities');
  if (!sh) {
    sh = SS.insertSheet('Blinkit_Custom_Cities');
    sh.appendRow(['Added_At', 'Added_By', 'Name', 'Darkstores']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([ts, user, p.name || '', Number(p.ds || 0)]);
  return { id: 'blinkit-city-' + ts.getTime(), message: 'City "' + p.name + '" saved' };
}

// Full-refresh Blinkit availability matrix. Long format: one row per city per SKU.
// Payload: { records: [{city, sku_key, sku_name, darkstores, city_total_ds}, ...], uploaded_at }
function saveBlinkitAvailability(ts, user, p) {
  let sh = SS.getSheetByName('Blinkit_Availability');
  if (!sh) {
    sh = SS.insertSheet('Blinkit_Availability');
    sh.appendRow(['Uploaded_At', 'Uploaded_By', 'City', 'SKU_Key', 'SKU_Name', 'Darkstores', 'City_Total_DS']);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const rows = (p.records || []).map(r => [
    ts, user, r.city || '', r.sku_key || '', r.sku_name || '',
    Number(r.darkstores || 0), Number(r.city_total_ds || 0)
  ]);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { id: 'blinkit-avail-' + ts.getTime(), message: 'Availability: ' + rows.length + ' city-SKU records saved' };
}

// Blinkit live inventory — one snapshot of all SKUs with stock, unsellable breakdown, and 7d/30d sales.
// Payload: { snapshot_date: 'YYYY-MM-DD', records: [{ sku_upc, product_name, mrp, selling_price,
//   soh_darkstore, soh_warehouse, soh_inbetween, soh_total_sellable, low_inv_flag, incoming_scheduled,
//   unsellable_total, unsellable_near_expiry, unsellable_damaged, unsellable_lost, unsellable_expired,
//   sales_7day, sales_30day, rev_30day }, ...] }
// Replaces the entire sheet on each upload (idempotent — the latest snapshot overrides).
// Shiprocket bulk load — full replace. Each row = one order-line (so one order with 2 SKUs = 2 rows).
// Payload: { records: [{ OrderID, Date, Channel, Status, SKU, Product, Qty, Customer, City, State, Pincode, Payment, Order_Total, Product_Price, Weight, Courier, AWB, Zone, Freight, COD_Payable, COD_Remitted, Delivered_Date, RTO_Date, RTO_Risk, EDD, Picked_Up }, ...] }
function saveShiprocketBulkLoad(ts, user, p) {
  p = p || {};
  let sh = SS.getSheetByName('Shipments_Shiprocket_Live');
  const HEADERS = ['Uploaded_At','Uploaded_By','OrderID','Date','Channel','Status','SKU','Product','Qty',
      'Customer','City','State','Pincode','Payment','Order_Total','Product_Price','Weight',
      'Courier','AWB','Zone','Freight','COD_Payable','COD_Remitted','Delivered_Date','RTO_Date','RTO_Risk','EDD','Picked_Up'];
  if (!sh) {
    sh = SS.insertSheet('Shipments_Shiprocket_Live');
  }
  // Always full-clear and rewrite headers (handles schema changes from old aggregated layout)
  sh.clear();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
  const rows = (p.records || []).map(r => [
    ts, user,
    r.OrderID || '', r.Date || '', r.Channel || '', r.Status || '',
    r.SKU || '', r.Product || '', Number(r.Qty || 0),
    r.Customer || '', r.City || '', r.State || '', r.Pincode || '',
    (r.Payment || '').toLowerCase(),
    Number(r.Order_Total || 0), Number(r.Product_Price || 0), Number(r.Weight || 0),
    r.Courier || '', r.AWB || '', r.Zone || '',
    Number(r.Freight || 0), Number(r.COD_Payable || 0), Number(r.COD_Remitted || 0),
    r.Delivered_Date || '', r.RTO_Date || '', r.RTO_Risk || '', r.EDD || '', r.Picked_Up || ''
  ]);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { id: 'shiprocket-bulk-' + ts.getTime(), message: 'Shiprocket: ' + rows.length + ' order-lines saved (full replace)' };
}

function saveBlinkitLiveInventory(ts, user, p) {
  p = p || {};
  const snapshotDate = p.snapshot_date || Utilities.formatDate(ts, 'Asia/Kolkata', 'yyyy-MM-dd');
  let sh = SS.getSheetByName('Blinkit_Live_Inventory');
  if (!sh) {
    sh = SS.insertSheet('Blinkit_Live_Inventory');
    sh.appendRow(['Snapshot_Date','Uploaded_At','Uploaded_By','SKU_UPC','Product_Name','MRP','Selling_Price',
      'SOH_Darkstore','SOH_Warehouse','SOH_InBetween','SOH_Total_Sellable','Low_Inv_Flag','Incoming_Scheduled',
      'Unsellable_Total','Unsellable_NearExpiry','Unsellable_Damaged','Unsellable_Lost','Unsellable_Expired',
      'Sales_7day','Sales_30day','Rev_30day']);
    sh.setFrozenRows(1);
  }
  // Overwrite — this is a live snapshot, not a log
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow()-1, sh.getLastColumn()).clearContent();
  const rows = (p.records || []).map(r => [
    snapshotDate, ts, user,
    r.sku_upc || '', r.product_name || '',
    Number(r.mrp || 0), Number(r.selling_price || 0),
    Number(r.soh_darkstore || 0), Number(r.soh_warehouse || 0), Number(r.soh_inbetween || 0), Number(r.soh_total_sellable || 0),
    r.low_inv_flag || '', Number(r.incoming_scheduled || 0),
    Number(r.unsellable_total || 0), Number(r.unsellable_near_expiry || 0), Number(r.unsellable_damaged || 0), Number(r.unsellable_lost || 0), Number(r.unsellable_expired || 0),
    Number(r.sales_7day || 0), Number(r.sales_30day || 0), Number(r.rev_30day || 0)
  ]);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { id: 'blinkit-live-inv-' + ts.getTime(), message: 'Blinkit live inventory: ' + rows.length + ' SKUs saved for snapshot ' + snapshotDate };
}

// Modern Trade store reports — bulk load secondary (store-level) sales per month, store, SKU.
// Payload: { chain: 'Food Square', records: [{ month, store, sku, units, value }, ...] }
// Append-only — each upload adds rows. Dashboard groups by chain/store/sku/month.
// CSV-upload handler: one POST per date+chain+store with items[]
// payload: { date, chain, store, items: [{sku, stock_in_hand?, expired_returned?, sold?, _format}] }
function saveMtStoreReportCsv(ts, user, p) {
  p = p || {};
  const date = p.date || '';
  const chain = p.chain || '';
  const store = p.store || '';
  const items = p.items || [];
  if (!date || !chain || !store || !items.length) throw new Error('mt_store_report: need date, chain, store, items');
  let sh = SS.getSheetByName('Sales_MT_Store_Reports');
  const HEADERS = ['Timestamp','Date','User','Chain','Store','SKU','Stock_In_Hand','Expired_Returned','Sold','Source'];
  if (!sh) {
    sh = SS.insertSheet('Sales_MT_Store_Reports');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  const rows = items.map(i => [
    ts, date, user || 'csv-upload', chain, store, i.sku || '',
    i.stock_in_hand != null ? Number(i.stock_in_hand) : '',
    i.expired_returned != null ? Number(i.expired_returned) : '',
    i.sold != null ? Number(i.sold) : '',
    'csv-upload manual'
  ]);
  sh.getRange(sh.getLastRow()+1, 1, rows.length, HEADERS.length).setValues(rows);
  return { id: 'mt-store-' + ts.getTime(), message: 'MT store report: ' + rows.length + ' rows saved for ' + store + ' on ' + date };
}

function saveMtStoreReportsBulk(ts, user, p) {
  p = p || {};
  const chain = p.chain || '';
  let sh = SS.getSheetByName('MT_Store_Reports');
  if (!sh) {
    sh = SS.insertSheet('MT_Store_Reports');
    sh.appendRow(['Uploaded_At','Uploaded_By','Chain','Month','Store','SKU','Units','Value']);
    sh.setFrozenRows(1);
  }
  const rows = (p.records || []).map(r => [
    ts, user, chain || r.chain || '',
    r.month || '', r.store || '', r.sku || '',
    Number(r.units || 0), Number(r.value || 0)
  ]);
  if (rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
  return { id: 'mt-store-reports-' + ts.getTime(), message: 'MT store reports: ' + rows.length + ' rows saved for ' + (chain || 'chain') };
}

// Modern Trade primary sales — bulk load from parsed Zoho invoice PDFs.
// Payload: { invoices: [{ invoice_number, date (dd/mm/yyyy), month (yyyy-mm), chain, customer_raw, place_of_supply, total, line_count, items_total_qty }, ...],
//            line_items: [{ invoice_number, chain, date, month, sku_desc, hsn, qty, rate, amount }, ...] }
function saveMtInvoicesBulkLoad(ts, user, p) {
  p = p || {};
  const invoices = p.invoices || [];
  const lines = p.line_items || [];
  // MT_Invoices — one row per invoice
  let sh = SS.getSheetByName('MT_Invoices');
  if (!sh) {
    sh = SS.insertSheet('MT_Invoices');
    sh.appendRow(['Synced_At', 'Invoice_Number', 'Date', 'Month', 'Chain', 'Customer_Raw', 'Place_Of_Supply', 'Line_Count', 'Total_Qty', 'Total']);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const invRows = invoices.map(i => [
    ts, i.invoice_number || '', i.date || '', i.month || '', i.chain || '',
    i.customer_raw || '', i.place_of_supply || '',
    Number(i.line_count) || 0, Number(i.items_total_qty) || 0, Number(i.total) || 0
  ]);
  if (invRows.length) sh.getRange(2, 1, invRows.length, invRows[0].length).setValues(invRows);
  // MT_Invoice_Lines — one row per line item
  let lh = SS.getSheetByName('MT_Invoice_Lines');
  if (!lh) {
    lh = SS.insertSheet('MT_Invoice_Lines');
    lh.appendRow(['Synced_At', 'Invoice_Number', 'Date', 'Month', 'Chain', 'SKU_Desc', 'HSN', 'Qty', 'Rate', 'Amount']);
    lh.setFrozenRows(1);
  }
  if (lh.getLastRow() > 1) lh.getRange(2, 1, lh.getLastRow() - 1, lh.getLastColumn()).clearContent();
  const lineRows = lines.map(l => [
    ts, l.invoice_number || '', l.date || '', l.month || '', l.chain || '',
    l.sku_desc || '', l.hsn || '', Number(l.qty) || 0, Number(l.rate) || 0, Number(l.amount) || 0
  ]);
  if (lineRows.length) lh.getRange(2, 1, lineRows.length, lineRows[0].length).setValues(lineRows);
  return { id: 'mt-inv-' + ts.getTime(), message: 'MT invoices loaded: ' + invRows.length + ' invoices, ' + lineRows.length + ' line items' };
}

// -------------------- FACTORY INVENTORY BULK LOAD --------------------
// Snapshot from Inventory Master xlsx — overwrites 6 dedicated sheets.
// Payload: { as_of, finished:[{category,sku,semi,ready,total}], raw:[{material,qty,remarks}],
//            bottles:[{size,type,qty}], labels:[{sku,front,back}], boxes:[{box,qty}],
//            batchcodes:[{sku,batchcode,mrp,usp,unit,best_before}] }
function saveFactoryInventorySnapshot(ts, user, p) {
  p = p || {};
  const asOf = p.as_of || new Date().toISOString().slice(0,10);
  const write = (sheetName, header, rows) => {
    let sh = SS.getSheetByName(sheetName);
    if (!sh) { sh = SS.insertSheet(sheetName); sh.appendRow(header); sh.setFrozenRows(1); }
    else if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  };
  const F = p.finished || [], R = p.raw || [], BT = p.bottles || [], L = p.labels || [], BX = p.boxes || [], BC = p.batchcodes || [];
  write('Factory_Finished_Inventory', ['As_Of','Snapshot_Ts','Category','SKU','Semi_Finished','Ready_Stock','Total'],
    F.map(r => [asOf, ts, r.category||'', r.sku||'', Number(r.semi)||0, Number(r.ready)||0, Number(r.total)||0]));
  write('Factory_Raw_Material', ['As_Of','Snapshot_Ts','Material','Qty_Raw','Remarks'],
    R.map(r => [asOf, ts, r.material||'', r.qty||'', r.remarks||'']));
  write('Factory_Bottles', ['As_Of','Snapshot_Ts','Size','Type','Qty'],
    BT.map(r => [asOf, ts, r.size||'', r.type||'', Number(r.qty)||0]));
  write('Factory_Labels', ['As_Of','Snapshot_Ts','SKU','Front','Back'],
    L.map(r => [asOf, ts, r.sku||'', r.front||'', r.back||'']));
  write('Factory_Boxes', ['As_Of','Snapshot_Ts','Box','Qty'],
    BX.map(r => [asOf, ts, r.box||'', r.qty||'']));
  write('Factory_Batchcodes', ['As_Of','Snapshot_Ts','SKU','Batchcode','MRP','USP','Unit','Best_Before'],
    BC.map(r => [asOf, ts, r.sku||'', r.batchcode||'', Number(r.mrp)||0, Number(r.usp)||0, r.unit||'', r.best_before||'']));
  return { id: 'factory-inv-'+ts.getTime(),
    message: 'Snapshot as of ' + asOf + ' · ' + F.length + ' finished, ' + R.length + ' raw, ' + BT.length + ' bottles, ' + L.length + ' labels, ' + BX.length + ' boxes, ' + BC.length + ' batchcodes' };
}

// -------------------- SKU MASTER + MULTI-CHANNEL ALIAS RESOLVER --------------------
// Purpose: reconcile the same physical product across Blinkit/Amazon/Shopify/B2B
// One-time setup: run seedSkuMaster_() from the editor. Creates two tabs:
//   SKU_Master   — 20 canonical Curio SKUs
//   SKU_Aliases  — every channel×external-id → canonical mapping (~60 rows)
// After that, every save*Sale handler auto-tags Canonical_SKU on writes.

// In-memory cache — reset by editing the sheet + running clearSkuCache_()
let SKU_ALIAS_CACHE = null;
function loadAliasCache_() {
  if (SKU_ALIAS_CACHE) return SKU_ALIAS_CACHE;
  const sh = SS.getSheetByName('SKU_Aliases');
  if (!sh || sh.getLastRow() < 2) { SKU_ALIAS_CACHE = {}; return SKU_ALIAS_CACHE; }
  const rows = sh.getDataRange().getValues().slice(1);
  const cache = {};
  rows.forEach(r => {
    const channel = String(r[0] || '').toLowerCase().trim();
    const externalId = String(r[1] || '').toLowerCase().trim();
    const canonical = String(r[3] || '').trim();
    if (channel && externalId && canonical) cache[channel + '|' + externalId] = canonical;
  });
  SKU_ALIAS_CACHE = cache;
  return cache;
}
function clearSkuCache_() { SKU_ALIAS_CACHE = null; }

// Public: resolveSku('blinkit', '670153') → 'CURIO-ALMOND-OIL-100' (or '' if unmapped)
function resolveSku(channel, externalId) {
  if (!channel || !externalId) return '';
  const cache = loadAliasCache_();
  const key = String(channel).toLowerCase().trim() + '|' + String(externalId).toLowerCase().trim();
  return cache[key] || '';
}

function seedSkuMaster_() {
  // --- SKU_Master ---
  let m = SS.getSheetByName('SKU_Master');
  if (!m) m = SS.insertSheet('SKU_Master');
  m.clear();
  m.appendRow(['Canonical_SKU', 'Product_Name', 'Pack', 'Category', 'MRP']);
  const master = [
    ['CURIO-ALMONDS-500',           'Kashmir Almonds (Premium Mamra)',            '500 g',  'Dry Fruits', 1300],
    ['CURIO-ALMONDS-1000',          'Kashmir Almonds (Premium Mamra)',            '1 kg',   'Dry Fruits', 2500],
    ['CURIO-WALNUTS-500',           'Kashmir Walnuts',                            '500 g',  'Dry Fruits', 1200],
    ['CURIO-WALNUTS-1000',          'Kashmir Walnuts',                            '1 kg',   'Dry Fruits', 2300],
    ['CURIO-APRICOTS-500',          'Ladakh Apricots (Sun Dried)',                '500 g',  'Dry Fruits', 1150],
    ['CURIO-APRICOTS-1000',         'Ladakh Apricots (Sun Dried)',                '1 kg',   'Dry Fruits', 2200],
    ['CURIO-GHEE-500',              'Cow Ghee (Himalayan Badri)',                 '500 ml', 'Ghee',       1400],
    ['CURIO-GHEE-1000',             'Cow Ghee (Himalayan Badri)',                 '1 L',    'Ghee',       2700],
    ['CURIO-SAFFRON-1G',            'Kashmir Saffron Mongra (Pure Threads)',      '1 g',    'Spices',      545],
    ['CURIO-SAFFRON-2G',            'Kashmir Saffron Mongra (Pure Threads)',      '2 g',    'Spices',     1050],
    ['CURIO-ALMOND-OIL-100',        'Cold Pressed Almond Oil',                    '100 ml', 'Oils',       1155],
    ['CURIO-ALMOND-OIL-250',        'Cold Pressed Almond Oil',                    '250 ml', 'Oils',       2800],
    ['CURIO-APRICOT-OIL-100',       'Cold Pressed Apricot Oil',                   '100 ml', 'Oils',       1200],
    ['CURIO-WALNUT-OIL-100',        'Cold Pressed Walnut Oil',                    '100 ml', 'Oils',       1200],
    ['CURIO-MUSTARD-OIL-500',       'Cold Pressed Mustard Oil',                   '500 ml', 'Oils',        460],
    ['CURIO-SIDR-HONEY-500',        'SIDR Honey',                                 '500 g',  'Honey',      1400],
    ['CURIO-BLACKFOREST-HONEY-500', 'Black Forest Honey',                         '500 g',  'Honey',      1100],
    ['CURIO-WILD-HONEY-500',        'Wild Floral Honey (Raw Multi Flower)',       '500 g',  'Honey',       650],
    ['CURIO-MONOFLORAL-HONEY-500',  'Raw Monofloral Honey (Single Origin)',       '500 g',  'Honey',       750],
    ['CURIO-QAHWA-TEA-200',         'Kashmir Qahwa Green Tea (Saffron Spice)',    '200 g',  'Tea',         550],
    ['CURIO-ZAFRANI-KEHWA-250',     'Kashmir Zafrani Kehwa Green Tea (Saffron)',  '250 g',  'Tea',         550],
    ['CURIO-CHAMOMILE-INF',         'Himalayan Chamomile Herbal Infusion',        '60 pcs', 'Tea',         550],
  ];
  m.getRange(2, 1, master.length, 5).setValues(master);
  m.setFrozenRows(1);

  // --- SKU_Aliases ---
  let a = SS.getSheetByName('SKU_Aliases');
  if (!a) a = SS.insertSheet('SKU_Aliases');
  a.clear();
  a.appendRow(['Channel', 'External_ID', 'Channel_Label', 'Canonical_SKU', 'Notes']);
  const aliases = [
    // Blinkit — key by Product ID
    ['blinkit', '669729', 'Curio Lifestyle Kashmir Almonds (Premium Mamra)',            'CURIO-ALMONDS-500',           'default pack'],
    ['blinkit', '696707', 'Curio Lifestyle Kashmir Walnuts',                            'CURIO-WALNUTS-500',           'default pack'],
    ['blinkit', '669730', 'Curio Lifestyle Ladakh Apricots (Sun Dried)',                'CURIO-APRICOTS-500',          'default pack'],
    ['blinkit', '670147', 'Curio Lifestyle Cow Ghee (Himalayan Badri)',                 'CURIO-GHEE-500',              'default pack'],
    ['blinkit', '670099', 'Curio Lifestyle Kashmir Saffron Mongra (Pure Threads)',      'CURIO-SAFFRON-1G',            'default pack'],
    ['blinkit', '670153', 'Curio Lifestyle Cold Pressed Almond Oil',                    'CURIO-ALMOND-OIL-100',        'default pack'],
    ['blinkit', '670155', 'Curio Lifestyle Cold Pressed Apricot Oil',                   'CURIO-APRICOT-OIL-100',       ''],
    ['blinkit', '670152', 'Curio Lifestyle Cold Pressed Walnut Oil',                    'CURIO-WALNUT-OIL-100',        ''],
    ['blinkit', '689004', 'Curio Lifestyle SIDR Honey',                                 'CURIO-SIDR-HONEY-500',        ''],
    ['blinkit', '689013', 'Curio Lifestyle Black Forest Honey',                         'CURIO-BLACKFOREST-HONEY-500', ''],
    ['blinkit', '670144', 'Curio Lifestyle Wild Floral Honey (Raw Multi Flower)',       'CURIO-WILD-HONEY-500',        ''],
    ['blinkit', '670149', 'Curio Lifestyle Raw Monofloral Honey (Single Origin)',       'CURIO-MONOFLORAL-HONEY-500',  ''],
    ['blinkit', '670096', 'Curio Lifestyle Kashmir Qahwa Green Tea (Saffron Spice)',    'CURIO-QAHWA-TEA-200',         ''],
    ['blinkit', '670097', 'Curio Lifestyle Kashmir Zafrani Kehwa Green Tea (Saffron)',  'CURIO-ZAFRANI-KEHWA-250',     ''],
    ['blinkit', '670202', 'Curio Lifestyle Himalayan Chamomile Herbal Infusion',        'CURIO-CHAMOMILE-INF',         ''],
    // Amazon — key by ASIN
    ['amazon', 'B0F69YFJNB', 'Kashmir Sweet Almonds Premium 500g',          'CURIO-ALMONDS-500',           ''],
    ['amazon', 'B0F69TGFLZ', 'Kashmir Sweet Almonds 1kg',                    'CURIO-ALMONDS-1000',          ''],
    ['amazon', 'B0F3ZW1C82', 'Premium Kashmir Walnut Kernels 500g',          'CURIO-WALNUTS-500',           ''],
    ['amazon', 'B0F41DL639', 'Premium Kashmir Walnut Kernels 1kg',           'CURIO-WALNUTS-1000',          ''],
    ['amazon', 'B0F3ZMFTVY', 'Premium Ladakh Apricots 500g',                 'CURIO-APRICOTS-500',          ''],
    ['amazon', 'B0F3Z9LFJ4', 'Premium Ladakh Apricots 1kg',                  'CURIO-APRICOTS-1000',         ''],
    ['amazon', 'B0F4RQF54X', 'Himalayan Badri Cow Ghee 500ml',               'CURIO-GHEE-500',              ''],
    ['amazon', 'B0F69Y25BY', 'Kashmiri Mongra Saffron 1g',                   'CURIO-SAFFRON-1G',            ''],
    ['amazon', 'B0F69YZ736', 'Kashmiri Mongra Saffron 2g',                   'CURIO-SAFFRON-2G',            ''],
    ['amazon', 'B0F4SYL2WZ', 'Cold Pressed Sweet Almond Oil 100ml',          'CURIO-ALMOND-OIL-100',        ''],
    ['amazon', 'B0F4TRZGPW', 'Cold Pressed Sweet Almond Oil 250ml',          'CURIO-ALMOND-OIL-250',        ''],
    ['amazon', 'B0F4VJRHGC', 'Cold Wood Pressed Sweet Apricot Oil 100ml',    'CURIO-APRICOT-OIL-100',       ''],
    ['amazon', 'B0F4T5N55D', 'Pure Cold Pressed Walnut Oil 100ml',           'CURIO-WALNUT-OIL-100',        ''],
    ['amazon', 'B0F4RRVRRT', 'Cold Pressed Mustard Oil 500ml',               'CURIO-MUSTARD-OIL-500',       ''],
    ['amazon', 'B0FH3Z6JKF', 'Honey Sidr 500g',                              'CURIO-SIDR-HONEY-500',        ''],
    ['amazon', 'B0FH37WYKP', 'Black Forest Honey 500g',                      'CURIO-BLACKFOREST-HONEY-500', ''],
    ['amazon', 'B0F6SP4RBT', 'Wild Himalayan Raw Multifloral Honey 500g',    'CURIO-WILD-HONEY-500',        ''],
    ['amazon', 'B0F69QW84S', 'Kashmiri Saffron Qahwa 200g',                  'CURIO-QAHWA-TEA-200',         ''],
    ['amazon', 'B0F6B1XRBB', 'Kashmiri Zafrani Kahwa 250g',                  'CURIO-ZAFRANI-KEHWA-250',     ''],
    ['amazon', 'B0F4V93QVN', 'Himalayan Chamomile Tea 60 blossoms',          'CURIO-CHAMOMILE-INF',         ''],
    // Shopify — key by SKU code
    ['shopify', 'KSAL-500',  'Kashmir Sweet Almonds — 500g',       'CURIO-ALMONDS-500',           ''],
    ['shopify', 'KSAL-1000', 'Kashmir Sweet Almonds — 1kg',        'CURIO-ALMONDS-1000',          ''],
    ['shopify', 'KSWL-500',  'Kashmir Walnut Kernels — 500g',      'CURIO-WALNUTS-500',           ''],
    ['shopify', 'KSWL-1000', 'Kashmir Walnut Kernels — 1kg',       'CURIO-WALNUTS-1000',          ''],
    ['shopify', 'LDAP-500',  'Ladakh Apricots — 500g',             'CURIO-APRICOTS-500',          ''],
    ['shopify', 'LDAP-1000', 'Ladakh Apricots — 1kg',              'CURIO-APRICOTS-1000',         ''],
    ['shopify', 'HBCG-500',  'Himalayan Badri Cow Ghee — 500 ml',  'CURIO-GHEE-500',              ''],
    ['shopify', 'HBCG-1000', 'Himalayan Badri Cow Ghee — 1 Ltr',   'CURIO-GHEE-1000',             ''],
    ['shopify', 'KHSFM-1G',  'Kashmir Mongra Saffron — 1g',        'CURIO-SAFFRON-1G',            ''],
    ['shopify', 'KHSFM-2G',  'Kashmir Mongra Saffron — 2g',        'CURIO-SAFFRON-2G',            ''],
    ['shopify', 'ALOIL-100', 'Cold Pressed Sweet Almond Oil — 100ml',  'CURIO-ALMOND-OIL-100',    ''],
    ['shopify', 'ALOIL-250', 'Cold Pressed Sweet Almond Oil — 250ml',  'CURIO-ALMOND-OIL-250',    ''],
    ['shopify', 'APOIL-100', 'Cold Pressed Sweet Apricot Oil — 100ml', 'CURIO-APRICOT-OIL-100',   ''],
    ['shopify', 'BMOIL-500', 'Cold Pressed Mustard Oil — 500ml',       'CURIO-MUSTARD-OIL-500',   ''],
    ['shopify', 'WLHN-500',  'Wild Multifloral Honey — 500g',      'CURIO-WILD-HONEY-500',        ''],
    ['shopify', 'SDHN-500',  'SIDR Honey — 500g',                  'CURIO-SIDR-HONEY-500',        ''],
    ['shopify', 'BFHN-500',  'Black Forest Honey — 500g',          'CURIO-BLACKFOREST-HONEY-500', ''],
    ['shopify', 'KHQH-200',  'Kashmir Saffron Qahwa — 200g',       'CURIO-QAHWA-TEA-200',         ''],
    ['shopify', 'ZFKH-250',  'Kashmir Zafrani Kehwa — 250g',       'CURIO-ZAFRANI-KEHWA-250',     ''],
    ['shopify', 'HCT-60',    'Himalayan Chamomile Herbal Tea',     'CURIO-CHAMOMILE-INF',         ''],
    // B2B — bulk packs (canonical for reporting; multiplier tracked separately)
    ['b2b', 'CURIO-ALMONDS-100KG',  'Kashmir Almonds — 100 kg drum',   'CURIO-ALMONDS-500',    'bulk 200×'],
    ['b2b', 'CURIO-WALNUTS-100KG',  'Kashmir Walnuts — 100 kg drum',   'CURIO-WALNUTS-500',    'bulk 200×'],
    ['b2b', 'CURIO-APRICOTS-100KG', 'Ladakh Apricots — 100 kg drum',   'CURIO-APRICOTS-500',   'bulk 200×'],
    ['b2b', 'CURIO-GHEE-15KG',      'Cow Ghee — 15 kg tin',            'CURIO-GHEE-500',       'bulk 30×'],
    ['b2b', 'CURIO-HONEY-25KG',     'Honey — 25 kg drum (any variant)','CURIO-WILD-HONEY-500', 'bulk 50×'],
  ];
  a.getRange(2, 1, aliases.length, 5).setValues(aliases);
  a.setFrozenRows(1);
  clearSkuCache_();
  Logger.log('SKU_Master seeded: ' + master.length + ' canonical SKUs, ' + aliases.length + ' aliases across ' +
    (new Set(aliases.map(x => x[0]))).size + ' channels');
}

// Add a new alias mapping (from admin dashboard "unmapped SKU" flow)
function saveSkuAddAlias(ts, user, p) {
  let sh = SS.getSheetByName('SKU_Aliases');
  if (!sh) throw new Error('Run seedSkuMaster_() first to create SKU_Aliases sheet');
  sh.appendRow([
    String(p.channel || '').toLowerCase(),
    String(p.external_id || ''),
    String(p.channel_label || ''),
    String(p.canonical_sku || ''),
    'Added by ' + user + ' on ' + formatDate(ts)
  ]);
  clearSkuCache_();
  return { id: 'alias-' + ts.getTime(), message: 'Alias added: ' + p.channel + '/' + p.external_id + ' → ' + p.canonical_sku };
}

// Consolidated view: sales rolled up per canonical SKU × channel × month
// Reads Sales_Blinkit / Sales_Amazon / Sales_Shopify / Sales_B2B and buckets by Canonical_SKU column
function getConsolidatedSkuSales() {
  loadAliasCache_();
  const buckets = {};  // key: canonical|month|channel → { units, revenue }
  const push = (canonical, month, channel, units, revenue) => {
    if (!canonical) canonical = 'UNMAPPED';
    const k = canonical + '|' + month + '|' + channel;
    if (!buckets[k]) buckets[k] = { canonical: canonical, month: month, channel: channel, units: 0, revenue: 0 };
    buckets[k].units += Number(units) || 0;
    buckets[k].revenue += Number(revenue) || 0;
  };
  const monthOf = (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return Utilities.formatDate(dt, 'Asia/Kolkata', 'yyyy-MM');
  };
  readSheet('Sales_Blinkit').forEach(r => {
    const c = r.Canonical_SKU || resolveSku('blinkit', r.SKU || '');
    push(c, monthOf(r.Date), 'Blinkit', r.Units, r.Net_Sales || r.Total_Sales);
  });
  readSheet('Sales_Amazon').forEach(r => {
    const c = r.Canonical_SKU || resolveSku('amazon', r.ASIN || r.SKU || '');
    push(c, monthOf(r.Date), 'Amazon', r.Units, r.Ordered_Product_Sales);
  });
  readSheet('Sales_Shopify').forEach(r => {
    const c = r.Canonical_SKU || resolveSku('shopify', r.SKU || '');
    push(c, monthOf(r.Order_Date), 'Shopify', r.Units, (Number(r.Units)||0) * (Number(r.Unit_Price)||0));
  });
  readSheet('Sales_B2B').forEach(r => {
    const c = r.Canonical_SKU || resolveSku('b2b', r.SKU_or_Description || '');
    push(c, monthOf(r.Order_Date), 'B2B', r.Quantity, (Number(r.Quantity)||0) * (Number(r.Unit_Price)||0));
  });
  return Object.values(buckets).sort((a, b) =>
    a.canonical.localeCompare(b.canonical) || a.month.localeCompare(b.month) || a.channel.localeCompare(b.channel)
  );
}

// One-time backfill: fills the Canonical_SKU column on historical sales rows.
// Run from the editor once after seedSkuMaster_(). Idempotent — safe to re-run.
function backfillCanonicalSkus_() {
  loadAliasCache_();
  const tag = (sheetName, channel, idColumn) => {
    const sh = SS.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return 0;
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    let canonicalCol = headers.indexOf('Canonical_SKU') + 1;
    if (canonicalCol === 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue('Canonical_SKU'); canonicalCol = sh.getLastColumn(); }
    const idCol = headers.indexOf(idColumn) + 1;
    if (idCol === 0) { Logger.log(sheetName + ': column ' + idColumn + ' missing, skipped'); return 0; }
    const n = sh.getLastRow() - 1;
    const ids = sh.getRange(2, idCol, n, 1).getValues().map(r => r[0]);
    const out = ids.map(id => [resolveSku(channel, id) || '']);
    sh.getRange(2, canonicalCol, n, 1).setValues(out);
    return n;
  };
  const b = tag('Sales_Blinkit', 'blinkit', 'SKU');
  const a = tag('Sales_Amazon',  'amazon',  'ASIN');
  const s = tag('Sales_Shopify', 'shopify', 'SKU');
  const b2 = tag('Sales_B2B',    'b2b',     'SKU_or_Description');
  Logger.log('Backfill: Blinkit=' + b + ', Amazon=' + a + ', Shopify=' + s + ', B2B=' + b2);
}

// -------------------- READ HELPERS --------------------
function readSheet(name) {
  const sh = SS.getSheetByName(name);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const o = {};
    headers.forEach((h, i) => o[h] = row[i]);
    return o;
  });
}
function filterByDate(sheetName, dateStr) {
  return readSheet(sheetName).filter(r => {
    const d = r.Date;
    if (!d) return false;
    return (d instanceof Date ? formatDate(d) : String(d).slice(0, 10)) === dateStr;
  });
}
function gatherTodaysSales() {
  const today = todayIST();
  return {
    blinkit: filterByDate('Sales_Blinkit', today),
    amazon:  filterByDate('Sales_Amazon', today),
    shopify: readSheet('Sales_Shopify').filter(r => r.Order_Date && formatDate(new Date(r.Order_Date)) === today),
    b2b:     readSheet('Sales_B2B').filter(r => r.Order_Date && formatDate(new Date(r.Order_Date)) === today),
    mt:      filterByDate('Sales_MT', today),
  };
}
function gatherTodaysOps() {
  const today = todayIST();
  return {
    checkins:  filterByDate('Log_Promoter_Checkins', today),
    stock:     filterByDate('Log_Promoter_Stock', today),
    batches:   filterByDate('Production_Batches', today),
    inventory: filterByDate('Inventory_Movements', today),
  };
}
function computeKPIs() {
  const t = todayIST();
  const s = gatherTodaysSales();
  const total = arr => arr.reduce((sum, r) => sum + Number(r.Net_Sales || r.Ordered_Product_Sales || r.Total || r.Revenue || 0), 0);
  return {
    date: t,
    total_sales_today: total(s.blinkit) + total(s.amazon) + total(s.shopify) + total(s.b2b) + total(s.mt),
    checkins_today: filterByDate('Log_Promoter_Checkins', t).length,
    blinkit_today: total(s.blinkit),
    amazon_today: total(s.amazon),
    shopify_today: total(s.shopify),
    b2b_today: total(s.b2b),
    mt_today: total(s.mt),
  };
}

// -------------------- UTILITIES --------------------
function appendRow(sheetName, row) {
  const sh = SS.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName + ' — call ensureSheet_() first if this is an auxiliary tab, otherwise the sheet name is wrong');
  sh.appendRow(row);
}
// Auto-create a tab with headers if missing. Use for auxiliary/optional tabs (e.g. new payload fields).
// Do NOT use in place of appendRow for tabs that MUST already exist — strict appendRow catches typos.
function ensureSheet_(name, headers) {
  let sh = SS.getSheetByName(name);
  if (sh) return sh;
  sh = SS.insertSheet(name);
  if (headers && headers.length) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}
function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function todayIST() {
  return formatDate(new Date());
}
function toDate_(d) {
  if (d instanceof Date && !isNaN(d.getTime())) return d;
  if (d == null || d === '') return new Date();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}
function formatDate(d) {
  return Utilities.formatDate(toDate_(d), 'Asia/Kolkata', 'yyyy-MM-dd');
}
function formatTime(d) {
  return Utilities.formatDate(toDate_(d), 'Asia/Kolkata', 'HH:mm:ss');
}
function distanceMeters(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lat2) return 0;
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
