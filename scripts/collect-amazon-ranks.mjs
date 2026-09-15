import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const html=await readFile('dist/index.html','utf8');
const block=html.match(/const AMZ_CATALOG_RAW=\{([\s\S]*?)\n\};/);
if(!block)throw new Error('AMZ_CATALOG_RAW not found');
let discovered=[];
try{const catalog=JSON.parse(await readFile('dist/data/amazon-catalog.json','utf8'));discovered=Object.values(catalog.brands||{}).flatMap(b=>Object.values(b.categories||{})).flatMap(x=>x).map(x=>x.asin)}catch{}
const asins=[...new Set([...block[1].matchAll(/([A-Z0-9]{10})\|/g)].map(x=>x[1]).concat(discovered))];
const outputPath='dist/data/amazon-ranks.json';
let previous={updatedAt:null,status:'waiting_first_collection',items:{}};
try{previous=JSON.parse(await readFile(outputPath,'utf8'))}catch{}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'en-US',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'});
const page=await context.newPage();
const today=new Date().toISOString().slice(0,10);
for(const [index,asin] of asins.entries()){
  const prior=previous.items[asin]||{history:[]};
  try{
    await page.goto(`https://www.amazon.com/dp/${asin}`,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(1400+Math.floor(Math.random()*900));
    const title=await page.locator('#productTitle').textContent().catch(()=>null);
    const links=await page.locator('a').evaluateAll(nodes=>nodes.map(a=>({text:(a.textContent||'').trim(),href:a.href})).filter(x=>/^#[\d,]+\s+in\s+/i.test(x.text)));
    const ranks=[];
    for(const link of links){const m=link.text.match(/^#([\d,]+)\s+in\s+(.+)$/i);if(!m)continue;const rank=Number(m[1].replaceAll(',','')),category=m[2].replace(/\s*\(.*$/,'').trim(),nodeId=(link.href.match(/\/zgbs\/[^/]+\/(\d+)/)||[])[1]||null;if(!ranks.some(x=>x.category===category))ranks.push({category,rank,nodeId,url:link.href})}
    const detailText=await page.locator('#detailBullets_feature_div, #productDetails_detailBullets_sections1, #productDetails_db_sections').allTextContents().catch(()=>[]);
    for(const text of detailText)for(const match of text.matchAll(/#([\d,]+)\s+in\s+([^\n(]+)/gi)){const rank=Number(match[1].replaceAll(',','')),category=match[2].trim();if(category&&!ranks.some(x=>x.category===category))ranks.push({category,rank,nodeId:null,url:`https://www.amazon.com/dp/${asin}`})}
    const snapshot={date:today,ranks};
    const history=[...(prior.history||[]).filter(x=>x.date!==today),snapshot].slice(-30);
    previous.items[asin]={asin,title:title?.trim()||prior.title||asin,url:`https://www.amazon.com/dp/${asin}`,status:ranks.length?'ok':'no_rank_found',checkedAt:new Date().toISOString(),ranks,history};
  }catch(error){previous.items[asin]={...prior,asin,url:`https://www.amazon.com/dp/${asin}`,status:'fetch_failed',checkedAt:new Date().toISOString(),error:String(error.message).slice(0,160)}}
  console.log(`${index+1}/${asins.length} ${asin} ${previous.items[asin].status}`);
}
await browser.close();
previous.updatedAt=new Date().toISOString();previous.status='complete';
await writeFile(outputPath,JSON.stringify(previous,null,2)+'\n');
