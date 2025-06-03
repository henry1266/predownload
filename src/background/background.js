// 頁面監測版本 - 背景腳本 (修正版)
// 處理擴充功能的全局狀態管理和自動儲存功能

// 全域變數
let monitoringTabs = new Map(); // 記錄正在監測的標籤頁
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5000; // 通知冷卻時間 5 秒

// 使用 ImageData 直接操作像素數據來創建圖示
// 適用於 service worker 環境

// 監測狀態常數
const ICON_STATUS = {
  STOPPED: 'stopped',      // 紅色 - 停止監測
  WAITING: 'waiting',      // 黃色 - 開始監測但尚未跳轉成功
  SUCCESS: 'success'       // 綠色 - 跳轉成功
};

// 創建綠色成功圖示 (跳轉成功)
function createSuccessIcon() {
  const size = 19;
  const data = new Uint8ClampedArray(size * size * 4); // RGBA 數據
  
  // 創建一個 ImageData 對象
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      
      // 計算像素到中心的距離
      const distanceToCenter = Math.sqrt(Math.pow(x - size/2, 2) + Math.pow(y - size/2, 2));
      
      if (distanceToCenter <= size/2) {
        // 綠色圓形背景 (#4CAF50)
        data[index] = 76;     // R
        data[index + 1] = 175; // G
        data[index + 2] = 80;  // B
        data[index + 3] = 255; // A (完全不透明)
        
        // 繪製白色播放圖示 (三角形)
        const trianglePoints = [
          {x: 7, y: 6},
          {x: 7, y: 13},
          {x: 14, y: 9.5}
        ];
        
        // 檢查點是否在三角形內
        if (isPointInTriangle({x, y}, trianglePoints[0], trianglePoints[1], trianglePoints[2])) {
          data[index] = 255;     // R
          data[index + 1] = 255; // G
          data[index + 2] = 255; // B
        }
      } else {
        // 透明背景
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
      }
    }
  }
  
  return new ImageData(data, size, size);
}

// 創建黃色等待圖示 (開始監測但尚未跳轉成功)
function createWaitingIcon() {
  const size = 19;
  const data = new Uint8ClampedArray(size * size * 4); // RGBA 數據
  
  // 創建一個 ImageData 對象
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      
      // 計算像素到中心的距離
      const distanceToCenter = Math.sqrt(Math.pow(x - size/2, 2) + Math.pow(y - size/2, 2));
      
      if (distanceToCenter <= size/2) {
        // 黃色圓形背景 (#FFC107)
        data[index] = 255;    // R
        data[index + 1] = 193; // G
        data[index + 2] = 7;   // B
        data[index + 3] = 255; // A (完全不透明)
        
        // 繪製白色播放圖示 (三角形)
        const trianglePoints = [
          {x: 7, y: 6},
          {x: 7, y: 13},
          {x: 14, y: 9.5}
        ];
        
        // 檢查點是否在三角形內
        if (isPointInTriangle({x, y}, trianglePoints[0], trianglePoints[1], trianglePoints[2])) {
          data[index] = 255;     // R
          data[index + 1] = 255; // G
          data[index + 2] = 255; // B
        }
      } else {
        // 透明背景
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
      }
    }
  }
  
  return new ImageData(data, size, size);
}

// 創建紅色停止圖示 (停止監測)
function createStoppedIcon() {
  const size = 19;
  const data = new Uint8ClampedArray(size * size * 4); // RGBA 數據
  
  // 創建一個 ImageData 對象
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      
      // 計算像素到中心的距離
      const distanceToCenter = Math.sqrt(Math.pow(x - size/2, 2) + Math.pow(y - size/2, 2));
      
      if (distanceToCenter <= size/2) {
        // 紅色圓形背景 (#F44336)
        data[index] = 244;    // R
        data[index + 1] = 67;  // G
        data[index + 2] = 54;  // B
        data[index + 3] = 255; // A (完全不透明)
        
        // 繪製白色 X 圖示
        const lineWidth = 2;
        const x1 = 6, y1 = 6, x2 = 13, y2 = 13;
        const x3 = 13, y3 = 6, x4 = 6, y4 = 13;
        
        // 檢查點是否在線段附近
        if (isPointNearLine({x, y}, {x: x1, y: y1}, {x: x2, y: y2}, lineWidth) ||
            isPointNearLine({x, y}, {x: x3, y: y3}, {x: x4, y: y4}, lineWidth)) {
          data[index] = 255;     // R
          data[index + 1] = 255; // G
          data[index + 2] = 255; // B
        }
      } else {
        // 透明背景
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
      }
    }
  }
  
  return new ImageData(data, size, size);
}

// 輔助函數：檢查點是否在三角形內
function isPointInTriangle(pt, v1, v2, v3) {
  function sign(p1, p2, p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  }
  
  const d1 = sign(pt, v1, v2);
  const d2 = sign(pt, v2, v3);
  const d3 = sign(pt, v3, v1);
  
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  
  return !(hasNeg && hasPos);
}

// 輔助函數：檢查點是否在線段附近
function isPointNearLine(pt, v1, v2, maxDistance) {
  function distToSegmentSquared(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
    
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    
    return Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + 
           Math.pow(p.y - (v.y + t * (w.y - v.y)), 2);
  }
  
  return Math.sqrt(distToSegmentSquared(pt, v1, v2)) <= maxDistance;
}

// 監聽擴充功能安裝事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('醫療資料頁面監測工具已安裝 (修正版)');
  
  // 設置預設設定
  chrome.storage.local.set({
    autoSave: true,
    notificationEnabled: true,
    monitoringEnabled: false,
    lastProcessedData: null
  });
  
  // 初始化設置停止狀態圖示 (紅色)
  const imageData = createStoppedIcon();
  chrome.action.setIcon({ imageData });
  console.log('初始化設置圖示為停止狀態 (紅色)');
});

// 監聽來自內容腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('背景腳本收到消息:', message.action);
  
  switch (message.action) {
    case 'captureAndExtract':
      handleCaptureAndExtract(sender.tab.id, sendResponse);
      return true; // 非同步回應
      
    case 'dataChanged':
      handleDataChanged(message.data, sender.tab.id);
      sendResponse({ success: true });
      break;
      
    case 'getMonitoringStatus':
      const tabId = sender.tab.id;
      sendResponse({
        isMonitoring: monitoringTabs.has(tabId),
        tabInfo: monitoringTabs.get(tabId) || null
      });
      break;
      
    case 'updateMonitoringStatus':
      updateMonitoringStatus(sender.tab.id, message.status);
      sendResponse({ success: true });
      break;
      
    case 'updateBrowserIcon':
      // 處理來自popup的icon更新請求
      if (message.status === 'monitoring') {
        // 監測中 - 設置為綠色
        const imageData = createSuccessIcon();
        chrome.action.setIcon({ imageData });
        console.log('設置瀏覽器icon為綠色（監測中）');
      } else if (message.status === 'stopped') {
        // 停止監測 - 設置為紅色
        const imageData = createStoppedIcon();
        chrome.action.setIcon({ imageData });
        console.log('設置瀏覽器icon為紅色（監測停止）');
      }
      sendResponse({ success: true });
      break;
      
    case 'startMonitoring':
      console.log(`標籤頁 ${sender.tab.id} 開始監測`);
      // 開始監測時設置為等待狀態（黃色），jumpSuccess 為 false
      updateMonitoringStatus(sender.tab.id, { 
        isMonitoring: true, 
        jumpSuccess: false 
      });
      sendResponse({ success: true });
      break;
      
    case 'stopMonitoring':
      console.log(`標籤頁 ${sender.tab.id} 停止監測`);
      monitoringTabs.delete(sender.tab.id);
      // 檢查是否還有其他標籤頁在監測中
      if (monitoringTabs.size === 0) {
        // 停止監測時設置為紅色
        const imageData = createStoppedIcon();
        chrome.action.setIcon({ imageData });
      }
      sendResponse({ success: true });
      break;
      
    default:
      console.log('未知的消息類型:', message.action);
      sendResponse({ success: false, message: '未知的消息類型' });
  }
  
  return true;
});


// 處理資料變化通知（自動觸發）
async function handleDataChanged(data, tabId) {
  try {
    console.log('處理資料變化通知，標籤頁ID:', tabId);
    console.log('資料筆數:', data.tableData ? data.tableData.length : 0);
    
    // 檢查是否啟用自動儲存
    const settings = await chrome.storage.local.get(['autoSave', 'notificationEnabled']);
    
    // 檢查是否為跳轉成功的觸發
    const isJumpSuccess = data.trigger === 'url_jump';
    
    if (settings.autoSave !== false) { // 預設啟用
      console.log('自動儲存已啟用，開始儲存資料...');
      
      // 構造與手動擷取相同的資料格式
      const extractedData = {
        success: true,
        tableData: data.tableData,
        personalInfo: data.personalInfo,
        timestamp: data.timestamp,
        message: `自動檢測到 ${data.tableData.length} 筆新資料`
      };
      
      // 自動儲存資料
      const saveResult = await saveExtractedData(extractedData, tabId);
      
      if (saveResult.success) {
        console.log('自動儲存成功');
        
        // 顯示通知（如果啟用且不在冷卻期間）
        if (settings.notificationEnabled !== false) {
          const now = Date.now();
          if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
            showNotification(
              '檢測到新資料', 
              `自動擷取並儲存了 ${data.tableData.length} 筆新資料`, 
              'success'
            );
            lastNotificationTime = now;
          }
        }
        
        // 更新監測狀態，如果是跳轉成功，設置 jumpSuccess 為 true（綠色）
        updateMonitoringStatus(tabId, {
          lastActivity: data.timestamp,
          lastDataCount: data.tableData.length,
          totalProcessed: (monitoringTabs.get(tabId)?.totalProcessed || 0) + 1,
          jumpSuccess: isJumpSuccess // 跳轉成功時設為 true，顯示綠色圖示
        });
        
        console.log(`圖示狀態更新: ${isJumpSuccess ? '跳轉成功(綠色)' : '一般監測(黃色)'}`);
        
      } else {
        console.error('自動儲存失敗:', saveResult.error);
        showNotification('自動儲存失敗', saveResult.error, 'error');
      }
    } else {
      console.log('自動儲存已停用，僅顯示通知');
      
      // 即使不儲存資料，也更新監測狀態和圖示
      updateMonitoringStatus(tabId, {
        lastActivity: data.timestamp,
        jumpSuccess: isJumpSuccess // 跳轉成功時設為 true，顯示綠色圖示
      });
      
      console.log(`圖示狀態更新: ${isJumpSuccess ? '跳轉成功(綠色)' : '一般監測(黃色)'}`);
      
      if (settings.notificationEnabled !== false) {
        const now = Date.now();
        if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
          showNotification(
            '檢測到新資料', 
            `發現 ${data.tableData.length} 筆新資料（自動儲存已停用）`, 
            'info'
          );
          lastNotificationTime = now;
        }
      }
    }
    
  } catch (error) {
    console.error('處理資料變化時發生錯誤:', error);
    showNotification('處理錯誤', '處理資料變化時發生錯誤', 'error');
  }
}

// 儲存擷取的資料
async function saveExtractedData(extractedData, tabId) {
  try {
    console.log('開始儲存擷取的資料...');
    
    // 生成時間戳記（yyyy-mm-dd_hh-mm-ss 格式）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    const timeStamp = `${year}-${month}-${day}_${hour}-${minute}-${second}`;
    
    // 獲取標籤頁資訊
    let tabInfo;
    try {
      tabInfo = await chrome.tabs.get(tabId);
    } catch (error) {
      console.warn('無法獲取標籤頁資訊:', error);
      tabInfo = { url: 'unknown', title: 'unknown' };
    }
    
    // 從個人資料中獲取姓名
    let personName = '未知姓名';
    if (extractedData.personalInfo && extractedData.personalInfo.name) {
      personName = extractedData.personalInfo.name;
    } else {
      // 嘗試從其他可能的欄位獲取姓名
      const personalInfo = extractedData.personalInfo || {};
      const possibleNameFields = ['姓名', 'name', 'userName', 'patientName', '病患姓名'];
      
      for (const field of possibleNameFields) {
        if (personalInfo[field] && personalInfo[field].trim() !== '') {
          personName = personalInfo[field].trim();
          break;
        }
      }
    }
    
    // 清理檔案名稱中的無效字符
    personName = personName.replace(/[<>:"/\\|?*]/g, '_').trim();
    if (personName === '' || personName === '_') {
      personName = '未知姓名';
    }
    
    // JSON 檔案名稱：時間戳記_姓名.json
    const jsonFilename = `${timeStamp}_${personName}.json`;
    
    console.log('準備 JSON 資料...');
    const jsonData = {
      metadata: {
        extractedAt: extractedData.timestamp || new Date().toISOString(),
        source: {
          url: tabInfo.url,
          title: tabInfo.title
        },
        dataCount: extractedData.tableData ? extractedData.tableData.length : 0,
        version: '2.0.7',
        filename: jsonFilename,
        personName: personName
      },
      personalInfo: extractedData.personalInfo,
      tableData: extractedData.tableData
    };
    
    console.log('下載 JSON 檔案:', jsonFilename);
    const jsonDataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(jsonData, null, 2));
    
    try {
      await chrome.downloads.download({
        url: jsonDataUrl,
        filename: jsonFilename,
        saveAs: false
      });
      console.log('JSON 檔案下載成功:', jsonFilename);
    } catch (jsonError) {
      console.error('JSON 檔案下載失敗:', jsonError);
      throw new Error('JSON 檔案下載失敗: ' + jsonError.message);
    }
    
    console.log('檔案儲存成功:', jsonFilename);
    
    // 儲存到本地存儲（用於歷史記錄）
    const historyData = {
      timestamp: extractedData.timestamp || new Date().toISOString(),
      dataCount: extractedData.tableData ? extractedData.tableData.length : 0,
      source: tabInfo.url,
      filename: jsonFilename,
      personName: personName,
      files: [jsonFilename]
    };
    
    // 獲取現有歷史記錄
    const result = await chrome.storage.local.get(['extractionHistory']);
    const history = result.extractionHistory || [];
    
    // 添加新記錄（保留最近 50 筆）
    history.unshift(historyData);
    if (history.length > 50) {
      history.splice(50);
    }
    
    // 儲存更新的歷史記錄
    await chrome.storage.local.set({ 
      extractionHistory: history,
      lastExtraction: historyData
    });
    
    console.log('歷史記錄已更新');
    
    return { 
      success: true, 
      filename: jsonFilename,
      personName: personName,
      files: [jsonFilename],
      dataCount: extractedData.tableData ? extractedData.tableData.length : 0
    };
    
  } catch (error) {
    console.error('儲存資料時發生錯誤:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// 顯示系統通知
function showNotification(title, message, type = 'info') {
  try {
    // 根據類型選擇圖示
    let iconPath;
    switch (type) {
      case 'success':
        iconPath = 'assets/icon48.png';
        break;
      case 'error':
        iconPath = 'assets/icon48.png';
        break;
      default:
        iconPath = 'assets/icon48.png';
    }
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconPath,
      title: title,
      message: message,
      priority: type === 'error' ? 2 : 1
    });
    
    console.log(`通知已顯示: ${title} - ${message}`);
  } catch (error) {
    console.error('顯示通知時發生錯誤:', error);
  }
}

// 更新監測狀態
function updateMonitoringStatus(tabId, status) {
  try {
    const currentStatus = monitoringTabs.get(tabId) || {
      startTime: new Date().toISOString(),
      totalProcessed: 0
    };
    
    // 合併狀態
    const updatedStatus = {
      ...currentStatus,
      ...status,
      lastUpdate: new Date().toISOString()
    };
    
    monitoringTabs.set(tabId, updatedStatus);
    console.log(`標籤頁 ${tabId} 監測狀態已更新:`, updatedStatus);
    
    // 更新瀏覽器圖示狀態
    updateBrowserIcon(tabId, updatedStatus);
  } catch (error) {
    console.error('更新監測狀態時發生錯誤:', error);
  }
}

// 更新瀏覽器圖示狀態
function updateBrowserIcon(tabId, status) {
  try {
    // 檢查監測狀態
    const tabStatus = monitoringTabs.get(tabId);
    const isMonitoring = status && tabStatus;
    
    // 根據監測狀態設置圖示
    if (!isMonitoring) {
      // 停止監測 - 紅色
      console.log(`設置標籤頁 ${tabId} 的圖示為停止狀態 (紅色)`);
      const imageData = createStoppedIcon();
      chrome.action.setIcon({ imageData });
    } else if (tabStatus.jumpSuccess) {
      // 跳轉成功 - 綠色
      console.log(`設置標籤頁 ${tabId} 的圖示為跳轉成功狀態 (綠色)`);
      const imageData = createSuccessIcon();
      chrome.action.setIcon({ imageData });
    } else {
      // 開始監測但尚未跳轉成功 - 黃色
      console.log(`設置標籤頁 ${tabId} 的圖示為等待跳轉狀態 (黃色)`);
      const imageData = createWaitingIcon();
      chrome.action.setIcon({ imageData });
    }
  } catch (error) {
    console.error('更新瀏覽器圖示時發生錯誤:', error);
    // 發生錯誤時使用預設圖示
    chrome.action.setIcon({
      path: {
        16: 'assets/icon16.png',
        48: 'assets/icon48.png',
        128: 'assets/icon128.png'
      }
    });
  }
}

// 監聽標籤頁關閉事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (monitoringTabs.has(tabId)) {
    console.log(`標籤頁 ${tabId} 已關閉，清理監測狀態`);
    monitoringTabs.delete(tabId);
    
    // 檢查是否還有其他標籤頁在監測中
    if (monitoringTabs.size === 0) {
      // 所有監測標籤頁都已關閉，設置為停止狀態 (紅色)
      const imageData = createStoppedIcon();
      chrome.action.setIcon({ imageData });
      console.log('所有監測標籤頁已關閉，設置圖示為停止狀態 (紅色)');
    }
  }
});

// 監聽標籤頁更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 當標籤頁 URL 變化時，檢查是否需要重新初始化監測
  if (changeInfo.url && monitoringTabs.has(tabId)) {
    console.log(`標籤頁 ${tabId} URL 已變化:`, changeInfo.url);
    
    // 如果 URL 變化到非相關頁面，停止監測
    if (!changeInfo.url.includes('medcloud2.nhi.gov.tw')) {
      console.log(`標籤頁 ${tabId} 已離開監測範圍，停止監測`);
      monitoringTabs.delete(tabId);
    }
  }
});

// 處理擴充功能圖示點擊事件
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 檢查是否為可監測的頁面
    const url = tab.url;
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
      // 在不支援的頁面上顯示說明
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icon48.png',
        title: '無法在此頁面使用',
        message: '此工具無法在瀏覽器內建頁面上運行，請切換到一般網站後再試。'
      });
      return;
    }
    
    // 嘗試與內容腳本通信
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    } catch (error) {
      // 如果通信失敗，嘗試注入內容腳本
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content.js']
        });
        
        // 等待腳本載入
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (injectError) {
        console.error('注入內容腳本失敗:', injectError);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon48.png',
          title: '無法載入功能',
          message: '無法在此頁面載入監測功能，請重新整理頁面後再試。'
        });
        return;
      }
    }
    
    console.log('擴充功能圖示被點擊，標籤頁ID:', tab.id);
  } catch (error) {
    console.error('處理圖示點擊時發生錯誤:', error);
  }
});

// 定期清理過期的監測狀態
setInterval(() => {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24 小時
  
  for (const [tabId, status] of monitoringTabs.entries()) {
    const lastUpdate = new Date(status.lastUpdate || status.startTime).getTime();
    if (now - lastUpdate > expireTime) {
      console.log(`清理過期的監測狀態，標籤頁ID: ${tabId}`);
      monitoringTabs.delete(tabId);
    }
  }
}, 60 * 60 * 1000); // 每小時檢查一次

console.log('醫療資料頁面監測工具背景腳本已載入 (修正版)');

