/**
 * PharmaLink OS - Reports Screen
 * Aggregate business metrics computed from existing repositories only
 * (no new stores). Deals/Medicines/Contacts are small collections so
 * getAllX() is used directly; WhatsApp-derived activity numbers use
 * the existing bounded/indexed reads (countMessages, getRecentEntities)
 * to stay safe at 500k+ message scale.
 */

import { getAllDeals } from '../../db/repositories/dealsRepo.js';
import { getAllMedicines } from '../../db/repositories/medicinesRepo.js';
import { getAllContacts } from '../../db/repositories/contactsRepo.js';
import { countMessages } from '../../db/repositories/whatsappRepo.js';
import { getRecentEntities } from '../../db/repositories/parsedEntitiesRepo.js';
import { DEAL_STATUS } from '../../shared/constants.js';

const STATUS_LABELS = {
  [DEAL_STATUS.PENDING]: 'معلقة',
  [DEAL_STATUS.CONFIRMED]: 'مؤكدة',
  [DEAL_STATUS.DELIVERED]: 'تم التسليم',
  [DEAL_STATUS.COMMISSION_COLLECTED]: 'تم تحصيل العمولة',
  [DEAL_STATUS.COMPLETED]: 'مكتملة',
  [DEAL_STATUS.CANCELLED]: 'ملغاة',
};

function statCard(value, label) {
  const el = document.createElement('div');
  el.className = 'stat-card';
  el.innerHTML = `<div class="stat-val">${value}</div><div class="stat-lbl">${label}</div>`;
  return el;
}

function topListCard(title, rows) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `<div class="entity-card__header"><span class="entity-card__title">${title}</span></div>`;
  const section = document.createElement('div');
  section.className = 'entity-card__section';
  if (rows.length === 0) {
    section.innerHTML = `<div class="entity-card__section-label">لا توجد بيانات كافية بعد</div>`;
  } else {
    rows.forEach(([name, count]) => {
      const row = document.createElement('div');
      row.className = 'entity-row';
      row.innerHTML = `<span class="entity-row__title">${name}</span><span class="entity-row__price">${count}</span>`;
      section.appendChild(row);
    });
  }
  card.appendChild(section);
  return card;
}

function topN(countMap, n = 5) {
  return Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="welcome" style="padding:20px 4px 8px;">
      <h2 style="color:var(--gold)">التقارير</h2>
    </div>
    <div id="reports-stats" class="stat-cards"></div>
    <div id="reports-status-breakdown" class="entity-card"></div>
    <div id="reports-top-medicines"></div>
    <div id="reports-top-sellers"></div>
  `;

  const [deals, medicines, contacts, messageCount, recentEntities] = await Promise.all([
    getAllDeals(),
    getAllMedicines(),
    getAllContacts(),
    countMessages(),
    getRecentEntities(500),
  ]);

  const completedDeals = deals.filter((d) => d.status === DEAL_STATUS.COMPLETED);
  const revenue = completedDeals.reduce((sum, d) => sum + d.price * d.quantity, 0);
  const commission = deals
    .filter((d) => d.commissionAmount)
    .reduce((sum, d) => sum + d.commissionAmount, 0);
  const urgentRecent = recentEntities.filter((e) => e.isUrgent).length;

  const statsEl = mountEl.querySelector('#reports-stats');
  statsEl.appendChild(statCard(completedDeals.length, 'صفقات مكتملة'));
  statsEl.appendChild(statCard(`${revenue.toLocaleString('ar-EG')} ج`, 'إجمالي قيمة الصفقات'));
  statsEl.appendChild(statCard(`${commission.toLocaleString('ar-EG')} ج`, 'عمولة محصّلة'));
  statsEl.appendChild(statCard(messageCount, 'رسائل واتساب'));

  const breakdownEl = mountEl.querySelector('#reports-status-breakdown');
  breakdownEl.innerHTML = `<div class="entity-card__header"><span class="entity-card__title">توزيع الصفقات حسب الحالة</span></div>`;
  const breakdownSection = document.createElement('div');
  breakdownSection.className = 'entity-card__section';
  Object.entries(STATUS_LABELS).forEach(([status, label]) => {
    const count = deals.filter((d) => d.status === status).length;
    const row = document.createElement('div');
    row.className = 'entity-row';
    row.innerHTML = `<span class="entity-row__title">${label}</span><span class="entity-row__price">${count}</span>`;
    breakdownSection.appendChild(row);
  });
  breakdownEl.appendChild(breakdownSection);

  const medicineCounts = new Map();
  deals.forEach((d) => {
    const medicine = medicines.find((m) => m.id === d.medicineId);
    const name = medicine ? medicine.name : d.medicineId;
    medicineCounts.set(name, (medicineCounts.get(name) || 0) + 1);
  });
  mountEl.querySelector('#reports-top-medicines').appendChild(topListCard('الأدوية الأكثر تداولًا', topN(medicineCounts)));

  const sellerCounts = new Map();
  deals.forEach((d) => {
    const seller = contacts.find((c) => c.id === d.sellerId);
    const name = seller ? seller.name : d.sellerId;
    sellerCounts.set(name, (sellerCounts.get(name) || 0) + 1);
  });
  mountEl.querySelector('#reports-top-sellers').appendChild(topListCard('أكثر الموردين تعاملًا', topN(sellerCounts)));

  if (urgentRecent > 0) {
    const note = document.createElement('div');
    note.className = 'entity-card__footer-tag';
    note.style.padding = '10px 4px';
    note.textContent = `${urgentRecent} طلب عاجل ضمن آخر ${recentEntities.length} بيانات مستوردة`;
    mountEl.appendChild(note);
  }
}
