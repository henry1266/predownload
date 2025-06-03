// 頁面監測版本 - 彈出視窗腳本 (URL 跳轉監測版)
// 處理 URL 跳轉監測功能的使用者介面互動

// 全域變數
let currentTabId = null;
let monitoringStatus = false;
let statusCheckInterval = null;
let currentTabInfo = null;

// 狀態圖示路徑
const STATUS_ICONS = {
  STOPPED: '../../assets/status_icons/status_stopped.png',
  RUNNING: '../../assets/status_icons/status_running.png',
  ERROR: '../../assets/status_icons/status_error.png'
};

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
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const toggleBtn = document.getElementById('toggleMonitorBtn');
  const monitorBtnText = document.getElementById('monitorBtnText');
  
  if (status.isMonitoring) {
    // 監測中
    statusIcon.src = STATUS_ICONS.RUNNING;
    statusText.textContent = '✅監測中';
    toggleBtn.className = 'monitor-btn stop';
    monitorBtnText.textContent = '⏹️停止監測';
    monitoringStatus = true;
    
    // 通知背景腳本更新瀏覽器icon為綠色
    chrome.runtime.sendMessage({
      action: 'updateBrowserIcon',
      status: 'monitoring'
    });
  } else {
    // 未監測
    statusIcon.src = STATUS_ICONS.STOPPED;
    statusText.textContent = '❌監測停止';
    toggleBtn.className = 'monitor-btn';
    monitorBtnText.textContent = '▶️開始監測';
    monitoringStatus = false;
    
    // 通知背景腳本更新瀏覽器icon為紅色
    chrome.runtime.sendMessage({
      action: 'updateBrowserIcon',
      status: 'stopped'
    });
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
  const statusIcon = document.getElementById('statusIcon');
  
  // 暫時禁用按鈕
  toggleBtn.disabled = true;
  monitorBtnText.textContent = '處理中...';
  
  const action = monitoringStatus ? 'stopMonitoring' : 'startMonitoring';
  
  chrome.tabs.sendMessage(currentTabId, { action: action }, function(response) {
    if (chrome.runtime.lastError) {
      const errorMessage = formatErrorMessage(chrome.runtime.lastError);
      console.error('切換監測狀態失敗:', errorMessage);
      
      // 顯示錯誤狀態圖示
      statusIcon.src = STATUS_ICONS.ERROR;
      
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
    
    // 顯示錯誤狀態圖示
    const statusIcon = document.getElementById('statusIcon');
    statusIcon.src = STATUS_ICONS.ERROR;
    
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

// 檢查是否為目標網址
function isTargetUrl(url) {
  return url && url.includes('/IMUE0008');
}

// 檢查是否為起始網址
function isStartUrl(url) {
  return url && (url.includes('/imu/IMUE1000/#') || url.endsWith('/imu/IMUE1000/'));
}

// 檢查是否為相關網址
function isRelevantUrl(url) {
  return url && url.includes('medcloud2.nhi.gov.tw/imu/IMUE1000/');
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  // 獲取當前標籤頁
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      currentTabId = tabs[0].id;
      currentTabInfo = tabs[0];
      
      console.log('當前標籤頁:', currentTabInfo.url);
      
      // 檢查監測狀態
      checkMonitoringStatus();
      
      // 設置定期檢查
      statusCheckInterval = setInterval(checkMonitoringStatus, 2000);
    }
  });
  
  // 綁定事件監聽器
  const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');
  
  // 監測控制按鈕
  if (toggleMonitorBtn) {
    toggleMonitorBtn.addEventListener('click', toggleMonitoring);
  }
});

// 清理
window.addEventListener('beforeunload', function() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
});
