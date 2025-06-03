# 健保醫療資訊系統表格結構分析

## 問題描述
用戶反映Chrome擴展可以截圖，但無法讀取表格資料。

## 參考網頁分析

### 1. 頁面基本信息
- 系統名稱：健保醫療資訊雲端查詢系統 (NHI MediCloud System)
- 功能頁面：西醫用藥紀錄
- 使用框架：DataTables

### 2. 表格結構分析

#### 主要容器結構：
```html
<div id="list" class="table-content-scroll">
  <div class="table-content-wrap">
    <div id="TableDiv">
      <div id="DataTables_Table_0_wrapper" class="dataTables_wrapper no-footer">
        <!-- DataTables 結構 -->
      </div>
    </div>
  </div>
</div>
```

#### DataTables 結構特點：
1. **雙重表格結構**：
   - `dataTables_scrollHead`：包含表頭的固定區域
   - `dataTables_scrollBody`：包含資料的滾動區域

2. **表頭結構**：
```html
<div class="dataTables_scrollHead">
  <div class="dataTables_scrollHeadInner">
    <table class="table table-bordered mb-none table-default dataTable no-footer">
      <thead>
        <tr role="row">
          <th>項次</th>
          <th>就醫日期</th>
          <th>來源</th>
          <!-- 更多表頭... -->
        </tr>
      </thead>
    </table>
  </div>
</div>
```

3. **資料區域結構**：
```html
<div class="dataTables_scrollBody">
  <table class="table table-bordered mb-none table-default dataTable no-footer" id="DataTables_Table_0">
    <thead>
      <!-- 隱藏的表頭，用於對齊 -->
    </thead>
    <tbody>
      <tr role="row" class="odd bg-green">
        <td>1</td>
        <td class="sorting_1">114/05/31</td>
        <td>桃園長庚<br>門診<br>1132071036</td>
        <!-- 更多資料... -->
      </tr>
    </tbody>
  </table>
</div>
```

### 3. 表格欄位分析

#### 表頭欄位：
1. 項次
2. 就醫日期
3. 來源
4. 就醫序號
5. 主診斷
6. 藥品代碼
7. 藥品名稱
8. 成分名稱
9. 用法用量
10. 給藥日數
11. 藥品用量
12. 單筆餘藥日數試算
13. ATC3名稱
14. ATC7代碼

#### 資料特點：
- 某些欄位包含多行資料（如來源欄位包含醫院名稱、門診類型、編號）
- 使用 `<br>` 標籤分隔多行內容
- 部分欄位可能包含特殊格式（如日期格式：114/05/31）

### 4. 現有代碼問題分析

#### 問題1：表格選擇器不正確
現有代碼使用 `document.querySelectorAll('table')` 會找到多個table元素，包括：
- 表頭區域的table
- 資料區域的table
- 可能的其他裝飾性table

#### 問題2：表頭擷取邏輯不完整
現有代碼假設表頭在第一個tr中，但DataTables的結構中，實際的表頭在 `dataTables_scrollHead` 區域。

#### 問題3：資料行識別不準確
現有代碼從第二行開始處理，但在DataTables結構中，資料都在 `dataTables_scrollBody` 的tbody中。

### 5. 解決方案建議

1. **改進表格識別**：
   - 優先識別DataTables結構
   - 使用更精確的選擇器定位資料表格

2. **分別處理表頭和資料**：
   - 從 `dataTables_scrollHead` 擷取表頭
   - 從 `dataTables_scrollBody` 擷取資料

3. **處理多行內容**：
   - 正確處理包含 `<br>` 的儲存格
   - 保持資料的完整性

4. **增加容錯機制**：
   - 如果DataTables結構不存在，回退到通用表格處理
   - 提供更好的錯誤處理和日誌記錄

