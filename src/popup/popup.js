// 頁面監測版本 - 彈出視窗腳本 (頁面重整觸發版)
// 處理頁面重整監測功能的使用者介面互動

// 全域變數
let currentTabId = null;
let monitoringStatus = false;
let statusCheckInterval = null;
let currentTabInfo = null;

// 格式化錯誤訊息的輔助函數
function formatErrorMessage(error) {
  if (!error) return '未知錯誤';
  
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error.message) return error.message;
  
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

// 格式化時間
function formatTime(isoString) {
  if (!isoString) return '--';
  
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return '剛剛';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分鐘前`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小時前`;
  } else {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}

// 更新監測狀態顯示
function updateMonitoringStatus(status) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const monitorInfo = document.getElementById('monitorInfo');
  const startTime = document.getElementById('startTime');
  const lastActivity = document.getElementById('lastActivity');
  const toggleBtn = document.getElementById('toggleMonitorBtn');
  const monitorIcon = document.getElementById('monitorIcon');
  const monitorBtnText = document.getElementById('monitorBtnText');
  const pageStatus = document.getElementById('pageStatus');
  
  if (status.isMonitoring) {
    // 監測中
    statusDot.className = 'status-dot active';
    monitorInfo.style.display = 'block';
    
    // 根據頁面狀態顯示不同的監測狀態
    if (status.isOnTargetPage) {
      statusText.textContent = '正在監測頁面重整';
      pageStatus.textContent = '目標頁面 - 監測頁面重整和資料變化';
      pageStatus.className = 'page-status target';
    } else if (currentTabInfo && currentTabInfo.url.includes('medcloud2.nhi.gov.tw')) {
      statusText.textContent = '正在監測頁面重整';
      pageStatus.textContent = '相關頁面 - 監測頁面重整';
      pageStatus.className = 'page-status related';
    } else {
      statusText.textContent = '正在監測頁面重整';
      pageStatus.textContent = '一般頁面 - 監測頁面重整';
      pageStatus.className = 'page-status general';
    }
    
    startTime.textContent = formatTime(status.startTime);
    lastActivity.textContent = formatTime(status.lastProcessed || status.pageLoadTime);
    
    toggleBtn.className = 'monitor-btn stop';
    toggleBtn.disabled = false;
    monitorIcon.textContent = '⏹️';
    monitorBtnText.textContent = '停止監測';
    
    monitoringStatus = true;
  } else {
    // 未監測
    statusDot.className = 'status-dot inactive';
    statusText.textContent = '監測已停止';
    monitorInfo.style.display = 'none';
    
    // 顯示當前頁面狀態
    if (currentTabInfo) {
      if (isTargetUrl(currentTabInfo.url)) {
        pageStatus.textContent = '目標頁面 - 可開始監測頁面重整';
        pageStatus.className = 'page-status target';
      } else if (isRelevantUrl(currentTabInfo.url)) {
        pageStatus.textContent = '相關頁面 - 可開始監測頁面重整';
        pageStatus.className = 'page-status related';
      } else {
        pageStatus.textContent = '一般頁面 - 可開始監測頁面重整';
        pageStatus.className = 'page-status general';
      }
    } else {
      pageStatus.textContent = '準備就緒';
      pageStatus.className = 'page-status ready';
    }
    
    toggleBtn.className = 'monitor-btn';
    toggleBtn.disabled = false;
    monitorIcon.textContent = '▶️';
    monitorBtnText.textContent = '開始監測';
    
    monitoringStatus = false;
  }
}

// 檢查當前標籤頁的監測狀態
function checkMonitoringStatus() {
  if (!currentTabId) return;
  
  chrome.tabs.sendMessage(currentTabId, { action: 'getMonitorStatus' }, function(response) {
    if (chrome.runtime.lastError) {
      // 如果無法與內容腳本通信，顯示未監測狀態
      updateMonitoringStatus({ isMonitoring: false });
      return;
    }
    
    if (response) {
      updateMonitoringStatus(response);
    }
  });
}

// 切換監測狀態
function toggleMonitoring() {
  if (!currentTabId) return;
  
  const toggleBtn = document.getElementById('toggleMonitorBtn');
  const monitorBtnText = document.getElementById('monitorBtnText');
  
  // 暫時禁用按鈕
  toggleBtn.disabled = true;
  monitorBtnText.textContent = '處理中...';
  
  const action = monitoringStatus ? 'stopMonitoring' : 'startMonitoring';
  
  chrome.tabs.sendMessage(currentTabId, { action: action }, function(response) {
    if (chrome.runtime.lastError) {
      const errorMessage = formatErrorMessage(chrome.runtime.lastError);
      console.error('切換監測狀態失敗:', errorMessage);
      
      // 如果是通信錯誤，嘗試注入內容腳本
      if (isHarmlessCommunicationError(errorMessage)) {
        chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          files: ['src/content/content.js']
        }).then(() => {
          // 腳本注入後再次嘗試
          setTimeout(() => {
            chrome.tabs.sendMessage(currentTabId, { action: action }, function(retryResponse) {
              if (chrome.runtime.lastError) {
                console.error('重試失敗:', formatErrorMessage(chrome.runtime.lastError));
                showError('無法在此頁面啟動監測功能');
                resetButton();
              } else {
                handleToggleResponse(retryResponse);
              }
            });
          }, 1000);
        }).catch(err => {
          console.error('腳本注入失敗:', formatErrorMessage(err));
          showError('無法在此頁面載入監測功能');
          resetButton();
        });
      } else {
        showError('通信錯誤: ' + errorMessage);
        resetButton();
      }
      return;
    }
    
    handleToggleResponse(response);
  });
  
  function resetButton() {
    toggleBtn.disabled = false;
    monitorBtnText.textContent = monitoringStatus ? '停止監測' : '開始監測';
  }
}

// 處理切換監測的回應
function handleToggleResponse(response) {
  if (response && response.success) {
    // 更新狀態
    setTimeout(() => {
      checkMonitoringStatus();
    }, 500);
  } else {
    const errorMessage = response ? response.message : '操作失敗';
    console.error('監測操作失敗:', errorMessage);
    showError('操作失敗: ' + errorMessage);
    
    // 恢復按鈕狀態
    const toggleBtn = document.getElementById('toggleMonitorBtn');
    const monitorBtnText = document.getElementById('monitorBtnText');
    toggleBtn.disabled = false;
    monitorBtnText.textContent = monitoringStatus ? '停止監測' : '開始監測';
  }
}

// 顯示錯誤訊息
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  errorDiv.style.cssText = `
    background-color: #ffebee;
    color: #c62828;
    padding: 8px 12px;
    border-radius: 4px;
    margin: 8px 0;
    font-size: 12px;
    border-left: 3px solid #c62828;
  `;
  
  const container = document.querySelector('.container');
  container.insertBefore(errorDiv, container.firstChild);
  
  // 3秒後自動移除
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 3000);
}

// 手動擷取資料
function captureAndExtract() {
  const captureBtn = document.getElementById('captureBtn');
  const statusPanel = document.getElementById('statusPanel');
  const statusMessage = document.getElementById('statusMessage');
  const progressBar = document.getElementById('progressBar');
  
  // 顯示處理中狀態
  statusPanel.style.display = 'block';
  statusMessage.textContent = '處理中...';
  captureBtn.disabled = true;
  
  // 模擬進度條動畫
  let progress = 0;
  const progressInterval = setInterval(function() {
    progress += 5;
    progressBar.style.width = progress + '%';
    
    if (progress >= 100) {
      clearInterval(progressInterval);
    }
  }, 100);
  
  // 向背景腳本發送消息
  chrome.runtime.sendMessage({ action: 'captureAndExtract' }, function(response) {
    // 清除進度條動畫
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    captureBtn.disabled = false;
    
    // 檢查是否有chrome.runtime.lastError
    if (chrome.runtime.lastError) {
      const errorMessage = formatErrorMessage(chrome.runtime.lastError);
      console.error('發送消息時發生錯誤:', errorMessage);
      statusMessage.textContent = '通信錯誤: ' + errorMessage;
      
      setTimeout(function() {
        statusPanel.style.display = 'none';
      }, 5000);
      return;
    }
    
    // 處理回應
    if (response && response.success) {
      // 顯示成功訊息
      statusMessage.textContent = response.message || '擷取完成！檔案已儲存到下載資料夾。';
      
      // 3秒後隱藏狀態面板
      setTimeout(function() {
        statusPanel.style.display = 'none';
      }, 3000);
    } else {
      // 顯示錯誤
      let errorMessage = '未知錯誤';
      
      if (response) {
        errorMessage = response.message || formatErrorMessage(response.error) || '處理失敗';
      }
      
      statusMessage.textContent = '發生錯誤: ' + errorMessage;
      console.error('擷取失敗:', errorMessage);
      
      setTimeout(function() {
        statusPanel.style.display = 'none';
      }, 5000);
    }
  });
}

// 檢查是否為目標網址
function isTargetUrl(url) {
  return url && url.includes('medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0008');
}

// 檢查是否為相關網址
function isRelevantUrl(url) {
  return url && url.includes('medcloud2.nhi.gov.tw/imu/IMUE1000/');
}

// 更新頁面資訊顯示
function updatePageInfo() {
  const pageInfo = document.getElementById('pageInfo');
  const urlDisplay = document.getElementById('urlDisplay');
  
  if (currentTabInfo) {
    const url = currentTabInfo.url;
    const title = currentTabInfo.title;
    
    // 顯示簡化的 URL
    let displayUrl = url;
    if (url.length > 50) {
      displayUrl = url.substring(0, 47) + '...';
    }
    
    urlDisplay.textContent = displayUrl;
    urlDisplay.title = url; // 完整 URL 顯示在 tooltip
    
    // 根據頁面類型設置樣式
    if (isTargetUrl(url)) {
      pageInfo.className = 'page-info target';
    } else if (isRelevantUrl(url)) {
      pageInfo.className = 'page-info related';
    } else {
      pageInfo.className = 'page-info general';
    }
  }
}

// 手動重新整理頁面
function refreshPage() {
  if (!currentTabId) return;
  
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '重新整理中...';
  }
  
  // 重新整理當前標籤頁
  chrome.tabs.reload(currentTabId, function() {
    if (chrome.runtime.lastError) {
      console.error('重新整理頁面失敗:', formatErrorMessage(chrome.runtime.lastError));
      showError('重新整理頁面失敗');
    } else {
      console.log('頁面重新整理成功');
      
      // 如果正在監測，重新整理後會自動觸發檢測
      if (monitoringStatus) {
        setTimeout(() => {
          checkMonitoringStatus();
        }, 2000);
      }
    }
    
    // 恢復按鈕狀態
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 重新整理';
    }
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  // 獲取當前標籤頁
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      currentTabId = tabs[0].id;
      currentTabInfo = tabs[0];
      
      console.log('當前標籤頁:', currentTabInfo.url);
      
      // 更新頁面資訊顯示
      updatePageInfo();
      
      // 檢查監測狀態
      checkMonitoringStatus();
      
      // 設置定期檢查
      statusCheckInterval = setInterval(checkMonitoringStatus, 3000);
    }
  });
  
  // 綁定事件監聽器
  const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');
  const captureBtn = document.getElementById('captureBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const helpLink = document.getElementById('helpLink');
  const settingsLink = document.getElementById('settingsLink');
  
  // 監測控制按鈕
  if (toggleMonitorBtn) {
    toggleMonitorBtn.addEventListener('click', toggleMonitoring);
  }
  
  // 手動擷取按鈕
  if (captureBtn) {
    captureBtn.addEventListener('click', captureAndExtract);
  }
  
  // 重新整理按鈕
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshPage);
  }
  
  // 說明連結
  if (helpLink) {
    helpLink.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/help.html') });
    });
  }
  
  // 設定連結
  if (settingsLink) {
    settingsLink.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
    });
  }
});

// 清理
window.addEventListener('beforeunload', function() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
});

