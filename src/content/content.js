// 頁面監測版本 - 內容腳本 (URL 跳轉監測版)
// 監測頁面在失敗頁面和成功頁面之間的跳轉，只在成功跳轉到目標頁面時觸發動作

// 監測配置
const MONITOR_CONFIG = {
  startUrl: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/#', // 失敗頁面
  targetUrl: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0008', // 成功頁面
  urlCheckInterval: 500, // URL 檢查間隔 (毫秒)
  dataCheckDelay: 2000, // 跳轉到目標頁面後延遲檢查資料的時間
  maxRetries: 3, // 最大重試次數
  cooldownPeriod: 5000 // 冷卻期間 (5秒)
};

// 全域變數
let isMonitoring = false;
let urlCheckInterval = null;
let currentUrl = window.location.href;
let lastProcessedHash = null;
let lastProcessedTime = 0;
let monitoringStartTime = null;
let jumpCount = 0; // 跳轉計數
let successfulJumps = 0; // 成功跳轉計數
let lastDataSnapshot = null;
let retryCount = 0;

// 監聽來自背景腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractTableData') {
    console.log('收到擷取表格資料的請求');
    handleDataExtraction(sendResponse);
    return true; // 非同步回應
  } else if (message.action === 'startMonitoring') {
    console.log('收到開始監測的請求');
    startUrlJumpMonitoring();
    sendResponse({ success: true, message: '開始監測頁面跳轉' });
  } else if (message.action === 'stopMonitoring') {
    console.log('收到停止監測的請求');
    stopUrlJumpMonitoring();
    sendResponse({ success: true, message: '停止監測頁面跳轉' });
  } else if (message.action === 'getMonitorStatus') {
    sendResponse({ 
      isMonitoring: isMonitoring,
      currentUrl: window.location.href,
      isOnTargetPage: isOnTargetPage(),
      isOnStartPage: isOnStartPage(),
      lastProcessed: lastProcessedTime ? new Date(lastProcessedTime).toISOString() : null,
      startTime: monitoringStartTime,
      jumpCount: jumpCount,
      successfulJumps: successfulJumps
    });
  }
  return true;
});

// 檢查是否在目標頁面
function isOnTargetPage() {
  const url = window.location.href;
  return url.includes('/IMUE0008');
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

// 開始 URL 跳轉監測
function startUrlJumpMonitoring() {
  if (isMonitoring) {
    console.log('監測已在運行中');
    return;
  }
  
  console.log('開始監測 URL 跳轉...');
  isMonitoring = true;
  retryCount = 0;
  jumpCount = 0;
  successfulJumps = 0;
  monitoringStartTime = new Date().toISOString();
  currentUrl = window.location.href;
  
  // 顯示當前狀態
  console.log('當前 URL:', currentUrl);
  if (isOnTargetPage()) {
    console.log('當前在目標頁面，開始監測跳轉');
    notifyUser('開始監測頁面跳轉 - 當前在目標頁面', 'info');
    
    // 如果已經在目標頁面，先檢查一次資料
    setTimeout(() => {
      if (isMonitoring) {
        checkDataAfterSuccessfulJump();
      }
    }, MONITOR_CONFIG.dataCheckDelay);
    
  } else if (isOnStartPage()) {
    console.log('當前在起始頁面，等待跳轉到目標頁面');
    notifyUser('開始監測頁面跳轉 - 等待跳轉到目標頁面', 'info');
  } else if (isRelevantPage()) {
    console.log('當前在相關頁面，啟用通用跳轉監測');
    notifyUser('啟用頁面跳轉監測', 'info');
  } else {
    console.log('當前頁面不是目標系統，啟用通用監測');
    notifyUser('啟用通用頁面跳轉監測', 'info');
  }
  
  // 開始 URL 監測循環
  startUrlCheckLoop();
  
  console.log('URL 跳轉監測已啟動');
}

// 停止 URL 跳轉監測
function stopUrlJumpMonitoring() {
  if (!isMonitoring) {
    return;
  }
  
  console.log('停止 URL 跳轉監測...');
  isMonitoring = false;
  
  // 清理 URL 檢查循環
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
    urlCheckInterval = null;
  }
  
  console.log(`監測已停止。總跳轉次數: ${jumpCount}, 成功跳轉次數: ${successfulJumps}`);
  notifyUser(`監測已停止 - 總跳轉 ${jumpCount} 次，成功 ${successfulJumps} 次`, 'info');
}

// 開始 URL 檢查循環
function startUrlCheckLoop() {
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
  }
  
  urlCheckInterval = setInterval(() => {
    if (!isMonitoring) {
      clearInterval(urlCheckInterval);
      return;
    }
    
    checkUrlChange();
  }, MONITOR_CONFIG.urlCheckInterval);
  
  console.log('URL 檢查循環已啟動，檢查間隔:', MONITOR_CONFIG.urlCheckInterval, 'ms');
}

// 檢查 URL 變化
function checkUrlChange() {
  const newUrl = window.location.href;
  
  if (newUrl !== currentUrl) {
    console.log('檢測到 URL 變化:');
    console.log('舊 URL:', currentUrl);
    console.log('新 URL:', newUrl);
    
    jumpCount++;
    
    // 檢查是否跳轉到目標頁面
    if (isUrlTargetPage(newUrl)) {
      console.log('🎯 成功跳轉到目標頁面！');
      successfulJumps++;
      
      notifyUser(`成功跳轉到目標頁面！(第 ${successfulJumps} 次)`, 'success');
      
      // 延遲檢查資料，確保頁面完全載入
      setTimeout(() => {
        if (isMonitoring && isOnTargetPage()) {
          checkDataAfterSuccessfulJump();
        }
      }, MONITOR_CONFIG.dataCheckDelay);
      
    } else if (isUrlStartPage(newUrl)) {
      console.log('↩️ 跳轉回起始頁面，繼續監測...');
      notifyUser('跳轉回起始頁面，繼續等待下次成功跳轉', 'warning');
      
    } else {
      console.log('🔄 跳轉到其他頁面:', newUrl);
      notifyUser('頁面跳轉中...', 'info');
    }
    
    // 更新當前 URL
    currentUrl = newUrl;
  }
}

// 檢查 URL 是否為目標頁面
function isUrlTargetPage(url) {
  return url.includes('/IMUE0008');
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
    timestamp: new Date().toISOString(),
    hash: generateDataHash(tableData, personalInfo)
  };
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
  
  // 簡單的雜湊函數
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 轉換為 32 位整數
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
        notifyUser(`跳轉後自動擷取完成！共 ${dataCount} 筆記錄 (第 ${successfulJumps} 次成功跳轉)`, 'success');
      } else {
        console.error('背景腳本處理失敗:', response);
        notifyUser('自動處理失敗', 'error');
      }
    });
    
    // 同時嘗試直接觸發手動擷取作為備用方案
    console.log('同時觸發備用擷取方案...');
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'captureAndExtract' }, function(backupResponse) {
        if (chrome.runtime.lastError) {
          console.error('備用擷取方案失敗:', chrome.runtime.lastError);
          return;
        }
        
        console.log('備用擷取方案回應:', backupResponse);
        
        if (backupResponse && backupResponse.success) {
          console.log('備用擷取方案成功');
        }
      });
    }, 1000); // 延遲 1 秒執行備用方案
    
  } catch (error) {
    console.error('觸發跳轉後自動動作時發生錯誤:', error);
    notifyUser('自動動作執行失敗: ' + error.message, 'error');
  }
}

// 處理資料擷取
function handleDataExtraction(sendResponse) {
  try {
    // 檢查是否在冷卻期間
    const now = Date.now();
    if (lastProcessedTime && (now - lastProcessedTime) < MONITOR_CONFIG.cooldownPeriod) {
      const remainingTime = Math.ceil((MONITOR_CONFIG.cooldownPeriod - (now - lastProcessedTime)) / 1000);
      console.log(`在冷卻期間，還需等待 ${remainingTime} 秒`);
      sendResponse({
        success: false,
        message: `冷卻期間，請等待 ${remainingTime} 秒後再試`,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 根據頁面類型選擇適當的擷取方法
    let tableData;
    if (detectMedicalSystem()) {
      console.log('使用醫療系統專用擷取邏輯');
      tableData = extractMedicalTableData();
    } else {
      console.log('使用通用表格擷取邏輯');
      tableData = extractTableData();
    }
    
    // 擷取個人基本資料
    console.log('開始擷取個人基本資料');
    const personalInfo = getPersonalInfo();
    
    // 檢查是否有實際資料
    if (!tableData || tableData.length === 0) {
      console.log('未找到表格資料');
      sendResponse({
        success: false,
        message: '未找到表格資料',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 生成資料雜湊值檢查是否重複
    const currentHash = generateDataHash(tableData, personalInfo);
    if (lastProcessedHash === currentHash) {
      console.log('資料未變化，跳過處理');
      sendResponse({
        success: false,
        message: '資料未變化，跳過重複處理',
        timestamp: new Date().toISOString()
      });
      return;
    }

    console.log('擷取結果:', `成功擷取 ${tableData.length} 筆表格資料`);
    console.log('個人資料擷取結果:', personalInfo ? '成功擷取個人資料' : '未找到個人資料');
    
    // 更新資料快照和處理記錄
    updateDataSnapshot(tableData, personalInfo);
    lastProcessedHash = currentHash;
    lastProcessedTime = now;
    
    sendResponse({ 
      success: true,
      tableData: tableData,
      personalInfo: personalInfo,
      message: `成功擷取 ${tableData.length} 筆資料`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('資料擷取時發生錯誤:', error);
    sendResponse({
      success: false,
      message: '資料擷取失敗: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// 顯示通知
function notifyUser(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // 創建頁面通知
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    max-width: 350px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    font-size: 14px;
    line-height: 1.4;
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
  
  // 根據類型設置不同的顯示時間
  const displayTime = type === 'success' ? 5000 : 3000;
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, displayTime);
}

// 初始化
function initialize() {
  console.log('醫療資料頁面監測工具已啟動 (URL 跳轉監測版)');
  
  // 記錄初始 URL
  currentUrl = window.location.href;
  console.log('初始 URL:', currentUrl);
  
  // 在頁面載入完成後執行初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', afterLoaded);
  } else {
    afterLoaded();
  }
  
  function afterLoaded() {
    // 檢測頁面是否為醫療資訊系統
    const isMedicalSystem = detectMedicalSystem();
    if (isMedicalSystem) {
      console.log('檢測到醫療資訊系統');
    }
    
    // 如果是相關頁面，顯示可以開始監測的提示
    if (isRelevantPage()) {
      console.log('檢測到相關頁面，可開始 URL 跳轉監測');
      if (isOnTargetPage()) {
        console.log('當前在目標頁面');
      } else if (isOnStartPage()) {
        console.log('當前在起始頁面');
      }
    }
  }
}

// 執行初始化
initialize();

// 以下是原有的資料擷取功能 (保持不變)
// ... (包含所有原有的擷取函數)

// 擷取表格資料的主要功能
function extractTableData() {
  try {
    console.log('開始擷取表格資料...');
    
    // 優先嘗試擷取 DataTables 結構
    let result = extractDataTablesData();
    if (result && result.length > 0) {
      console.log('成功擷取 DataTables 資料，共', result.length, '筆記錄');
      return result;
    }
    
    // 如果 DataTables 擷取失敗，回退到通用表格擷取
    console.log('DataTables 擷取失敗，嘗試通用表格擷取...');
    result = extractGenericTableData();
    if (result && result.length > 0) {
      console.log('成功擷取通用表格資料，共', result.length, '筆記錄');
      return result;
    }
    
    console.warn('未能擷取到任何表格資料');
    return null;
  } catch (error) {
    console.error('擷取表格資料時發生錯誤:', error);
    return null;
  }
}

// 擷取 DataTables 結構的資料
function extractDataTablesData() {
  try {
    // 尋找 DataTables 容器
    const dataTablesWrapper = document.querySelector('.dataTables_wrapper');
    if (!dataTablesWrapper) {
      console.log('未找到 DataTables 結構');
      return null;
    }
    
    console.log('找到 DataTables 結構，開始擷取...');
    
    // 獲取表頭 - 從 dataTables_scrollHead 區域
    const headers = [];
    const scrollHead = dataTablesWrapper.querySelector('.dataTables_scrollHead');
    if (scrollHead) {
      const headerCells = scrollHead.querySelectorAll('th');
      headerCells.forEach(cell => {
        // 清理表頭文字，移除排序相關的屬性文字
        let headerText = cell.textContent.trim();
        // 移除 "activate to sort column ascending" 等文字
        headerText = headerText.replace(/:\s*activate to sort.*$/i, '');
        headers.push(headerText);
      });
      console.log('擷取到表頭:', headers);
    }
    
    // 如果沒有找到 scrollHead，嘗試從主表格獲取表頭
    if (headers.length === 0) {
      const mainTable = dataTablesWrapper.querySelector('table');
      if (mainTable) {
        const headerCells = mainTable.querySelectorAll('thead th');
        headerCells.forEach(cell => {
          let headerText = cell.textContent.trim();
          headerText = headerText.replace(/:\s*activate to sort.*$/i, '');
          headers.push(headerText);
        });
        console.log('從主表格擷取到表頭:', headers);
      }
    }
    
    // 獲取資料 - 從 dataTables_scrollBody 區域或主表格的 tbody
    const data = [];
    let dataRows = [];
    
    // 優先從 scrollBody 獲取資料
    const scrollBody = dataTablesWrapper.querySelector('.dataTables_scrollBody');
    if (scrollBody) {
      const tbody = scrollBody.querySelector('tbody');
      if (tbody) {
        dataRows = tbody.querySelectorAll('tr');
        console.log('從 scrollBody 找到', dataRows.length, '行資料');
      }
    }
    
    // 如果沒有找到 scrollBody，從主表格獲取
    if (dataRows.length === 0) {
      const mainTable = dataTablesWrapper.querySelector('table tbody');
      if (mainTable) {
        dataRows = mainTable.querySelectorAll('tr');
        console.log('從主表格找到', dataRows.length, '行資料');
      }
    }
    
    // 處理每一行資料
    dataRows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return;
      
      const rowData = {};
      cells.forEach((cell, cellIndex) => {
        // 使用表頭作為鍵名，如果表頭不存在則使用索引
        const key = headers[cellIndex] || `column${cellIndex}`;
        
        // 處理包含 <br> 標籤的多行內容
        let cellContent = '';
        if (cell.innerHTML.includes('<br>')) {
          // 將 <br> 替換為換行符，保持多行結構
          cellContent = cell.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '') // 移除其他HTML標籤
            .trim();
        } else {
          cellContent = cell.textContent.trim();
        }
        
        rowData[key] = cellContent;
      });
      
      data.push(rowData);
    });
    
    return data;
  } catch (error) {
    console.error('擷取 DataTables 資料時發生錯誤:', error);
    return null;
  }
}

// 通用表格資料擷取（原有邏輯的改進版）
function extractGenericTableData() {
  try {
    // 尋找頁面中的所有表格
    const tables = document.querySelectorAll('table');
    if (!tables || tables.length === 0) {
      console.warn('頁面中未找到表格');
      return null;
    }
    
    // 尋找最可能包含資料的表格（排除明顯的裝飾性表格）
    let targetTable = null;
    for (let table of tables) {
      const rows = table.querySelectorAll('tr');
      const dataCells = table.querySelectorAll('td');
      
      // 如果表格有足夠的行和資料儲存格，認為是資料表格
      if (rows.length > 1 && dataCells.length > 0) {
        targetTable = table;
        break;
      }
    }
    
    if (!targetTable) {
      console.warn('未找到合適的資料表格');
      return null;
    }
    
    console.log('使用通用方法處理表格，表格有', targetTable.querySelectorAll('tr').length, '行');
    
    // 獲取表頭
    const headers = [];
    const headerRow = targetTable.querySelector('tr');
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('th');
      if (headerCells && headerCells.length > 0) {
        headerCells.forEach(cell => {
          headers.push(cell.textContent.trim());
        });
      } else {
        // 如果沒有 th 元素，嘗試使用第一行的 td 元素作為表頭
        const firstRowCells = headerRow.querySelectorAll('td');
        firstRowCells.forEach(cell => {
          headers.push(cell.textContent.trim());
        });
      }
    }
    
    // 獲取表格資料
    const rows = targetTable.querySelectorAll('tr');
    const data = [];
    
    // 從第二行開始處理資料行（跳過表頭）
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) continue;
      
      const rowData = {};
      cells.forEach((cell, index) => {
        // 使用表頭作為鍵名，如果表頭不存在則使用索引
        const key = headers[index] || `column${index}`;
        
        // 處理包含 <br> 標籤的多行內容
        let cellContent = '';
        if (cell.innerHTML.includes('<br>')) {
          cellContent = cell.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .trim();
        } else {
          cellContent = cell.textContent.trim();
        }
        
        rowData[key] = cellContent;
      });
      
      data.push(rowData);
    }
    
    return data;
  } catch (error) {
    console.error('通用表格擷取時發生錯誤:', error);
    return null;
  }
}

// 針對醫療資訊系統的特殊處理
function extractMedicalTableData() {
  try {
    console.log('使用醫療系統專用擷取邏輯...');
    
    // 針對健保醫療資訊雲端查詢系統的特殊處理
    if (detectNHIMediCloudSystem()) {
      console.log('檢測到健保醫療資訊雲端查詢系統');
      return extractNHIMediCloudData();
    }
    
    // 其他醫療系統可以在這裡添加特殊處理
    
    // 如果沒有特殊處理，使用通用邏輯
    return extractTableData();
  } catch (error) {
    console.error('醫療系統資料擷取時發生錯誤:', error);
    return extractTableData(); // 回退到通用邏輯
  }
}

// 檢測是否為健保醫療資訊雲端查詢系統
function detectNHIMediCloudSystem() {
  const pageTitle = document.title;
  const url = window.location.href;
  
  // 檢查頁面標題
  if (pageTitle.includes('健保醫療資訊雲端查詢系統') || pageTitle.includes('NHI MediCloud System')) {
    return true;
  }
  
  // 檢查 URL
  if (url.includes('medcloud2.nhi.gov.tw')) {
    return true;
  }
  
  // 檢查頁面內容
  const logoElement = document.querySelector('.logo a');
  if (logoElement && logoElement.textContent.includes('健保醫療資訊雲端查詢系統')) {
    return true;
  }
  
  // 檢查是否有特定的功能標籤
  const functionTabs = document.querySelectorAll('.function-tab a');
  const tabTexts = Array.from(functionTabs).map(tab => tab.textContent);
  const medicalTabs = ['西醫用藥', '中醫醫療', '牙科處置紀錄', '過敏紀錄', '檢查與檢驗'];
  
  return medicalTabs.some(tab => tabTexts.some(text => text.includes(tab)));
}

// 專門處理健保醫療資訊雲端查詢系統的資料擷取
function extractNHIMediCloudData() {
  try {
    // 首先嘗試 DataTables 結構
    let result = extractDataTablesData();
    if (result && result.length > 0) {
      // 對健保系統的資料進行後處理
      return postProcessNHIData(result);
    }
    
    // 如果 DataTables 失敗，嘗試其他方法
    return extractGenericTableData();
  } catch (error) {
    console.error('健保系統資料擷取失敗:', error);
    return null;
  }
}

// 對健保系統資料進行後處理
function postProcessNHIData(data) {
  if (!data || !Array.isArray(data)) return data;
  
  return data.map(row => {
    const processedRow = { ...row };
    
    // 處理日期格式（民國年轉西元年）
    Object.keys(processedRow).forEach(key => {
      if (key.includes('日期') && processedRow[key]) {
        processedRow[key] = convertROCDateToAD(processedRow[key]);
      }
    });
    
    // 處理來源欄位的多行資料
    if (processedRow['來源']) {
      const sourceLines = processedRow['來源'].split('\n');
      if (sourceLines.length >= 3) {
        processedRow['醫院名稱'] = sourceLines[0];
        processedRow['門診類型'] = sourceLines[1];
        processedRow['機構代碼'] = sourceLines[2];
      }
    }
    
    return processedRow;
  });
}

// 轉換民國年日期為西元年
function convertROCDateToAD(rocDate) {
  if (!rocDate || typeof rocDate !== 'string') return rocDate;
  
  // 匹配民國年格式：114/05/31
  const rocPattern = /^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/;
  const match = rocDate.match(rocPattern);
  
  if (match) {
    const rocYear = parseInt(match[1]);
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    const adYear = rocYear + 1911;
    
    return `${adYear}/${month}/${day}`;
  }
  
  return rocDate; // 如果不符合格式，返回原始值
}

// 檢測頁面是否為醫療資訊系統
function detectMedicalSystem() {
  // 簡單檢測頁面標題或URL是否包含醫療相關關鍵字
  const pageTitle = document.title.toLowerCase();
  const url = window.location.href.toLowerCase();
  
  const medicalKeywords = [
    '醫療', '健保', 'medicloud', '病歷', '藥品', '診所', '醫院', '門診'
  ];
  
  return medicalKeywords.some(keyword => 
    pageTitle.includes(keyword) || url.includes(keyword)
  );
}

// 擷取個人基本資料
function extractPersonalInfo() {
  try {
    console.log('開始擷取個人基本資料...');
    
    const personalInfo = {};
    
    // 擷取身分證號
    const idElement = document.querySelector('.idno');
    if (idElement) {
      const idText = idElement.textContent.trim();
      // 移除前綴文字，提取實際身分證號
      const idMatch = idText.match(/[A-Z]\d{2}\*{3}\d{3}|[A-Z]\d{9}/);
      if (idMatch) {
        personalInfo.idNumber = idMatch[0];
        console.log('找到身分證號:', personalInfo.idNumber);
      } else {
        // 如果沒有匹配到標準格式，保留原始文字（去除前綴）
        personalInfo.idNumber = idText.replace(/^身分證號[：:]\s*/, '');
      }
    }
    
    // 擷取姓名
    const nameElement = document.querySelector('.name');
    if (nameElement) {
      personalInfo.name = nameElement.textContent.trim();
      console.log('找到姓名:', personalInfo.name);
    }
    
    // 擷取出生日期
    const birthElement = document.querySelector('.birth');
    if (birthElement) {
      const birthText = birthElement.textContent.trim();
      personalInfo.birthDate = birthText;
      
      // 嘗試轉換民國年為西元年
      const rocMatch = birthText.match(/民\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
      if (rocMatch) {
        const rocYear = parseInt(rocMatch[1]);
        const month = rocMatch[2].padStart(2, '0');
        const day = rocMatch[3].padStart(2, '0');
        const adYear = rocYear + 1911;
        personalInfo.birthDateAD = `${adYear}/${month}/${day}`;
        console.log('找到出生日期:', personalInfo.birthDate, '(西元年:', personalInfo.birthDateAD + ')');
      } else {
        console.log('找到出生日期:', personalInfo.birthDate);
      }
    }
    
    // 擷取性別
    const genderElement = document.querySelector('.sex');
    if (genderElement) {
      personalInfo.gender = genderElement.textContent.trim();
      console.log('找到性別:', personalInfo.gender);
    }
    
    // 添加擷取時間和來源
    personalInfo.extractedAt = new Date().toISOString();
    personalInfo.source = document.title || window.location.href;
    
    // 檢查是否有找到任何個人資料
    const hasData = Object.keys(personalInfo).some(key => 
      key !== 'extractedAt' && key !== 'source' && personalInfo[key]
    );
    
    if (hasData) {
      console.log('成功擷取個人資料:', personalInfo);
      return personalInfo;
    } else {
      console.log('未找到個人資料');
      return null;
    }
  } catch (error) {
    console.error('擷取個人資料時發生錯誤:', error);
    return null;
  }
}

// 使用通用方法擷取個人資料（備用方案）
function extractPersonalInfoGeneric() {
  try {
    console.log('使用通用方法擷取個人資料...');
    
    const personalInfo = {};
    const pageText = document.body.textContent;
    
    // 使用正則表達式尋找身分證號
    const idPattern = /身分證號[：:]\s*([A-Z]\d{2}\*{3}\d{3}|[A-Z]\d{9})/;
    const idMatch = pageText.match(idPattern);
    if (idMatch) {
      personalInfo.idNumber = idMatch[1];
      console.log('通用方法找到身分證號:', personalInfo.idNumber);
    }
    
    // 使用正則表達式尋找民國年出生日期
    const birthPattern = /民\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})/;
    const birthMatch = pageText.match(birthPattern);
    if (birthMatch) {
      personalInfo.birthDate = `民 ${birthMatch[1]}/${birthMatch[2]}/${birthMatch[3]}`;
      const rocYear = parseInt(birthMatch[1]);
      const month = birthMatch[2].padStart(2, '0');
      const day = birthMatch[3].padStart(2, '0');
      const adYear = rocYear + 1911;
      personalInfo.birthDateAD = `${adYear}/${month}/${day}`;
      console.log('通用方法找到出生日期:', personalInfo.birthDate);
    }
    
    // 添加擷取時間和來源
    personalInfo.extractedAt = new Date().toISOString();
    personalInfo.source = document.title || window.location.href;
    
    // 檢查是否有找到任何個人資料
    const hasData = Object.keys(personalInfo).some(key => 
      key !== 'extractedAt' && key !== 'source' && personalInfo[key]
    );
    
    return hasData ? personalInfo : null;
  } catch (error) {
    console.error('通用個人資料擷取時發生錯誤:', error);
    return null;
  }
}

// 主要個人資料擷取函數
function getPersonalInfo() {
  // 優先使用特定選擇器方法
  let personalInfo = extractPersonalInfo();
  
  // 如果失敗，使用通用方法
  if (!personalInfo) {
    personalInfo = extractPersonalInfoGeneric();
  }
  
  return personalInfo;
}

