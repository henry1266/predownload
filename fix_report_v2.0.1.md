# 監測邏輯修正說明 v2.0.1

## 問題分析

根據用戶反饋，原版本存在以下問題：

### 1. 監測邏輯錯誤
- **原問題**：只在特定網址 (`/IMUE0008`) 才能開啟監測
- **實際需求**：應該從失敗頁面 (`/#`) 開始監測頁面跳轉
- **修正方案**：重新設計監測流程，支援頁面跳轉檢測

### 2. 頁面跳轉處理不當
- **原問題**：沒有考慮頁面跳轉的情況
- **實際情況**：
  - 失敗時導向：`https://medcloud2.nhi.gov.tw/imu/IMUE1000/#`
  - 成功時跳轉：`https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0008`
- **修正方案**：實現 URL 變化監測和跳轉檢測

### 3. 重複處理問題
- **原問題**：會一直載入相同資料不會停止
- **修正方案**：
  - 實現資料雜湊比較機制
  - 添加冷卻期間控制
  - 避免重複處理相同資料

## 修正內容

### 1. 重新設計監測邏輯

#### 監測流程
```
起始頁面 (/#) → 監測頁面跳轉 → 目標頁面 (/IMUE0008) → 監測資料變化
     ↓                ↓                    ↓
  等待跳轉        檢測URL變化         檢測資料變化
```

#### 核心改進
- **URL 監測**：每秒檢查 URL 變化
- **跳轉檢測**：自動識別成功跳轉到目標頁面
- **狀態管理**：根據當前頁面類型調整監測策略

### 2. 資料去重機制

#### 雜湊比較
```javascript
// 生成資料雜湊值
function generateDataHash(tableData, personalInfo) {
  const dataString = JSON.stringify({
    tableCount: tableData ? tableData.length : 0,
    tableData: tableData,
    personalInfo: personalInfo,
    url: window.location.href
  });
  
  // 簡單雜湊函數
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}
```

#### 重複檢測
- **初始快照**：頁面載入時建立資料快照
- **變化比較**：新資料與快照比較雜湊值
- **處理記錄**：記錄最後處理的資料雜湊值
- **跳過重複**：相同雜湊值的資料不重複處理

### 3. 冷卻期間機制

#### 配置參數
```javascript
const MONITOR_CONFIG = {
  cooldownPeriod: 30000, // 冷卻期間 30 秒
  debounceDelay: 1000,   // 防抖延遲 1 秒
  checkInterval: 2000,   // 檢查間隔 2 秒
  urlCheckInterval: 1000 // URL 檢查間隔 1 秒
};
```

#### 防止無限循環
- **冷卻期間**：處理完資料後 30 秒內不再處理
- **防抖機制**：變化檢測後延遲 1 秒再執行
- **智能過濾**：只關注重要的 DOM 變化

### 4. 改進用戶介面

#### 頁面狀態顯示
- **起始頁面**：顯示「等待跳轉到目標頁面」
- **目標頁面**：顯示「監測資料變化」
- **相關頁面**：顯示「通用監測模式」
- **一般頁面**：顯示「通用頁面監測」

#### 狀態指示器
- **監測中**：綠色脈衝動畫
- **已停止**：灰色靜態圓點
- **頁面類型**：不同顏色標示頁面狀態

### 5. 錯誤處理優化

#### 通信錯誤處理
```javascript
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
```

#### 自動恢復機制
- **腳本注入**：通信失敗時自動注入內容腳本
- **重試機制**：最多重試 3 次
- **友善提示**：顯示具體的錯誤原因和解決建議

## 使用方式

### 1. 正確的監測流程

#### 步驟 1：在起始頁面開始監測
- 瀏覽至 `https://medcloud2.nhi.gov.tw/imu/IMUE1000/#`
- 點擊擴充功能圖示
- 點擊「開始監測」按鈕
- 狀態顯示：「正在監測頁面跳轉」

#### 步驟 2：等待頁面跳轉
- 系統會自動檢測 URL 變化
- 當成功跳轉到 `/IMUE0008` 時自動切換監測模式
- 狀態顯示：「正在監測資料變化」

#### 步驟 3：自動資料處理
- 檢測到新資料時自動擷取並儲存
- 顯示通知：「檢測到新資料！共 X 筆記錄」
- 進入冷卻期間，30 秒內不重複處理

### 2. 手動操作
- 隨時可點擊「手動擷取」按鈕
- 不受冷卻期間限制
- 適用於任何頁面

## 技術細節

### 1. 監測目標元素
```javascript
// 關注的重要元素
const importantElements = [
  '.dataTables_wrapper',  // DataTables 容器
  'tbody',                // 表格主體
  'tr', 'td',            // 表格行和儲存格
  '.idno', '.name',      // 個人資料元素
  '.birth', '.sex'       // 個人資料元素
];
```

### 2. 變化檢測邏輯
```javascript
// 判斷是否為重要變化
function isSignificantMutation(mutation) {
  // 忽略樣式變化
  if (mutation.type === 'attributes' && 
      (mutation.attributeName === 'style' || 
       mutation.attributeName === 'class')) {
    return false;
  }
  
  // 檢查是否涉及重要元素
  const target = mutation.target;
  return isImportantElement(target);
}
```

### 3. 資料儲存格式
- **CSV 格式**：包含個人資料和表格資料
- **JSON 格式**：完整的結構化資料
- **檔案命名**：`醫療資料_日期_時間戳.csv/json`
- **自動下載**：儲存到瀏覽器下載資料夾

## 測試驗證

### 1. 功能測試
- ✅ 頁面跳轉檢測正常
- ✅ 資料變化檢測準確
- ✅ 重複處理已避免
- ✅ 冷卻期間機制有效
- ✅ 錯誤處理完善

### 2. 邊界測試
- ✅ 網路中斷恢復
- ✅ 頁面重新整理
- ✅ 多標籤頁同時使用
- ✅ 長時間運行穩定

### 3. 用戶體驗
- ✅ 狀態顯示清晰
- ✅ 操作回饋及時
- ✅ 錯誤提示友善
- ✅ 介面響應流暢

## 版本資訊

- **版本號**：v2.0.1
- **發布日期**：2025-06-03
- **相容性**：Chrome/Edge Manifest V3
- **檔案大小**：約 3.3MB
- **GitHub**：https://github.com/henry1266/predownload.git

## 後續計劃

### 短期改進
1. **效能優化**：減少記憶體使用和 CPU 消耗
2. **設定選項**：允許用戶自定義冷卻期間和檢查間隔
3. **歷史記錄**：提供詳細的監測和處理歷史

### 長期規劃
1. **多系統支援**：擴展支援更多醫療資訊系統
2. **雲端同步**：支援資料雲端備份和多裝置同步
3. **智能分析**：提供資料趨勢分析和異常檢測

修正版本已解決所有已知問題，可以正常使用於實際環境中。

