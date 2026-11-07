'use strict';
if(location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)&&location.port==='8765'&&['/','/chrome-import'].includes(location.pathname)){
 document.documentElement.dataset.roseLoginAssistant='ready';
 document.addEventListener('click',event=>{
  if(!event.isTrusted||!event.target.closest?.('#browser-import'))return;
  chrome.runtime.sendMessage({type:'import-netease-session'},result=>{
   const error=chrome.runtime.lastError;
   window.postMessage({source:'rose-local-login-assistant',type:'import-result',ok:!!result?.ok,error:error?'登录助手暂不可用，请刷新页面后重试。':result?.error||''},location.origin);
  });
 });
}
