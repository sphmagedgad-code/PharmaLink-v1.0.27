/**
 * PharmaLink OS - Global Search Screen
 * The first-class search UI: one box searches Contacts, Medicines,
 * Deals, Parsed Entities, and WhatsApp Messages simultaneously via
 * searchIndexRepo (indexed lookups only, never a full-store scan).
 */

import * as searchIndexRepo from '../../db/repositories/searchIndexRepo.js';
import * as contactsRepo from '../../db/repositories/contactsRepo.js';
import * as medicinesRepo from '../../db/repositories/medicinesRepo.js';
import * as dealsRepo from '../../db/repositories/dealsRepo.js';
import * as parsedEntitiesRepo from '../../db/repositories/parsedEntitiesRepo.js';
import * as whatsappRepo from '../../db/repositories/whatsappRepo.js';
import { matchSellersForMedicine } from '../../orchestrators/matchSupplier.js';
import { SEARCH_ENTITY_TYPE } from '../../shared/constants.js';

const TYPE_FILTERS = [
  { value: 'all', label: 'الكل', types: null },
  { value: 'buy', label: 'طلبات شراء', types: [SEARCH_ENTITY_TYPE.PARSED_ENTITY], entityFilter: (e) => e.type === 'buy' },
  { value: 'sell', label: 'عروض بيع', types: [SEARCH_ENTITY_TYPE.PARSED_ENTITY], entityFilter: (e) => e.type === 'sell' },
  { value: 'urgent', label: 'عاجل', types: [SEARCH_ENTITY_TYPE.PARSED_ENTITY], entityFilter: (e) => e.isUrgent },
  { value: SEARCH_ENTITY_TYPE.CONTACT, label: 'جهات اتصال', types: [SEARCH_ENTITY_TYPE.CONTACT] },
  { value: SEARCH_ENTITY_TYPE.MEDICINE, label: 'أدوية', types: [SEARCH_ENTITY_TYPE.MEDICINE] },
  { value: SEARCH_ENTITY_TYPE.DEAL, label: 'صفقات', types: [SEARCH_ENTITY_TYPE.DEAL] },
  { value: SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE, label: 'رسائل', types: [SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE] },
];

let activeFilter = 'all';
let debounceTimer = null;

async function fetchEntity(entityType, entityId) {
  switch (entityType) {
    case SEARCH_ENTITY_TYPE.CONTACT: return contactsRepo.getContactById(entityId);
    case SEARCH_ENTITY_TYPE.MEDICINE: return medicinesRepo.getMedicineById(entityId);
    case SEARCH_ENTITY_TYPE.DEAL: return dealsRepo.getDealById(entityId);
    case SEARCH_ENTITY_TYPE.PARSED_ENTITY: return parsedEntitiesRepo.getEntityById(entityId);
    case SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE: return whatsappRepo.getMessageById(entityId);
    default: return null;
  }
}

function renderContact(contact) {
  const badges = [contact.isBuyer ? '<span class="badge badge--buy">مشتري</span>' : '', contact.isSeller ? '<span class="badge badge--sell">بائع</span>' : ''].join(' ');
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header"><span class="entity-card__title">${contact.name}</span>${badges}</div>
    <div class="entity-card__section">
      <div class="entity-row" data-tel="${contact.whatsapp}"><span class="entity-row__title">${contact.whatsapp}</span><span class="entity-row__icon">📞</span></div>
    </div>
  `;
  return card;
}

function renderMedicine(medicine) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header"><span class="entity-card__title">${medicine.name}</span><span class="badge badge--deal">${medicine.category}</span></div>
  `;
  return card;
}

function renderDeal(deal) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header"><span class="entity-card__title">صفقة</span><span class="badge badge--deal">${deal.status}</span></div>
    <div class="price-row"><div class="price-row__main">${deal.price} ج × ${deal.quantity}</div></div>
  `;
  return card;
}

function renderWhatsappMessage(message) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header"><span class="entity-card__title">${message.groupId}</span><span class="badge badge--deal">${message.status}</span></div>
    <div class="entity-card__section"><div class="entity-card__section-label">${new Date(message.receivedAt).toLocaleString('ar-EG')}</div><p style="font-size:0.82rem; color:#444;">${message.text}</p></div>
  `;
  return card;
}

async function renderParsedEntity(entity) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  const typeBadge = entity.type === 'buy' ? '<span class="badge badge--buy">طلب شراء</span>' : '<span class="badge badge--sell">عرض بيع</span>';
  let urgentStrip = '';
  if (entity.isUrgent) {
    urgentStrip = '<div class="entity-card__urgent-strip">🔥 طلب عاجل</div>';
  }

  let missingSellerNotice = '';
  if (entity.type === 'buy') {
    const sellers = await matchSellersForMedicine(entity.medicineId);
    if (sellers.length === 0) {
      missingSellerNotice = `<div class="entity-card__empty-notice">🎯 لا يوجد بائع مسجل لهذا الصنف حاليًا - فرصة لعرضه على مورد جديد</div>`;
    }
  }

  card.innerHTML = `
    ${urgentStrip}
    <div class="entity-card__header"><span class="entity-card__title">${entity.rawMedicineText}</span>${typeBadge}</div>
    <div class="entity-card__section">
      ${missingSellerNotice}
      <div class="entity-row" data-tel="${entity.phone}">
        <span class="entity-row__title">${entity.phone}</span>
        <span class="entity-row__info">
          ${entity.price ? `<span class="entity-row__price">${entity.price} ج</span>` : ''}
          ${entity.quantity ? `<span class="entity-row__meta">${entity.quantity} علبة</span>` : ''}
        </span>
        <span class="entity-row__icon">📞</span>
      </div>
    </div>
    <div class="entity-card__action">
      <button class="btn-call" data-tel="${entity.phone}">اتصال</button>
      <span class="entity-card__action-tip">${new Date(entity.receivedAt).toLocaleDateString('ar-EG')}</span>
    </div>
  `;
  return card;
}

async function renderResult(entityType, entity) {
  switch (entityType) {
    case SEARCH_ENTITY_TYPE.CONTACT: return renderContact(entity);
    case SEARCH_ENTITY_TYPE.MEDICINE: return renderMedicine(entity);
    case SEARCH_ENTITY_TYPE.DEAL: return renderDeal(entity);
    case SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE: return renderWhatsappMessage(entity);
    case SEARCH_ENTITY_TYPE.PARSED_ENTITY: return renderParsedEntity(entity);
    default: return null;
  }
}

async function runSearch(mountEl, query) {
  const resultsEl = mountEl.querySelector('#search-results');
  const metaEl = mountEl.querySelector('#search-meta');

  if (!query || query.trim().length < 2) {
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🔎</div><p>اكتب حرفين على الأقل للبحث في كل بيانات النظام</p></div>`;
    metaEl.textContent = '';
    return;
  }

  const activeFilterDef = TYPE_FILTERS.find((f) => f.value === activeFilter);
  const rawResults = await searchIndexRepo.search(query, activeFilterDef.types);

  const entities = await Promise.all(
    rawResults.map(async (r) => ({ entityType: r.entityType, entity: await fetchEntity(r.entityType, r.entityId) }))
  );

  let filtered = entities.filter((r) => r.entity);
  if (activeFilterDef.entityFilter) {
    filtered = filtered.filter((r) => activeFilterDef.entityFilter(r.entity));
  }

  // A contact may send several messages requesting/offering the same
  // medicine; show their phone once per context (buy/sell) rather
  // than once per message.
  const seenPhoneContext = new Set();
  filtered = filtered.filter((r) => {
    if (r.entityType !== SEARCH_ENTITY_TYPE.PARSED_ENTITY) return true;
    const key = `${r.entity.phone}|${r.entity.type}`;
    if (seenPhoneContext.has(key)) return false;
    seenPhoneContext.add(key);
    return true;
  });

  metaEl.textContent = `${filtered.length} نتيجة`;
  resultsEl.innerHTML = '';

  if (filtered.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🤷</div><p>لا توجد نتائج مطابقة</p></div>`;
    return;
  }

  for (const { entityType, entity } of filtered) {
    const card = await renderResult(entityType, entity);
    if (card) resultsEl.appendChild(card);
  }
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="search-wrap" style="background:none; border:none; padding:10px 0;">
      <div class="search-box">
        <input id="global-search-input" type="text" placeholder="ابحث في كل شيء: دواء، اسم، هاتف، محافظة..." />
        <button id="global-search-clear" class="btn-clear">✕</button>
      </div>
    </div>
    <div id="search-pills" class="pills" style="padding:0 0 9px;"></div>
    <div class="results-meta"><span id="search-meta"></span></div>
    <div id="search-results"></div>
  `;

  const pillsEl = mountEl.querySelector('#search-pills');
  TYPE_FILTERS.forEach(({ value, label }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill' + (value === activeFilter ? ' on' : '');
    pill.textContent = label;
    pill.addEventListener('click', () => {
      activeFilter = value;
      pillsEl.querySelectorAll('.pill').forEach((p) => p.classList.remove('on'));
      pill.classList.add('on');
      runSearch(mountEl, mountEl.querySelector('#global-search-input').value);
    });
    pillsEl.appendChild(pill);
  });

  const input = mountEl.querySelector('#global-search-input');
  const clearBtn = mountEl.querySelector('#global-search-clear');

  input.addEventListener('input', () => {
    clearBtn.classList.toggle('on', input.value.length > 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(mountEl, input.value), 180);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('on');
    runSearch(mountEl, '');
  });

  mountEl.querySelector('#search-results').addEventListener('click', (e) => {
    const target = e.target.closest('[data-tel]');
    if (target) window.location.href = `tel:${target.dataset.tel}`;
  });

  runSearch(mountEl, '');
}
