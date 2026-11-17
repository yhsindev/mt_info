import 'dotenv/config';
import { createEquipmentSync, equipmentSyncOptionsFromEnv } from '../server/equipmentSync';

// CLI and background worker share validation, a lock and atomic activation.
try {
  const sync = createEquipmentSync(equipmentSyncOptionsFromEnv());
  const result = await sync.refresh();
  const status = sync.getStatus();
  if (result.outcome === 'updated') {
    console.log(`已啟用衛福部 AED 驗證版本。抓取時間 ${status.fetchedAt}；執行中的 API 會自動讀取新版本，不需重啟。此時間不是設備實際巡檢時間。`);
  } else if (result.outcome === 'busy') {
    console.log('另一個 AED 同步工作執行中，本次未重複下載。');
  } else {
    console.error('AED 同步失敗，保留最近一次驗證成功的資料，稍後可重試。');
    process.exitCode = 1;
  }
} catch {
  console.error('AED 同步無法完成，請檢查同步設定或本機資料目錄權限；原保存資料未切換。');
  process.exitCode = 1;
}
