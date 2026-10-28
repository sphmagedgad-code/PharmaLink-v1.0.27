/**
 * PharmaLink OS - Contacts Screen
 * Unified buyer/seller entity. Role flags, not separate lists - one
 * person can be both, matching the frozen architecture decision.
 */

import * as contactsRepo from '../../db/repositories/contactsRepo.js';

let allContacts = [];
let activeFilter = 'all';
let searchQuery = '';

function roleBadges(contact) {
  const badges = [];
  if (contact.isBuyer) badges.push('<span class="badge badge--buy">مشتري</span>');
  if (contact.isSeller) badges.push('<span class="badge badge--sell">بائع</span>');
  return badges.join(' ');
}

function contactCard(contact) {
  const priceCount = contact.lastPrices ? Object.keys(contact.lastPrices).length : 0;
  const card = document.createElement('div');
  card.className = 'entity-card';
  card.innerHTML = `
    <div class="entity-card__header">
      <span class="entity-card__title">${contact.name}</span>
      ${roleBadges(contact)}
    </div>
    <div class="entity-card__section">
      <div class="entity-row" data-action="call" data-phone="${contact.whatsapp}">
        <span class="entity-row__title">${contact.whatsapp}</span>
        <span class="entity-row__icon">📞</span>
      </div>
      ${contact.governorate ? `<div class="entity-card__section-label">${contact.governorate}</div>` : ''}
      ${priceCount > 0 ? `<span class="entity-row__tag">${priceCount} سعر مسجل</span>` : ''}
    </div>
    <div class="entity-card__action">
      <span class="entity-card__action-tip">${contact.notes || ''}</span>
      <button class="btn btn--outline" data-action="delete" data-id="${contact.id}">حذف</button>
    </div>
  `;
  return card;
}

async function refreshList(mountEl) {
  const listEl = mountEl.querySelector('#contacts-list');
  const filtered = allContacts.filter((c) => {
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'buyers' && c.isBuyer) ||
      (activeFilter === 'sellers' && c.isSeller);
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.whatsapp.includes(q);
    return matchesFilter && matchesQuery;
  });

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">👤</div><p>لا توجد جهات اتصال مطابقة</p></div>`;
    return;
  }
  for (const contact of filtered) {
    listEl.appendChild(contactCard(contact));
  }
}

export async function render(mountEl) {
  mountEl.innerHTML = `
    <div class="search-wrap" style="background:none; border:none; padding:10px 0;">
      <div class="search-box">
        <input id="contacts-search" type="text" placeholder="ابحث بالاسم أو الرقم..." />
      </div>
    </div>
    <div id="contacts-pills" class="pills" style="padding:0 0 9px;"></div>

    <div class="entity-card">
      <div class="entity-card__header"><span class="entity-card__title">إضافة جهة اتصال</span></div>
      <div class="entity-card__section">
        <input id="new-contact-name" type="text" placeholder="الاسم" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:6px;" />
        <input id="new-contact-phone" type="tel" placeholder="رقم الواتساب" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:6px; direction:ltr;" />
        <input id="new-contact-gov" type="text" placeholder="المحافظة (اختياري)" style="width:100%; padding:9px; border-radius:11px; border:1.5px solid #ECF0F8; margin-bottom:8px;" />
        <label style="display:flex; align-items:center; gap:6px; margin-bottom:6px; font-size:0.82rem;"><input type="checkbox" id="new-contact-buyer" /> مشتري</label>
        <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:0.82rem;"><input type="checkbox" id="new-contact-seller" /> بائع</label>
        <button id="add-contact-btn" class="btn btn--gold" style="width:100%;">إضافة</button>
      </div>
    </div>

    <div id="contacts-list"></div>
  `;

  const pillsEl = mountEl.querySelector('#contacts-pills');
  [{ value: 'all', label: 'الكل' }, { value: 'buyers', label: 'المشترين' }, { value: 'sellers', label: 'البائعين' }].forEach(({ value, label }) => {
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

  mountEl.querySelector('#contacts-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    refreshList(mountEl);
  });

  mountEl.querySelector('#add-contact-btn').addEventListener('click', async () => {
    const name = mountEl.querySelector('#new-contact-name').value.trim();
    const whatsapp = mountEl.querySelector('#new-contact-phone').value.trim();
    const governorate = mountEl.querySelector('#new-contact-gov').value.trim();
    const isBuyer = mountEl.querySelector('#new-contact-buyer').checked;
    const isSeller = mountEl.querySelector('#new-contact-seller').checked;
    if (!name || !whatsapp) return;

    await contactsRepo.addContact({ name, whatsapp, governorate, isBuyer, isSeller });
    mountEl.querySelector('#new-contact-name').value = '';
    mountEl.querySelector('#new-contact-phone').value = '';
    mountEl.querySelector('#new-contact-gov').value = '';
    mountEl.querySelector('#new-contact-buyer').checked = false;
    mountEl.querySelector('#new-contact-seller').checked = false;
    allContacts = await contactsRepo.getAllContacts();
    refreshList(mountEl);
  });

  mountEl.querySelector('#contacts-list').addEventListener('click', async (e) => {
    const callRow = e.target.closest('[data-action="call"]');
    if (callRow) {
      window.location.href = `tel:${callRow.dataset.phone}`;
      return;
    }
    const deleteButton = e.target.closest('[data-action="delete"]');
    if (deleteButton) {
      await contactsRepo.deleteContact(deleteButton.dataset.id);
      allContacts = await contactsRepo.getAllContacts();
      refreshList(mountEl);
    }
  });

  allContacts = await contactsRepo.getAllContacts();
  refreshList(mountEl);
}
