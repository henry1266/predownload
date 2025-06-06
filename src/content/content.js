// 頁面監測版本 - 內容腳本 (URL 跳轉監測版 + 狀態持久化)
// 監測頁面在失敗頁面和成功頁面之間的跳轉，並在成功跳轉時自動執行資料擷取

// 監測配置
const MONITOR_CONFIG = {
  startUrl: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/#',     // 失敗頁面
  targetUrls: [
    'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0008',      // 目標頁面1
    'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0060'       // 目標頁面2
  ],
  urlCheckInterval: 500,    // URL 檢查間隔 (毫秒)
  dataCheckDelay: 2000,     // 跳轉後延遲檢查資料的時間
  maxRetries: 3,            // 最大重試次數
  cooldownPeriod: 10000,    // 冷卻期間 (10秒) - 增加避免重複觸發
  persistenceKey: 'monitoring_state' // 持久化狀態的鍵值
};;

// 全域變數
let isMonitoring = false;
let urlCheckInterval = null;
let currentUrl = window.location.href;
let jumpCount = 0;
let successfulJumps = 0;
let lastDataSnapshot = null;
let lastProcessedHash = null;
let lastProcessedTime = 0;
let retryCount = 0;

// 頁面載入時檢查並恢復監測狀態
document.addEventListener('DOMContentLoaded', function() {
  console.log('頁面載入完成，檢查監測狀態...');
  restoreMonitoringState();
});

// 如果 DOMContentLoaded 已經觸發，立即執行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('頁面載入完成，檢查監測狀態...');
    restoreMonitoringState();
  });
} else {
  console.log('頁面已載入，立即檢查監測狀態...');
  restoreMonitoringState();
}

// 恢復監測狀態
async function restoreMonitoringState() {
  try {
    console.log('嘗試恢復監測狀態...');
    
    // 從 chrome.storage 獲取監測狀態
    const result = await chrome.storage.local.get([MONITOR_CONFIG.persistenceKey]);
    const savedState = result[MONITOR_CONFIG.persistenceKey];
    
    if (savedState && savedState.isMonitoring) {
      console.log('發現已儲存的監測狀態，正在恢復...');
      console.log('儲存的狀態:', savedState);
      
      // 檢查狀態是否過期（超過 1 小時自動失效）
      const now = Date.now();
      const stateAge = now - (savedState.timestamp || 0);
      const maxAge = 60 * 60 * 1000; // 1 小時
      
      if (stateAge > maxAge) {
        console.log('監測狀態已過期，清除狀態');
        await clearMonitoringState();
        return;
      }
      
      // 恢復監測狀態
      jumpCount = savedState.jumpCount || 0;
      successfulJumps = savedState.successfulJumps || 0;
      lastDataSnapshot = savedState.lastDataSnapshot || null;
      lastProcessedHash = savedState.lastProcessedHash || null;
      lastProcessedTime = savedState.lastProcessedTime || 0;
      
      // 重新開始監測
      console.log('重新開始監測...');
      startMonitoring();
      
      // 顯示恢復通知
      notifyUser('雲端擷取小幫手運作中', 'success');
      
      // 如果當前在目標頁面，立即檢查一次資料
      if (isOnTargetPage()) {
        console.log('當前在目標頁面，立即檢查資料...');
        setTimeout(() => {
          checkDataAfterSuccessfulJump();
        }, 1000);
      }
      
    } else {
      console.log('沒有找到監測狀態，或監測已停止');
    }
  } catch (error) {
    console.error('恢復監測狀態時發生錯誤:', error);
  }
}

// 儲存監測狀態
async function saveMonitoringState() {
  try {
    const state = {
      isMonitoring: isMonitoring,
      jumpCount: jumpCount,
      successfulJumps: successfulJumps,
      lastDataSnapshot: lastDataSnapshot,
      lastProcessedHash: lastProcessedHash,
      lastProcessedTime: lastProcessedTime,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    await chrome.storage.local.set({
      [MONITOR_CONFIG.persistenceKey]: state
    });
    
    console.log('監測狀態已儲存:', state);
  } catch (error) {
    console.error('儲存監測狀態時發生錯誤:', error);
  }
}

// 清除監測狀態
async function clearMonitoringState() {
  try {
    await chrome.storage.local.remove([MONITOR_CONFIG.persistenceKey]);
    console.log('監測狀態已清除');
  } catch (error) {
    console.error('清除監測狀態時發生錯誤:', error);
  }
}

// 監聽來自背景腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractTableData') {
    console.log('收到擷取表格資料的請求');
    handleDataExtraction(sendResponse);
    return true; // 非同步回應
  } else if (message.action === 'startMonitoring') {
    console.log('收到開始監測的請求');
    startMonitoring();
    sendResponse({ success: true, message: '開始監測過卡' });
  } else if (message.action === 'stopMonitoring') {
    console.log('收到停止監測的請求');
    stopMonitoring();
    sendResponse({ success: true, message: '停止監測' });
  } else if (message.action === 'getMonitorStatus') {
    sendResponse({ 
      isMonitoring: isMonitoring,
      currentUrl: window.location.href,
      isOnTargetPage: isOnTargetPage(),
      isOnStartPage: isOnStartPage(),
      lastProcessed: lastProcessedTime ? new Date(lastProcessedTime).toISOString() : null,
      jumpCount: jumpCount,
      successfulJumps: successfulJumps
    });
  } else if (message.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
  }
  return true;
});

// 開始監測
function startMonitoring() {
  if (isMonitoring) {
    console.log('監測已在進行中');
    return;
  }
  
  //console.log('開始監測 URL 跳轉...');
  isMonitoring = true;
  currentUrl = window.location.href;
  
  // 儲存監測狀態
  saveMonitoringState();
  
  // 如果當前在目標頁面，立即檢查一次資料
  if (isOnTargetPage()) {
    console.log('當前在目標頁面，立即檢查資料...');
    setTimeout(() => {
      checkDataAfterSuccessfulJump();
    }, MONITOR_CONFIG.dataCheckDelay);
  }
  
  // 開始 URL 監測循環
  urlCheckInterval = setInterval(() => {
    checkUrlChange();
  }, MONITOR_CONFIG.urlCheckInterval);
  
  //console.log('URL 跳轉監測已啟動');
  notifyUser('開始監測過卡', 'success');
}

// 停止監測
function stopMonitoring() {
  if (!isMonitoring) {
    console.log('監測未在進行中');
    return;
  }
  
  console.log('停止監測');
  isMonitoring = false;
  
  // 清除監測狀態
  clearMonitoringState();
  
  // 停止 URL 檢查
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
    urlCheckInterval = null;
  }
  
  // 重置統計
  jumpCount = 0;
  successfulJumps = 0;
  retryCount = 0;

}

// 檢查 URL 變化
function checkUrlChange() {
  const newUrl = window.location.href;
  
  if (newUrl !== currentUrl) {
    jumpCount++;
    
    // 儲存更新的狀態
    saveMonitoringState();
    
    if (isUrlTargetPage(newUrl)) {
      successfulJumps++;
      console.log(`🎯 成功跳轉到目標頁面！(第 ${successfulJumps} 次)`);
      notifyUser(`成功跳轉到目標頁面！(第 ${successfulJumps} 次)`, 'success');
      
      // 延遲檢查資料，確保頁面完全載入
      setTimeout(() => {
        if (isMonitoring && isOnTargetPage()) {
          checkDataAfterSuccessfulJump();
        }
      }, MONITOR_CONFIG.dataCheckDelay);
      
    } else if (isUrlStartPage(newUrl)) {
      console.log('↩️ 跳轉回起始頁面，繼續等待下次成功跳轉');
      //notifyUser('跳轉回起始頁面，繼續等待下次成功跳轉', 'info');
    } else {
      console.log('🔄 頁面跳轉中...');
      //notifyUser('頁面跳轉中...', 'info');
    }
    
    currentUrl = newUrl;
  }
}

// 檢查是否在目標頁面
function isOnTargetPage() {
  const url = window.location.href;
  return url.includes('/IMUE0008') || url.includes('/IMUE0060');
}

// 檢查是否在起始頁面
function isOnStartPage() {
  const url = window.location.href;
  return url.includes('/imu/IMUE1000/#') || url.endsWith('/imu/IMUE1000/');
}

// 檢查是否為相關頁面
function isRelevantPage() {
  const url = window.location.href;
  return url.includes('medcloud2.nhi.gov.tw/imu/IMUE1000/');
}

// 檢查 URL 是否為目標頁面
function isUrlTargetPage(url) {
  return url.includes('/IMUE0008') || url.includes('/IMUE0060');
}

// 檢查 URL 是否為起始頁面
function isUrlStartPage(url) {
  return url.includes('/imu/IMUE1000/#') || url.endsWith('/imu/IMUE1000/');
}

// 成功跳轉後檢查資料
function checkDataAfterSuccessfulJump() {
  try {
    console.log('=== 開始檢查跳轉後的資料 ===');
    console.log('當前 URL:', window.location.href);
    console.log('是否在目標頁面:', isOnTargetPage());
    
    // 檢查是否在冷卻期間
    const now = Date.now();
    if (lastProcessedTime && (now - lastProcessedTime) < MONITOR_CONFIG.cooldownPeriod) {
      const remainingTime = Math.ceil((MONITOR_CONFIG.cooldownPeriod - (now - lastProcessedTime)) / 1000);
      console.log(`在冷卻期間，還需等待 ${remainingTime} 秒`);
      notifyUser(`冷卻期間，等待 ${remainingTime} 秒`, 'warning');
      return;
    }

    console.log('開始擷取表格資料...');
    const currentTableData = extractTableData();
    console.log('表格資料擷取結果:', currentTableData ? `${currentTableData.length} 筆` : '無資料');
    
    console.log('開始擷取個人資料...');
    const currentPersonalInfo = getPersonalInfo();
    console.log('個人資料擷取結果:', currentPersonalInfo ? '已擷取' : '無資料');
    
    // 檢查是否有實際資料
    if (!currentTableData || currentTableData.length === 0) {
      console.log('跳轉後未找到表格資料，可能頁面還在載入中');
      
      // 重試機制
      retryCount++;
      if (retryCount < MONITOR_CONFIG.maxRetries) {
        console.log(`重試檢查資料 (${retryCount}/${MONITOR_CONFIG.maxRetries})`);
        notifyUser(`重試檢查資料 (${retryCount}/${MONITOR_CONFIG.maxRetries})`, 'info');
        setTimeout(() => {
          if (isMonitoring && isOnTargetPage()) {
            checkDataAfterSuccessfulJump();
          }
        }, 2000);
      } else {
        console.log('達到最大重試次數，跳過此次檢查');
        notifyUser('達到最大重試次數，未找到資料', 'warning');
        retryCount = 0;
      }
      return;
    }
    
    console.log('找到表格資料，開始比較雜湊值...');
    const currentHash = generateDataHash(currentTableData, currentPersonalInfo);
    console.log('當前資料雜湊:', currentHash);
    console.log('上次快照雜湊:', lastDataSnapshot ? lastDataSnapshot.hash : 'null');
    console.log('上次處理雜湊:', lastProcessedHash || 'null');
    
    // 比較雜湊值
    if (!lastDataSnapshot || currentHash !== lastDataSnapshot.hash) {
      // 再次檢查是否與最後處理的資料相同
      if (lastProcessedHash === currentHash) {
        console.log('資料與最後處理的相同，跳過重複處理');
        notifyUser('資料未變化，跳過重複處理', 'info');
        return;
      }
      
      console.log('🎉 跳轉後檢測到新資料!');
      console.log('舊雜湊:', lastDataSnapshot ? lastDataSnapshot.hash : 'null');
      console.log('新雜湊:', currentHash);
      console.log('資料筆數:', currentTableData.length);
      
      // 更新快照
      updateDataSnapshot(currentTableData, currentPersonalInfo);
      
      // 觸發自動動作
      console.log('準備觸發自動動作...');
      triggerAutoActionAfterJump(currentTableData, currentPersonalInfo);
      
      // 記錄處理狀態
      lastProcessedHash = currentHash;
      lastProcessedTime = now;
      
      // 儲存更新的狀態
      saveMonitoringState();
      
      retryCount = 0; // 重置重試計數
    } else {
      console.log('跳轉後資料無變化');
      notifyUser('跳轉成功，但資料無變化', 'info');
      
      // 更新快照時間，但不觸發動作
      if (lastDataSnapshot) {
        lastDataSnapshot.timestamp = new Date().toISOString();
      }
    }
    
    console.log('=== 資料檢查完成 ===');
  } catch (error) {
    console.error('檢查跳轉後資料時發生錯誤:', error);
    retryCount++;
    
    if (retryCount >= MONITOR_CONFIG.maxRetries) {
      console.error('達到最大重試次數');
      notifyUser('資料檢查發生錯誤', 'error');
      retryCount = 0;
    } else {
      console.log(`發生錯誤，將重試 (${retryCount}/${MONITOR_CONFIG.maxRetries})`);
      setTimeout(() => {
        if (isMonitoring && isOnTargetPage()) {
          checkDataAfterSuccessfulJump();
        }
      }, 2000);
    }
  }
}

// 更新資料快照
function updateDataSnapshot(tableData, personalInfo) {
  lastDataSnapshot = {
    tableData: tableData,
    personalInfo: personalInfo,
    hash: generateDataHash(tableData, personalInfo),
    timestamp: new Date().toISOString(),
    url: window.location.href
  };
  console.log('資料快照已更新:', lastDataSnapshot);
}

// 生成資料雜湊值
function generateDataHash(tableData, personalInfo) {
  const dataString = JSON.stringify({
    tableCount: tableData ? tableData.length : 0,
    tableData: tableData,
    personalInfo: personalInfo,
    url: window.location.href,
    jumpCount: jumpCount // 加入跳轉計數作為雜湊因子
  });
  
  // 生成雜湊值
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// 觸發跳轉後的自動動作
function triggerAutoActionAfterJump(tableData, personalInfo) {
  console.log('觸發跳轉後的自動動作...');
  console.log('表格資料筆數:', tableData ? tableData.length : 0);
  console.log('個人資料:', personalInfo ? '已擷取' : '未擷取');
  
  try {
    // 檢查資料是否有效
    if (!tableData || tableData.length === 0) {
      console.warn('沒有有效的表格資料，跳過自動動作');
      notifyUser('跳轉成功但未找到資料', 'warning');
      return;
    }
    
    console.log('準備發送 dataChanged 訊息到背景腳本...');
    
    // 通知背景腳本有新資料
    const messageData = {
      action: 'dataChanged',
      data: {
        tableData: tableData,
        personalInfo: personalInfo,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        trigger: 'url_jump', // 標記觸發原因
        jumpCount: jumpCount,
        successfulJumps: successfulJumps
      }
    };
    
    console.log('發送訊息:', messageData);
    
    chrome.runtime.sendMessage(messageData, function(response) {
      if (chrome.runtime.lastError) {
        console.error('發送 dataChanged 訊息失敗:', chrome.runtime.lastError);
        notifyUser('自動處理失敗: 通信錯誤', 'error');
        return;
      }
      
      console.log('dataChanged 訊息發送成功，背景腳本回應:', response);
      
      if (response && response.success) {
        console.log('背景腳本確認處理成功');
        // 顯示成功通知
        const dataCount = tableData ? tableData.length : 0;
        notifyUser(`自動擷取完成！共 ${dataCount} 筆記錄`, 'success');
      } else {
        console.error('背景腳本處理失敗:', response);
        notifyUser('自動處理失敗', 'error');
      }
    });
    
    // 移除備用擷取方案，避免重複觸發
    console.log('主要擷取方案已執行，不再執行備用方案');
    
  } catch (error) {
    console.error('觸發跳轉後自動動作時發生錯誤:', error);
    notifyUser('自動動作執行失敗: ' + error.message, 'error');
  }
}

// 處理資料擷取
function handleDataExtraction(sendResponse) {
  try {
    console.log('開始處理資料擷取請求...');
    
    const tableData = extractTableData();
    const personalInfo = getPersonalInfo();
    
    if (!tableData || tableData.length === 0) {
      console.warn('未找到表格資料');
      sendResponse({
        success: false,
        message: '未找到表格資料，請確認頁面已完全載入'
      });
      return;
    }
    
    console.log(`成功擷取 ${tableData.length} 筆表格資料`);
    
    sendResponse({
      success: true,
      tableData: tableData,
      personalInfo: personalInfo,
      timestamp: new Date().toISOString(),
      message: `成功擷取 ${tableData.length} 筆資料`
    });
    
  } catch (error) {
    console.error('處理資料擷取時發生錯誤:', error);
    sendResponse({
      success: false,
      message: '擷取資料時發生錯誤: ' + error.message
    });
  }
}

// 擷取表格資料
function extractTableData() {
  try {
    console.log('開始擷取表格資料...');
    
    // 尋找表格
    const tables = document.querySelectorAll('table');
    console.log(`找到 ${tables.length} 個表格`);
    
    if (tables.length === 0) {
      console.log('頁面中沒有找到表格');
      return [];
    }
    
    let allData = [];
    
    tables.forEach((table, tableIndex) => {
      console.log(`處理第 ${tableIndex + 1} 個表格...`);
      
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) {
        console.log(`表格 ${tableIndex + 1} 沒有資料行`);
        return;
      }
      
      // 獲取表頭
      let headers = [];
      const headerRow = rows[0];
      const headerCells = headerRow.querySelectorAll('th, td');
      headerCells.forEach(cell => {
        headers.push(cell.textContent.trim());
      });
      
      console.log(`表格 ${tableIndex + 1} 表頭:`, headers);
      
      // 處理資料行
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td, th');
        
        if (cells.length === 0) continue;
        
        const rowData = {};
        cells.forEach((cell, cellIndex) => {
          const header = headers[cellIndex] || `欄位${cellIndex + 1}`;
          rowData[header] = cell.textContent.trim();
        });
        
        // 只添加非空的資料行
        if (Object.values(rowData).some(value => value !== '')) {
          rowData['_表格編號'] = tableIndex + 1;
          rowData['_資料行編號'] = i;
          allData.push(rowData);
        }
      }
    });
    
    console.log(`總共擷取到 ${allData.length} 筆資料`);
    return allData;
    
  } catch (error) {
    console.error('擷取表格資料時發生錯誤:', error);
    return [];
  }
}

// 獲取個人資料
function getPersonalInfo() {
  try {
    console.log('開始擷取個人資料...');
    
    const personalInfo = {
      extractedAt: new Date().toISOString(),
      source: window.location.href
    };
    
    // 尋找常見的個人資料欄位
    const commonFields = [
      { key: 'idNumber', selectors: ['input[name*="id"]', 'input[name*="身分證"]', '[class*="id"]'] },
      { key: 'name', selectors: ['input[name*="name"]', 'input[name*="姓名"]', '[class*="name"]'] },
      { key: 'birthDate', selectors: ['input[name*="birth"]', 'input[name*="生日"]', '[class*="birth"]'] },
      { key: 'gender', selectors: ['input[name*="gender"]', 'input[name*="性別"]', '[class*="gender"]'] }
    ];
    
    commonFields.forEach(field => {
      for (const selector of field.selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          const value = element.value || element.textContent;
          if (value && value.trim() !== '') {
            personalInfo[field.key] = value.trim();
            console.log(`找到 ${field.key}:`, value.trim());
          }
        });
        if (personalInfo[field.key]) break;
      }
    });
    
    // 尋找顯示的文字資訊
    const textElements = document.querySelectorAll('span, div, p, td');
    textElements.forEach(element => {
      const text = element.textContent.trim();
      
      // 身分證號碼模式
      if (/^[A-Z]\d{9}$/.test(text)) {
        personalInfo.idNumber = text;
      }
      
      // 日期模式
      if (/^\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(text)) {
        if (!personalInfo.birthDate) {
          personalInfo.birthDate = text;
        }
      }
    });
    
    console.log('個人資料擷取完成:', personalInfo);
    return personalInfo;
    
  } catch (error) {
    console.error('擷取個人資料時發生錯誤:', error);
    return {
      extractedAt: new Date().toISOString(),
      source: window.location.href,
      error: error.message
    };
  }
}

// 顯示通知
function notifyUser(message, type = 'info') {
  try {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: bold;
      z-index: 10000;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
    `;
    
    // 根據類型設置顏色
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#4CAF50';
        break;
      case 'error':
        notification.style.backgroundColor = '#f44336';
        break;
      case 'warning':
        notification.style.backgroundColor = '#ff9800';
        break;
      default:
        notification.style.backgroundColor = '#2196F3';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3 秒後自動移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 3000);
    
    console.log(`通知 (${type}):`, message);
  } catch (error) {
    console.error('顯示通知時發生錯誤:', error);
    console.log(`通知 (${type}):`, message);
  }
}

console.log('醫療資料頁面監測工具內容腳本已載入 (URL 跳轉監測版 + 狀態持久化)');

