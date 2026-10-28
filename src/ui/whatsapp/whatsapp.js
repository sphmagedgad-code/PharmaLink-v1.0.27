/**
 * PharmaLink OS - WhatsApp Import Screen
 * Multi-file drag & drop TXT import, wired to importWhatsAppFiles.
 * Visuals ported from the frozen reference's dropzone/processing/
 * stats patterns.
 */

import { importWhatsAppFiles } from '../../orchestrators/importWhatsAppFile.js';
import { archiveAndDeleteOldMessages, exportOldMessages } from '../../orchestrators/archiveWhatsApp.js';
import { findSalesOpportunities } from '../../orchestrators/findSalesOpportunities.js';
import * as whatsappRepo from '../../db/repositories/whatsappRepo.js';
import * as medicinesRepo from '../../db/repositories/medicinesRepo.js';
import * as contactsRepo from '../../db/repositories/contactsRepo.js';

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Staged files awaiting an explicit "Analyze" click. Re-selecting a
// file with the same name is ignored (UX-level guard); actual
// content-level duplicate detection during analysis is handled by
// the existing importWhatsAppFile.js dedupe mechanism, unchanged.
let stagedFiles = [];
let isAnalyzing = false;

function renderStagedFiles(mountEl) {
  const tagsEl = mountEl.querySelector('#wa-file-tags');
  const analyzeBtn = mountEl.querySelector('#wa-analyze-btn');

  tagsEl.innerHTML = stagedFiles.map((f) => `<span class="file-tag">📄 ${f.name}</span>`).join('');
  tagsEl.classList.toggle('on', stagedFiles.length > 0);
  analyzeBtn.disabled = stagedFiles.length === 0 || isAnalyzing;
  analyzeBtn.textContent = isAnalyzing ? 'جارٍ التحليل...' : `تحليل (${stagedFiles.length})`;
}

function stageFiles(mountEl, fileList) {
  const incoming = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.txt'));
  for (const file of incoming) {
    if (!stagedFiles.some((f) => f.name === file.name)) {
      stagedFiles.push(file);
    }
  }
  renderStagedFiles(mountEl);
}

async function analyzeStagedFiles(mountEl) {
  if (isAnalyzing || stagedFiles.length === 0) return;
  isAnalyzing = true;
  renderStagedFiles(mountEl);

  const welcomeEl = mountEl.querySelector('#wa-welcome');
  const processingEl = mountEl.querySelector('#wa-processing');
  const resultEl = mountEl.querySelector('#wa-result');
  const progressBar = mountEl.querySelector('#wa-progress-bar');
  const progressText = mountEl.querySelector('#wa-progress-text');

  welcomeEl.style.display = 'none';
  resultEl.style.display = 'none';
  processingEl.style.display = 'flex';

  const filesToAnalyze = stagedFiles;
  let summary;
  try {
    const fileContents = await Promise.all(
      filesToAnalyze.map(async (f) => ({ name: f.name, text: await readFileAsText(f) }))
    );

    summary = await importWhatsAppFiles(fileContents, ({ phase, current, total }) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      progressBar.style.width = `${pct}%`;
      const phaseLabel = { classifying: 'تحليل الرسائل', linking: 'ربط البيانات', saving: 'الحفظ' }[phase] || phase;
      progressText.textContent = `تحليل ${filesToAnalyze.length} ملف - ${phaseLabel}... ${current}/${total}`;
    });
  } catch (err) {
    processingEl.style.display = 'none';
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div class="entity-card"><div class="entity-card__section"><p style="font-size:0.82rem;color:#c0392b;">تعذّر إكمال التحليل: ${err.message}</p></div></div>`;
    isAnalyzing = false;
    stagedFiles = [];
    renderStagedFiles(mountEl);
    return;
  }

  // Real, freshly-persisted system-wide totals - not batch estimates.
  const [medicines, buyers, sellers, opportunities] = await Promise.all([
    medicinesRepo.getAllMedicines(),
    contactsRepo.getBuyers(),
    contactsRepo.getSellers(),
    findSalesOpportunities(),
  ]);

  processingEl.style.display = 'none';
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">اكتمل التحليل</span></div>
      <div class="entity-card__section">
        <div class="entity-card__section-label">هذه الدفعة (${filesToAnalyze.length} ملف)</div>
        <div class="entity-row"><span class="entity-row__title">إجمالي الأسطر</span><span class="entity-row__price">${summary.totalLines}</span></div>
        <div class="entity-row"><span class="entity-row__title">رسائل مستوردة</span><span class="entity-row__price">${summary.imported}</span></div>
        <div class="entity-row"><span class="entity-row__title">مكررة تم تجاهلها</span><span class="entity-row__price">${summary.duplicates}</span></div>
        <div class="entity-row"><span class="entity-row__title">عاجلة</span><span class="entity-row__price">${summary.urgentCount}</span></div>
        <div class="entity-row"><span class="entity-row__title">بيانات مستخرجة</span><span class="entity-row__price">${summary.entitiesCreated}</span></div>
      </div>
      <div class="entity-card__section">
        <div class="entity-card__section-label">إجمالي النظام الآن</div>
        <div class="entity-row"><span class="entity-row__title">الأدوية</span><span class="entity-row__price">${medicines.length}</span></div>
        <div class="entity-row"><span class="entity-row__title">المشترين</span><span class="entity-row__price">${buyers.length}</span></div>
        <div class="entity-row"><span class="entity-row__title">البائعين</span><span class="entity-row__price">${sellers.length}</span></div>
        <div class="entity-row"><span class="entity-row__title">فرص بيع مطابقة</span><span class="entity-row__price">${opportunities.length}</span></div>
      </div>
    </div>
  `;

  isAnalyzing = false;
  stagedFiles = [];
  renderStagedFiles(mountEl);
  await refreshMessageCount(mountEl);
}

async function refreshMessageCount(mountEl) {
  const count = await whatsappRepo.countMessages();
  const el = mountEl.querySelector('#wa-total-count');
  if (el) el.textContent = count;
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div id="wa-welcome" class="welcome">
      <div class="dz-icon" style="font-size:2.6rem">📲</div>
      <h2>استيراد محادثات واتساب</h2>
      <p>ارفع ملفات نصية (.txt) مصدّرة من واتساب - يمكن رفع أكثر من ملف دفعة واحدة</p>
      <div id="wa-dropzone" class="dropzone">
        <div class="dz-icon">📁</div>
        <h3>اسحب الملفات هنا أو اضغط للاختيار</h3>
        <p>ملفات .txt فقط</p>
        <input id="wa-file-input" type="file" accept=".txt" multiple style="display:none" />
      </div>
      <div id="wa-file-tags" class="file-tags"></div>
      <button id="wa-analyze-btn" class="btn btn--gold" style="width:100%;" disabled>تحليل (0)</button>
      <div class="howto">
        <h4>عدد الرسائل المستوردة حاليًا: <span id="wa-total-count">…</span></h4>
        <li>📄 كل رسالة تُفحص لاستخراج الدواء والسعر والهاتف</li>
        <li>🔁 الرسائل المكررة يتم تجاهلها تلقائيًا</li>
        <li>🚨 الطلبات العاجلة تظهر في لوحة التحكم</li>
      </div>
    </div>

    <div id="wa-processing" class="processing" style="display:none;">
      <div class="spinner"></div>
      <p id="wa-progress-text">جارٍ المعالجة...</p>
      <div class="progress-bar-wrap"><div id="wa-progress-bar" class="progress-bar"></div></div>
    </div>

    <div id="wa-result" style="display:none;"></div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">أرشفة البيانات القديمة</span></div>
      <div class="entity-card__section">
        <div class="entity-card__section-label">حذف/تصدير الرسائل الأقدم من تاريخ محدد (لا يؤثر على الأدوية أو جهات الاتصال أو الصفقات)</div>
        <input id="wa-archive-date" type="date" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:8px;" />
        <div style="display:flex; gap:6px;">
          <button id="wa-export-btn" class="btn btn--outline" style="flex:1">تصدير فقط</button>
          <button id="wa-archive-btn" class="btn btn--danger" style="flex:1">تصدير وحذف</button>
        </div>
      </div>
    </div>
  `;

  await refreshMessageCount(mountEl);
  renderStagedFiles(mountEl);

  const dropzone = mountEl.querySelector('#wa-dropzone');
  const fileInput = mountEl.querySelector('#wa-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    stageFiles(mountEl, e.target.files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    stageFiles(mountEl, e.dataTransfer.files);
  });

  mountEl.querySelector('#wa-analyze-btn').addEventListener('click', () => analyzeStagedFiles(mountEl));

  mountEl.querySelector('#wa-export-btn').addEventListener('click', async () => {
    const dateValue = mountEl.querySelector('#wa-archive-date').value;
    if (!dateValue) return;
    const result = await exportOldMessages(new Date(dateValue).toISOString());
    downloadJSON(result, `pharmalink-whatsapp-export-${dateValue}.json`);
  });

  mountEl.querySelector('#wa-archive-btn').addEventListener('click', async () => {
    const dateValue = mountEl.querySelector('#wa-archive-date').value;
    if (!dateValue) return;
    const confirmed = window.confirm('سيتم تصدير الرسائل ثم حذفها نهائيًا. متابعة؟');
    if (!confirmed) return;
    const result = await archiveAndDeleteOldMessages(new Date(dateValue).toISOString());
    downloadJSON(result.export, `pharmalink-whatsapp-archive-${dateValue}.json`);
    await refreshMessageCount(mountEl);
  });
}
