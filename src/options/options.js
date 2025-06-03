// 設定頁面的腳本
document.addEventListener('DOMContentLoaded', function() {
  // 獲取DOM元素
  const autoStart = document.getElementById('autoStart');
  const showNotification = document.getElementById('showNotification');
  const screenshotQuality = document.getElementById('screenshotQuality');
  const screenshotFormat = document.getElementById('screenshotFormat');
  const defaultFormat = document.getElementById('defaultFormat');
  const autoDetectTable = document.getElementById('autoDetectTable');
  const saveLocation = document.getElementById('saveLocation');
  const customSelector = document.getElementById('customSelector');
  const dataProcessing = document.getElementById('dataProcessing');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  
  // 預設設定
  const defaultSettings = {
    autoStart: false,
    showNotification: true,
    screenshotQuality: '0.7',
    screenshotFormat: 'png',
    defaultFormat: 'csv',
    autoDetectTable: true,
    saveLocation: '',
    customSelector: '',
    dataProcessing: 'none'
  };
  
  // 載入設定
  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, function(items) {
      autoStart.checked = items.autoStart;
      showNotification.checked = items.showNotification;
      screenshotQuality.value = items.screenshotQuality;
      screenshotFormat.value = items.screenshotFormat;
      defaultFormat.value = items.defaultFormat;
      autoDetectTable.checked = items.autoDetectTable;
      saveLocation.value = items.saveLocation;
      customSelector.value = items.customSelector;
      dataProcessing.value = items.dataProcessing;
    });
  }
  
  // 儲存設定
  function saveSettings() {
    const settings = {
      autoStart: autoStart.checked,
      showNotification: showNotification.checked,
      screenshotQuality: screenshotQuality.value,
      screenshotFormat: screenshotFormat.value,
      defaultFormat: defaultFormat.value,
      autoDetectTable: autoDetectTable.checked,
      saveLocation: saveLocation.value,
      customSelector: customSelector.value,
      dataProcessing: dataProcessing.value
    };
    
    chrome.storage.sync.set(settings, function() {
      // 顯示儲存成功訊息
      showToast('設定已儲存');
    });
  }
  
  // 重設為預設值
  function resetSettings() {
    // 確認是否要重設
    if (confirm('確定要重設所有設定為預設值嗎？')) {
      chrome.storage.sync.set(defaultSettings, function() {
        loadSettings();
        showToast('設定已重設為預設值');
      });
    }
  }
  
  // 顯示提示訊息
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
  
  // 初始載入設定
  loadSettings();
  
  // 儲存按鈕點擊事件
  saveBtn.addEventListener('click', saveSettings);
  
  // 重設按鈕點擊事件
  resetBtn.addEventListener('click', resetSettings);
  
  // 瀏覽資料夾按鈕點擊事件
  browseFolderBtn.addEventListener('click', function() {
    // 注意：由於瀏覽器擴充功能的安全限制，無法直接存取本地檔案系統
    // 這裡只是示範，實際上需要使用 chrome.downloads.onDeterminingFilename 事件來處理
    alert('由於瀏覽器安全限制，無法直接選擇資料夾。請在下載時手動選擇儲存位置。');
  });
});
