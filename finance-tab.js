/* finance-tab.js — Bank-reconciled finance for the Curio Ops dashboard.
 * Fills the "Payments & Receivables" page and refreshes the Cash & Debt figures.
 * Source: J&K Bank statements, Blinkit Seller Hub, Zoho Books (read only).
 * To update: edit the FIN object below and re-upload. Nothing here writes anywhere.
 * Safe on other pages: does nothing unless #page-payments exists.
 */
(function () {
  var FIN = {"asOf": "1 Oct 2026", "checked": "2 Oct 2026", "receivables": [["New Modern Bazaar", 1611354.5, "chase", "Chase", "37 invoices, nothing received in the bank"], ["Landcraft (Food Square)", 1121551.58, "pr", "PR Active", "Billed ₹19.60 L, paid ₹8.38 L in 9 payments. PR Active checking debit notes, then chase"], ["Lulu Hypermarket", 960750.0, "chase", "Chase", "INV-000440, PO 4505348892. Only one of the two 26 Dec invoices was paid"], ["Blinkit", 161392.13, "due", "Due 5 Oct", "Next payout (16–30 Sep sales). All 19 earlier payouts received"], ["AAP KA BAZAR", 143010.0, "chase", "Chase", "6 invoices unpaid"], ["Pick-N-Choose", 20362.88, "chase", "Chase", "Balance on INV-000316 and INV-000540"], ["Trikuta, J&K Bank, Vishal, Naresh", 59000.02, "check", "To check", "No payment found; Tabish to confirm"]], "settled": "Kisaansay, JLV (₹26.00 L by debit notes), Dawar Mir (₹85,000 cash, ₹4,980.50 written off), DC Office Udhampur and Daulat Ram are settled.", "bridge": [["Invoiced to Blinkit", 154.87, "sum"], ["Never received by Blinkit", 6.01, "crit"], ["Possible duplicate invoices (INV-561/562)", 7.0, "crit"], ["Short at Blinkit GRN", 9.39, "warn"], ["Received by Blinkit", 132.47, "sum"], ["Sold to consumers", 61.87, "s1"], ["Sellable stock with Blinkit", 55.92, "s2"], ["Unsellable stock with Blinkit", 13.12, "warn"], ["Recalled or lost (unexplained)", 1.57, "mute"]], "payouts": [{"p": "1-15 Dec 25", "d": "2025-12-18", "utr": "CMS5451585397", "sales": 21745, "net": 2884.23, "due": false}, {"p": "16-31 Dec 25", "d": "2026-01-05", "utr": "CMS5479016993", "sales": 77515, "net": 42111.05, "due": false}, {"p": "1-15 Jan 26", "d": "2026-01-19", "utr": "CMS5498560553", "sales": 53925, "net": 21880.65, "due": false}, {"p": "16-31 Jan 26", "d": "2026-02-03", "utr": "CMS5520678059", "sales": 85510, "net": 46780.31, "due": false}, {"p": "1-15 Feb 26", "d": "2026-02-18", "utr": "CMS5548292672", "sales": 226240, "net": 164716.42, "due": false}, {"p": "16-28 Feb 26", "d": "2026-03-03", "utr": "CMS5570922609", "sales": 41825, "net": 27477.05, "due": false}, {"p": "1-15 Mar 26", "d": "2026-03-18", "utr": "CMS5593949294", "sales": 61930, "net": 11215.63, "due": false}, {"p": "16-31 Mar 26", "d": "2026-04-03", "utr": "CMS5619222257", "sales": 183395, "net": 76855.37, "due": false}, {"p": "1-15 Apr 26", "d": "2026-04-20", "utr": "CMS5643194175", "sales": 307085, "net": 180174.59, "due": false}, {"p": "16-30 Apr 26", "d": "2026-05-04", "utr": "CMS5661398650", "sales": 210540, "net": 91126.56, "due": false}, {"p": "1-15 May 26", "d": "2026-05-18", "utr": "CMS5681145873", "sales": 690165, "net": 406075.66, "due": false}, {"p": "16-31 May 26", "d": "2026-06-03", "utr": "CMS5703170156", "sales": 411375, "net": 174489.21, "due": false}, {"p": "1-15 Jun 26", "d": "2026-06-18", "utr": "CMS5724908934", "sales": 392815, "net": 153122.85, "due": false}, {"p": "16-30 Jun 26", "d": "2026-07-03", "utr": "CMS5747297603", "sales": 504130, "net": 386274.9, "due": false}, {"p": "1-15 Jul 26", "d": "2026-07-20", "utr": "CMS5777637712", "sales": 504045, "net": 223337.14, "due": false}, {"p": "16-31 Jul 26", "d": "2026-08-03", "utr": "CMS5802170426", "sales": 492090, "net": 263841.98, "due": false}, {"p": "1-15 Aug 26", "d": "2026-08-18", "utr": "CMS5830870090", "sales": 530250, "net": 254896.5, "due": false}, {"p": "16-31 Aug 26", "d": "2026-09-03", "utr": "CMS5860946125", "sales": 563168, "net": 317281.07, "due": false}, {"p": "1-15 Sep 26", "d": "2026-09-18", "utr": "CMS5884398558", "sales": 519966, "net": 281829.91, "due": false}, {"p": "16-30 Sep 26", "d": "2026-10-05", "utr": "(due)", "sales": 309096, "net": 161392.13, "due": true}], "cash": [{"m": "2025-10", "in": 854756, "out": 4679406}, {"m": "2025-11", "in": 373043, "out": 2241604}, {"m": "2025-12", "in": 2045439, "out": 1240962}, {"m": "2026-01", "in": 1358576, "out": 1776170}, {"m": "2026-02", "in": 2043156, "out": 3615041}, {"m": "2026-03", "in": 2250575, "out": 3959630}, {"m": "2026-04", "in": 3077862, "out": 3008105}, {"m": "2026-05", "in": 621976, "out": 2128754}, {"m": "2026-06", "in": 1589966, "out": 2525395}, {"m": "2026-07", "in": 1700363, "out": 2151075}, {"m": "2026-08", "in": 767389, "out": 1692756}, {"m": "2026-09", "in": 927197, "out": 2837468}], "balances": [["Cash Credit ..530", 11252258.81, "Dr", "8.90%"], ["Secured OD ..043", 3273495.31, "Dr", "7.70%, against deposits"], ["Term Loan ..028", 1577953.33, "Dr", "10.10%"], ["ECLGS ..027", 2000000.0, "Dr", "8.75%, drawn 29 Jun 2026"], ["Current ..2961", 128845.85, "Cr", "Last seen 28 Feb 2026. Statement from Mar needed"]], "bills": [["Six farmer bills", 300000, "₹50,000 each. No bank payment to these names; some paid in cash", "Tabish"], ["Basu Kesar Company", 140325, "₹1,50,000 paid 22 Apr 2026 (IMPS 61122224596) not applied to the bill. Rest to confirm", "PR Active"], ["Small bills, nine vendors", 47739.22, "Pan Pack (2 bills), M S Traders, Bharat Photostat, Arora Industries, Jammu Trading, Manglapuri Parkview, Sanjeev Hardware, Greater Jammu", "PR Active"], ["Curio Lifestyle", 15911, "Own brand account, inter-company", "PR Active"]], "backlog": [["Bank payments with no entry in Zoho", 236, 20404186.59], ["Imported but uncategorised (Apr–Jun)", 84, 3295450.44], ["Vendor payments not applied to any bill", 129, 3890396.98], ["Customer receipts not recorded (Jul–Sep)", 18, 3072981]]};

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var page = document.getElementById('page-payments');
    if (!page || page.dataset.fin) return;
    page.dataset.fin = '1';

    var R = function (x) { return Number(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var R0 = function (x) { return Math.round(x).toLocaleString('en-IN'); };
    var L = function (x) { return (x / 1e5).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var Cr = function (x) { return (x / 1e7).toFixed(2); };
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var MON = function (m) { var p = m.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1] - 1] + ' ' + p[0].slice(2); };
    var sum = function (a, f) { return a.reduce(function (s, r) { return s + f(r); }, 0); };

    var due = sum(FIN.receivables.filter(function (r) { return r[2] !== 'check'; }), function (r) { return r[1]; });
    var chk = sum(FIN.receivables.filter(function (r) { return r[2] === 'check'; }), function (r) { return r[1]; });
    var bills = sum(FIN.bills, function (r) { return r[1]; });
    var bank = FIN.balances.filter(function (r) { return r[2] === 'Dr'; });
    var debt = sum(bank, function (r) { return r[1]; });
    var next = FIN.payouts.filter(function (p) { return p.due; })[0];

    /* ---------- styles (scoped) ---------- */
    var css = document.createElement('style');
    css.textContent = [
      '.fx{--fx-s1:#2a78d6;--fx-s2:#1baf7a;--fx-crit:#d03b3b;--fx-warn:#e09400;--fx-mute:#9a988f;--fx-grid:rgba(120,120,110,.18);--fx-ink2:#5d5b55;}',
      '.fx .fx-banner{background:#fff7e6;border:1px solid #f5d9a8;color:#7a4b00;border-radius:10px;padding:10px 14px;font-size:12.5px;margin-bottom:16px;line-height:1.5}',
      '.fx .fx-answer{font-size:13px;color:var(--fx-ink2);margin:0 0 12px;line-height:1.55;max-width:80ch}',
      '.fx .fx-answer b{color:var(--text-primary,#111)}',
      '.fx section{margin-top:22px}',
      '.fx .fx-sh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px}',
      '.fx .fx-sh h2{font-size:16px;margin:0}',
      '.fx .fx-note{font-size:11.5px;color:var(--fx-mute)}',
      '.fx .fx-tbl{overflow-x:auto}',
      '.fx table{width:100%;border-collapse:collapse;font-size:12.5px}',
      '.fx th{text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--fx-mute);padding:9px 12px;border-bottom:1px solid var(--border-subtle,#e5e5e5)}',
      '.fx td{padding:9px 12px;border-bottom:1px solid var(--border-subtle,#eee);vertical-align:top}',
      '.fx .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.fx tr.tot td{font-weight:700;border-bottom:none}',
      '.fx .what{color:var(--fx-ink2)}',
      '.fx .pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap}',
      '.fx .p-chase{background:#fde2e2;color:#9b1c1c}.fx .p-pr{background:#e6e1fb;color:#3f2f9a}.fx .p-due{background:#dcf3e6;color:#11603a}.fx .p-check{background:#fff1cc;color:#7a4b00}',
      '.fx .fx-g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px}',
      '.fx .fx-pad{padding:14px 16px}',
      '.fx h3{font-size:13px;margin:0 0 2px}.fx .fx-sub{font-size:11.5px;color:var(--fx-mute);margin:0 0 10px}',
      '.fx .br{display:grid;grid-template-columns:minmax(120px,1.3fr) 2fr 56px;gap:10px;align-items:center;font-size:12px;padding:5px 0}',
      '.fx .br.sum{font-weight:700}.fx .br .bar{position:relative;height:12px;background:var(--fx-grid);border-radius:3px;overflow:hidden}',
      '.fx .br .bar span{position:absolute;top:0;bottom:0;left:0;border-radius:3px}',
      '.fx .legend{display:flex;gap:14px;font-size:11.5px;color:var(--fx-ink2);margin-bottom:6px}.fx .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}',
      '.fx svg text{font-size:10px;fill:var(--fx-mute)}',
      '.fx details{border-top:1px solid var(--border-subtle,#eee);padding:8px 16px}.fx summary{cursor:pointer;font-size:12px;color:var(--fx-ink2)}',
      '.fx .fx-tip{position:fixed;z-index:9999;pointer-events:none;background:#1d1d1b;color:#fff;font-size:12px;padding:7px 10px;border-radius:7px;line-height:1.45;box-shadow:0 4px 14px rgba(0,0,0,.2)}',
      '.fx .fx-foot{font-size:11.5px;color:var(--fx-mute);margin-top:20px;line-height:1.6}',
      '.fx-cf-banner{background:#eef5ff;border:1px solid #c9dcf7;color:#173f73;border-radius:10px;padding:10px 14px;font-size:12.5px;margin-bottom:16px;line-height:1.55}'
    ].join('\n');
    document.head.appendChild(css);

    /* ---------- page ---------- */
    var pill = function (k, t) { return '<span class="pill p-' + k + '">' + esc(t) + '</span>'; };
    var recRows = FIN.receivables.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + R(r[1]) + '</td><td>' + pill(r[2], r[3]) + '</td><td class="what">' + esc(r[4]) + '</td></tr>';
    }).join('') + '<tr class="tot"><td>Total</td><td class="n">' + R(due + chk) + '</td><td></td><td class="what">₹' + R(due) + ' due plus ₹' + R(chk) + ' to check</td></tr>';

    var balRows = FIN.balances.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + R(r[1]) + ' ' + r[2] + '</td><td class="what">' + esc(r[3]) + '</td></tr>';
    }).join('') + '<tr class="tot"><td>Owed to the bank</td><td class="n">' + R(debt) + '</td><td class="what">CC, SOD, TL and ECLGS</td></tr>';

    var billRows = FIN.bills.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + R(r[1]) + '</td><td class="what">' + esc(r[2]) + '</td><td>' + pill(r[3] === 'PR Active' ? 'pr' : 'check', r[3]) + '</td></tr>';
    }).join('') + '<tr class="tot"><td>Total</td><td class="n">' + R(bills) + '</td><td></td><td></td></tr>';

    var blRows = FIN.backlog.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + r[1] + '</td><td class="n">' + R0(r[2]) + '</td></tr>';
    }).join('');

    var tin = sum(FIN.cash, function (r) { return r['in']; }), tout = sum(FIN.cash, function (r) { return r.out; });

    page.innerHTML =
      '<div class="page-head"><div><h1>💳 Payments &amp; Receivables</h1>' +
      '<div class="meta">Bank-reconciled · J&amp;K Bank statements to ' + FIN.asOf + ' · Blinkit Seller Hub · checked ' + FIN.checked + '</div></div>' +
      '<span class="badge">Read only</span></div>' +
      '<div class="fx">' +
      '<div class="fx-banner">Zoho banking stops at 30 Jun 2026, so these figures come from the bank, not Zoho. Landcraft, JLV and Blinkit balances are provisional until debit notes and the consignment treatment are settled.</div>' +

      '<div class="kpi-row">' +
        '<div class="kpi"><div class="label">Owed to us</div><div class="value">₹' + L(due) + ' L</div><div class="sub">' + (FIN.receivables.length - 1) + ' customers · Zoho shows ₹2.51 Cr</div></div>' +
        '<div class="kpi"><div class="label">Next Blinkit payout</div><div class="value">₹' + L(next ? next.net : 0) + ' L</div><div class="sub">' + (next ? 'Due ' + next.d.split('-').reverse().join('-') + ' · ' + next.p : '') + '</div></div>' +
        '<div class="kpi"><div class="label">Bills still to check</div><div class="value">₹' + L(bills) + ' L</div><div class="sub">₹6.54 L open in Zoho on these; ₹1.50 L of it paid</div></div>' +
        '<div class="kpi"><div class="label">Bank payments not in Zoho</div><div class="value">₹' + Cr(FIN.backlog[0][2]) + ' Cr</div><div class="sub">' + FIN.backlog[0][1] + ' payments, Jul–Sep</div></div>' +
      '</div>' +

      '<section><div class="fx-sh"><h2>Who owes us</h2><span class="fx-note">Reconciled against bank receipts · as of ' + FIN.asOf + '</span></div>' +
      '<p class="fx-answer"><b>₹' + L(due) + ' L is actually due</b>, and two customers make up two thirds of it. Another ₹' + R0(chk) + ' needs checking. ' + esc(FIN.settled) + '</p>' +
      '<div class="card fx-tbl"><table><thead><tr><th>Customer</th><th class="n">Due ₹</th><th>Status</th><th>What happens next</th></tr></thead><tbody>' + recRows + '</tbody></table></div></section>' +

      '<section><div class="fx-sh"><h2>Blinkit</h2><span class="fx-note">Consignment: Blinkit pays only on what sells · as of ' + FIN.asOf + '</span></div>' +
      '<p class="fx-answer">Of ₹1.55 Cr invoiced, <b>₹69.03 L is our stock still with Blinkit</b> and ₹61.87 L has sold. Every payout has reached the bank; Blinkit kept ₹28.99 L of sales as charges.</p>' +
      '<div class="fx-g2">' +
        '<div class="card fx-pad"><h3>Where the invoiced value went</h3><p class="fx-sub">₹ lakh at selling price · Dec 2025 to Sep 2026</p><div id="fx-bridge"></div></div>' +
        '<div class="card" style="padding:0"><div class="fx-pad"><h3>Sales and payout by cycle</h3><p class="fx-sub">₹ lakh per fortnight · payout = sales less Blinkit charges</p>' +
        '<div class="legend"><span><i style="background:var(--fx-s1)"></i>Sales</span><span><i style="background:var(--fx-s2)"></i>Payout</span></div><div id="fx-pay"></div></div>' +
        '<details><summary>Show as table</summary><div class="fx-tbl" id="fx-payT"></div></details></div>' +
      '</div></section>' +

      '<section><div class="fx-sh"><h2>Money in and out</h2><span class="fx-note">CC 530 and SOD 043 · own-account transfers and loans left out</span></div>' +
      '<p class="fx-answer">Over twelve months <b>₹' + L(tout - tin) + ' L more went out than came in</b> through CC and SOD (₹' + L(tin) + ' L in, ₹' + L(tout) + ' L out). The Bodhivriksha loan of ₹1.30 Cr and the ₹20 L ECLGS loan covered the gap. Receipts into CD 2961, such as Lulu\'s, are not in this chart.</p>' +
      '<div class="fx-g2">' +
        '<div class="card" style="padding:0"><div class="fx-pad"><h3>Monthly receipts and payments</h3><p class="fx-sub">₹ lakh · Oct 2025 to Sep 2026</p>' +
        '<div class="legend"><span><i style="background:var(--fx-s1)"></i>Money in</span><span><i style="background:var(--fx-s2)"></i>Money out</span></div><div id="fx-cash"></div></div>' +
        '<details><summary>Show as table</summary><div class="fx-tbl" id="fx-cashT"></div></details></div>' +
        '<div class="card fx-tbl"><table><thead><tr><th>Account</th><th class="n">Balance ' + FIN.asOf + '</th><th>Note</th></tr></thead><tbody>' + balRows + '</tbody></table></div>' +
      '</div></section>' +

      '<section><div class="fx-sh"><h2>Bills to check</h2><span class="fx-note">Open vendor bills with no matching bank payment</span></div>' +
      '<div class="card fx-tbl"><table><thead><tr><th>Bill</th><th class="n">Amount ₹</th><th>Note</th><th>Who checks</th></tr></thead><tbody>' + billRows + '</tbody></table></div></section>' +

      '<section><div class="fx-sh"><h2>Zoho backlog</h2><span class="fx-note">What PR Active has to clear · counted ' + FIN.checked + '</span></div>' +
      '<div class="card fx-tbl"><table><thead><tr><th>Item</th><th class="n">Entries</th><th class="n">Amount ₹</th></tr></thead><tbody>' + blRows + '</tbody></table></div></section>' +

      '<div class="fx-foot">Sources: J&amp;K Bank statements to ' + FIN.asOf + ' (CD 2961 only Dec 2025 to Feb 2026), Blinkit Seller Hub payout details and stock, Zoho Books read ' + FIN.checked + '. Detail per invoice and bill is in the AR and AP aging workbooks.</div>' +
      '<div class="fx-tip" id="fx-tip" hidden></div>' +
      '</div>';

    /* ---------- bridge ---------- */
    var col = { sum: 'var(--fx-mute)', crit: 'var(--fx-crit)', warn: 'var(--fx-warn)', s1: 'var(--fx-s1)', s2: 'var(--fx-s2)', mute: 'var(--fx-mute)' };
    var top = FIN.bridge[0][1];
    document.getElementById('fx-bridge').innerHTML = FIN.bridge.map(function (b) {
      return '<div class="br' + (b[2] === 'sum' ? ' sum' : '') + '"><span>' + esc(b[0]) + '</span><span class="bar"><span style="width:' + (b[1] / top * 100).toFixed(2) + '%;background:' + col[b[2]] + ';opacity:' + (b[2] === 'sum' ? .45 : 1) + '"></span></span><span class="n">' + b[1].toFixed(2) + '</span></div>';
    }).join('');

    /* ---------- grouped bars ---------- */
    var tip = document.getElementById('fx-tip');
    function showTip(ev, html) { tip.innerHTML = html; tip.hidden = false; var w = tip.offsetWidth, h = tip.offsetHeight, x = ev.clientX + 14, y = ev.clientY - h - 10; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y < 8) y = ev.clientY + 16; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
    function hideTip() { tip.hidden = true; }
    var NS = 'http://www.w3.org/2000/svg';
    function el(t, a, p) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
    function grouped(host, rows, a, b, label, tipf) {
      var W = 520, H = 230, m = { l: 34, r: 6, t: 8, b: 26 };
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' }, host);
      var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r[a], r[b]); }));
      var step = max > 3e6 ? 1e6 : max > 1.2e6 ? 5e5 : max > 6e5 ? 2e5 : 1e5;
      var topv = Math.ceil(max / step) * step, iw = W - m.l - m.r, ih = H - m.t - m.b;
      var y = function (v) { return m.t + ih - (v / topv) * ih; };
      for (var v = 0; v <= topv + 1; v += step) { el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'var(--fx-grid)' }, svg); var t = el('text', { x: m.l - 5, y: y(v) + 3.5, 'text-anchor': 'end' }, svg); t.textContent = (v / 1e5).toFixed(0); }
      var gw = iw / rows.length, bw = Math.max(3, Math.min(14, (gw - 6) / 2));
      rows.forEach(function (r, i) {
        var cx = m.l + gw * i + gw / 2;
        [[a, 'var(--fx-s1)', -1], [b, 'var(--fx-s2)', 1]].forEach(function (s) {
          var val = r[s[0]], h = Math.max(0, m.t + ih - y(val)), x = s[2] < 0 ? cx - bw - 1 : cx + 1;
          el('path', { d: 'M' + x + ',' + (m.t + ih) + ' v' + (-Math.max(0, h - 3)) + ' q0,-3 3,-3 h' + (bw - 6) + ' q3,0 3,3 v' + Math.max(0, h - 3) + ' z', fill: s[1], opacity: r.due && s[0] === b ? .45 : 1 }, svg);
        });
        var lab = label(r, i); if (lab) { var t2 = el('text', { x: cx, y: H - 9, 'text-anchor': 'middle' }, svg); t2.textContent = lab; }
        var hit = el('rect', { x: m.l + gw * i, y: m.t, width: gw, height: ih, fill: 'transparent' }, svg);
        hit.addEventListener('pointermove', function (ev) { showTip(ev, tipf(r)); });
        hit.addEventListener('pointerleave', hideTip);
      });
      el('line', { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: 'var(--fx-mute)' }, svg);
    }
    function table(id, head, rows) {
      document.getElementById(id).innerHTML = '<table><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="n"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    var dmy = function (d) { return d.split('-').reverse().join('-'); };
    grouped(document.getElementById('fx-pay'), FIN.payouts, 'sales', 'net',
      function (r, i) { return i % 3 === 0 ? r.p.replace(/^\d+-\d+ /, '') : ''; },
      function (r) { return '<div>' + r.p + '</div><div>Sales <b>₹' + L(r.sales) + ' L</b></div><div>Payout <b>₹' + L(r.net) + ' L</b></div><div>' + (r.due ? 'Due ' : 'Paid ') + dmy(r.d) + (r.due ? '' : ' · ' + r.utr) + '</div>'; });
    table('fx-payT', ['Cycle', 'Sales ₹', 'Payout ₹', 'Bank date', 'UTR'], FIN.payouts.map(function (r) { return [r.p, R(r.sales), R(r.net), (r.due ? 'due ' : '') + dmy(r.d), r.utr]; }));
    grouped(document.getElementById('fx-cash'), FIN.cash, 'in', 'out',
      function (r) { return MON(r.m).split(' ')[0]; },
      function (r) { return '<div>' + MON(r.m) + '</div><div>In <b>₹' + L(r['in']) + ' L</b></div><div>Out <b>₹' + L(r.out) + ' L</b></div>'; });
    table('fx-cashT', ['Month', 'In ₹', 'Out ₹'], FIN.cash.map(function (r) { return [MON(r.m), R(r['in']), R(r.out)]; }));

    /* ---------- nav badges + Cash & Debt note ---------- */
    var nb = document.querySelector('.nav-item[data-page="payments"] .badge');
    if (nb) nb.textContent = '₹' + (due / 1e5).toFixed(1) + 'L';
    var cb = document.querySelector('.nav-item[data-page="cashflow"] .badge');
    if (cb) cb.textContent = '₹' + Cr(debt) + 'Cr';
    var cf = document.getElementById('page-cashflow');
    if (cf && !cf.querySelector('.fx-cf-banner')) {
      var ban = document.createElement('div');
      ban.className = 'fx-cf-banner';
      ban.innerHTML = '<b>Update to ' + FIN.asOf + ':</b> owed to the bank is now <b>₹' + R(debt) + '</b> (₹' + Cr(debt) + ' Cr) — ' +
        bank.map(function (r) { return esc(r[0]) + ' ₹' + L(r[1]) + ' L'; }).join(' · ') +
        '. The ECLGS loan of ₹20 L was drawn on 29 Jun. The figures below are still Q1 (30 Jun). Full detail on <a href="#" data-fx-go="payments">Payments &amp; Receivables</a>.';
      var head = cf.querySelector('.page-head');
      if (head && head.nextSibling) cf.insertBefore(ban, head.nextSibling); else cf.prepend(ban);
      var go = ban.querySelector('[data-fx-go]');
      go.addEventListener('click', function (e) { e.preventDefault(); var n = document.querySelector('.nav-item[data-page="payments"]'); if (n) n.click(); });
    }
  });
})();
