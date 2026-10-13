const cds = require('@sap/cds');
const { syncNorthwind } = require('./lib/northwind-sync');
const { runForecast }   = require('./lib/forecast');
const { askClaude }     = require('./lib/ai');

// key of the product a bound action was called on, e.g. Products(11) → 11
const keyOf = req => { const p = req.params[0]; return typeof p === 'object' ? p.ID : p; };

module.exports = class ReplenishmentService extends cds.ApplicationService {
  init() {
    const db = cds.entities('nw.replenish');

    this.on('syncNorthwind', async (req) => {
      const r = await syncNorthwind();
      const msg = `Synced ${r.products} products, ${r.suppliers} suppliers, ` +
                  `${r.categories} categories, ${r.orders} orders, ${r.items} order lines.`;
      req.info(msg);
      return msg;
    });

    this.on('runForecast', async (req) => {
      try {
        const r = await runForecast();
        const c = r.counts;
        const msg = `Analyzed ${r.analyzed} products (demand window ${r.from} to ${r.to}): ` +
                    `${c.Critical} critical, ${c.Warning} warning, ${c.OK} OK, ${c.Discontinued} discontinued.`;
        req.info(msg);
        return msg;
      } catch (e) {
        return req.error(e.status || 500, e.message);
      }
    });

    // Claude: explain why a product is at risk
    this.on('explainRisk', 'Products', async (req) => {
      const ID = keyOf(req);
      const p = await SELECT.one.from(db.Products, ID).columns(
        'ID', 'name', 'unitsInStock', 'unitsOnOrder', 'reorderLevel', 'discontinued',
        'avgMonthlyDemand', 'daysOfStock', 'suggestedQty', 'riskStatus', 'supplier_ID',
        'category.name as category', 'supplier.companyName as supplier');
      if (!p) return req.error(404, `Product ${ID} not found`);
      if (!p.riskStatus) return req.error(400, 'Run the forecast first.');

      try {
        const text = await askClaude({
          feature: 'EXPLAIN_RISK', productID: ID, supplierID: p.supplier_ID, maxTokens: 1024,
          system: 'You are a supply chain analyst at Northwind Traders. Explain stock risks to a ' +
                  'purchasing clerk in plain language. Use only the numbers given. Maximum 3 sentences.',
          prompt: `Explain why this product has risk status "${p.riskStatus}" and what the buyer should do.\n\n` +
                  `${JSON.stringify(p, null, 2)}\n\n` +
                  `Notes: daysOfStock 999 means no sales in the last 6 months. ` +
                  `suggestedQty covers 60 days of demand plus the reorder level.`
        });
        await UPDATE(db.Products, ID).with({ aiExplanation: text });
        req.info(text);
        return text;
      } catch (e) {
        return req.error(502, e.message);
      }
    });

    // Claude: draft a purchase request email to the product's supplier
    this.on('draftSupplierEmail', 'Products', async (req) => {
      const ID = keyOf(req);
      const p = await SELECT.one.from(db.Products, ID).columns('ID', 'supplier_ID');
      if (!p) return req.error(404, `Product ${ID} not found`);

      const s = await SELECT.one.from(db.Suppliers, p.supplier_ID);
      const items = await SELECT.from(db.Products)
        .columns('ID', 'name', 'quantityPerUnit', 'suggestedQty')
        .where({ supplier_ID: p.supplier_ID, discontinued: false });
      if (items.every(i => i.suggestedQty == null)) return req.error(400, 'Run the forecast first.');

      const lines = items.filter(i => i.suggestedQty > 0);
      if (!lines.length) return req.error(400, `Nothing needs reordering from ${s.companyName} right now.`);

      try {
        const text = await askClaude({
          feature: 'DRAFT_EMAIL', productID: ID, supplierID: s.ID, maxTokens: 1500,
          system: "You write short, polite, professional purchase request emails for Northwind Traders' purchasing team.",
          prompt: `Write a purchase request email to ${s.contactName} (${s.contactTitle}) at ${s.companyName}, ` +
                  `${s.city}, ${s.country}.\nRequest these quantities:\n` +
                  lines.map(l => `- ${l.name} (${l.quantityPerUnit}): ${l.suggestedQty} units`).join('\n') +
                  `\nAsk them to confirm price and delivery date. Sign as "Purchasing Team, Northwind Traders".\n` +
                  `Reply in exactly this format:\nSubject: <subject line>\n\n<email body>`
        });

        const m = text.match(/^Subject:\s*(.+)$/m);
        const subject = (m ? m[1] : `Purchase request - ${s.companyName}`).trim().slice(0, 200);
        const body = m ? text.slice(text.indexOf(m[0]) + m[0].length).trim() : text;

        const draft = { ID: cds.utils.uuid(), product_ID: ID, supplier_ID: s.ID, subject, body, status: 'Draft' };
        await INSERT.into(db.EmailDrafts).entries(draft);
        req.info(`Email draft created for ${s.companyName}: "${subject}"`);
        return draft;
      } catch (e) {
        return req.error(502, e.message);
      }
    });

    return super.init();
  }
};