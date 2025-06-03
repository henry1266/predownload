// 頁面監測版本 - 彈出視窗腳本
// 處理監測功能的使用者介面互動

// 全域變數
let currentTabId = null;
let monitoringStatus = false;
let statusCheckInterval = null;

// 格式化錯誤訊息的輔助函數
function formatErrorMessage(error) {
  if (!error) return '未知錯誤';
  
  // 如果是字符串，直接返回
  if (typeof error === 'string') return error;
  
  // 如果是Error對象，返回message屬性
  if (error instanceof Error) return error.message;
  
  // 如果是對象且有message屬性
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

// 格式化時間
function formatTime(isoString) {
  if (!isoString) return '--';
  
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) { // 小於1分鐘
    return '剛剛';
  } else if (diff < 3600000) { // 小於1小時
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分鐘前`;
  } else if (diff < 86400000) { // 小於1天
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
  
  if (status.isMonitoring) {
    // 監測中
    statusDot.className = 'status-dot active';
    statusText.textContent = '正在監測頁面變化';
    monitorInfo.style.display = 'block';
    
    startTime.textContent = formatTime(status.startTime);
    lastActivity.textContent = formatTime(status.lastActivity);
    
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
                toggleBtn.disabled = false;
                monitorBtnText.textContent = monitoringStatus ? '停止監測' : '開始監測';
              } else {
                handleToggleResponse(retryResponse);
              }
            });
          }, 500);
        }).catch(err => {
          console.error('腳本注入失敗:', formatErrorMessage(err));
          toggleBtn.disabled = false;
          monitorBtnText.textContent = monitoringStatus ? '停止監測' : '開始監測';
        });
      } else {
        toggleBtn.disabled = false;
        monitorBtnText.textContent = monitoringStatus ? '停止監測' : '開始監測';
      }
      return;
    }
    
    handleToggleResponse(response);
  });
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
    
    // 恢復按鈕狀態
    const toggleBtn = document.getElementById('toggleMonitorBtn');
    const monitorBtnText = document.getElementById('monitorBtnText');
    toggleBtn.disabled = false;
    monitorBtnText.textContent = monitoringStatus ? '停止監測' : '開始監測';
  }
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
      
      // 5秒後隱藏狀態面板
      setTimeout(function() {
        statusPanel.style.display = 'none';
      }, 5000);
      return;
    }
    
    // 處理回應
    if (response && response.success) {
      // 顯示成功訊息
      statusMessage.textContent = '擷取完成！檔案已儲存到下載資料夾。';
      
      // 3秒後隱藏狀態面板
      setTimeout(function() {
        statusPanel.style.display = 'none';
      }, 3000);
    } else {
      // 顯示錯誤
      let errorMessage = '未知錯誤';
      
      if (response) {
        // 優先使用message，然後是error，最後是默認值
        errorMessage = response.message || formatErrorMessage(response.error) || '處理失敗';
      }
      
      statusMessage.textContent = '發生錯誤: ' + errorMessage;
      console.error('擷取失敗:', errorMessage);
      
      // 5秒後隱藏狀態面板
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

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  // 獲取當前標籤頁
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      currentTabId = tabs[0].id;
      
      // 檢查是否為目標網址
      const isTarget = isTargetUrl(tabs[0].url);
      if (isTarget) {
        console.log('當前頁面是目標網址');
      } else {
        console.log('當前頁面不是目標網址，但仍可使用監測功能');
      }
      
      // 檢查監測狀態
      checkMonitoringStatus();
      
      // 設置定期檢查
      statusCheckInterval = setInterval(checkMonitoringStatus, 3000);
    }
  });
  
  // 綁定事件監聽器
  const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');
  const captureBtn = document.getElementById('captureBtn');
  const helpLink = document.getElementById('helpLink');
  const settingsLink = document.getElementById('settingsLink');
  
  // 監測控制按鈕
  toggleMonitorBtn.addEventListener('click', toggleMonitoring);
  
  // 手動擷取按鈕
  captureBtn.addEventListener('click', captureAndExtract);
  
  // 說明連結
  helpLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/help.html') });
  });
  
  // 設定連結
  settingsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  });
});

// 清理
window.addEventListener('beforeunload', function() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
});

