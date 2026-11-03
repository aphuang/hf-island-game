/**
 * 島嶼大冒險 — 抽獎名單接收程式（Google Apps Script）
 *
 * 部署步驟：
 * 1. 開一份新的 Google 試算表（專門放抽獎名單），選單「擴充功能 → Apps Script」
 * 2. 把這整份程式碼貼上、儲存
 * 3. 右上「部署 → 新增部署作業」，類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 誰可以存取：所有人
 * 4. 複製產生的網址，貼到 data.js 的 ENTRY_ENDPOINT
 */
const SHEET_NAME = '抽獎名單';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['送出時間', '獎項', '姓名', '手機', 'Email', '抵達國家', '擲骰次數', '圖鑑國數', '來源頁面']);
    }
    const phone = String(data.phone || '').replace(/\D/g, '');
    const name = String(data.name || '').slice(0, 30);
    const email = String(data.email || '').slice(0, 80);
    if (!/^09\d{8}$/.test(phone) || !name) {
      return json({ ok: false, error: 'invalid' });
    }
    const prize = data.prize === '環島大獎' ? '環島大獎' : '一般抽獎';
    // 同一支手機每種獎項只登記一次
    const last = sheet.getLastRow();
    if (last > 1) {
      const rows = sheet.getRange(2, 2, last - 1, 3).getValues();
      if (rows.some((r) => r[0] === prize && String(r[2]).replace(/\D/g, '') === phone)) return json({ ok: true, duplicate: true });
    }
    sheet.appendRow([new Date(), prize, name, "'" + phone, email, data.target || '', data.rolls || '', data.dex || '', data.page || '']);
    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
