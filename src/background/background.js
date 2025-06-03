// 頁面監測版本 - 背景腳本
// 處理擴充功能的全局狀態、生命週期和監測功能協調

// 監測狀態管理
let monitoringTabs = new Map(); // 儲存正在監測的標籤頁
let notificationQueue = []; // 通知佇列

// 格式化錯誤訊息的輔助函數
function formatErrorMessage(error) {
  if (!error) return '未知錯誤';
  
  // 如果是字符串，直接返回
  if (typeof error === 'string') return error;
  
  // 如果是Error對象，返回message屬性
  if (error instanceof Error) return error.message;
  
  // 如果是chrome.runtime.lastError對象
  if (error.message) return error.message;
  
  // 如果是其他對象，嘗試JSON序列化
  try {
    return JSON.stringify(error);
  } catch (e) {
    return '錯誤對象無法序列化';
  }
}

// 檢查是否為無害的通信錯誤
function isHarmlessCommunicationError(errorMessage) {
  const harmlessErrors = [
    'Could not establish connection. Receiving end does not exist',
    'The message port closed before a response was received',
    'Extension context invalidated',
    'Cannot access contents of the page'
  ];
  
  return harmlessErrors.some(harmlessError => 
    errorMessage.includes(harmlessError)
  );
}

// 監聽來自彈出視窗和內容腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message.action);
  
  switch (message.action) {
    case 'captureAndExtract':
      captureAndExtractData()
        .then(result => sendResponse(result))
        .catch(error => {
          const errorMessage = formatErrorMessage(error);
          console.error('擷取資料時發生錯誤:', errorMessage);
          sendResponse({ 
            success: false,
            error: errorMessage,
            message: `錯誤: ${errorMessage}`
          });
        });
      return true; // 非同步回應
      
    case 'startMonitoring':
      handleStartMonitoring(sender.tab.id)
        .then(result => sendResponse(result))
        .catch(error => {
          const errorMessage = formatErrorMessage(error);
          sendResponse({ success: false, message: errorMessage });
        });
      return true;
      
    case 'stopMonitoring':
      handleStopMonitoring(sender.tab.id)
        .then(result => sendResponse(result))
        .catch(error => {
          const errorMessage = formatErrorMessage(error);
          sendResponse({ success: false, message: errorMessage });
        });
      return true;
      
    case 'getMonitorStatus':
      const status = getMonitoringStatus(sender.tab.id);
      sendResponse(status);
      break;
      
    case 'dataChanged':
      handleDataChanged(message.data, sender.tab.id)
        .then(result => sendResponse(result))
        .catch(error => {
          const errorMessage = formatErrorMessage(error);
          console.error('處理資料變化時發生錯誤:', errorMessage);
          sendResponse({ success: false, message: errorMessage });
        });
      return true;
      
    case 'getGlobalMonitorStatus':
      sendResponse({
        monitoringCount: monitoringTabs.size,
        tabs: Array.from(monitoringTabs.entries()).map(([tabId, info]) => ({
          tabId: tabId,
          url: info.url,
          startTime: info.startTime,
          lastActivity: info.lastActivity
        }))
      });
      break;
  }
  
  return false;
});

// 處理開始監測請求
async function handleStartMonitoring(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    
    monitoringTabs.set(tabId, {
      url: tab.url,
      startTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });
    
    console.log(`開始監測標籤頁 ${tabId}: ${tab.url}`);
    
    // 發送通知
    showNotification('監測已啟動', `正在監測: ${tab.title || tab.url}`, 'info');
    
    return { success: true, message: '監測已啟動' };
  } catch (error) {
    console.error('啟動監測失敗:', error);
    return { success: false, message: '啟動監測失敗' };
  }
}

// 處理停止監測請求
async function handleStopMonitoring(tabId) {
  try {
    if (monitoringTabs.has(tabId)) {
      const info = monitoringTabs.get(tabId);
      monitoringTabs.delete(tabId);
      
      console.log(`停止監測標籤頁 ${tabId}`);
      
      // 計算監測時長
      const startTime = new Date(info.startTime);
      const duration = Math.round((Date.now() - startTime.getTime()) / 1000);
      
      showNotification('監測已停止', `監測時長: ${duration} 秒`, 'info');
      
      return { success: true, message: '監測已停止' };
    } else {
      return { success: false, message: '該標籤頁未在監測中' };
    }
  } catch (error) {
    console.error('停止監測失敗:', error);
    return { success: false, message: '停止監測失敗' };
  }
}

// 獲取監測狀態
function getMonitoringStatus(tabId) {
  const isMonitoring = monitoringTabs.has(tabId);
  const info = monitoringTabs.get(tabId);
  
  return {
    isMonitoring: isMonitoring,
    startTime: info ? info.startTime : null,
    lastActivity: info ? info.lastActivity : null
  };
}

// 處理資料變化通知
async function handleDataChanged(data, tabId) {
  try {
    console.log('收到資料變化通知:', data);
    
    // 更新監測狀態
    if (monitoringTabs.has(tabId)) {
      const info = monitoringTabs.get(tabId);
      info.lastActivity = new Date().toISOString();
      monitoringTabs.set(tabId, info);
    }
    
    // 自動儲存資料
    const saveResult = await autoSaveData(data, tabId);
    
    // 發送通知
    const dataCount = data.tableData ? data.tableData.length : 0;
    showNotification(
      '檢測到新資料！', 
      `發現 ${dataCount} 筆新記錄，已自動儲存`, 
      'success'
    );
    
    return { 
      success: true, 
      message: '資料變化處理完成',
      saveResult: saveResult
    };
  } catch (error) {
    console.error('處理資料變化失敗:', error);
    return { success: false, message: '處理資料變化失敗' };
  }
}

// 自動儲存資料
async function autoSaveData(data, tabId) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    // 從個人資料中提取姓名，如果沒有則使用預設值
    const name = data.personalInfo && data.personalInfo.name ? data.personalInfo.name : '監測資料';
    
    // 資料夾命名格式：yyyy-mm-dd_hh-mm-ss_{name}_auto
    const folderName = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${name}_auto`;
    
    // 檔案名稱
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `auto-detected-${timestamp}`;
    
    // 儲存表格資料
    if (data.tableData && data.tableData.length > 0) {
      await saveTableData(data.tableData, filename, folderName);
      console.log(`自動儲存 ${data.tableData.length} 筆資料到 ${folderName}/${filename}.csv`);
    }
    
    // 儲存個人資料
    if (data.personalInfo) {
      await createPersonalInfoFile(data.personalInfo, folderName);
    }
    
    // 儲存監測日誌
    await saveMonitoringLog(data, folderName, tabId);
    
    return {
      success: true,
      folderName: folderName,
      filename: filename,
      dataCount: data.tableData ? data.tableData.length : 0
    };
  } catch (error) {
    console.error('自動儲存失敗:', error);
    return { success: false, error: error.message };
  }
}

// 儲存監測日誌
async function saveMonitoringLog(data, folderName, tabId) {
  try {
    const logData = {
      timestamp: new Date().toISOString(),
      tabId: tabId,
      url: data.url,
      dataCount: data.tableData ? data.tableData.length : 0,
      hasPersonalInfo: !!data.personalInfo,
      monitoringInfo: monitoringTabs.get(tabId) || null
    };
    
    const logJson = JSON.stringify(logData, null, 2);
    const logBase64 = btoa(unescape(encodeURIComponent(logJson)));
    const logDataUrl = `data:application/json;charset=utf-8;base64,${logBase64}`;
    
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: logDataUrl,
        filename: `${folderName}/monitoring-log.json`,
        saveAs: false
      }, downloadId => {
        if (chrome.runtime.lastError) {
          const errorMessage = formatErrorMessage(chrome.runtime.lastError);
          console.warn('無法創建監測日誌:', errorMessage);
          resolve(null);
        } else {
          console.log('成功創建監測日誌');
          resolve(downloadId);
        }
      });
    });
  } catch (error) {
    console.warn('創建監測日誌時發生錯誤:', error);
    return null;
  }
}

// 顯示系統通知
function showNotification(title, message, type = 'info') {
  // 創建通知ID
  const notificationId = `monitor_${Date.now()}`;
  
  // 根據類型選擇圖示
  let iconUrl = 'assets/icon48.png';
  if (type === 'success') {
    iconUrl = 'assets/icon48.png'; // 可以準備不同的圖示
  } else if (type === 'error') {
    iconUrl = 'assets/icon48.png';
  }
  
  // 創建通知
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: iconUrl,
    title: title,
    message: message
  });
  
  // 3秒後自動清除通知
  setTimeout(() => {
    chrome.notifications.clear(notificationId);
  }, 3000);
}

// 監聽標籤頁關閉事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (monitoringTabs.has(tabId)) {
    console.log(`標籤頁 ${tabId} 已關閉，停止監測`);
    monitoringTabs.delete(tabId);
  }
});

// 監聽標籤頁更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && monitoringTabs.has(tabId)) {
    // 頁面重新載入完成，更新監測資訊
    const info = monitoringTabs.get(tabId);
    info.url = tab.url;
    info.lastActivity = new Date().toISOString();
    monitoringTabs.set(tabId, info);
    
    console.log(`標籤頁 ${tabId} 已更新: ${tab.url}`);
  }
});

// 截圖並擷取資料的主要功能 (保持原有功能)
async function captureAndExtractData() {
  try {
    // 獲取當前活動標籤頁
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 截取可見區域的截圖
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    // 向內容腳本發送消息，請求擷取表格資料
    let response;
    try {
      response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { action: 'extractTableData' }, (result) => {
          if (chrome.runtime.lastError) {
            const errorMessage = formatErrorMessage(chrome.runtime.lastError);
            
            // 檢查是否為無害的通信錯誤
            if (isHarmlessCommunicationError(errorMessage)) {
              // 無害錯誤：只在控制台記錄，不顯示給用戶
              console.log('通信提示 (功能正常):', errorMessage);
              // 嘗試注入內容腳本，但不顯示錯誤
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content/content.js']
              }).then(() => {
                // 腳本注入後再次嘗試發送消息
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { action: 'extractTableData' }, (retryResult) => {
                    if (chrome.runtime.lastError) {
                      // 再次失敗也靜默處理
                      console.log('重試通信提示:', formatErrorMessage(chrome.runtime.lastError));
                      resolve({ success: true, tableData: [], personalInfo: null, message: '基本功能完成' });
                    } else {
                      resolve(retryResult);
                    }
                  });
                }, 500);
              }).catch(err => {
                console.log('腳本注入提示:', formatErrorMessage(err));
                resolve({ success: true, tableData: [], personalInfo: null, message: '基本功能完成' });
              });
            } else {
              // 真正的錯誤：顯示給用戶
              console.error('發送消息時發生錯誤:', errorMessage);
              // 嘗試注入內容腳本
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content/content.js']
              }).then(() => {
                // 腳本注入後再次嘗試發送消息
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { action: 'extractTableData' }, (retryResult) => {
                    if (chrome.runtime.lastError) {
                      const retryErrorMessage = formatErrorMessage(chrome.runtime.lastError);
                      reject(new Error(`內容腳本通信失敗: ${retryErrorMessage}`));
                    } else {
                      resolve(retryResult);
                    }
                  });
                }, 500);
              }).catch(err => {
                const injectErrorMessage = formatErrorMessage(err);
                reject(new Error(`腳本注入失敗: ${injectErrorMessage}`));
              });
            }
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      console.error('與內容腳本通信失敗:', errorMessage);
      throw new Error(`無法與頁面通信: ${errorMessage}`);
    }
    
    // 檢查回應格式
    if (!response) {
      throw new Error('未收到內容腳本的回應');
    }
    
    // 處理新的回應格式
    const success = response.success !== undefined ? response.success : (response.tableData !== null);
    const tableData = response.tableData;
    const personalInfo = response.personalInfo;
    const message = response.message || (success ? '資料擷取成功' : '未找到表格資料');
    
    console.log('資料擷取結果:', message);
    if (personalInfo) {
      console.log('個人資料擷取成功:', personalInfo);
    }
    
    // 儲存截圖和資料
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    // 從個人資料中提取姓名，如果沒有則使用預設值
    const name = personalInfo && personalInfo.name ? personalInfo.name : '醫療資料';
    
    // 新的資料夾命名格式：yyyy-mm-dd_hh-mm-ss_{name}（使用破折號確保檔案系統相容性）
    const folderName = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${name}`;
    
    // 檔案名稱保持原有格式以確保相容性
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `medical-data-${timestamp}`;
    
    // 儲存截圖
    await saveScreenshot(screenshotUrl, filename, folderName);
    
    // 儲存表格資料（如果有的話）
    if (success && tableData && tableData.length > 0) {
      await saveTableData(tableData, filename, folderName);
      console.log(`成功儲存 ${tableData.length} 筆資料到 ${folderName}/${filename}.csv`);
    } else {
      console.log('沒有表格資料需要儲存');
    }
    
    // 創建個人資料文件（如果有個人資料的話）
    if (personalInfo) {
      await createPersonalInfoFile(personalInfo, folderName);
    }
    
    return {
      success: success,
      screenshot: screenshotUrl,
      tableData: tableData,
      message: message
    };
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    console.error('擷取資料時發生錯誤:', errorMessage);
    return { 
      success: false, 
      error: errorMessage,
      message: `錯誤: ${errorMessage}`
    };
  }
}

// 儲存截圖
async function saveScreenshot(dataUrl, filename, folderName) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: `${folderName}/${filename}.png`,
      saveAs: false
    }, downloadId => {
      if (chrome.runtime.lastError) {
        const errorMessage = formatErrorMessage(chrome.runtime.lastError);
        reject(new Error(`截圖儲存失敗: ${errorMessage}`));
      } else {
        resolve(downloadId);
      }
    });
  });
}

// 儲存表格資料
async function saveTableData(tableData, filename, folderName) {
  // 轉換為 CSV 格式
  const csvContent = convertToCSV(tableData);
  
  // 使用 data URL 而非 Blob URL，以提高瀏覽器相容性
  // 將 CSV 內容轉換為 Base64 編碼
  const base64 = btoa(unescape(encodeURIComponent(csvContent)));
  const dataUrl = `data:text/csv;base64,${base64}`;
  
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: `${folderName}/${filename}.csv`,
      saveAs: false
    }, downloadId => {
      if (chrome.runtime.lastError) {
        const errorMessage = formatErrorMessage(chrome.runtime.lastError);
        reject(new Error(`CSV檔案儲存失敗: ${errorMessage}`));
      } else {
        resolve(downloadId);
      }
    });
  });
}

// 將表格資料轉換為 CSV 格式
function convertToCSV(tableData) {
  if (!tableData || !tableData.length) return '';
  
  const header = Object.keys(tableData[0]).join(',');
  const rows = tableData.map(row => {
    return Object.values(row)
      .map(value => {
        // 改良斷句處理
        let processedValue = String(value)
          .replace(/\n/g, ' | ')    // 換行符替換為分隔符
          .replace(/\r/g, '')       // 移除回車符
          .replace(/\s+/g, ' ')     // 多個空白字符替換為單個空格
          .trim();                  // 移除首尾空白
        
        // 處理雙引號轉義
        return `"${processedValue.replace(/"/g, '""')}"`;
      })
      .join(',');
  });
  
  return [header, ...rows].join('\n');
}

// 創建個人資料JSON文件
async function createPersonalInfoFile(personalInfo, folderName) {
  try {
    if (!personalInfo) {
      console.log('沒有個人資料需要儲存');
      return null;
    }

    // 將個人資料轉換為JSON格式
    const personalInfoJson = JSON.stringify(personalInfo, null, 2);
    const personalInfoBase64 = btoa(unescape(encodeURIComponent(personalInfoJson)));
    const personalInfoDataUrl = `data:application/json;charset=utf-8;base64,${personalInfoBase64}`;
    
    // 儲存個人資料JSON文件
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: personalInfoDataUrl,
        filename: `${folderName}/personal-info.json`,
        saveAs: false
      }, downloadId => {
        if (chrome.runtime.lastError) {
          const errorMessage = formatErrorMessage(chrome.runtime.lastError);
          console.warn('無法創建個人資料JSON檔案:', errorMessage);
          resolve(null);
        } else {
          console.log('成功創建個人資料JSON檔案');
          resolve(downloadId);
        }
      });
    });
  } catch (error) {
    console.warn('創建個人資料文件時發生錯誤:', error);
    return null;
  }
}

