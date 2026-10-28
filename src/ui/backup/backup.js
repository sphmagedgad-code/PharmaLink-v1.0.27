/**
 * PharmaLink OS - Backup & Restore Screen
 */

import { exportBusinessData, exportFullData, restoreBusinessData, restoreFullData } from '../../orchestrators/backupRestore.js';

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="welcome" style="padding:20px 4px 8px;">
      <h2 style="color:var(--gold)">النسخ الاحتياطي والاستعادة</h2>
    </div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">تصدير نسخة احتياطية</span></div>
      <div class="entity-card__section">
        <div class="entity-card__section-label">الأدوية وجهات الاتصال والصفقات (سريع وموصى به)</div>
        <button id="export-business-btn" class="btn btn--gold" style="width:100%; margin-bottom:10px;">تصدير البيانات الأساسية</button>
        <div class="entity-card__empty-notice">تحذير: تضمين رسائل واتساب قد يكون بطيئًا مع عدد كبير من الرسائل</div>
        <button id="export-full-btn" class="btn btn--outline" style="width:100%; margin-top:8px;">تصدير كامل (شامل رسائل واتساب)</button>
      </div>
    </div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">استعادة من نسخة احتياطية</span></div>
      <div class="entity-card__section">
        <div class="entity-card__section-label">سيتم دمج البيانات المستعادة مع البيانات الحالية بنفس المعرّفات (لا يوجد حذف)</div>
        <input id="restore-file-input" type="file" accept="application/json,.json" style="width:100%; margin-bottom:8px;" />
        <button id="restore-btn" class="btn btn--danger" style="width:100%;">استعادة الآن</button>
      </div>
    </div>

    <div id="backup-status"></div>
  `;

  const statusEl = mountEl.querySelector('#backup-status');

  function showStatus(message) {
    statusEl.innerHTML = `<div class="entity-card"><div class="entity-card__section"><p style="font-size:0.82rem;">${message}</p></div></div>`;
  }

  mountEl.querySelector('#export-business-btn').addEventListener('click', async () => {
    showStatus('جارٍ تجهيز النسخة الاحتياطية...');
    const data = await exportBusinessData();
    downloadJSON(data, `pharmalink-backup-business-${new Date().toISOString().slice(0, 10)}.json`);
    showStatus(`تم تصدير ${data.medicines.length} دواء و ${data.contacts.length} جهة اتصال و ${data.deals.length} صفقة.`);
  });

  mountEl.querySelector('#export-full-btn').addEventListener('click', async () => {
    const confirmed = window.confirm('التصدير الكامل قد يستغرق وقتًا أطول مع عدد كبير من الرسائل. متابعة؟');
    if (!confirmed) return;
    showStatus('جارٍ تجهيز النسخة الكاملة...');
    const data = await exportFullData();
    downloadJSON(data, `pharmalink-backup-full-${new Date().toISOString().slice(0, 10)}.json`);
    showStatus(`تم تصدير نسخة كاملة تشمل ${data.whatsappMessages.length} رسالة و ${data.parsedEntities.length} بيانات مستخرجة.`);
  });

  mountEl.querySelector('#restore-btn').addEventListener('click', async () => {
    const fileInput = mountEl.querySelector('#restore-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const confirmed = window.confirm('سيتم استعادة البيانات من الملف المحدد. هل أنت متأكد؟');
    if (!confirmed) return;

    showStatus('جارٍ الاستعادة...');
    try {
      const text = await readFileAsText(file);
      const backup = JSON.parse(text);
      const counts = backup.scope === 'full' ? await restoreFullData(backup) : await restoreBusinessData(backup);
      showStatus(
        `تمت الاستعادة: ${counts.medicines} دواء، ${counts.contacts} جهة اتصال، ${counts.deals} صفقة` +
          (counts.whatsappMessages !== undefined ? `، ${counts.whatsappMessages} رسالة واتساب، ${counts.parsedEntities} بيانات مستخرجة.` : '.')
      );
    } catch (err) {
      showStatus(`تعذّرت الاستعادة: الملف تالف أو غير متوافق. (${err.message})`);
    }
  });
}
