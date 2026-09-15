import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const html=await readFile('dist/index.html','utf8');
const categoryBlock=html.match(/const CATEGORIES=\{([\s\S]*?)\n\};/);
if(!categoryBlock)throw new Error('CATEGORIES not found');
const categories={};
for(const match of categoryBlock[1].matchAll(/'([^']+)':\[([^\]]+)\]/g))categories[match[1]]=[...match[2].matchAll(/'([^']+)'/g)].map(x=>x[1]);
const brandFilter=process.env.BRAND_FILTER||'';
const nodeFilter=process.env.NODE_FILTER||'';
const searchPages=Math.max(1,Number(process.env.SEARCH_PAGES||3));
const nodeTerm=node=>{
  const rules=[['不锈钢高汤锅','stainless steel stock pot'],['硬质阳极氧化','hard anodized cookware'],['铝制不粘','aluminum nonstick cookware'],['陶瓷不粘','ceramic nonstick cookware'],['陶瓷锅具套装','ceramic cookware set'],['不粘锅具套装','nonstick cookware set'],['不锈钢锅具套装','stainless steel cookware set'],['锅具套装','cookware set'],['不锈钢煎锅','stainless steel frying pan'],['不锈钢奶锅','stainless steel saucepan'],['不锈钢','stainless steel cookware'],['不粘煎锅','nonstick frying pan'],['不粘','nonstick cookware'],['铸铁荷兰锅','cast iron dutch oven'],['珐琅铸铁','enameled cast iron cookware'],['铸铁','cast iron cookware'],['碳钢','carbon steel pan'],['铜锅','copper cookware'],['烘焙器具','bakeware'],['烘焙套装','bakeware set'],['刀具','kitchen knives'],['空气炸锅','air fryer'],['压力锅','pressure cooker'],['汤锅','stock pot'],['炒锅','wok'],['煎锅','frying pan'],['餐具','tableware'],['电水壶','kettle'],['咖啡机','coffee maker'],['食物处理机','food processor'],['Wonder Oven','wonder oven'],['Always Pan','always pan'],['Perfect Pot','perfect pot'],['Titanium 系列','titanium cookware'],['Signature 不粘','signature nonstick cookware'],['Premier 不粘','premier nonstick cookware'],['Classic 不粘','classic nonstick cookware'],['D3 不锈钢','D3 stainless steel cookware'],['D5 不锈钢','D5 stainless steel cookware'],['Copper Core','copper core cookware'],['HA1 不粘','HA1 nonstick cookware'],['Tri-Ply Clad','tri ply clad cookware'],['专业不粘煎锅','professional nonstick frying pan'],['Hybrid 煎锅','hybrid frying pan'],['Hybrid 锅具套装','hybrid cookware set'],['Hybrid 炒锅','hybrid wok'],['Hybrid 烤盘','hybrid griddle'],['Multi-Ply 不锈钢','multi ply stainless steel cookware'],['Classic 不锈钢','classic stainless steel cookware']];
  return rules.find(([name])=>node.includes(name))?.[1]||node;
};
const outputPath=process.env.OUTPUT_PATH||'dist/data/amazon-catalog.json';
let previous={updatedAt:null,status:'waiting_first_collection',brands:{}};
try{previous=JSON.parse(await readFile(outputPath,'utf8'))}catch{}
const browser=await chromium.launch({headless:true});
const userAgents=['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129 Safari/537.36'];
const brands={};
for(const [brand,nodes] of Object.entries(categories)){
  if(brandFilter&&brand!==brandFilter)continue;
  brands[brand]={categories:{},skuCount:0};
  const brandSeen=new Set();
  for(const node of nodes){
    if(nodeFilter&&node!==nodeFilter)continue;
    const found=new Map();
    for(let searchPage=1;searchPage<=searchPages;searchPage++){
      try{
        const context=await browser.newContext({locale:'en-US',timezoneId:'America/Los_Angeles',userAgent:userAgents[(searchPage+node.length)%userAgents.length]});
        const page=await context.newPage();
        const q=encodeURIComponent(`${brand} ${nodeTerm(node)}`);
        await page.goto(`https://www.amazon.com/s?k=${q}&page=${searchPage}`,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForTimeout(1800+Math.floor(Math.random()*1600));
        const cards=await page.locator('[data-component-type="s-search-result"][data-asin]').evaluateAll(nodes=>nodes.map(card=>{const link=card.querySelector('a.a-link-normal.s-line-clamp-4')||card.querySelector('h2 a');return{asin:card.getAttribute('data-asin'),title:link?.getAttribute('aria-label')||card.querySelector('h2')?.textContent?.trim()||'',url:link?.href||'',image:card.querySelector('img.s-image')?.src||'',price:card.querySelector('.a-price .a-offscreen')?.textContent?.trim()||'',rating:card.querySelector('.a-icon-alt')?.textContent?.trim()||'',reviewCount:card.querySelector('[data-csa-c-slot-id="alf-reviews"] .a-size-base')?.textContent?.trim()||''}}).filter(x=>/^[A-Z0-9]{10}$/.test(x.asin)&&x.title));
        const normalizedBrand=brand.toLowerCase().replace(/[^a-z0-9]/g,'');
        for(const product of cards)if(product.title.toLowerCase().replace(/[^a-z0-9]/g,'').includes(normalizedBrand))found.set(product.asin,{...product,url:product.url||`https://www.amazon.com/dp/${product.asin}`});
        await context.close();
      }catch(error){console.warn(`${brand} / ${node} / page ${searchPage}: ${error.message}`)}
    }
    const prior=previous.brands?.[brand]?.categories?.[node]||[];
    const products=found.size?[...found.values()]:prior;
    brands[brand].categories[node]=products;
    for(const product of products)brandSeen.add(product.asin);
    console.log(`${brand} / ${node}: ${products.length} SKU`);
  }
  brands[brand].skuCount=brandSeen.size;
}
await browser.close();
await writeFile(outputPath,JSON.stringify({updatedAt:new Date().toISOString(),status:'complete',brands},null,2)+'\n');
