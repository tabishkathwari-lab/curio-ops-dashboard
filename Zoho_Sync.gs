// ============================================================
// ZOHO BOOKS SYNC — OAuth, fetch helper, master sync
// Script Properties required: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID
// ============================================================

const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3';
const ZOHO_ACCOUNTS_BASE = 'https://accounts.zoho.in';

function zohoAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('ZOHO_ACCESS_TOKEN');
  const expires = Number(props.getProperty('ZOHO_ACCESS_TOKEN_EXP') || 0);
  if (cached && expires > Date.now() + 60000) return cached;
  const refresh = props.getProperty('ZOHO_REFRESH_TOKEN');
  const clientId = props.getProperty('ZOHO_CLIENT_ID');
  const clientSecret = props.getProperty('ZOHO_CLIENT_SECRET');
  if (!refresh || !clientId || !clientSecret) throw new Error('Zoho credentials missing in Script Properties: need ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN');
  const url = ZOHO_ACCOUNTS_BASE + '/oauth/v2/token?refresh_token=' + encodeURIComponent(refresh) + '&client_id=' + encodeURIComponent(clientId) + '&client_secret=' + encodeURIComponent(clientSecret) + '&grant_type=refresh_token';
  const res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Zoho token refresh failed: ' + res.getContentText().slice(0, 200));
  const body = JSON.parse(res.getContentText());
  if (!body.access_token) throw new Error('Zoho token response missing access_token: ' + res.getContentText().slice(0, 200));
  const expIn = (body.expires_in || 3600) * 1000;
  props.setProperty('ZOHO_ACCESS_TOKEN', body.access_token);
  props.setProperty('ZOHO_ACCESS_TOKEN_EXP', String(Date.now() + expIn));
  return body.access_token;
}

function zohoFetch_(path, opts) {
  opts = opts || {};
  const token = zohoAccessToken_();
  const orgId = PropertiesService.getScriptProperties().getProperty('ZOHO_ORG_ID');
  const sep = path.indexOf('?') >= 0 ? '&' : '?';
  const url = ZOHO_API_BASE + path + (orgId ? sep + 'organization_id=' + orgId : '');
  const res = UrlFetchApp.fetch(url, {
    method: opts.method || 'get',
    headers: { 'Authorization': 'Zoho-oauthtoken ' + token },
    payload: opts.payload,
    contentType: opts.contentType,
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Zoho ' + path + ' ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function _writeZohoSheet_(name, headers, rows) {
  let sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function fetchZohoInvoicesAll() {
  const H = ['invoice_id','invoice_number','customer_name','customer_id','date','due_date','status','total','balance','currency','location_name','created_time'];
  const rows = [];
  let page = 1;
  while (page <= 100) {
    const r = zohoFetch_('/invoices?page=' + page + '&per_page=200');
    const list = r.invoices || [];
    if (!list.length) break;
    list.forEach(i => rows.push(H.map(h => i[h] != null ? i[h] : '')));
    if (!r.page_context || !r.page_context.has_more_page) break;
    page++;
    Utilities.sleep(300);
  }
  _writeZohoSheet_('Zoho_Invoices', H, rows);
  return rows.length;
}

function fetchZohoSalesOrdersAll() {
  const H = ['so_id','so_number','customer_name','date','shipment_date','status','total','total_qty','qty_shipped','currency','reference_number'];
  // Zoho returns different field names — map them
  const MAP = { so_id:'salesorder_id', so_number:'salesorder_number', total_qty:'total_quantity', qty_shipped:'quantity_shipped', currency:'currency_code' };
  const rows = [];
  let page = 1;
  while (page <= 100) {
    const r = zohoFetch_('/salesorders?page=' + page + '&per_page=200');
    const list = r.salesorders || [];
    if (!list.length) break;
    list.forEach(s => rows.push(H.map(h => { const srcKey = MAP[h] || h; return s[srcKey] != null ? s[srcKey] : ''; })));
    if (!r.page_context || !r.page_context.has_more_page) break;
    page++;
    Utilities.sleep(300);
  }
  _writeZohoSheet_('Zoho_SalesOrders', H, rows);
  return rows.length;
}

function fetchZohoPurchaseOrdersAll() {
  const H = ['po_id','po_number','vendor_name','vendor_id','date','delivery_date','status','total','total_ordered_qty','qty_received','currency','reference_number'];
  const MAP = { po_id:'purchaseorder_id', po_number:'purchaseorder_number', total_ordered_qty:'total_quantity', qty_received:'quantity_received', currency:'currency_code' };
  const rows = [];
  let page = 1;
  while (page <= 100) {
    const r = zohoFetch_('/purchaseorders?page=' + page + '&per_page=200');
    const list = r.purchaseorders || [];
    if (!list.length) break;
    list.forEach(p => rows.push(H.map(h => { const srcKey = MAP[h] || h; return p[srcKey] != null ? p[srcKey] : ''; })));
    if (!r.page_context || !r.page_context.has_more_page) break;
    page++;
    Utilities.sleep(300);
  }
  _writeZohoSheet_('Zoho_PurchaseOrders', H, rows);
  return rows.length;
}

function fetchZohoBillsAll() {
  const H = ['bill_id','bill_number','vendor_name','vendor_id','date','due_date','status','total','balance','currency','reference_number','created_time'];
  const MAP = { currency:'currency_code' };
  const rows = [];
  let page = 1;
  while (page <= 100) {
    const r = zohoFetch_('/bills?page=' + page + '&per_page=200');
    const list = r.bills || [];
    if (!list.length) break;
    list.forEach(b => rows.push(H.map(h => { const k = MAP[h] || h; return b[k] != null ? b[k] : ''; })));
    if (!r.page_context || !r.page_context.has_more_page) break;
    page++;
    Utilities.sleep(300);
  }
  _writeZohoSheet_('Zoho_Bills', H, rows);
  return rows.length;
}

function fetchZohoExpensesAll() {
  const H = ['expense_id','date','account_name','paid_through_account_name','vendor_name','customer_name','total','status','reference_number','description','created_time'];
  const rows = [];
  let page = 1;
  while (page <= 100) {
    const r = zohoFetch_('/expenses?page=' + page + '&per_page=200');
    const list = r.expenses || [];
    if (!list.length) break;
    list.forEach(e => rows.push(H.map(h => e[h] != null ? e[h] : '')));
    if (!r.page_context || !r.page_context.has_more_page) break;
    page++;
    Utilities.sleep(300);
  }
  _writeZohoSheet_('Zoho_Expenses', H, rows);
  return rows.length;
}

function fetchZohoItemsAll() {
  const H = ['item_id','sku','name','rate','stock_on_hand','available_stock','status','unit','item_type'];
  const rows = [];
  let page = 1;
  while (page <= 50) {
    const r = zohoFetch_('/items?page=' + page + '&per_page=200');
    const list = r.items || [];
    if (!list.length) break;
    list.forEach(i => rows.push(H.map(h => i[h] != null ? i[h] : '')));
    if (!r.page_context || !r.page_context.has_more_page) break;
    page++;
    Utilities.sleep(300);
  }
  _writeZohoSheet_('Zoho_Items', H, rows);
  return rows.length;
}

function syncZohoBooks() {
  const out = {};
  try { out.invoices = fetchZohoInvoicesAll(); } catch(e) { out.invoices_err = e.message; }
  try { out.sos = fetchZohoSalesOrdersAll(); } catch(e) { out.sos_err = e.message; }
  try { out.pos = fetchZohoPurchaseOrdersAll(); } catch(e) { out.pos_err = e.message; }
  try { out.items = fetchZohoItemsAll(); } catch(e) { out.items_err = e.message; }
  try { out.bills = fetchZohoBillsAll(); } catch(e) { out.bills_err = e.message; }
  try { out.expenses = fetchZohoExpensesAll(); } catch(e) { out.expenses_err = e.message; }
  Logger.log('Zoho sync: ' + JSON.stringify(out));
  return out;
}

function runZohoSync() { Logger.log(JSON.stringify(syncZohoBooks())); }

// Install a 1-hour recurring trigger for syncZohoBooks
function installZohoHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncZohoBooks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncZohoBooks').timeBased().everyHours(1).create();
  return 'Installed hourly trigger for syncZohoBooks';
}
