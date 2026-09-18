import assert from 'node:assert/strict';
import worker from '../worker/api.mjs';
const original=globalThis.fetch;
let queries=[];
globalThis.fetch=async (url) => {
 const u=new URL(url);queries.push(u);
 const ds=u.pathname.split('/').pop();
 let rows=[];
 if(ds==='az4n-8mr2.json') rows=[{dot_number:'99999999',legal_name:'TEST ONLY',power_units:'100',total_drivers:'100',status_code:'A'}];
 if(ds==='4y6x-dmck.json') rows=[{insp_total:'10',driver_insp_total:'5',vehicle_insp_total:'5',driver_oos_insp_total:'0',vehicle_oos_insp_total:'0'}];
 if(ds==='4wxs-vbns.json') rows=[{report_date:'01-SEP-26',fatalities:'3',injuries:'4',tow_away:'Y'}];
 return new Response(JSON.stringify(rows),{headers:{'content-type':'application/json'}});
};
try{
 const r=await worker.fetch(new Request('https://api.dotreportcard.com/carrier?dot=99999999'));
 assert.equal(r.status,200);
 const c=await r.json();
 assert.equal(c.schema_version,2);
 assert.deepEqual([c.crashes.total,c.crashes.fatalities,c.crashes.injuries,c.crashes.fatal_crashes,c.crashes.injury_crashes],[1,3,4,1,1]);
 assert.equal(c.basics[0].public_ac,null);
 assert.equal(c.basics[0].alert,null);
 queries=[];
 await worker.fetch(new Request('https://api.dotreportcard.com/search?q=MC-12345'));
 assert.match(queries[0].searchParams.get('$where'),/docket1='12345' AND docket1prefix='MC'/);
 assert.equal((await worker.fetch(new Request('https://api.dotreportcard.com/carrier?dot=no'))).status,400);
 console.log('PASS: Worker normalized counts, nullable indicators, exact MC prefix, bad identifier');
} finally {globalThis.fetch=original;}
