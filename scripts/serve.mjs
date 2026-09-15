import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root=resolve('dist');
const port=Number(process.env.PORT||3000);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp'};

createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const relative=normalize(pathname).replace(/^([/\\])+/, '');
    let file=resolve(join(root,relative||'index.html'));
    if(!file.startsWith(root+sep)&&file!==root)throw new Error('invalid path');
    let info=await stat(file).catch(()=>null);
    if(info?.isDirectory()){file=join(file,'index.html');info=await stat(file).catch(()=>null)}
    if(!info?.isFile()){file=join(root,'index.html');info=await stat(file)}
    res.writeHead(200,{'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
    createReadStream(file).pipe(res);
  }catch(error){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found')}
}).listen(port,'0.0.0.0',()=>console.log(`PANORAMA listening on 0.0.0.0:${port}`));
