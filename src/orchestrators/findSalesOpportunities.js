/**
 * Detect actionable buy/sell opportunities from imported WhatsApp data.
 * Never creates or confirms a deal automatically.
 */
import { getRecentEntities } from '../db/repositories/parsedEntitiesRepo.js';
import { getDealsByBuyer } from '../db/repositories/dealsRepo.js';
import { matchSellersForMedicine } from './matchSupplier.js';
import { DEAL_STATUS, PARSED_ENTITY_TYPE } from '../shared/constants.js';

function timestamp(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
}

export async function findSalesOpportunities(scanLimit = 5000) {
  const recentEntities = await getRecentEntities(Math.max(100, Math.min(50000, scanLimit)));
  const buyEntities = recentEntities.filter((entity) => entity.type === PARSED_ENTITY_TYPE.BUY);
  const dealsByBuyer = new Map();
  const matchesByMedicine = new Map();
  const dedup = new Map();

  for (const buyEntity of buyEntities) {
    if (!buyEntity.medicineId || !buyEntity.contactId) continue;
    const key = `${buyEntity.contactId}|${buyEntity.medicineId}`;
    const prior = dedup.get(key);
    // Prefer the newest request for each buyer/medicine pair; keeps one
    // current opportunity card rather than repeating old messages.
    if (!prior || timestamp(buyEntity.receivedAt) > timestamp(prior.receivedAt)) dedup.set(key, buyEntity);
  }

  const opportunities = [];
  for (const buyEntity of dedup.values()) {
    if (!matchesByMedicine.has(buyEntity.medicineId)) {
      matchesByMedicine.set(buyEntity.medicineId, await matchSellersForMedicine(buyEntity.medicineId));
    }
    const sellerMatches = matchesByMedicine.get(buyEntity.medicineId);
    if (!sellerMatches.length) continue;

    if (!dealsByBuyer.has(buyEntity.contactId)) {
      dealsByBuyer.set(buyEntity.contactId, await getDealsByBuyer(buyEntity.contactId));
    }
    const buyerDeals = dealsByBuyer.get(buyEntity.contactId) || [];
    const alreadyHandled = buyerDeals.some((deal) =>
      deal.medicineId === buyEntity.medicineId && deal.status !== DEAL_STATUS.CANCELLED
    );
    if (alreadyHandled) continue;

    const pricedMatches = sellerMatches.filter((match) => Number.isFinite(match.price) && match.price > 0);
    const bestPricedMatch = pricedMatches[0] || null;
    const latestSellerTime = sellerMatches.reduce((latest, match) => Math.max(latest, timestamp(match.date)), 0);
    const priceScore = bestPricedMatch ? 40 : 0;
    const urgencyScore = buyEntity.isUrgent ? 20 : 0;
    const recencyHours = latestSellerTime ? Math.max(0, (Date.now() - latestSellerTime) / 3600000) : 999999;
    const recencyScore = Math.max(0, 25 - Math.min(25, recencyHours / 4));
    const score = Math.round(priceScore + urgencyScore + recencyScore + (sellerMatches.length > 1 ? 5 : 0));

    opportunities.push({
      buyEntity,
      sellerMatches,
      bestPricedMatch,
      score,
      stars: Math.max(1, Math.min(5, Math.round(score / 20))),
      potentialBrokerage: bestPricedMatch ? bestPricedMatch.potentialBrokerageAt7Percent : null,
      hasConfirmedPrice: Boolean(bestPricedMatch),
    });
  }

  // Highest priority: urgent, confirmed lowest price, newest evidence,
  // then total opportunity score. Never pretend an inferred price is real.
  opportunities.sort((a, b) => {
    const ap = a.bestPricedMatch?.price;
    const bp = b.bestPricedMatch?.price;
    if (ap != null && bp == null) return -1;
    if (ap == null && bp != null) return 1;
    if (ap != null && bp != null && ap !== bp) return ap - bp;
    const timeDiff = timestamp(b.buyEntity.receivedAt) - timestamp(a.buyEntity.receivedAt);
    if (timeDiff) return timeDiff;
    if (a.buyEntity.isUrgent !== b.buyEntity.isUrgent) return Number(b.buyEntity.isUrgent) - Number(a.buyEntity.isUrgent);
    return b.score - a.score;
  });
  return opportunities;
}
