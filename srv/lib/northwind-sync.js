const cds = require('@sap/cds');
const LOG = cds.log('nw-sync');
const PAGE = 100;

// Northwind pages its results, so keep fetching until a page comes back empty
async function fetchAll(nw, entitySet, select) {
  const rows = [];
  let skip = 0;
  while (true) {
    const path = `/${entitySet}?$select=${select}&$top=${PAGE}&$skip=${skip}`;
    const res = await nw.send({ method: 'GET', path });
    const batch = Array.isArray(res) ? res : (res?.value ?? []);
    if (batch.length === 0) break;
    rows.push(...batch);
    skip += batch.length;
    if (skip > 50000) break; // safety stop
  }
  LOG.info(`${entitySet}: ${rows.length} rows`);
  return rows;
}

async function syncNorthwind() {
  const nw = await cds.connect.to('Northwind');
  const { Categories, Suppliers, Products, Orders, OrderItems } = cds.entities('nw.replenish');

  const cats  = await fetchAll(nw, 'Categories', 'CategoryID,CategoryName,Description');
  const sups  = await fetchAll(nw, 'Suppliers', 'SupplierID,CompanyName,ContactName,ContactTitle,City,Country,Phone');
  const prods = await fetchAll(nw, 'Products', 'ProductID,ProductName,SupplierID,CategoryID,QuantityPerUnit,UnitPrice,UnitsInStock,UnitsOnOrder,ReorderLevel,Discontinued');
  const ords  = await fetchAll(nw, 'Orders', 'OrderID,CustomerID,OrderDate,ShipCountry');
  const items = await fetchAll(nw, 'Order_Details', 'OrderID,ProductID,UnitPrice,Quantity,Discount');

  // full refresh: clear, then insert
  await DELETE.from(OrderItems);
  await DELETE.from(Orders);
  await DELETE.from(Products);
  await DELETE.from(Suppliers);
  await DELETE.from(Categories);

  await INSERT.into(Categories).entries(cats.map(c => ({
    ID: c.CategoryID, name: c.CategoryName, description: c.Description
  })));
  await INSERT.into(Suppliers).entries(sups.map(s => ({
    ID: s.SupplierID, companyName: s.CompanyName, contactName: s.ContactName,
    contactTitle: s.ContactTitle, city: s.City, country: s.Country, phone: s.Phone
  })));
  await INSERT.into(Products).entries(prods.map(p => ({
    ID: p.ProductID, name: p.ProductName, supplier_ID: p.SupplierID, category_ID: p.CategoryID,
    quantityPerUnit: p.QuantityPerUnit, unitPrice: p.UnitPrice, unitsInStock: p.UnitsInStock,
    unitsOnOrder: p.UnitsOnOrder, reorderLevel: p.ReorderLevel, discontinued: p.Discontinued
  })));
  await INSERT.into(Orders).entries(ords.map(o => ({
    ID: o.OrderID, customerID: o.CustomerID,
    orderDate: o.OrderDate ? o.OrderDate.slice(0, 10) : null, shipCountry: o.ShipCountry
  })));
  await INSERT.into(OrderItems).entries(items.map(i => ({
    salesOrder_ID: i.OrderID, product_ID: i.ProductID,
    unitPrice: i.UnitPrice, quantity: i.Quantity, discount: i.Discount
  })));

  return { categories: cats.length, suppliers: sups.length, products: prods.length,
           orders: ords.length, items: items.length };
}

module.exports = { syncNorthwind };