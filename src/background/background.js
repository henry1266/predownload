// 頁面監測版本 - 背景腳本 (修正版)
// 處理擴充功能的全局狀態管理和自動儲存功能

// 全域變數
let monitoringTabs = new Map(); // 記錄正在監測的標籤頁
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5000; // 通知冷卻時間 5 秒

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
      
    default:
      console.log('未知的消息類型:', message.action);
      sendResponse({ success: false, message: '未知的消息類型' });
  }
  
  return true;
});

// 處理手動擷取請求
async function handleCaptureAndExtract(tabId, sendResponse) {
  try {
    console.log('處理手動擷取請求，標籤頁ID:', tabId);
    
    // 向內容腳本發送擷取請求
    const response = await chrome.tabs.sendMessage(tabId, { action: 'extractTableData' });
    
    if (response && response.success) {
      console.log('擷取成功，開始儲存資料...');
      
      // 自動儲存資料
      const saveResult = await saveExtractedData(response, tabId);
      
      if (saveResult.success) {
        // 顯示成功通知
        showNotification('擷取完成', `成功擷取並儲存 ${response.tableData.length} 筆資料`, 'success');
        
        sendResponse({
          success: true,
          message: `擷取完成！已儲存 ${response.tableData.length} 筆資料到下載資料夾`,
          data: response
        });
      } else {
        sendResponse({
          success: false,
          message: '資料擷取成功但儲存失敗: ' + saveResult.error
        });
      }
    } else {
      const errorMessage = response ? response.message : '擷取失敗';
      console.error('擷取失敗:', errorMessage);
      sendResponse({
        success: false,
        message: errorMessage
      });
    }
  } catch (error) {
    console.error('處理擷取請求時發生錯誤:', error);
    sendResponse({
      success: false,
      message: '處理請求時發生錯誤: ' + error.message
    });
  }
}

// 處理資料變化通知（自動觸發）
async function handleDataChanged(data, tabId) {
  try {
    console.log('處理資料變化通知，標籤頁ID:', tabId);
    console.log('資料筆數:', data.tableData ? data.tableData.length : 0);
    
    // 檢查是否啟用自動儲存
    const settings = await chrome.storage.local.get(['autoSave', 'notificationEnabled']);
    
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
        
        // 更新監測狀態
        updateMonitoringStatus(tabId, {
          lastActivity: data.timestamp,
          lastDataCount: data.tableData.length,
          totalProcessed: (monitoringTabs.get(tabId)?.totalProcessed || 0) + 1
        });
        
      } else {
        console.error('自動儲存失敗:', saveResult.error);
        showNotification('自動儲存失敗', saveResult.error, 'error');
      }
    } else {
      console.log('自動儲存已停用，僅顯示通知');
      
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
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dateStr = new Date().toLocaleDateString('zh-TW').replace(/\//g, '');
    
    // 獲取標籤頁資訊
    let tabInfo;
    try {
      tabInfo = await chrome.tabs.get(tabId);
    } catch (error) {
      console.warn('無法獲取標籤頁資訊:', error);
      tabInfo = { url: 'unknown', title: 'unknown' };
    }
    
    // 生成檔案名稱
    let filePrefix = '醫療資料';
    if (tabInfo.title && tabInfo.title.includes('健保')) {
      filePrefix = '健保醫療資料';
    } else if (tabInfo.url && tabInfo.url.includes('medcloud')) {
      filePrefix = '健保雲端資料';
    }
    
    // 準備 CSV 資料
    console.log('準備 CSV 資料...');
    const csvData = convertToCSV(extractedData.tableData, extractedData.personalInfo);
    const csvFilename = `${filePrefix}_${dateStr}_${timestamp}.csv`;
    
    // 準備 JSON 資料
    console.log('準備 JSON 資料...');
    const jsonData = {
      metadata: {
        extractedAt: extractedData.timestamp || new Date().toISOString(),
        source: {
          url: tabInfo.url,
          title: tabInfo.title
        },
        dataCount: extractedData.tableData ? extractedData.tableData.length : 0,
        version: '2.0.4'
      },
      personalInfo: extractedData.personalInfo,
      tableData: extractedData.tableData
    };
    
    const jsonFilename = `${filePrefix}_${dateStr}_${timestamp}.json`;
    
    // 使用 Data URL 方式下載檔案（相容 Service Worker）
    console.log('使用 Data URL 方式下載 CSV 檔案...');
    const csvDataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvData);
    
    try {
      await chrome.downloads.download({
        url: csvDataUrl,
        filename: csvFilename,
        saveAs: false
      });
      console.log('CSV 檔案下載成功:', csvFilename);
    } catch (csvError) {
      console.error('CSV 檔案下載失敗:', csvError);
      throw new Error('CSV 檔案下載失敗: ' + csvError.message);
    }
    
    console.log('使用 Data URL 方式下載 JSON 檔案...');
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
    
    console.log('所有檔案儲存成功');
    
    // 儲存到本地存儲（用於歷史記錄）
    const historyData = {
      timestamp: extractedData.timestamp || new Date().toISOString(),
      dataCount: extractedData.tableData ? extractedData.tableData.length : 0,
      source: tabInfo.url,
      files: [csvFilename, jsonFilename]
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
      files: [csvFilename, jsonFilename],
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

// 轉換資料為 CSV 格式
function convertToCSV(tableData, personalInfo) {
  try {
    let csvContent = '\uFEFF'; // UTF-8 BOM
    
    // 添加個人基本資料（如果有）
    if (personalInfo) {
      csvContent += '個人基本資料\n';
      csvContent += '項目,內容\n';
      
      if (personalInfo.idNumber) {
        csvContent += `身分證號,${personalInfo.idNumber}\n`;
      }
      if (personalInfo.name) {
        csvContent += `姓名,${personalInfo.name}\n`;
      }
      if (personalInfo.birthDate) {
        csvContent += `出生日期,${personalInfo.birthDate}\n`;
      }
      if (personalInfo.birthDateAD) {
        csvContent += `出生日期(西元年),${personalInfo.birthDateAD}\n`;
      }
      if (personalInfo.gender) {
        csvContent += `性別,${personalInfo.gender}\n`;
      }
      
      csvContent += `擷取時間,${personalInfo.extractedAt}\n`;
      csvContent += `資料來源,${personalInfo.source}\n`;
      csvContent += '\n'; // 空行分隔
    }
    
    // 添加表格資料
    if (tableData && tableData.length > 0) {
      csvContent += '表格資料\n';
      
      // 獲取所有欄位名稱
      const allKeys = new Set();
      tableData.forEach(row => {
        Object.keys(row).forEach(key => allKeys.add(key));
      });
      const headers = Array.from(allKeys);
      
      // 添加表頭
      csvContent += headers.map(header => `"${header}"`).join(',') + '\n';
      
      // 添加資料行
      tableData.forEach(row => {
        const values = headers.map(header => {
          const value = row[header] || '';
          // 處理包含逗號、引號或換行符的值
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csvContent += values.join(',') + '\n';
      });
    }
    
    // 添加擷取資訊
    csvContent += '\n擷取資訊\n';
    csvContent += `擷取時間,${new Date().toISOString()}\n`;
    csvContent += `資料筆數,${tableData ? tableData.length : 0}\n`;
    csvContent += `工具版本,2.0.0\n`;
    
    return csvContent;
  } catch (error) {
    console.error('轉換 CSV 時發生錯誤:', error);
    return '轉換錯誤: ' + error.message;
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
  } catch (error) {
    console.error('更新監測狀態時發生錯誤:', error);
  }
}

// 監聽標籤頁關閉事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (monitoringTabs.has(tabId)) {
    console.log(`標籤頁 ${tabId} 已關閉，清理監測狀態`);
    monitoringTabs.delete(tabId);
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

