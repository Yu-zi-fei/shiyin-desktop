'use strict';
const status=document.querySelector('#status');
setTimeout(()=>{if(document.documentElement.dataset.roseLoginAssistant!=='ready')status.textContent='未检测到登录助手。请按拾音窗口中的说明安装或重新加载扩展，然后刷新本页。';else status.textContent='登录助手已就绪。';},500);
document.querySelector('#browser-import').addEventListener('click',()=>{status.textContent=document.documentElement.dataset.roseLoginAssistant==='ready'?'正在验证登录状态…':'未检测到登录助手，请先安装并刷新本页。';});
window.addEventListener('message',event=>{const m=event.data;if(event.source!==window||event.origin!==location.origin||m?.source!=='rose-local-login-assistant'||m.type!=='import-result')return;status.textContent=m.ok?'导入成功！请回到拾音，可以关闭此页面。':(m.error||'导入失败，请检查网易云登录状态。');});
