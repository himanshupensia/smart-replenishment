using nw.replenish as db from '../db/schema';

service ReplenishmentService @(path: 'replenishment') {

  @readonly entity Products as projection on db.Products actions {
    action explainRisk() returns String;
    action draftSupplierEmail() returns EmailDrafts;
  };

  @readonly entity Categories  as projection on db.Categories;
  @readonly entity Suppliers   as projection on db.Suppliers;
  @readonly entity Orders      as projection on db.Orders;
  @readonly entity OrderItems  as projection on db.OrderItems;
  @readonly entity EmailDrafts as projection on db.EmailDrafts;
  @readonly entity AICallLogs  as projection on db.AICallLogs;

  action syncNorthwind() returns String;
  action runForecast() returns String;
}