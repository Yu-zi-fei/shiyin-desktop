const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('shiYinDesktop',{openChromeImport:()=>ipcRenderer.invoke('open-chrome-import')});
