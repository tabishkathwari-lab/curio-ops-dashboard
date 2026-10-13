// Curio · Blinkit Sync bookmarklet entrypoint
// Loaded onto seller.blinkit.com — captures auth, pulls inventory + coverage, posts to Apps Script.
(async function() {
  const EXEC = 'https://script.google.com/macros/s/AKfycbwCqZtIIM7ZKVf9b-3Fwa_4K9tgrkr6MRG34hw4IXcuicPYpJ48zbfm5pSUImnIzXCo/exec';

  // Toast UI
  function toast(msg, color) {
    let el = document.getElementById('__curioToast');
    if (!el) {
      el = document.createElement('div');
      el.id = '__curioToast';
      el.style.cssText = 'position:fixed;top:20px;right:20px;background:#161e39;color:#efefea;padding:14px 20px;border-radius:10px;font-family:system-ui,sans-serif;font-size:13px;z-index:2147483647;box-shadow:0 10px 30px rgba(0,0,0,0.3);max-width:360px;line-height:1.4;';
      document.body.appendChild(el);
    }
    el.style.background = color || '#161e39';
    el.innerHTML = msg;
  }

  if (!/seller\.blinkit\.com/.test(location.hostname)) {
    toast('⚠ Open seller.blinkit.com first, then click this bookmark.', '#991b1b');
    setTimeout(() => document.getElementById('__curioToast')?.remove(), 5000);
    return;
  }

  toast('Capturing session… make a request so the token is live.');

  // Capture auth via XHR + fetch interception
  let captured = null;
  const origSet = XMLHttpRequest.prototype.setRequestHeader;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u, ...r) { this._url = u; this._h = {}; return origOpen.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.setRequestHeader = function(n, v) {
    this._h = this._h || {};
    this._h[n.toLowerCase()] = v;
    if (this._url && /seller-hub/.test(this._url) && this._h.access_token && !captured) captured = {...this._h};
    return origSet.call(this, n, v);
  };
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input.url || '');
    if (/seller-hub/.test(url) && init?.headers) {
      const h = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers;
      const lower = Object.fromEntries(Object.entries(h).map(([k,v]) => [k.toLowerCase(), v]));
      if (lower.access_token && !captured) captured = {...lower};
    }
    return origFetch.apply(this, arguments);
  };

  // Nudge a known endpoint to trigger a request
  try {
    await fetch('/seller-hub/api/inventories/v1/view?per_page=1&page=1', { credentials: 'include' });
  } catch(e) {}

  await new Promise(r => setTimeout(r, 2000));

  if (!captured) {
    toast('⚠ Could not capture session. Navigate to Inventory tab, then click bookmark again.', '#991b1b');
    setTimeout(() => document.getElementById('__curioToast')?.remove(), 6000);
    return;
  }

  const bk = (path) => fetch('https://seller.blinkit.com' + path, {
    headers: {
      'accept': 'application/json',
      'x-api-key': captured['x-api-key'],
      'app_client': captured['app_client'],
      'x-gr-seller-id': captured['x-gr-seller-id'],
      'access_token': captured['access_token']
    }
  }).then(r => r.json());

  // Pull inventory
  toast('Pulling inventory…');
  const inv = [];
  for (let page = 1; page <= 10; page++) {
    const r = await bk('/seller-hub/api/inventories/v1/view?per_page=10&page=' + page);
    const items = r.data?.data || [];
    if (!items.length) break;
    inv.push(...items);
    if (inv.length >= (r.data?.total_count || 0)) break;
  }

  // Pull coverage
  toast('Pulling coverage… 465 cities');
  const citiesResp = await bk('/seller-hub/api/serviceability/v2/cities');
  const cities = citiesResp.data?.cities || [];
  const coverage = [];
  const batch = 20;
  for (let i = 0; i < cities.length; i += batch) {
    const chunk = cities.slice(i, i + batch);
    const results = await Promise.all(chunk.map(c => bk('/seller-hub/api/serviceability/v2/city-details/' + c.city_id).catch(() => null)));
    results.forEach((r, idx) => {
      if (r?.data) {
        coverage.push({
          city_id: chunk[idx].city_id,
          city_name: chunk[idx].city_name,
          active_pids: r.data.products_stats?.active_pids_count || 0,
          inactive_pids: r.data.products_stats?.inactive_pids_count || 0,
          trial_pids: r.data.products_stats?.trial_pids_count || 0,
          launch_awaited: r.data.products_stats?.launch_awaited_pids_count || 0,
          darkstores: r.data.darkstores?.length || 0,
          darkstores_with_active: (r.data.darkstores || []).filter(d => (d.products_stats?.active_pids_count || 0) > 0).length
        });
      }
    });
    toast('Pulling coverage… ' + Math.min(i + batch, cities.length) + ' / ' + cities.length);
  }

  // Flatten inventory
  const flat = inv.map(it => ({
    SKU_UPC: it.item_details?.upc || '',
    Product_Name: it.item_details?.product_name || '',
    Expansion_Level: it.item_details?.expansion_level || '',
    Category: it.item_details?.business_category_name || '',
    MRP: parseFloat(String(it.pricing?.mrp || '').replace(/[₹,]/g, '')) || 0,
    Selling_Price: parseFloat(String(it.pricing?.selling_price || '').replace(/[₹,]/g, '')) || 0,
    SOH_Darkstore: it.stock_on_hand?.sellable?.darkstore || 0,
    SOH_Warehouse: it.stock_on_hand?.sellable?.warehouse || 0,
    SOH_InBetween: it.stock_on_hand?.sellable?.in_between || 0,
    SOH_Total_Sellable: it.stock_on_hand?.sellable?.total || 0,
    Low_Inv_Flag: it.stock_on_hand?.sellable?.bad_health_tag?.tag_name === 'Low Inventory' ? 'LOW' : 'OK',
    Incoming_Scheduled: it.stock_on_hand?.incoming?.scheduled || 0,
    Unsellable_Total: it.stock_on_hand?.unsellable?.total || 0,
    Unsellable_NearExpiry: it.stock_on_hand?.unsellable?.near_expiry || 0,
    Unsellable_Damaged: it.stock_on_hand?.unsellable?.damaged || 0,
    Unsellable_Lost: it.stock_on_hand?.unsellable?.lost || 0,
    Unsellable_Expired: it.stock_on_hand?.unsellable?.expired || 0,
    Sales_7day: it.sales?.last_7_days || 0,
    Sales_15day: it.sales?.last_15_days || 0,
    Sales_30day: it.sales?.last_30_days || 0
  }));

  // Push to backend
  toast('Pushing ' + flat.length + ' SKUs + ' + coverage.length + ' cities to backend…');
  try {
    const resp = await fetch(EXEC, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify({ action: 'save_blinkit_live', payload: { inventory: flat, coverage: coverage, synced_at: new Date().toISOString() } })
    });
    const result = await resp.json();
    if (result.ok) {
      toast('✓ Synced ' + flat.length + ' SKUs + ' + coverage.length + ' cities. Dashboard will refresh.', '#166534');
    } else {
      toast('⚠ Backend error: ' + (result.error || JSON.stringify(result)).slice(0, 200), '#991b1b');
    }
  } catch(e) {
    toast('⚠ Push failed: ' + e.message, '#991b1b');
  }

  setTimeout(() => document.getElementById('__curioToast')?.remove(), 8000);
})();
