'use strict';
// Only responds to a click relayed by the local player in the same Chrome profile.
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(message?.type!=='import-netease-session'||sender.frameId!==0||!sender.url)return false;
 let url;try{url=new URL(sender.url)}catch{return false}
 if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:'||url.port!=='8765'||!['/','/chrome-import'].includes(url.pathname))return false;
 (async()=>{
  try{
   const session=await chrome.cookies.get({url:'https://music.163.com/',name:'MUSIC_U'});
   if(!session?.value)return {ok:false,error:'当前 Chrome 尚未登录网易云网页，请先在这个 Chrome 中登录 music.163.com。'};
   const csrf=await chrome.cookies.get({url:'https://music.163.com/',name:'__csrf'});
   const cookie='MUSIC_U='+session.value+(csrf?.value?'; __csrf='+csrf.value:'');
   const response=await fetch('http://127.0.0.1:8765/api/account/browser-import',{method:'POST',headers:{'content-type':'application/json','x-rosemusic-client':'local-v1'},body:JSON.stringify({cookie}),signal:AbortSignal.timeout(30000)});
   const data=await response.json();if(!response.ok)return {ok:false,error:data.error||'导入失败，请检查网易云登录状态。'};
   return {ok:true};
  }catch{return {ok:false,error:'无法连接本机播放器，请确认播放器已启动并重试。'}}
 })().then(sendResponse);return true;
});
