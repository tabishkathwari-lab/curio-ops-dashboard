// SCOREPATCH_PROMOTER_CHECKINS_V2
// Populates Days active / AM-PM / Last active / On leave (= missed days this month) on the Promoters scorecard
(function(){
  var SB='https://cikyevecsuamzndxfpir.supabase.co';
  var KEY='sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  var CACHE=null, CACHE_T=0;
  function istDateStr(d){ return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  async function loadData(){
    if (CACHE && (Date.now()-CACHE_T)<300000) return CACHE;
    var out={}, off=0;
    while(off<20000){
      var r = await fetch(SB+'/rest/v1/promoter_checkins?select=promoter,date,time_str,timestamp&limit=1000&offset='+off,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
      var page = await r.json();
      if (!Array.isArray(page)||!page.length) break;
      page.forEach(function(rec){
        var k=rec.promoter; if(!k) return;
        if (!out[k]) out[k]={days:new Set(), last:null, am:0, pm:0, thisMonthDays:new Set()};
        if (rec.date) {
          out[k].days.add(rec.date);
          var now=new Date(), ym=istDateStr(now).slice(0,7);
          if (rec.date.slice(0,7)===ym) out[k].thisMonthDays.add(rec.date);
        }
        if (!out[k].last || rec.timestamp>out[k].last) out[k].last=rec.timestamp;
        var h=null;
        if (rec.time_str && /^\d{1,2}/.test(rec.time_str)) h=parseInt(rec.time_str.split(':')[0]);
        else if (rec.timestamp) h=new Date(rec.timestamp).getHours();
        if (h!=null){ if (h<14) out[k].am++; else out[k].pm++; }
      });
      if (page.length<1000) break;
      off+=1000;
    }
    CACHE=out; CACHE_T=Date.now();
    return out;
  }
  function elapsedMonthDays(){
    // Days from 1st of IST month up to today inclusive
    var now=new Date();
    var ist=istDateStr(now);
    return parseInt(ist.slice(8,10), 10);
  }
  async function patch(){
    try {
      var tables=document.querySelectorAll('table');
      var table=null;
      for (var i=0;i<tables.length;i++){
        var th=tables[i].querySelectorAll('thead th');
        var names=[]; for (var j=0;j<th.length;j++) names.push(th[j].textContent.trim());
        if (names.indexOf('Days active')>=0 && names.indexOf('AM / PM')>=0 && names.indexOf('Last active')>=0){ table=tables[i]; break; }
      }
      if (!table) return;
      if (table.dataset.spPatched==='2' && (Date.now()-parseInt(table.dataset.spTs||'0',10))<30000) return;
      var data=await loadData();
      var hdrs=Array.from(table.querySelectorAll('thead th')).map(function(x){return x.textContent.trim();});
      var iN=hdrs.indexOf('Promoter'), iD=hdrs.indexOf('Days active'), iA=hdrs.indexOf('AM / PM'), iL=hdrs.indexOf('Last active'), iOL=hdrs.indexOf('On leave');
      // Rename 'On leave' header to 'Missed (mo)' once for clarity
      if (iOL>=0 && table.querySelectorAll('thead th')[iOL].dataset.renamed!=='1'){
        var th=table.querySelectorAll('thead th')[iOL];
        th.textContent='Missed (mo)';
        th.title='Working days this month without a check-in · computed from promoter_checkins';
        th.dataset.renamed='1';
      }
      var elapsed = elapsedMonthDays();
      Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
        var tds=tr.querySelectorAll('td'); if (!tds.length) return;
        var name=(tds[iN]&&tds[iN].textContent||'').replace(/^[^A-Za-z]+/,'').trim();
        var d=data[name]; if (!d) return;
        if (tds[iD]) tds[iD].textContent=d.days.size;
        if (tds[iA]) tds[iA].textContent=d.am+' / '+d.pm;
        if (tds[iL] && d.last) tds[iL].textContent=new Date(d.last).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
        if (iOL>=0 && tds[iOL]) {
          var missed = Math.max(0, elapsed - d.thisMonthDays.size);
          tds[iOL].textContent = missed;
          tds[iOL].title = 'Days in Nov '+elapsed+' · active '+d.thisMonthDays.size+' · missed '+missed;
        }
      });
      table.dataset.spPatched='2'; table.dataset.spTs=String(Date.now());
    } catch(e){ console.warn('[scorepatch]', e); }
  }
  var t;
  var run=function(){ clearTimeout(t); t=setTimeout(patch, 500); };
  if (document.body) new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded', function(){ new MutationObserver(run).observe(document.body,{childList:true,subtree:true}); run(); });
  run();
})();
