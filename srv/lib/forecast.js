const cds = require('@sap/cds');
const LOG = cds.log('forecast');

const WINDOW_MONTHS     = 6;   // demand history to look at
const TARGET_COVER_DAYS = 60;  // order enough for this many days
const CRITICAL_DAYS     = 14;
const WARNING_DAYS      = 30;

const round2 = n => Math.round(n * 100) / 100;

// Pure calculation for one product: easy to read and to unit-test
function assess(p, monthlyDemand) {
  const stock   = p.unitsInStock ?? 0;
  const onOrder = p.unitsOnOrder ?? 0;
  const reorder = p.reorderLevel ?? 0;
  const daily   = monthlyDemand / 30;
  const daysOfStock = daily > 0 ? Math.floor((stock + onOrder) / daily) : 999; // 999 = no recent demand

  if (p.discontinued) {
    return { avgMonthlyDemand: round2(monthlyDemand), daysOfStock, suggestedQty: 0,
             riskStatus: 'Discontinued', riskCriticality: 0 };
  }

  const suggestedQty = Math.max(0, Math.ceil(daily * TARGET_COVER_DAYS + reorder - stock - onOrder));

  let riskStatus = 'OK', riskCriticality = 3;              // 3 = green
  if (daysOfStock < CRITICAL_DAYS || (reorder > 0 && stock + onOrder <= reorder)) {
    riskStatus = 'Critical'; riskCriticality = 1;          // 1 = red
  } else if (daysOfStock < WARNING_DAYS || stock <= reorder) {
    riskStatus = 'Warning';  riskCriticality = 2;          // 2 = yellow
  }

  return { avgMonthlyDemand: round2(monthlyDemand), daysOfStock, suggestedQty, riskStatus, riskCriticality };
}

async function runForecast() {
  const { Products, Orders, OrderItems } = cds.entities('nw.replenish');

  // 1. find the newest order date in the data
  const { maxDate } = await SELECT.one.from(Orders).columns('max(orderDate) as maxDate') || {};
  if (!maxDate) {
    const e = new Error('No order data yet. Run "Sync from Northwind" first.');
    e.status = 400;
    throw e;
  }
  const since = new Date(maxDate);
  since.setMonth(since.getMonth() - WINDOW_MONTHS);
  const sinceStr = since.toISOString().slice(0, 10);

  // 2. units sold per product in the window (CAP turns salesOrder.orderDate into a join)
  const demandRows = await SELECT.from(OrderItems)
    .columns('product_ID', 'sum(quantity) as qty')
    .where `salesOrder.orderDate >= ${sinceStr}`
    .groupBy('product_ID');
  const demand = new Map(demandRows.map(r => [r.product_ID, Number(r.qty)]));

  // 3. assess and update every product
  const products = await SELECT.from(Products)
    .columns('ID', 'unitsInStock', 'unitsOnOrder', 'reorderLevel', 'discontinued');
  const now = new Date().toISOString();
  const counts = { Critical: 0, Warning: 0, OK: 0, Discontinued: 0 };

  for (const p of products) {
    const result = assess(p, (demand.get(p.ID) || 0) / WINDOW_MONTHS);
    counts[result.riskStatus]++;
    await UPDATE(Products, p.ID).with({ ...result, lastAnalyzed: now });
  }

  LOG.info(`Window ${sinceStr} to ${maxDate}`, counts);
  return { analyzed: products.length, from: sinceStr, to: maxDate, counts };
}

module.exports = { runForecast, assess };