const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const account = require('./account.cjs');
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || '127.0.0.1';
const extensionOrigin = 'chrome-extension://lkcpnnanmgngcmbekfiiojbbmddlpnmg';
const files = {'/':'index.html','/chrome-import':'chrome-import.html','/chrome-import.js':'chrome-import.js','/app.js':'app.js','/style.css':'style.css','/vendor/qrcode.js':'vendor/qrcode.js'};
let importVersion = 0;
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/account/')) {
    const hostHeader = req.headers.host || '';
    const validHost = [`127.0.0.1:${port}`, `localhost:${port}`].includes(hostHeader);
    const localPeer = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const origin = req.headers.origin;
    const extensionImport = url.pathname === '/api/account/browser-import' && origin === extensionOrigin;
    const corsHeaders = extensionImport ? {'access-control-allow-origin':extensionOrigin,'vary':'Origin'} : {};
    if (extensionImport && req.method === 'OPTIONS' && validHost && localPeer) {
      res.writeHead(204,{...corsHeaders,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type,x-rosemusic-client','cache-control':'no-store'});return res.end();
    }
    if (req.method !== 'POST' || !validHost || !localPeer || (url.pathname==='/api/account/browser-import' ? !extensionImport : (origin && origin !== `http://${hostHeader}`)) || req.headers['x-rosemusic-client'] !== 'local-v1' || !(req.headers['content-type']||'').startsWith('application/json')) {
      res.writeHead(403, {'cache-control':'no-store'}); return res.end();
    }
    let raw='',size=0;
    try {
      for await (const chunk of req) { size+=chunk.length;if(size>20000)throw new Error('请求内容过长');raw+=chunk.toString('utf8') }
      let input;try{input=JSON.parse(raw||'{}')}catch{throw new Error('请求格式不正确')}let data;
      switch(url.pathname){
        case '/api/account/status': data={profile:await account.getProfile()};break;
        case '/api/account/qr/new': data=await account.beginQR();break;
        case '/api/account/qr/check': data=await account.pollQR();break;
        case '/api/account/qr/cancel': account.cancelQR();data={ok:true};break;
        case '/api/account/import': data=await account.importCookie(input.cookie);break;
        case '/api/account/browser-import': data=await account.importCookie(input.cookie);importVersion++;break;
        case '/api/account/import-state': data={version:importVersion};break;
        case '/api/account/playlists': data=await account.playlists(input.offset);break;
        case '/api/account/tracks': data=await account.playlistTracks(input.id,input.offset);break;
        case '/api/account/daily': data=await account.daily();break;
        case '/api/account/discover/hot': data=await account.hotPlaylists(input.category);break;
        case '/api/account/discover/personal': data=await account.recommendedPlaylists();break;
        case '/api/account/lyric': data=await account.lyric(input.id);break;
        case '/api/account/resolve-share': data=await account.resolveShare(input.url);break;
        case '/api/account/logout': await account.logout();data={ok:true};break;
        default: res.writeHead(404,{'cache-control':'no-store'});return res.end();
      }
      res.writeHead(200,{...corsHeaders,'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(JSON.stringify(data));
    }catch(error){res.writeHead(400,{...corsHeaders,'content-type':'application/json; charset=utf-8','cache-control':'no-store'});return res.end(JSON.stringify({error:error.message||'账号请求失败'}))}
  }
  if (url.pathname === '/api/netease' && ['GET','POST'].includes(req.method)) {
    const hostHeader=req.headers.host||'';
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(hostHeader)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||(req.headers.origin&&req.headers.origin!==`http://${hostHeader}`)||req.headers['x-shiyin-client']!=='local-v1'){res.writeHead(403);return res.end();}
    let proxy;
    try{proxy=new URL(req.headers['x-shiyin-proxy']);if(!['http:','https:'].includes(proxy.protocol)||proxy.username||proxy.password||proxy.hash)throw Error()}catch{res.writeHead(400,{'content-type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'请先在设置中填写有效的搜索代理地址'}));}
    const endpoint = url.searchParams.get('endpoint');
    const allowed = ['/weapi/search/get', '/api/song/detail', '/api/song/lyric', '/api/v6/playlist/detail', '/weapi/song/enhance/play/mv/url'];
    if (!allowed.includes(endpoint) && !/^\/weapi\/v1\/album\/\d+$/.test(endpoint || '')) { res.writeHead(400); return res.end('Invalid endpoint'); }
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 20000) { res.writeHead(413); return res.end(); } }
    const query = new URLSearchParams(url.searchParams); query.delete('endpoint');
    const target = 'https://music.163.com' + endpoint + (query.size ? '?' + query : '');
    proxy.searchParams.set('url',target);
    try {
      const response = await fetch(proxy, { method: req.method, headers: req.method === 'POST' ? {'content-type':'application/x-www-form-urlencoded'} : {}, body: req.method === 'POST' ? body : undefined, signal: AbortSignal.timeout(15000),redirect:'error' });
      const text = await response.text();
      if (!response.ok) throw Error('HTTP '+response.status);
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); return res.end(text);
    } catch (e) { res.writeHead(502, {'content-type':'application/json; charset=utf-8'}); return res.end(JSON.stringify({error:'无法连接配置的搜索代理：'+(e.cause?.code||e.message)})); }
  }
  const file = files[url.pathname];
  if (req.method !== 'GET' || !file) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname,file), (err, data) => { if (err) {res.writeHead(500); return res.end();} res.writeHead(200, {'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'cache-control':'no-store'}); res.end(data); });
}).on('error', error => { if (process.send) process.send({type:'error',message:error.message}); else console.error(error); process.exitCode=1; }).listen(port, host, async () => { try { await account.initialize();const url = `http://127.0.0.1:${port}`; console.log(`本地播放器已启动：${url}`); if (process.send) process.send({type:'ready'}); if (process.argv.includes('--open') && process.platform === 'win32') require('node:child_process').spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {detached:true, stdio:'ignore'}).unref(); } catch(error) { if(process.send) process.send({type:'error',message:error.message}); process.exit(1); } });


