'use strict';
const {app,BrowserWindow,dialog,ipcMain,shell}=require('electron');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
let child,win,quitting=false;
app.setName('拾音公开版');
if(process.platform==='win32')app.setAppUserModelId('com.shiyin.public');
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(()=>{
  if(process.platform==='win32'&&app.isPackaged&&process.env.SHIYIN_SKIP_SHORTCUT!=='1'){
   const shortcut=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','拾音公开版.lnk');
   const options={target:process.execPath,cwd:path.dirname(process.execPath),description:'拾音音乐播放器',icon:path.join(__dirname,'icon.ico'),iconIndex:0,appUserModelId:'com.shiyin.public'};
   try{if(!fs.existsSync(shortcut)||shell.readShortcutLink(shortcut).appUserModelId===options.appUserModelId)shell.writeShortcutLink(shortcut,'create',options)}catch{}
  }
  child=spawn(process.execPath,[path.join(__dirname,'server.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',HOST:'127.0.0.1',PORT:'8765'},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  child.on('message',m=>{if(m.type==='error'){dialog.showErrorBox('拾音无法启动','本地服务无法启动，请关闭旧版拾音后重试。\n'+m.message);app.quit();}else if(m.type==='ready'){
   win=new BrowserWindow({title:'拾音',icon:path.join(__dirname,'icon.ico'),width:1280,height:850,minWidth:850,minHeight:600,show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!=='http://127.0.0.1:8765')event.preventDefault();});
   win.once('ready-to-show',()=>win.show());win.loadURL('http://127.0.0.1:8765/');
  }});
  child.on('error',e=>{dialog.showErrorBox('拾音无法启动',e.message);app.quit();});
  child.on('exit',()=>{if(!quitting){dialog.showErrorBox('拾音已停止','本地服务意外退出，请重新打开拾音。');app.quit();}});
 });
 ipcMain.handle('open-chrome-import',()=>{
  const candidates=[path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Google/Chrome/Application/chrome.exe'),path.join(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe')];
  const chrome=candidates.find(p=>fs.existsSync(p));if(!chrome)throw new Error('未找到 Google Chrome，请先安装 Chrome。');
  const p=spawn(chrome,['http://127.0.0.1:8765/chrome-import'],{detached:true,stdio:'ignore'});p.unref();return true;
 });
 app.on('before-quit',()=>{quitting=true;if(child&&!child.killed)child.kill();});
 app.on('window-all-closed',()=>app.quit());
}
