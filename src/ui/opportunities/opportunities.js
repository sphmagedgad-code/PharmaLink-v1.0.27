/** PharmaLink OS - ranked buyer/seller opportunities. */
import { findSalesOpportunities } from '../../orchestrators/findSalesOpportunities.js';
import { getMedicineById } from '../../db/repositories/medicinesRepo.js';
import { getContactById } from '../../db/repositories/contactsRepo.js';
import { addDeal } from '../../db/repositories/dealsRepo.js';
let opportunities = [];

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatDate(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? new Date(n).toLocaleString('ar-EG') : 'وقت غير معروف';
}
function opportunityCard(opportunity, index, medicine, buyer) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  const name = medicine?.name || opportunity.buyEntity.rawMedicineText;
  const buyerPhone = buyer?.whatsapp || opportunity.buyEntity.phone || 'غير متاح';
  const matches = opportunity.sellerMatches || [];
  const best = opportunity.bestPricedMatch;
  const urgent = opportunity.buyEntity.isUrgent ? '<div class="entity-card__urgent-strip">🔥 طلب عاجل - أولوية تنفيذ</div>' : '';
  const stars = '★'.repeat(opportunity.stars || 1) + '☆'.repeat(5 - (opportunity.stars || 1));
  const offers = matches.slice(0, 5).map((m) => `
    <div class="entity-row">
      <span class="entity-row__title">${esc(m.contact?.name || 'بائع')}<br><small>${esc(m.phone || m.contact?.whatsapp || 'رقم غير متاح')}</small></span>
      <span class="entity-row__info"><span class="entity-row__price">${m.price != null ? `${Number(m.price).toLocaleString('en-US')} ج` : (m.estimatedPrice != null ? `تقديري ~${Math.round(m.estimatedPrice).toLocaleString('en-US')} ج` : 'بدون سعر')}</span><br><small>${esc(formatDate(m.date))}</small></span>
      <button class="btn-call" data-tel="${esc(m.phone || m.contact?.whatsapp || '')}">اتصال</button>
    </div>`).join('');
  card.innerHTML = `${urgent}
    <div class="entity-card__header"><span class="entity-card__title">${esc(name)}</span><span class="badge badge--deal">${stars}</span></div>
    <div class="entity-card__section">
      <div class="entity-card__section-label">المشتري</div>
      <div class="entity-row"><span class="entity-row__title">${esc(buyer?.name || buyerPhone)}</span><span class="entity-row__meta">${esc(buyerPhone)}</span><button class="btn-call" data-tel="${esc(buyerPhone)}">اتصال</button></div>
      <div class="entity-card__section-label">عروض البيع المطابقة (${matches.length}) — السعر الحقيقي أولًا ثم الأحدث</div>
      ${offers || '<p>لا توجد عروض متاحة.</p>'}
    </div>
    <div class="price-row"><div><div class="price-row__main">${best ? `${Number(best.price).toLocaleString('en-US')} ج` : 'لا يوجد سعر مؤكد'}</div><div class="price-row__note">${best ? `أفضل سعر مسجل: ${esc(best.contact?.name || '')}` : 'الأسعار التقديرية لا تصلح لتأكيد صفقة'}</div><div class="price-row__note">الربح المحتمل التقديري (7%): ${best ? `${Number(best.potentialBrokerageAt7Percent || 0).toLocaleString('en-US')} ج` : 'غير محسوب — لا يوجد سعر مؤكد'}</div></div><span class="price-row__badge">${opportunity.buyEntity.isUrgent ? 'عاجل' : 'فرصة محتملة'}</span></div>
    <div class="entity-card__action"><button class="btn btn--gold" data-action="convert" data-index="${index}" ${best ? '' : 'disabled title="يلزم سعر بيع حقيقي"'} style="flex:1">تحويل إلى صفقة</button></div>`;
  return card;
}
async function refreshList(mountEl) {
  const listEl = mountEl.querySelector('#opportunities-list');
  listEl.innerHTML = '';
  if (!opportunities.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state__icon">🎯</div><p>لا توجد فرص بيع مطابقة حاليًا. استورد رسائل واتساب جديدة لتحديث النتائج.</p></div>';
    return;
  }
  for (let i = 0; i < opportunities.length; i += 1) {
    const item = opportunities[i];
    const [medicine, buyer] = await Promise.all([getMedicineById(item.buyEntity.medicineId), getContactById(item.buyEntity.contactId)]);
    listEl.appendChild(opportunityCard(item, i, medicine, buyer));
  }
}
export async function render(mountEl) {
  mountEl.innerHTML = '<div class="welcome" style="padding:20px 4px 8px;"><h2 style="color:var(--gold)">أفضل فرص البيع والشراء</h2><p>مطابقة بيانات واتساب الفعلية: السعر أولًا، ثم التوقيت والاستعجال. السعر التقديري موضح ولا يُعامل كعرض مؤكد.</p></div><div id="opportunities-list"><div class="processing"><div class="spinner"></div><p>جارٍ تحليل فرص المطابقة...</p></div></div>';
  opportunities = await findSalesOpportunities();
  await refreshList(mountEl);
  mountEl.querySelector('#opportunities-list').addEventListener('click', async (e) => {
    const tel = e.target.closest('[data-tel]');
    if (tel && tel.dataset.tel) { window.location.href = `tel:${tel.dataset.tel}`; return; }
    const button = e.target.closest('[data-action="convert"]');
    if (!button || button.disabled) return;
    const opportunity = opportunities[Number(button.dataset.index)];
    const best = opportunity?.bestPricedMatch;
    if (!best || !Number.isFinite(best.price) || best.price <= 0) return;
    const confirmed = window.confirm(`تحويل الفرصة إلى صفقة معلقة بسعر ${best.price} ج مع ${best.contact.name}؟\nتأكد من موافقة الطرفين قبل التأكيد.`);
    if (!confirmed) return;
    await addDeal({ medicineId: opportunity.buyEntity.medicineId, buyerId: opportunity.buyEntity.contactId, sellerId: best.contact.id, quantity: opportunity.buyEntity.quantity || 1, price: best.price });
    opportunities = opportunities.filter((_, i) => i !== Number(button.dataset.index));
    await refreshList(mountEl);
  });
}
