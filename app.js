'use strict';
const $ = s => document.querySelector(s);
const audio = $('#audio');
const serverStorageKey='shiyin-server-settings-v1';
let serverSettings={proxy:'',stream:''};
try{const saved=JSON.parse(localStorage.getItem(serverStorageKey)||'{}');for(const key of ['proxy','stream'])if(typeof saved[key]==='string')serverSettings[key]=saved[key]}catch{}
function validServiceUrl(value){if(!value)return '';let u;try{u=new URL(value)}catch{throw Error('请输入完整的服务器网址。')}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw Error('请输入不含账号密码或 # 的 HTTP(S) 网址。');return u.href}
function openServerSettings(){const settings=$('#settings-dialog');if(settings?.open)settings.close();$('#server-proxy').value=serverSettings.proxy;$('#server-stream').value=serverSettings.stream;$('#server-status').textContent='';if(!$('#server-dialog').open)$('#server-dialog').showModal()}

const defaults = {color:'#007aff',mode:'system',lyrics:'both',floating:true};
let preferences = {...defaults};
try { const saved=JSON.parse(localStorage.getItem('rose-local-preferences')||'{}'); if(/^#[0-9a-f]{6}$/i.test(saved.color))preferences.color=saved.color.toLowerCase(); if(['system','light','dark'].includes(saved.mode))preferences.mode=saved.mode; if(['both','original','off'].includes(saved.lyrics))preferences.lyrics=saved.lyrics; if(typeof saved.floating==='boolean')preferences.floating=saved.floating; } catch {}
let lyricOriginal='', lyricTranslation='', timedOriginal=[], timedTranslation=[];

const modulus = BigInt('0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7');
let favorites = []; try { favorites = JSON.parse(localStorage.getItem('rose-local-favorites') || '[]'); if (!Array.isArray(favorites)) favorites = []; } catch {}
let queue = [], current = null, view = 'account', searchResults = [], lyrics = [], lyricSeq = 0, searchSeq = 0;
let queueIndex = -1, queueSource = 'single', queueContext = null, draggedQueueIndex = null;
let category = 'song', collectionResults = [], collectionTracks = null, collectionName = '', collectionSeq = 0;
let discoveryResults = [],personalDiscoveryResults=[],discoveryCategory='全部',discoverySeq=0,personalDiscoverySeq=0;
let collectionOwner='search',selecting=false,selectedIndices=new Set();
let accountState={checked:false,profile:null,section:'playlists',items:[],requestId:0},qrTimer=null,qrGeneration=0;
let accountPlaylistScroll=0;
const accountGroupsExpanded={created:true,collected:true,other:true};
const categoryNames = {song:'单曲',album:'专辑',playlist:'歌单',mv:'MV'};
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function saveFavorites(){ let saved=true;try{localStorage.setItem('rose-local-favorites',JSON.stringify(favorites));}catch{saved=false;status('浏览器不允许保存收藏，请检查本地存储设置。')} $('#favorite-count').textContent=favorites.length; $('#favorite').textContent=current && favorites.some(s=>s.id===current.id)?'♥':'♡';return saved; }
function status(text){$('#status').textContent=text || ''}
let toastTimer=null;
function showToast(text){const toast=$('#action-toast');clearTimeout(toastTimer);toast.textContent=text;toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true},2500)}
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
function applyPreferences(){
 document.documentElement.style.setProperty('--seed',preferences.color);
 document.documentElement.dataset.mode=preferences.mode==='system'?(systemTheme.matches?'dark':'light'):preferences.mode;
 $('#theme-color').value=preferences.color;$('#theme-mode').value=preferences.mode;$('#lyric-mode').value=preferences.lyrics;
 const floatingEnabled=preferences.floating&&preferences.lyrics!=='off';$('#floating-toggle').setAttribute('aria-pressed',String(floatingEnabled));$('#floating-toggle').setAttribute('aria-label',floatingEnabled?'关闭悬浮歌词':'显示悬浮歌词');$('#floating-toggle').title=floatingEnabled?'关闭悬浮歌词':'显示悬浮歌词';
 document.querySelectorAll('.color-swatch').forEach(b=>{const selected=b.dataset.color.toLowerCase()===preferences.color;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});
}
function savePreferences(){try{localStorage.setItem('rose-local-preferences',JSON.stringify(preferences))}catch{status('浏览器不允许保存设置，请检查本地存储。')}applyPreferences()}
function parseLyric(raw){return (raw||'').split('\n').flatMap(line=>{const times=[...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];const text=line.replace(/\[[^\]]+\]/g,'').trim();return text?times.map(t=>({time:Number(t[1])*60+Number(t[2]),text})):[]}).sort((a,b)=>a.time-b.time)}
function updateFloatingLyric(){
 const overlay=$('#floating-lyrics');const time=audio.currentTime;
 if(!preferences.floating||preferences.lyrics==='off'||!current||!Number.isFinite(time)||!timedOriginal.length){overlay.hidden=true;return}
 let lo=0,hi=timedOriginal.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(timedOriginal[mid].time<=time)lo=mid+1;else hi=mid}
 if(lo===0){overlay.hidden=true;return}
 const line=timedOriginal[lo-1],translation=preferences.lyrics==='both'?timedTranslation.find(t=>Math.abs(t.time-line.time)<.3):null;
 $('#floating-original').textContent=line.text;
 $('#floating-translation').textContent=translation&&translation.text!==line.text?translation.text:'';
 overlay.hidden=false;
}
function renderLyrics(){timedOriginal=parseLyric(lyricOriginal);timedTranslation=parseLyric(lyricTranslation);updateFloatingLyric();if(preferences.lyrics==='off'){$('#lyrics').textContent='歌词已关闭。';return}if(!timedOriginal.length){$('#lyrics').textContent=current?'这首歌暂时没有歌词。':'音乐响起时，歌词会出现在这里。';return}$('#lyrics').textContent=timedOriginal.map(line=>{if(preferences.lyrics!=='both')return line.text;const translation=timedTranslation.find(t=>Math.abs(t.time-line.time)<.3);return translation&&translation.text!==line.text?line.text+'\n'+translation.text:line.text}).join('\n\n')}
function modpow(base, exp, mod) { let out=1n; while(exp){if(exp&1n)out=out*base%mod;base=base*base%mod;exp>>=1n;} return out; }
async function aes(text,key) { const enc=new TextEncoder();const k=await crypto.subtle.importKey('raw',enc.encode(key),'AES-CBC',false,['encrypt']);const out=await crypto.subtle.encrypt({name:'AES-CBC',iv:enc.encode('0102030405060708')},k,enc.encode(text));return btoa(String.fromCharCode(...new Uint8Array(out))); }
async function encrypt(data){const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';const random=crypto.getRandomValues(new Uint8Array(16));const key=Array.from(random,x=>chars[x%chars.length]).join(''); const params=await aes(await aes(JSON.stringify(data),'0CoJUm6Qyw8W8jud'),key);const reversed=Array.from(key).reverse().map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');const encSecKey=modpow(BigInt('0x'+reversed),65537n,modulus).toString(16).padStart(256,'0');return new URLSearchParams({params,encSecKey});}
async function request(endpoint, params, method='GET'){
 if(!serverSettings.proxy)throw Error('请先在设置中填写搜索代理地址');
 const query=new URLSearchParams(params),u=new URL('/api/netease',location.origin);u.searchParams.set('endpoint',endpoint);if(method==='GET')for(const [k,v] of query)u.searchParams.set(k,v);
 const res=await fetch(u,{method,headers:{'x-shiyin-client':'local-v1','x-shiyin-proxy':serverSettings.proxy},body:method==='POST'?query:undefined,signal:AbortSignal.timeout(20000)});
 let data;try{data=await res.json()}catch{throw Error('搜索代理返回的数据格式不正确')}if(!res.ok||data.code!==200)throw Error(data.error||'接口返回 '+data.code);return data;
}
function renderDiscoveryCards(selector,items){
 const grid=$(selector);grid.innerHTML=items.map((s,i)=>`<button class="discover-card" data-index="${i}" aria-label="查看歌单 ${escapeHtml(s.title)}"><div class="discover-image">${s.cover?`<img src="${escapeHtml(s.cover.replace(/^http:/,'https:'))}" alt="" referrerpolicy="no-referrer">`:''}</div><div class="discover-name">${escapeHtml(s.title)}</div><div class="discover-label">${escapeHtml(s.artist)}${s.count?' · '+s.count+' 首':''}</div></button>`).join('');
 grid.querySelectorAll('.discover-card').forEach(b=>b.onclick=()=>{const item=items[Number(b.dataset.index)];if(item)openSharedPlaylist({id:String(item.id)})});
}
async function loadHotDiscovery(){
 const seq=++discoverySeq;$('#discover-status').textContent='正在加载热门歌单…';$('#discover-grid').innerHTML='';
 try{const data=await accountApi('/discover/hot',{category:discoveryCategory});if(seq!==discoverySeq)return;discoveryResults=data.playlists||[];renderDiscoveryCards('#discover-grid',discoveryResults);$('#discover-status').textContent=discoveryResults.length?'':'暂时没有热门歌单。'}catch(e){if(seq===discoverySeq)$('#discover-status').textContent='热门歌单加载失败：'+e.message}
}
async function loadPersonalDiscovery(){
 const seq=++personalDiscoverySeq;$('#personal-discover-status').textContent='正在加载推荐歌单…';$('#personal-discover-grid').innerHTML='';
 try{const data=await accountApi('/discover/personal');if(seq!==personalDiscoverySeq)return;personalDiscoveryResults=data.playlists||[];renderDiscoveryCards('#personal-discover-grid',personalDiscoveryResults);$('#personal-discover-status').textContent=personalDiscoveryResults.length?'':'暂时没有推荐歌单。'}catch(e){if(seq===personalDiscoverySeq)$('#personal-discover-status').textContent='推荐歌单暂时无法加载：'+e.message}
}
function loadDiscovery(){loadHotDiscovery();loadPersonalDiscovery()}
function songFrom(s){return {id:Number(s.id),title:s.name||'未知歌曲',artist:(s.artists||s.ar||[]).map(a=>a.name).join(' / ')||'未知歌手',cover:(s.album||s.al||{}).picUrl||'',fee:Number(s.fee)||0};}
async function fillSongDetails(songs){
 const ids=[...new Set(songs.filter(s=>!s.privateSource&&!s.cover&&Number.isSafeInteger(s.id)&&s.id>0).map(s=>s.id))];
 if(!ids.length)return songs;
 const details=new Map();
 for(let i=0;i<ids.length;i+=100){const data=await request('/api/song/detail',{ids:JSON.stringify(ids.slice(i,i+100))});for(const item of data.songs||[]){const song=songFrom(item);details.set(song.id,song);}}
 return songs.map(s=>details.has(s.id)?{...s,...details.get(s.id)}:s);
}
function renderQueue(){
 updateSystemQueueControls();
 const list=$('#queue-list');
 $('#clear-queue').disabled=!queue.length;
 if(!queue.length){list.innerHTML='<div class="queue-empty">选择歌曲后，播放列表会显示在这里。</div>';return}
 list.innerHTML=queue.map((song,i)=>`<div class="queue-entry ${i===queueIndex?'current':''}" draggable="true" data-index="${i}"><span class="queue-number">${i+1}</span><button class="queue-drag" data-index="${i}" aria-label="调整 ${escapeHtml(song.title)} 的顺序，可使用上下方向键" title="拖动调整顺序">⋮⋮</button><button class="queue-play" data-action="play" data-index="${i}" aria-label="播放 ${escapeHtml(song.title)}" ${i===queueIndex?'aria-current="true"':''}><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)}</small></button><button class="queue-remove" data-action="remove" data-index="${i}" aria-label="从播放列表移除 ${escapeHtml(song.title)}" title="从播放列表移除">✕</button></div>`).join('');
}
function stopCurrent(){
 ++lyricSeq;current=null;queueIndex=-1;audio.pause();audio.removeAttribute('src');audio.load();
 clearSystemMedia();
 lyrics=[];lyricOriginal='';lyricTranslation='';timedOriginal=[];timedTranslation=[];updateFloatingLyric();renderLyrics();
 $('#track-title').textContent=$('#bar-title').textContent='还没有播放音乐';$('#track-artist').textContent='选一首喜欢的歌开始播放';$('#bar-artist').textContent='你的音乐，随时开始';
 $('#artwork').innerHTML='<div class="art-placeholder">♫</div>';$('#mini-art').textContent='♫';$('#play').textContent='▶';$('#current').textContent=$('#duration').textContent='0:00';$('#seek').value=0;saveFavorites();status('');
}
function removeQueueIndex(index){
 if(!Number.isInteger(index)||index<0||index>=queue.length)return;
 const wasCurrent=index===queueIndex;queue.splice(index,1);
 if(wasCurrent){if(index<queue.length){playQueueIndex(index);return}stopCurrent()}
 else if(index<queueIndex)queueIndex--;
 renderQueue();
}
function clearQueue(){queue=[];queueContext=null;queueSource='single';stopCurrent();renderQueue()}
function playQueueIndex(index,notify=false){if(!Number.isInteger(index)||index<0||index>=queue.length)return;queueIndex=index;renderQueue();playSong(queue[index],notify)}
function playNext(song){
 if(!song)return;
 queue.splice(queueIndex+1,0,song);queueSource='collection';renderQueue();
 showToast(current?'已添加到下一首播放':'已加入播放列表，请点击播放');
}
function startQueue(list,index){
 if(!list[index])return;
 queue=[list[index]];queueContext=null;queueSource='single';playQueueIndex(0,true);
}
function reorderQueue(from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=queue.length||to>=queue.length||from===to)return;
 const item=queue.splice(from,1)[0];queue.splice(to,0,item);
 if(queueIndex===from)queueIndex=to;else if(from<queueIndex&&to>=queueIndex)queueIndex--;else if(from>queueIndex&&to<=queueIndex)queueIndex++;
 renderQueue();
}
function showSongs(list){const area=view==='account'?$('#account-results'):$('#results');if(view!=='account')$('#result-count').textContent=list.length?`${list.length} 首歌曲`:'暂无歌曲';if(!list.length){area.innerHTML=`<div class="empty"><div class="empty-icon">♫</div><strong>${view==='favorites'?'还没有收藏':'没有找到歌曲'}</strong><p>${view==='favorites'?'点击歌曲旁边的心形按钮收藏。':'试试其他关键词或歌单。'}</p></div>`;return;}const selectable=list===collectionTracks&&selecting;area.innerHTML=list.map((song,i)=>`<div class="row song-row">${selectable?`<input class="row-select" type="checkbox" data-index="${i}" aria-label="选择 ${escapeHtml(song.title)}" ${selectedIndices.has(i)?'checked':''}>`:`<span class="row-no">${String(i+1).padStart(2,'0')}</span>`}${song.cover?`<img class="cover" src="${escapeHtml(song.cover.replace(/^http:/,'https:'))}" alt="" referrerpolicy="no-referrer">`:'<div class="cover"></div>'}<div><div class="song-name">${escapeHtml(song.title)}</div><div class="song-artist">${escapeHtml(song.artist)}</div></div><button class="row-play" data-index="${i}" title="播放" aria-label="播放 ${escapeHtml(song.title)}">▶</button><button class="row-fav" data-index="${i}" title="收藏" aria-label="收藏 ${escapeHtml(song.title)}">${favorites.some(f=>f.id===song.id)?'♥':'♡'}</button><button class="row-next" data-index="${i}" title="下一首播放" aria-label="下一首播放 ${escapeHtml(song.title)}"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h8M4 12h8M4 17h11"/><circle cx="17" cy="8" r="4"/><path d="M17 6v4M15 8h4"/></svg></button></div>`).join('');area.querySelectorAll('.row-play').forEach(b=>b.onclick=()=>startQueue(list,Number(b.dataset.index)));area.querySelectorAll('.row-fav').forEach(b=>b.onclick=()=>toggleFavorite(list[Number(b.dataset.index)]));area.querySelectorAll('.row-next').forEach(b=>b.onclick=()=>playNext(list[Number(b.dataset.index)]));area.querySelectorAll('.row-select').forEach(b=>b.onchange=()=>{const i=Number(b.dataset.index);if(b.checked)selectedIndices.add(i);else selectedIndices.delete(i);const count=area.querySelector('.collection-selection-count');if(count)count.textContent=`已选 ${selectedIndices.size} 首 · 勾选歌曲后点击播放已选`});}
function setActiveNavigation(target){document.querySelectorAll('.nav').forEach(b=>{const active=target==='settings'?b.id==='open-settings':b.dataset.view===target;b.classList.toggle('active',active);if(b.dataset.view){if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}})}
function selectView(v){if(!['home','search','favorites','account'].includes(v))return;if(view==='account'&&v!=='account')++accountState.requestId;view=v;setActiveNavigation(v);$('#home-content').hidden=v!=='home';$('#content').hidden=v==='home'||v==='account';$('#account-content').hidden=v!=='account';if(v==='home'){loadDiscovery();return}if(v==='account'){renderAccount();if(!accountState.checked)refreshAccount();return}$('#section-title').textContent=v==='search'?'搜索':'我的收藏';$('#section-kicker').textContent=v==='search'?'EXPLORE MUSIC':'YOUR FAVORITES';$('#categories').hidden=v!=='search';status('');renderCurrent();if(v==='favorites'&&favorites.some(song=>!song.cover)){fillSongDetails(favorites).then(updated=>{const byId=new Map(updated.map(song=>[song.id,song]));favorites=favorites.map(song=>!song.cover&&byId.has(song.id)?byId.get(song.id):song);saveFavorites();if(view==='favorites')renderCurrent()}).catch(()=>{if(view==='favorites')status('部分收藏的封面暂时无法获取，请检查网络。')})}}
function toggleFavorite(song){if(!song){status('请先选择一首歌曲。');return;}const i=favorites.findIndex(s=>s.id===song.id);if(i<0)favorites.push(song);else favorites.splice(i,1);const saved=saveFavorites();renderCurrent();showToast(saved?(i<0?'已添加到收藏':'已取消收藏'):'收藏未能保存，请检查浏览器设置')}
function renderCurrent(){if(view==='home')return;if(view==='account'){renderAccount();return}if(view==='favorites'){showSongs(favorites);return}if(collectionTracks&&collectionOwner==='search'){renderCollection();return}if(category==='song'){showSongs(searchResults);return}showCollections(collectionResults)}
function showCollections(list){const area=$('#results');$('#result-count').textContent=list.length?`${list.length} 个${categoryNames[category]}`:'暂无结果';if(!list.length){area.innerHTML='<div class="empty"><div class="empty-icon">♫</div><strong>没有找到结果</strong><p>输入关键词搜索'+categoryNames[category]+'。</p></div>';return}area.innerHTML=list.map((s,i)=>`<div class="row"><span class="row-no">${String(i+1).padStart(2,'0')}</span>${s.cover?`<img class="cover" src="${escapeHtml(s.cover.replace(/^http:/,'https:'))}" alt="" referrerpolicy="no-referrer">`:'<div class="cover"></div>'}<div><div class="song-name">${escapeHtml(s.title)}</div><div class="song-artist">${escapeHtml(s.artist)}${s.count?' · '+s.count+' 首':''}</div></div><span></span><button class="row-open" data-index="${i}">${category==='mv'?'播放':'查看'}</button></div>`).join('');area.querySelectorAll('.row-open').forEach(b=>b.onclick=()=>{const item=list[Number(b.dataset.index)];category==='mv'?playMV(item):openCollection(item)});}
async function openCollection(item){const kind=category,seq=++collectionSeq;status('正在读取'+categoryNames[kind]+'…');try{let songs=[],total=0;if(kind==='album'){const data=await request('/weapi/v1/album/'+item.id,await encrypt({csrf_token:''}),'POST');songs=(data.songs||[]).map(songFrom);total=songs.length;songs=await fillSongDetails(songs)}else{const data=await request('/api/v6/playlist/detail',{id:String(item.id),n:'100000',s:'8'});item={...item,title:data.playlist?.name||item.title};const ids=(data.playlist?.trackIds||[]).map(x=>x.id).filter(Number.isSafeInteger);total=ids.length;if(ids.length){const all=[];for(let i=0;i<ids.length;i+=100){if(seq!==collectionSeq)return;status('正在读取歌单 '+Math.min(i+100,ids.length)+' / '+ids.length+'…');const chunk=ids.slice(i,i+100);const detail=await request('/api/song/detail',{ids:JSON.stringify(chunk)});const map=new Map((detail.songs||[]).map(s=>[Number(s.id),songFrom(s)]));all.push(...chunk.map(id=>map.get(id)).filter(Boolean))}songs=all}else songs=(data.playlist?.tracks||[]).map(songFrom)}if(seq!==collectionSeq||category!==kind||view!=='search')return;collectionTracks=songs;collectionOwner='search';collectionName=item.title;selecting=false;selectedIndices.clear();renderCurrent();status(songs.length?'':'没有可显示的歌曲。')}catch(e){if(seq===collectionSeq)status('读取失败：'+e.message)}}
async function playMV(item){const dlg=$('#mv-dialog'),video=$('#mv-video');audio.pause();video.pause();video.removeAttribute('src');video.load();$('#mv-title').textContent=item.title;$('#mv-status').textContent='正在获取 MV 播放地址…';dlg.showModal();try{const data=await request('/weapi/song/enhance/play/mv/url',await encrypt({id:String(item.id),r:1080,csrf_token:''}),'POST');if(!dlg.open)return;const url=data.data?.url;if(!url)throw Error(data.data?.msg||'没有可用的播放地址');video.src=url;$('#mv-status').textContent='';video.play().catch(()=>{$('#mv-status').textContent='请点击视频上的播放按钮。'})}catch(e){if(dlg.open)$('#mv-status').textContent='无法播放 MV：'+e.message}}
function selectCategory(next){if(!categoryNames[next])return;category=next;collectionTracks=null;collectionResults=[];++collectionSeq;document.querySelectorAll('.category').forEach(b=>b.classList.toggle('active',b.dataset.category===next));if($('#query').value.trim())search($('#query').value);else{++searchSeq;status('');renderCurrent()}}
async function search(input){const q=input.trim();if(!q)return;const share=findPlaylistShare(q);if(share){await openSharedPlaylist(share);return}const kind=category,seq=++searchSeq;++collectionSeq;collectionTracks=null;selectView('search');status('正在搜索，请稍候…');$('#result-count').textContent='搜索中';try{const match=kind==='song'&&q.match(/(?:[?&#]id=|\/song\/)(\d+)/i);let result;if(match){const data=await request('/api/song/detail',{ids:`[${match[1]}]`});result={songs:data.songs||[]}}else{const payload=await encrypt({s:q,type:{song:1,album:10,playlist:1000,mv:1004}[kind],limit:50,offset:'0'});const data=await request('/weapi/search/get',payload,'POST');result=data.result||{}}if(seq!==searchSeq||category!==kind)return;if(kind==='song'){searchResults=(result.songs||[]).map(songFrom);if(view==='search')renderCurrent();let warning='',filled=searchResults;try{filled=await fillSongDetails(searchResults)}catch{warning='歌曲已找到，封面暂时无法获取，请检查网络。'}if(seq!==searchSeq||category!==kind)return;searchResults=filled;if(view==='search'){renderCurrent();status(warning||(searchResults.length?'':'没有搜索到结果。'))}}else{const raw=result[{album:'albums',playlist:'playlists',mv:'mvs'}[kind]]||[];collectionResults=raw.map(x=>({id:Number(x.id),title:x.name||'未知',artist:kind==='playlist'?(x.creator?.nickname||'未知用户'):(x.artist?.name||x.artistName||x.artists?.[0]?.name||'未知歌手'),cover:x.picUrl||x.coverImgUrl||x.cover||'',count:kind==='album'?x.size:kind==='playlist'?x.trackCount:0}));if(view==='search'){renderCurrent();status(collectionResults.length?'':'没有搜索到结果。')}}}catch(e){if(seq!==searchSeq||category!==kind)return;if(view==='search'){status('搜索失败：'+e.message+'。请检查网络、代理软件和原插件的代理服务是否可用。');$('#results').innerHTML=''}}}
function format(t){if(!Number.isFinite(t))return '0:00';return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
async function playSong(song,notify=false){if(!song)return;if(!serverSettings.stream){status('请先配置播放解析服务地址。');openServerSettings();return;}const video=$("#mv-video");video.pause();if($("#mv-dialog").open)$("#mv-dialog").close();current=song;const seq=++lyricSeq;lyrics=[];lyricOriginal='';lyricTranslation='';timedOriginal=[];timedTranslation=[];updateFloatingLyric();$('#lyrics').textContent=preferences.lyrics==='off'?'歌词已关闭。':'正在获取歌词…';$('#track-title').textContent=$('#bar-title').textContent=song.title;$('#track-artist').textContent=$('#bar-artist').textContent=song.artist;const cover=song.cover.replace(/^http:/,'https:');for(const id of ['artwork','mini-art']){const el=$('#'+id);el.innerHTML=cover?`<img src="${escapeHtml(cover)}" alt="专辑封面" referrerpolicy="no-referrer">`:'♫';}saveFavorites();status('正在连接歌曲解析服务…');const streamUrl=new URL(serverSettings.stream);streamUrl.searchParams.set('platform','netease');streamUrl.searchParams.set('id',String(song.id));streamUrl.searchParams.set('quality','320');streamUrl.searchParams.set('vip',String(song.fee));streamUrl.hash='.mp3';audio.src=streamUrl.href;audio.play().then(()=>{if(seq===lyricSeq){status('');if(notify)showToast('开始播放')}}).catch(()=>{if(seq===lyricSeq){status('无法播放：歌曲可能受版权或地区限制，也可能是原解析服务不可用。');if(notify)showToast('播放失败，请检查网络或解析服务')}});try{const data=song.privateSource?await accountApi('/lyric',{id:String(song.id)}):await request('/api/song/lyric',{id:String(song.id),tv:'-1',lv:'-1',kv:'-1',rv:'-1'});if(seq!==lyricSeq)return;lyricOriginal=data.lrc?.lyric||'';lyricTranslation=data.tlyric?.lyric||'';renderLyrics();}catch{if(seq===lyricSeq)$('#lyrics').textContent=preferences.lyrics==='off'?'歌词已关闭。':'歌词暂时无法获取，不影响播放。';}}
function move(step){if(!current||queueIndex<0)return;const next=queueIndex+step;if(next>=0&&next<queue.length)playQueueIndex(next)}
function updateSystemQueueControls(){
 if(!('mediaSession' in navigator))return;
 for(const [action,enabled,step] of [['previoustrack',!!current&&queueIndex>0,-1],['nexttrack',!!current&&queueIndex>=0&&queueIndex+1<queue.length,1]]){
  try{navigator.mediaSession.setActionHandler(action,enabled?()=>move(step):null)}catch{}
 }
}
function updateSystemPosition(){
 if(!('mediaSession' in navigator)||!current||!Number.isFinite(audio.duration)||audio.duration<=0)return;
 try{navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate||1,position:Math.max(0,Math.min(audio.currentTime||0,audio.duration))})}catch{}
}
function updateSystemMedia(){
 if(!('mediaSession' in navigator)||!current)return;
 const cover=String(current.cover||'').replace(/^http:/,'https:');
 try{navigator.mediaSession.metadata=new MediaMetadata({title:current.title||'未知歌曲',artist:current.artist||'未知歌手',album:current.album||'',artwork:cover?[{src:cover}]:[]})}catch{}
 navigator.mediaSession.playbackState=audio.paused?'paused':'playing';updateSystemQueueControls();updateSystemPosition();
}
function clearSystemMedia(){
 if(!('mediaSession' in navigator))return;
 navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';updateSystemQueueControls();
 try{navigator.mediaSession.setPositionState()}catch{}
}
if('mediaSession' in navigator){
 for(const [action,handler] of [
  ['play',()=>{if(current)audio.play().catch(()=>status('播放失败，请检查解析服务和网络。'));else if(queue.length)playQueueIndex(0)}],
  ['pause',()=>audio.pause()],
  ['seekto',details=>{if(Number.isFinite(details.seekTime)&&Number.isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(details.seekTime,audio.duration))}],
  ['seekbackward',details=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.max(0,audio.currentTime-(details.seekOffset||10))}],
  ['seekforward',details=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(details.seekOffset||10))}]
 ])try{navigator.mediaSession.setActionHandler(action,handler)}catch{}
 audio.addEventListener('play',updateSystemMedia);
 audio.addEventListener('pause',()=>{if(current)navigator.mediaSession.playbackState='paused'});
 for(const event of ['loadedmetadata','durationchange','timeupdate','seeked','ratechange'])audio.addEventListener(event,updateSystemPosition);
 updateSystemQueueControls();
}
$('#search-form').onsubmit=e=>{e.preventDefault();search($('#query').value)};document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>selectView(b.dataset.view));$('#favorite').onclick=()=>toggleFavorite(current);$('#play').onclick=()=>{if(!current){if(queue.length)playQueueIndex(0);else status('请先搜索并选择一首歌曲。');return;}if(audio.paused)audio.play().catch(()=>status('播放失败，请检查解析服务和网络。'));else audio.pause()};$('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1);$('#volume').oninput=e=>audio.volume=Number(e.target.value);audio.volume=.8;$('#seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value)/1000*audio.duration};audio.ontimeupdate=()=>{$('#current').textContent=format(audio.currentTime);$('#duration').textContent=format(audio.duration);$('#seek').value=Number.isFinite(audio.duration)&&audio.duration>0?audio.currentTime/audio.duration*1000:0;updateFloatingLyric();};audio.onseeked=updateFloatingLyric;audio.onplay=()=>{$('#play').textContent='❚❚';status('')};audio.onpause=()=>$('#play').textContent='▶';audio.onended=()=>{if(queueSource==='collection'&&queueIndex+1<queue.length)move(1);else $('#play').textContent='▶'};audio.onerror=()=>{if(current)status('无法加载音频：歌曲可能受版权或地区限制，也可能是原解析服务不可用。')};saveFavorites();


document.querySelectorAll('.category').forEach(b=>b.onclick=()=>selectCategory(b.dataset.category));
$('#mv-close').onclick=()=>$('#mv-dialog').close();
$('#mv-dialog').onclose=()=>{const v=$('#mv-video');v.pause();v.removeAttribute('src');v.load()};
$('#mv-video').onerror=()=>{if($('#mv-dialog').open&&$('#mv-video').getAttribute('src'))$('#mv-status').textContent='视频加载失败，请检查网络或稍后重试。'};



const settingsDialog=$('#settings-dialog');
$('#open-settings').onclick=()=>{settingsDialog.showModal();document.documentElement.classList.add('settings-open');setActiveNavigation('settings')};
$('#settings-close').onclick=()=>settingsDialog.close();
settingsDialog.addEventListener('close',()=>{document.documentElement.classList.remove('settings-open');setActiveNavigation(view)});
settingsDialog.addEventListener('click',event=>{
 if(event.target!==settingsDialog)return;
 const box=settingsDialog.getBoundingClientRect();
 if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)settingsDialog.close();
});
document.querySelectorAll('.color-swatch').forEach(b=>b.onclick=()=>{preferences.color=b.dataset.color.toLowerCase();savePreferences()});
$('#theme-color').oninput=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){preferences.color=e.target.value.toLowerCase();savePreferences()}};
$('#theme-mode').onchange=e=>{if(['system','light','dark'].includes(e.target.value)){preferences.mode=e.target.value;savePreferences()}};
$('#lyric-mode').onchange=e=>{if(['both','original','off'].includes(e.target.value)){preferences.lyrics=e.target.value;savePreferences();renderLyrics()}};
$('#open-server-settings').onclick=openServerSettings;
$('#server-later').onclick=()=>$('#server-dialog').close();
$('#server-save').onclick=()=>{try{const proxy=validServiceUrl($('#server-proxy').value.trim()),stream=validServiceUrl($('#server-stream').value.trim());localStorage.setItem(serverStorageKey,JSON.stringify({proxy,stream}));serverSettings={proxy,stream};$('#server-dialog').close()}catch(e){$('#server-status').textContent=e.message||'无法保存服务器设置。'}};
systemTheme.addEventListener('change',()=>{if(preferences.mode==='system')applyPreferences()});
applyPreferences();

$('#home-search').onclick=()=>{selectView('search');$('#query').focus()};
document.querySelectorAll('.discover-category').forEach(b=>b.onclick=()=>{discoveryCategory=b.dataset.category;document.querySelectorAll('.discover-category').forEach(x=>x.classList.toggle('active',x===b));loadHotDiscovery()});
$('#discover-daily').onclick=()=>{const signed=!!accountState.profile;selectView('account');if(signed)loadDaily();else showToast('连接网易云账号后可查看每日推荐')};
document.querySelectorAll('.nav').forEach(b=>{if(b.dataset.view==='search')b.addEventListener('click',()=>$('#query').focus())});

$('#close-lyrics').onclick=()=>{$('#lyrics-panel').hidden=true};


$('#floating-toggle').onclick=()=>{const enabled=preferences.floating&&preferences.lyrics!=='off';preferences.floating=!enabled;if(preferences.floating&&preferences.lyrics==='off')preferences.lyrics='both';savePreferences();renderLyrics()};
$('#toggle-queue').onclick=()=>{const panel=$('#queue-panel');panel.hidden=!panel.hidden;$('#toggle-queue').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){$('#lyrics-panel').hidden=true;renderQueue()}};
$('#close-queue').onclick=()=>{$('#queue-panel').hidden=true;$('#toggle-queue').setAttribute('aria-expanded','false')};
$('#clear-queue').onclick=clearQueue;
const queueList=$('#queue-list');
queueList.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button)return;const index=Number(button.dataset.index);if(button.dataset.action==='play')playQueueIndex(index);else if(button.dataset.action==='remove')removeQueueIndex(index)});
queueList.addEventListener('keydown',event=>{const handle=event.target.closest('.queue-drag');if(!handle||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const from=Number(handle.dataset.index),to=from+(event.key==='ArrowUp'?-1:1);if(to<0||to>=queue.length)return;reorderQueue(from,to);queueList.querySelector(`.queue-drag[data-index="${to}"]`)?.focus()});
queueList.addEventListener('dragstart',event=>{const row=event.target.closest('.queue-entry');if(!row)return;draggedQueueIndex=Number(row.dataset.index);if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','queue-item')}});
queueList.addEventListener('dragover',event=>{if(draggedQueueIndex!==null&&event.target.closest('.queue-entry'))event.preventDefault()});
queueList.addEventListener('drop',event=>{const row=event.target.closest('.queue-entry');if(draggedQueueIndex===null||!row)return;event.preventDefault();reorderQueue(draggedQueueIndex,Number(row.dataset.index));draggedQueueIndex=null});
queueList.addEventListener('dragend',()=>{draggedQueueIndex=null});
renderQueue();

const sidebarToggle=$('#sidebar-toggle'),sidebarResize=$('#sidebar-resize');
let sidebarWidth=230,sidebarCollapsed=false,sidebarDrag=null;
try{const width=Number(localStorage.getItem('rose-sidebar-width'));if(Number.isFinite(width)&&width>=180&&width<=420)sidebarWidth=width;sidebarCollapsed=localStorage.getItem('rose-sidebar-collapsed')==='true'}catch{}
function sidebarMaxWidth(){return Math.max(180,Math.min(420,window.innerWidth-340))}
function applySidebar(){const actual=Math.max(180,Math.min(sidebarWidth,sidebarMaxWidth()));document.documentElement.style.setProperty('--sidebar-width',actual+'px');document.documentElement.dataset.sidebar=sidebarCollapsed?'collapsed':'expanded';sidebarToggle.setAttribute('aria-expanded',String(!sidebarCollapsed));sidebarToggle.setAttribute('aria-label',sidebarCollapsed?'展开侧边栏':'收起侧边栏');sidebarToggle.title=sidebarCollapsed?'展开侧边栏':'收起侧边栏';sidebarResize.hidden=sidebarCollapsed;sidebarResize.setAttribute('aria-valuenow',String(actual));sidebarResize.setAttribute('aria-valuemax',String(sidebarMaxWidth()))}
function saveSidebar(){try{localStorage.setItem('rose-sidebar-width',String(sidebarWidth));localStorage.setItem('rose-sidebar-collapsed',String(sidebarCollapsed))}catch{}}
sidebarToggle.addEventListener('click',()=>{sidebarCollapsed=!sidebarCollapsed;applySidebar();saveSidebar()});
sidebarResize.addEventListener('pointerdown',event=>{if(sidebarCollapsed||event.button!==0)return;sidebarDrag={id:event.pointerId,start:sidebarWidth};sidebarResize.setPointerCapture(event.pointerId);document.documentElement.classList.add('resizing-sidebar');event.preventDefault()});
sidebarResize.addEventListener('pointermove',event=>{if(!sidebarDrag||event.pointerId!==sidebarDrag.id)return;sidebarWidth=Math.round(Math.max(180,Math.min(sidebarMaxWidth(),event.clientX)));applySidebar()});
function finishSidebarDrag(event,cancelled){if(!sidebarDrag||event.pointerId!==sidebarDrag.id)return;if(cancelled)sidebarWidth=sidebarDrag.start;sidebarDrag=null;document.documentElement.classList.remove('resizing-sidebar');applySidebar();if(!cancelled)saveSidebar()}
sidebarResize.addEventListener('pointerup',event=>finishSidebarDrag(event,false));sidebarResize.addEventListener('pointercancel',event=>finishSidebarDrag(event,true));
sidebarResize.addEventListener('lostpointercapture',event=>finishSidebarDrag(event,true));
sidebarResize.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const actual=Math.max(180,Math.min(sidebarWidth,sidebarMaxWidth()));sidebarWidth=Math.max(180,Math.min(sidebarMaxWidth(),actual+(event.key==='ArrowLeft'?-10:10)));applySidebar();saveSidebar()});
window.addEventListener('resize',applySidebar);applySidebar();

// Authenticated requests stay on this machine and are sent by the local
// service directly to music.163.com; the UI never receives the session cookie.
async function accountApi(endpoint,payload={}){const response=await fetch('/api/account'+endpoint,{method:'POST',headers:{'content-type':'application/json','x-rosemusic-client':'local-v1'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'账号请求失败');return data}
function accountMessage(text){$('#account-status').textContent=text||''}
function renderAccount(){
 const signed=!!accountState.profile;$('#account-signed-out').hidden=signed;$('#account-signed-in').hidden=!signed;$('#account-name').textContent=signed?accountState.profile.nickname:'';
 if(!signed)return;
 $('#account-playlists').classList.toggle('active',accountState.section==='playlists');$('#account-daily').classList.toggle('active',accountState.section==='daily');
 if(collectionOwner==='account'&&collectionTracks){renderCollection();return}
 const area=$('#account-results');
 if(!accountState.items.length){area.innerHTML='<div class="empty"><div class="empty-icon">♫</div><strong>暂无歌单</strong><p>请点击刷新，或检查账号里的歌单。</p></div>';return}
 const groups={created:[],collected:[],other:[]};
 accountState.items.forEach((p,i)=>{const owner=p.creatorId?String(p.creatorId)===String(accountState.profile.uid):(typeof p.subscribed==='boolean'?!p.subscribed:null);groups[owner===true?'created':owner===false?'collected':'other'].push({p,i})});
 const labels={created:'我创建的歌单',collected:'我收藏的歌单',other:'其他歌单'};
 area.innerHTML=['created','collected','other'].filter(key=>key!=='other'||groups[key].length).map(key=>`<section class="account-group"><button class="account-group-toggle" type="button" data-group="${key}" aria-expanded="${accountGroupsExpanded[key]}" aria-controls="account-group-${key}"><span class="account-group-arrow" aria-hidden="true">›</span><span>${labels[key]}</span><small>${groups[key].length}</small></button><div class="account-grid" id="account-group-${key}" data-group-content="${key}" ${accountGroupsExpanded[key]?'':'hidden'}>${groups[key].map(({p,i})=>`<button class="account-card" data-index="${i}" aria-label="打开 ${escapeHtml(p.title)}">${p.cover?`<img src="${escapeHtml(p.cover.replace(/^http:/,'https:'))}" alt="" referrerpolicy="no-referrer">`:'<div class="account-cover-placeholder"></div>'}<strong>${escapeHtml(p.title)}</strong><small>${escapeHtml(p.artist)}${p.count?' · '+p.count+' 首':''}</small></button>`).join('')}</div></section>`).join('');
 area.querySelectorAll('.account-group-toggle').forEach(b=>b.onclick=()=>{const key=b.dataset.group;accountGroupsExpanded[key]=!accountGroupsExpanded[key];b.setAttribute('aria-expanded',String(accountGroupsExpanded[key]));area.querySelector(`[data-group-content="${key}"]`).hidden=!accountGroupsExpanded[key]});
 area.querySelectorAll('.account-card').forEach(b=>b.onclick=()=>openAccountPlaylist(accountState.items[Number(b.dataset.index)]));
}
async function refreshAccount(){try{const data=await accountApi('/status');accountState.checked=true;accountState.profile=data.profile||null;renderAccount();if(data.profile)await loadAccountPlaylists()}catch(e){accountState.checked=true;accountState.profile=null;renderAccount();$('#account-name').textContent='';$('#account-signed-out').querySelector('p').textContent='账号状态暂时无法读取：'+e.message}}
async function loadAccountPlaylists(){
 if(!accountState.profile)return;const seq=++accountState.requestId;accountState.section='playlists';collectionTracks=null;collectionOwner='account';selecting=false;selectedIndices.clear();accountMessage('正在读取我的歌单…');renderAccount();
 try{let offset=0,items=[];for(let page=0;page<100;page++){const result=await accountApi('/playlists',{offset});if(seq!==accountState.requestId)return;items.push(...result.playlists);accountMessage('正在读取我的歌单，已获取 '+items.length+' 个…');if(!result.more||result.nextOffset<=offset)break;offset=result.nextOffset}if(seq!==accountState.requestId)return;accountState.items=items;accountMessage(items.length?'':'该账号暂时没有可显示的歌单。');if(view==='account')renderAccount()}catch(e){if(seq===accountState.requestId)accountMessage('读取歌单失败：'+e.message)}
}
async function openAccountPlaylist(item){
 if(!item?.id)return;accountPlaylistScroll=window.scrollY;const seq=++accountState.requestId;accountMessage('正在读取歌单…');
 try{let offset=0,tracks=[],name=item.title;for(let page=0;page<1000;page++){const result=await accountApi('/tracks',{id:String(item.id),offset});if(seq!==accountState.requestId)return;name=result.name||name;tracks.push(...result.tracks);accountMessage(`正在读取歌单 ${Math.min(result.nextOffset,result.total)} / ${result.total}…`);if(!result.more||result.nextOffset<=offset)break;offset=result.nextOffset}if(seq!==accountState.requestId||view!=='account')return;collectionOwner='account';collectionTracks=tracks;collectionName=name;selecting=false;selectedIndices.clear();renderAccount();accountMessage(tracks.length?'':'没有可显示的歌曲。');window.scrollTo({top:0,behavior:'instant'})}catch(e){if(seq===accountState.requestId)accountMessage('读取歌单失败：'+e.message)}
}
async function loadDaily(){if(!accountState.profile)return;const seq=++accountState.requestId;accountState.section='daily';collectionTracks=null;accountMessage('正在读取每日推荐…');renderAccount();try{const data=await accountApi('/daily');if(seq!==accountState.requestId||view!=='account')return;collectionOwner='account';collectionTracks=data.tracks||[];collectionName='每日推荐';selecting=false;selectedIndices.clear();renderAccount();accountMessage(collectionTracks.length?'':'今天暂时没有可显示的推荐。')}catch(e){if(seq===accountState.requestId)accountMessage('读取每日推荐失败：'+e.message)}}
function collectionMessage(text){if(view==='account')accountMessage(text);else status(text)}
function playCollection(mode){
 if(!collectionTracks?.length)return;let indices=selecting?[...selectedIndices].sort((a,b)=>a-b):collectionTracks.map((_,i)=>i);let tracks=indices.map(i=>collectionTracks[i]).filter(Boolean);if(!tracks.length){collectionMessage('请先选择要播放的歌曲。');return}
 if(mode==='shuffle')for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]]}
 queue=tracks.slice();queueSource='collection';queueContext=tracks.length===collectionTracks.length?collectionTracks:null;playQueueIndex(0);collectionMessage('');
}
function renderCollection(){
 const area=view==='account'?$('#account-results'):$('#results');showSongs(collectionTracks);
 const toolbar=document.createElement('div');toolbar.className='collection-toolbar';toolbar.innerHTML=`<button class="collection-action primary" data-collection="ordered">▶ ${selecting?'正序播放已选':'正序播放'}</button><button class="collection-action" data-collection="shuffle">⤨ ${selecting?'随机播放已选':'乱序播放'}</button><button class="collection-action" data-collection="select">${selecting?'取消选曲':'选择歌曲'}</button>${selecting?'<button class="collection-action" data-collection="all">全选</button><span class="collection-selection-count">已选 '+selectedIndices.size+' 首 · 勾选歌曲后点击播放已选</span>':''}`;
 toolbar.querySelector('[data-collection="ordered"]').onclick=()=>playCollection('ordered');toolbar.querySelector('[data-collection="shuffle"]').onclick=()=>playCollection('shuffle');toolbar.querySelector('[data-collection="select"]').onclick=()=>{selecting=!selecting;selectedIndices.clear();renderCollection()};const all=toolbar.querySelector('[data-collection="all"]');if(all)all.onclick=()=>{selectedIndices=new Set(collectionTracks.map((_,i)=>i));renderCollection()};
 const back=document.createElement('button');back.className='collection-back';back.textContent=view==='account'?'← 返回我的歌单':'← 返回搜索结果';back.onclick=()=>{collectionTracks=null;selecting=false;selectedIndices.clear();if(view==='account'){accountState.section='playlists';accountMessage('');renderAccount();window.scrollTo({top:accountPlaylistScroll,behavior:'instant'})}else{renderCurrent();status('')}};
 const title=document.createElement('h2');title.className='collection-title';title.textContent=collectionName+' · '+collectionTracks.length+' 首';area.prepend(toolbar);area.prepend(title);area.prepend(back);if(view==='search')$('#result-count').textContent=collectionName+' · '+collectionTracks.length+' 首';
}
async function startAccountQR(){
 const seq=++qrGeneration;clearTimeout(qrTimer);$('#account-qr').hidden=false;$('#account-qr').innerHTML='';$('#account-login-status').textContent='正在生成二维码…';
 try{const data=await accountApi('/qr/new');if(seq!==qrGeneration||!$('#account-dialog').open)return;const qr=qrcode(0,'M');qr.addData(data.url);qr.make();$('#account-qr').innerHTML=qr.createSvgTag(4,16);$('#account-login-status').textContent='请使用网易云音乐 App 扫码并确认。';const poll=async()=>{try{const state=await accountApi('/qr/check');if(seq!==qrGeneration||!$('#account-dialog').open)return;if(state.code===803){accountState.profile=state.profile;accountState.checked=true;$('#account-dialog').close();renderAccount();await loadAccountPlaylists();return}if(state.code===8821){$('#account-login-status').textContent='网易云要求额外安全验证。请展开下方说明，使用已登录网页的本机信息。';$('#account-import-help').open=true;return}if(state.code===800){$('#account-login-status').textContent='二维码已过期，请重新生成。';return}$('#account-login-status').textContent=state.code===802?'已扫码，请在手机上确认。':'请使用网易云音乐 App 扫码并确认。';qrTimer=setTimeout(poll,2000)}catch(e){if(seq===qrGeneration)$('#account-login-status').textContent='登录状态检查失败：'+e.message}};qrTimer=setTimeout(poll,2000)}catch(e){if(seq===qrGeneration)$('#account-login-status').textContent='无法生成二维码：'+e.message}
}
function openAccountDialog(){$('#account-connect-status').textContent='登录信息只在本机读取和保存，不会发给第三方解析服务。';$('#account-dialog').showModal()}
$('#account-login').onclick=openAccountDialog;$('#account-login-again').onclick=openAccountDialog;
$('#account-close').onclick=()=>$('#account-dialog').close();
$('#account-dialog').addEventListener('close',()=>{++qrGeneration;clearTimeout(qrTimer);clearTimeout(browserImportTimer);$('#account-cookie').value='';accountApi('/qr/cancel').catch(()=>{})});
$('#start-account-qr').onclick=startAccountQR;
$('#account-import').onclick=async()=>{const field=$('#account-cookie');const value=field.value;field.value='';$('#account-login-status').textContent='正在验证登录状态…';try{const data=await accountApi('/import',{cookie:value});accountState.profile=data.profile;accountState.checked=true;$('#account-dialog').close();renderAccount();await loadAccountPlaylists()}catch(e){$('#account-login-status').textContent='导入失败：'+e.message}};
$('#account-playlists').onclick=loadAccountPlaylists;$('#account-daily').onclick=loadDaily;
$('#account-refresh').onclick=()=>accountState.section==='daily'?loadDaily():loadAccountPlaylists();
$('#account-logout').onclick=async()=>{try{await accountApi('/logout');accountState={checked:true,profile:null,section:'playlists',items:[],requestId:accountState.requestId+1};collectionTracks=null;selecting=false;selectedIndices.clear();renderAccount()}catch(e){accountMessage('退出失败：'+e.message)}};
function findPlaylistShare(text){const match=String(text).match(/(?:https?:\/\/)?(?:music\.163\.com|y\.music\.163\.com|163cn\.tv)\/[^\s<>]+/i);if(!match)return null;let url;try{url=new URL(/^https?:\/\//i.test(match[0])?match[0]:'https://'+match[0])}catch{return null}if(url.hostname.toLowerCase()==='163cn.tv')return {url:url.href,short:true};const route=url.pathname+url.hash;if(!/\/playlist(?:[/?#]|$)/i.test(route))return null;const direct=url.searchParams.get('id');const hashed=url.hash.includes('?')?new URLSearchParams(url.hash.slice(url.hash.indexOf('?')+1)).get('id'):null;const pathId=route.match(/\/playlist\/(\d+)/i)?.[1];const id=direct||hashed||pathId;return /^\d{1,18}$/.test(id||'')?{id}:null}
async function openSharedPlaylist(share){
 const seq=++collectionSeq;++searchSeq;category='playlist';collectionTracks=null;collectionResults=[];document.querySelectorAll('.category').forEach(t=>t.classList.toggle('active',t.dataset.category==='playlist'));selectView('search');status('正在读取歌单链接…');
 try{if(share.short){const result=await accountApi('/resolve-share',{url:share.url});if(seq!==collectionSeq)return;share=findPlaylistShare(result.url);if(!share||share.short)throw new Error('分享链接中没有找到歌单，请使用网易云的歌单分享链接')}
 let offset=0,tracks=[],name='歌单';for(let page=0;page<1000;page++){const data=await accountApi('/tracks',{id:String(share.id),offset});if(seq!==collectionSeq)return;name=data.name||name;tracks.push(...data.tracks);status(`正在读取歌单 ${Math.min(data.nextOffset,data.total)} / ${data.total}…`);if(!data.more||data.nextOffset<=offset)break;offset=data.nextOffset}if(seq!==collectionSeq||view!=='search')return;collectionTracks=tracks;collectionOwner='search';collectionName=name;selecting=false;selectedIndices.clear();renderCollection();status(tracks.length?'':'歌单没有可显示的歌曲。');
 }catch(e){if(seq===collectionSeq)status('读取歌单失败：'+e.message+'；私人歌单请先登录网易云。')}
}

let browserImportTimer=null;
$('#browser-import').onclick=async()=>{clearTimeout(browserImportTimer);if(window.shiYinDesktop){try{const initial=await accountApi('/import-state');await window.shiYinDesktop.openChromeImport();$('#account-connect-status').textContent='请在打开的 Chrome 页面中确认导入。首次使用请先安装登录助手。';const started=Date.now();const poll=async()=>{if(!$('#account-dialog').open)return;try{const state=await accountApi('/import-state');if(state.version!==initial.version){const data=await accountApi('/status');if(!data.profile)throw new Error('未能验证网易云账号');accountState.profile=data.profile;accountState.checked=true;$('#account-dialog').close();renderAccount();await loadAccountPlaylists();return}}catch(e){$('#account-connect-status').textContent='检查登录状态失败：'+e.message;return}if(Date.now()-started<300000)browserImportTimer=setTimeout(poll,1500);else $('#account-connect-status').textContent='等待已超时，请再次点击导入。'};browserImportTimer=setTimeout(poll,1500)}catch(e){$('#account-connect-status').textContent='无法打开 Chrome：'+e.message}return}if(document.documentElement.dataset.roseLoginAssistant!=='ready'){$('#extension-help').open=true;$('#account-connect-status').textContent='未检测到登录助手。请按下方说明在 Chrome 中安装，并刷新本页。';return}$('#account-connect-status').textContent='正在从 Chrome 导入并验证登录状态…';browserImportTimer=setTimeout(()=>{$('#account-connect-status').textContent='登录助手没有响应，请确认本机播放器运行中，刷新页面后重试。'},35000)};
window.addEventListener('message',async event=>{const msg=event.data;if(event.source!==window||event.origin!==location.origin||msg?.source!=='rose-local-login-assistant'||msg.type!=='import-result'||!$('#account-dialog').open)return;clearTimeout(browserImportTimer);if(!msg.ok){$('#account-connect-status').textContent=msg.error||'导入失败，请检查网易云网页登录状态。';return}try{const data=await accountApi('/status');if(!data.profile)throw new Error('未能验证网易云账号');accountState.profile=data.profile;accountState.checked=true;$('#account-dialog').close();renderAccount();await loadAccountPlaylists()}catch(e){$('#account-connect-status').textContent='验证登录状态失败：'+e.message}});

selectView('account');

if(!serverSettings.proxy&&!serverSettings.stream)setTimeout(openServerSettings,0);
