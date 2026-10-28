/**
 * PharmaLink OS - Settings Screen
 * Reuses nav.js's existing language switching (no new preference
 * system) and repository count methods for a quick data overview.
 */

import { setLanguage } from '../nav.js';
import { LANGUAGES, PREFERENCE_KEYS, APP_NAME, APP_VERSION } from '../../shared/constants.js';
import { getState } from '../../state/appStore.js';
import { getAllMedicines } from '../../db/repositories/medicinesRepo.js';
import { getAllContacts } from '../../db/repositories/contactsRepo.js';
import { getAllDeals } from '../../db/repositories/dealsRepo.js';
import { countMessages } from '../../db/repositories/whatsappRepo.js';

export async function render(mountEl) {
  const currentLanguage = localStorage.getItem(PREFERENCE_KEYS.LANGUAGE) || getState().ui.language;

  mountEl.innerHTML = `
    <div class="welcome" style="padding:20px 4px 8px;">
      <h2 style="color:var(--gold)">الإعدادات</h2>
    </div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">اللغة</span></div>
      <div class="entity-card__section" id="settings-lang-pills" style="display:flex; gap:6px;">
        <button class="btn ${currentLanguage === LANGUAGES.AR ? 'btn--gold' : 'btn--outline'}" data-lang="${LANGUAGES.AR}" style="flex:1">العربية</button>
        <button class="btn ${currentLanguage === LANGUAGES.EN ? 'btn--gold' : 'btn--outline'}" data-lang="${LANGUAGES.EN}" style="flex:1">English</button>
      </div>
    </div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">نظرة عامة على البيانات</span></div>
      <div class="entity-card__section" id="settings-counts"></div>
    </div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">حول التطبيق</span></div>
      <div class="entity-card__section">
        <div class="entity-row"><span class="entity-row__title">${APP_NAME}</span><span class="entity-row__meta">v${APP_VERSION}</span></div>
      </div>
    </div>
  `;

  mountEl.querySelector('#settings-lang-pills').addEventListener('click', (e) => {
    const button = e.target.closest('[data-lang]');
    if (!button) return;
    setLanguage(button.dataset.lang);
    render(mountEl);
  });

  const [medicines, contacts, deals, messageCount] = await Promise.all([
    getAllMedicines(),
    getAllContacts(),
    getAllDeals(),
    countMessages(),
  ]);

  const countsEl = mountEl.querySelector('#settings-counts');
  [
    ['الأدوية', medicines.length],
    ['جهات الاتصال', contacts.length],
    ['الصفقات', deals.length],
    ['رسائل واتساب', messageCount],
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'entity-row';
    row.innerHTML = `<span class="entity-row__title">${label}</span><span class="entity-row__price">${value}</span>`;
    countsEl.appendChild(row);
  });
}
