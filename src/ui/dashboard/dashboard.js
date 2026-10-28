/**
 * PharmaLink OS - Dashboard Screen
 * Daily operating snapshot: pending deals, today's completed deals,
 * urgent open requests, and message volume - the numbers that matter
 * for hitting the 2-completed-deals-a-day goal.
 */

import * as dealsRepo from '../../db/repositories/dealsRepo.js';
import * as whatsappRepo from '../../db/repositories/whatsappRepo.js';
import * as parsedEntitiesRepo from '../../db/repositories/parsedEntitiesRepo.js';
import { DEAL_STATUS } from '../../shared/constants.js';

function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function statCard(value, label) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.innerHTML = `<div class="stat-val">${value}</div><div class="stat-lbl">${label}</div>`;
  return card;
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="welcome" style="padding:20px 4px 8px;">
      <h2 style="color:var(--gold)">لوحة التحكم</h2>
    </div>
    <div id="dash-stats" class="stat-cards"></div>
    <div id="dash-urgent"></div>
  `;

  const [allDeals, pendingDeals, urgentEntities, messageCount] = await Promise.all([
    dealsRepo.getAllDeals(),
    dealsRepo.getDealsByStatus(DEAL_STATUS.PENDING),
    parsedEntitiesRepo.getRecentEntities(300),
    whatsappRepo.countMessages(),
  ]);

  const completedToday = allDeals.filter((d) => d.status === DEAL_STATUS.COMPLETED && isToday(d.createdAt)).length;
  const urgentOpen = urgentEntities.filter((e) => e.type === 'buy' && e.isUrgent);

  const statsEl = mountEl.querySelector('#dash-stats');
  statsEl.appendChild(statCard(completedToday, 'صفقات مكتملة اليوم'));
  statsEl.appendChild(statCard(pendingDeals.length, 'صفقات معلقة'));
  statsEl.appendChild(statCard(urgentOpen.length, 'طلبات عاجلة'));
  statsEl.appendChild(statCard(messageCount, 'رسائل واتساب'));

  const urgentEl = mountEl.querySelector('#dash-urgent');
  if (urgentOpen.length === 0) {
    urgentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">✅</div>
        <p>لا توجد طلبات عاجلة مفتوحة حاليًا</p>
      </div>`;
    return;
  }

  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__urgent-strip">🔥 طلبات عاجلة تحتاج رد سريع</div>
    <div class="entity-card__section">
      <div class="entity-card__section-label">آخر ${Math.min(urgentOpen.length, 8)} طلب</div>
    </div>
  `;
  const section = card.querySelector('.entity-card__section');
  urgentOpen.slice(0, 8).forEach((entity) => {
    const row = document.createElement('div');
    row.className = 'entity-row';
    row.innerHTML = `
      <span class="entity-row__title">${entity.rawMedicineText}</span>
      <span class="entity-row__meta" style="direction:ltr">${entity.phone}</span>
    `;
    row.addEventListener('click', () => {
      window.location.href = `tel:${entity.phone}`;
    });
    section.appendChild(row);
  });
  urgentEl.appendChild(card);
}
