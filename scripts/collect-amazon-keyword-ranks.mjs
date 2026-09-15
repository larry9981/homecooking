import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const catalog=JSON.parse(await readFile('dist/data/amazon-catalog.json','utf8'));
const outputPath='dist/data/amazon-keyword-ranks.json';
const searchPages=Math.max(1,Number(process.env.KEYWORD_SEARCH_PAGES||3));
let previous={items:{}};
try{previous=JSON.parse(await readFile(outputPath,'utf8'))}catch{}

const coreTerm=(category,title)=>{const text=`${category} ${title}`.toLowerCase(),rules=[['nonstick','nonstick cookware'],['不粘','nonstick cookware'],['ceramic','ceramic cookware'],['陶瓷','ceramic cookware'],['stainless','stainless steel cookware'],['不锈钢','stainless steel cookware'],['cast iron','cast iron cookware'],['铸铁','cast iron cookware'],['carbon steel','carbon steel pan'],['碳钢','carbon steel pan'],['copper','copper cookware'],['铜','copper cookware'],['bake','bakeware set'],['烘焙','bakeware set'],['knife','kitchen knife set'],['刀具','kitchen knife set'],['wok','wok pan'],['炒锅','wok pan'],['stock pot','stock pot'],['汤锅','stock pot'],['fry','frying pan'],['煎锅','frying pan'],['sauce','saucepan'],['奶锅','saucepan']];return rules.find(([key])=>text.includes(key))?.[1]||(text.includes('set')?'pots and pans set':'cookware')};
const keywordList=(brand,category,title)=>{const core=coreTerm(category,title),size=(title.match(/\b(\d{1,2})[- ]?inch\b/i)||[])[1],terms=[`${brand} ${core}`,core,`${brand} ${category}`,`best ${core}`,`${brand} cookware`,`${core} set`,`${core} with lid`,`${core} induction compatible`,`${core} oven safe`,`${core} dishwasher safe`,`${core} non toxic`,`${core} for gas stove`,`${core} for electric stove`,`${core} professional grade`,`${core} kitchen cookware`,`${brand} pots and pans`,`${brand} kitchen cookware`,size?`${size} inch ${core}`:`durable ${core}`,`commercial ${core}`,`restaurant quality ${core}`],unique=[...new Set(terms)];for(const m of['heavy duty','home kitchen','chef recommended','premium','easy clean'])if(unique.length<20)unique.push(`${m} ${core}`);return unique.slice(0,20)};
const products=[];
for(const [brand,data] of Object.entries(catalog.brands||{}))for(const [category,rows] of Object.entries(data.categories||{}))for(const product of rows)products.push({brand,category,...product,keywords:keywordList(brand,category,product.title)});
const keywordMap=new Map();
for(const product of products)for(const keyword of product.keywords){if(!keywordMap.has(keyword))keywordMap.set(keyword,new Set());keywordMap.get(keyword).add(product.asin)}

const browser=await chromium.launch({headless:true});
const searchResults={};
let completed=0;
for(const [keyword,targetAsins] of keywordMap){
  const positions={};
  for(let searchPage=1;searchPage<=searchPages&&Object.keys(positions).length<targetAsins.size;searchPage++){
    const context=await browser.newContext({locale:'en-US',timezoneId:'America/Los_Angeles',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'});
    const page=await context.newPage();
    try{
      await page.goto(`https://www.amazon.com/s?k=${encodeURIComponent(keyword)}&page=${searchPage}`,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForTimeout(1200+Math.floor(Math.random()*900));
      const organic=await page.locator('[data-component-type="s-search-result"][data-asin]').evaluateAll(nodes=>nodes.filter(card=>!card.querySelector('.puis-sponsored-label-text')).map(card=>card.getAttribute('data-asin')).filter(Boolean));
      organic.forEach((asin,index)=>{if(targetAsins.has(asin)&&!positions[asin])positions[asin]={page:searchPage,position:index+1,absolute:(searchPage-1)*48+index+1}});
    }catch(error){console.warn(`${keyword} page ${searchPage}: ${error.message}`)}
    await context.close();
  }
  searchResults[keyword]=positions;
  completed++;console.log(`${completed}/${keywordMap.size} ${keyword}`);
}
await browser.close();
const today=new Date().toISOString().slice(0,10),items={...previous.items};
for(const product of products){const keywords=product.keywords.map(keyword=>({keyword,status:searchResults[keyword]?.[product.asin]?'found':'not_found',...(searchResults[keyword]?.[product.asin]||{})})),prior=items[product.asin]||{};items[product.asin]={asin:product.asin,checkedAt:new Date().toISOString(),searchPages,keywords,history:[...(prior.history||[]).filter(x=>x.date!==today),{date:today,keywords}].slice(-30)}}
await writeFile(outputPath,JSON.stringify({updatedAt:new Date().toISOString(),status:'complete',searchPages,items},null,2)+'\n');
