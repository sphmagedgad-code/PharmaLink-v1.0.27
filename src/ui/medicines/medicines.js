/**
 * PharmaLink OS - Medicines Screen
 * Real CRUD over the medicines store, instant local filter (list size
 * is small so no need to hit searchIndex for this list) plus category
 * pills matching the frozen pill filter pattern.
 */

import * as medicinesRepo from '../../db/repositories/medicinesRepo.js';
import { MEDICINE_CATEGORY } from '../../shared/constants.js';

const CATEGORY_LABELS = {
  [MEDICINE_CATEGORY.SHORTAGE]: 'أدوية ناقصة',
  [MEDICINE_CATEGORY.HIGH_VALUE]: 'أدوية غالية',
  [MEDICINE_CATEGORY.CANCER]: 'أورام',
  [MEDICINE_CATEGORY.HORMONAL]: 'هرمونات',
  [MEDICINE_CATEGORY.IMMUNOLOGY]: 'مناعة',
  [MEDICINE_CATEGORY.GENERAL]: 'عام',
};

let allMedicines = [];
let activeCategory = 'all';
let searchQuery = '';

function medicineCard(medicine) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header">
      <span class="entity-card__title">${medicine.name}</span>
      <span class="badge badge--deal">${CATEGORY_LABELS[medicine.category] || medicine.category}</span>
    </div>
    <div class="entity-card__action">
      <span class="entity-card__action-tip">${medicine.unit || 'بدون وحدة محددة'}</span>
      <button class="btn btn--outline" data-action="delete" data-id="${medicine.id}">حذف</button>
    </div>
  `;
  return card;
}

async function refreshList(mountEl) {
  const listEl = mountEl.querySelector('#medicines-list');
  const filtered = allMedicines.filter((m) => {
    const matchesCategory = activeCategory === 'all' || m.category === activeCategory;
    const matchesQuery = !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">💊</div><p>لا توجد أدوية مطابقة</p></div>`;
    return;
  }
  for (const medicine of filtered) {
    listEl.appendChild(medicineCard(medicine));
  }
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="search-wrap" style="background:none; border:none; padding:10px 0;">
      <div class="search-box">
        <input id="medicines-search" type="text" placeholder="ابحث عن دواء..." />
      </div>
    </div>
    <div id="medicines-pills" class="pills" style="padding:0 0 9px;"></div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">إضافة دواء جديد</span></div>
      <div class="entity-card__section">
        <input id="new-med-name" type="text" placeholder="اسم الدواء" class="search-box" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:6px;" />
        <select id="new-med-category" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:8px;">
          ${Object.entries(CATEGORY_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select>
        <button id="add-med-btn" class="btn btn--gold" style="width:100%;">إضافة</button>
      </div>
    </div>

    <div id="medicines-list"></div>
  `;

  const pillsEl = mountEl.querySelector('#medicines-pills');
  const categories = [{ value: 'all', label: 'الكل' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))];
  categories.forEach(({ value, label }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill' + (value === activeCategory ? ' on' : '');
    pill.textContent = label;
    pill.addEventListener('click', () => {
      activeCategory = value;
      pillsEl.querySelectorAll('.pill').forEach((p) => p.classList.remove('on'));
      pill.classList.add('on');
      refreshList(mountEl);
    });
    pillsEl.appendChild(pill);
  });

  mountEl.querySelector('#medicines-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    refreshList(mountEl);
  });

  mountEl.querySelector('#add-med-btn').addEventListener('click', async () => {
    const nameInput = mountEl.querySelector('#new-med-name');
    const categorySelect = mountEl.querySelector('#new-med-category');
    const name = nameInput.value.trim();
    if (!name) return;
    await medicinesRepo.addMedicine({ name, category: categorySelect.value });
    nameInput.value = '';
    allMedicines = await medicinesRepo.getAllMedicines();
    refreshList(mountEl);
  });

  mountEl.querySelector('#medicines-list').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action="delete"]');
    if (!button) return;
    await medicinesRepo.deleteMedicine(button.dataset.id);
    allMedicines = await medicinesRepo.getAllMedicines();
    refreshList(mountEl);
  });

  allMedicines = await medicinesRepo.getAllMedicines();
  refreshList(mountEl);
}
