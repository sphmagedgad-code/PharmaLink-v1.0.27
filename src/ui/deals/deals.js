/**
 * PharmaLink OS - Deals Screen
 * Real CRUD across the full deal lifecycle: pending -> confirmed ->
 * delivered -> commission_collected -> completed, cancellable from
 * any stage before completed.
 */

import * as dealsRepo from '../../db/repositories/dealsRepo.js';
import * as medicinesRepo from '../../db/repositories/medicinesRepo.js';
import * as contactsRepo from '../../db/repositories/contactsRepo.js';
import { completeDeal } from '../../orchestrators/completeDeal.js';
import { DEAL_STATUS } from '../../shared/constants.js';

const STATUS_LABELS = {
  [DEAL_STATUS.PENDING]: 'معلقة',
  [DEAL_STATUS.CONFIRMED]: 'مؤكدة',
  [DEAL_STATUS.DELIVERED]: 'تم التسليم',
  [DEAL_STATUS.COMMISSION_COLLECTED]: 'تم تحصيل العمولة',
  [DEAL_STATUS.COMPLETED]: 'مكتملة',
  [DEAL_STATUS.CANCELLED]: 'ملغاة',
};

const NEXT_ACTION_LABEL = {
  [DEAL_STATUS.PENDING]: 'تأكيد الصفقة',
  [DEAL_STATUS.CONFIRMED]: 'تأكيد التسليم',
  [DEAL_STATUS.DELIVERED]: 'تحصيل العمولة',
  [DEAL_STATUS.COMMISSION_COLLECTED]: 'إغلاق الصفقة',
};

let allDeals = [];
let medicines = [];
let buyers = [];
let sellers = [];
let activeFilter = 'all';

function dealCard(deal) {
  const medicine = medicines.find((m) => m.id === deal.medicineId);
  const buyer = buyers.concat(sellers).find((c) => c.id === deal.buyerId);
  const seller = buyers.concat(sellers).find((c) => c.id === deal.sellerId);
  const nextLabel = NEXT_ACTION_LABEL[deal.status];

  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header">
      <span class="entity-card__title">${medicine ? medicine.name : 'دواء محذوف'}</span>
      <span class="badge badge--deal">${STATUS_LABELS[deal.status] || deal.status}</span>
    </div>
    <div class="entity-card__section">
      <div class="entity-card__section-label">المشتري</div>
      <div class="entity-row"><span class="entity-row__title">${buyer ? buyer.name : '—'}</span></div>
      <div class="entity-card__section-label">البائع</div>
      <div class="entity-row"><span class="entity-row__title">${seller ? seller.name : '—'}</span></div>
    </div>
    <div class="price-row">
      <div>
        <div class="price-row__main">${deal.price} ج × ${deal.quantity}</div>
        <div class="price-row__note">الإجمالي: ${(deal.price * deal.quantity).toLocaleString('ar-EG')} ج</div>
      </div>
    </div>
    <div class="entity-card__action">
      ${nextLabel ? `<button class="btn btn--gold" data-action="advance" data-id="${deal.id}" style="flex:1">${nextLabel}</button>` : ''}
      ${deal.status !== DEAL_STATUS.COMPLETED && deal.status !== DEAL_STATUS.CANCELLED ? `<button class="btn btn--danger" data-action="cancel" data-id="${deal.id}">إلغاء</button>` : ''}
    </div>
  `;
  return card;
}

async function refreshList(mountEl) {
  const listEl = mountEl.querySelector('#deals-list');
  const filtered = activeFilter === 'all' ? allDeals : allDeals.filter((d) => d.status === activeFilter);
  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🤝</div><p>لا توجد صفقات في هذه الحالة</p></div>`;
    return;
  }
  filtered
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((deal) => listEl.appendChild(dealCard(deal)));
}

function populateSelect(select, items, labelFn) {
  select.innerHTML = items.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`).join('');
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div id="deals-pills" class="pills" style="padding:10px 0 9px;"></div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">صفقة جديدة</span></div>
      <div class="entity-card__section">
        <select id="deal-medicine" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:6px;"></select>
        <select id="deal-buyer" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:6px;"></select>
        <select id="deal-seller" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:6px;"></select>
        <div style="display:flex; gap:6px; margin-bottom:8px;">
          <input id="deal-qty" type="number" min="1" placeholder="الكمية" style="flex:1; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8;" />
          <input id="deal-price" type="number" min="1" placeholder="السعر" style="flex:1; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8;" />
        </div>
        <button id="add-deal-btn" class="btn btn--gold" style="width:100%;">إنشاء الصفقة</button>
      </div>
    </div>

    <div id="deals-list"></div>
  `;

  [medicines, buyers, sellers, allDeals] = await Promise.all([
    medicinesRepo.getAllMedicines(),
    contactsRepo.getBuyers(),
    contactsRepo.getSellers(),
    dealsRepo.getAllDeals(),
  ]);

  populateSelect(mountEl.querySelector('#deal-medicine'), medicines, (m) => m.name);
  populateSelect(mountEl.querySelector('#deal-buyer'), buyers, (c) => c.name);
  populateSelect(mountEl.querySelector('#deal-seller'), sellers, (c) => c.name);

  const pillsEl = mountEl.querySelector('#deals-pills');
  const filters = [{ value: 'all', label: 'الكل' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))];
  filters.forEach(({ value, label }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill' + (value === activeFilter ? ' on' : '');
    pill.textContent = label;
    pill.addEventListener('click', () => {
      activeFilter = value;
      pillsEl.querySelectorAll('.pill').forEach((p) => p.classList.remove('on'));
      pill.classList.add('on');
      refreshList(mountEl);
    });
    pillsEl.appendChild(pill);
  });

  mountEl.querySelector('#add-deal-btn').addEventListener('click', async () => {
    const medicineId = mountEl.querySelector('#deal-medicine').value;
    const buyerId = mountEl.querySelector('#deal-buyer').value;
    const sellerId = mountEl.querySelector('#deal-seller').value;
    const quantity = Number(mountEl.querySelector('#deal-qty').value);
    const price = Number(mountEl.querySelector('#deal-price').value);
    if (!medicineId || !buyerId || !sellerId || !quantity || !price) return;

    await completeDeal({ medicineId, buyerId, sellerId, quantity, price });
    mountEl.querySelector('#deal-qty').value = '';
    mountEl.querySelector('#deal-price').value = '';
    allDeals = await dealsRepo.getAllDeals();
    refreshList(mountEl);
  });

  mountEl.querySelector('#deals-list').addEventListener('click', async (e) => {
    const advanceBtn = e.target.closest('[data-action="advance"]');
    const cancelBtn = e.target.closest('[data-action="cancel"]');
    if (advanceBtn) {
      const deal = allDeals.find((d) => d.id === advanceBtn.dataset.id);
      const next = dealsRepo.getNextStatus(deal.status);
      if (next) await dealsRepo.setDealStatus(deal.id, next);
    } else if (cancelBtn) {
      await dealsRepo.setDealStatus(cancelBtn.dataset.id, DEAL_STATUS.CANCELLED);
    } else {
      return;
    }
    allDeals = await dealsRepo.getAllDeals();
    refreshList(mountEl);
  });

  refreshList(mountEl);
}
