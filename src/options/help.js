// 說明頁面的腳本
document.addEventListener('DOMContentLoaded', function() {
  // 獲取返回按鈕
  const backBtn = document.getElementById('backBtn');
  
  // 返回設定頁面
  backBtn.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
});
