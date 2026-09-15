import { readFile, writeFile } from 'node:fs/promises';

const searchCatalog=JSON.parse(await readFile('dist/data/amazon-search-catalog.json','utf8'));
const rankData=JSON.parse(await readFile('dist/data/amazon-ranks.json','utf8'));
const brands={};
for(const [brand,data] of Object.entries(searchCatalog.brands||{})){
  const unique=new Map();
  for(const products of Object.values(data.categories||{}))for(const product of products)unique.set(product.asin,product);
  const categories={};
  for(const product of unique.values()){
    const rankItem=rankData.items?.[product.asin],ranks=rankItem?.ranks||[];
    const mostSpecific=ranks.at(-1);
    const category=mostSpecific?.category||'Amazon 子类目待采集';
    if(!categories[category])categories[category]=[];
    categories[category].push({...product,amazonCategory:category,nodeId:mostSpecific?.nodeId||null,categoryRank:mostSpecific?.rank||null,rankCheckedAt:rankItem?.checkedAt||null});
  }
  for(const products of Object.values(categories))products.sort((a,b)=>(a.categoryRank??Number.MAX_SAFE_INTEGER)-(b.categoryRank??Number.MAX_SAFE_INTEGER));
  brands[brand]={skuCount:unique.size,categories};
}
await writeFile('dist/data/amazon-catalog.json',JSON.stringify({updatedAt:new Date().toISOString(),status:'complete',classification:'amazon_product_page_bsr_subcategory',brands},null,2)+'\n');
