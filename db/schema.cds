namespace nw.replenish;

using { cuid, managed } from '@sap/cds/common';

entity Categories {
  key ID          : Integer;
      name        : String(15)  @title: 'Category';
      description : LargeString @title: 'Description';
}

entity Suppliers {
  key ID           : Integer;
      companyName  : String(40) @title: 'Supplier';
      contactName  : String(30) @title: 'Contact';
      contactTitle : String(30) @title: 'Contact Title';
      city         : String(15) @title: 'City';
      country      : String(15) @title: 'Country';
      phone        : String(24) @title: 'Phone';
      products     : Association to many Products on products.supplier = $self;
}

entity Products {
  key ID               : Integer;
      name             : String(40)    @title: 'Product';
      @title: 'Category'
      category         : Association to Categories;
      @title: 'Supplier'
      supplier         : Association to Suppliers;
      quantityPerUnit  : String(20)    @title: 'Qty per Unit';
      unitPrice        : Decimal(10,2) @title: 'Unit Price';
      unitsInStock     : Integer       @title: 'In Stock';
      unitsOnOrder     : Integer       @title: 'On Order';
      reorderLevel     : Integer       @title: 'Reorder Level';
      discontinued     : Boolean       @title: 'Discontinued';

      // filled by the forecast logic
      avgMonthlyDemand : Decimal(10,2) @title: 'Avg Monthly Demand';
      daysOfStock      : Integer       @title: 'Days of Stock';
      suggestedQty     : Integer       @title: 'Suggested Qty';
      riskStatus       : String(12)    @title: 'Risk';
      riskCriticality  : Integer;

      // filled by Claude
      aiExplanation    : LargeString   @title: 'AI Explanation';
      lastAnalyzed     : Timestamp     @title: 'Last Analyzed';

      drafts           : Association to many EmailDrafts on drafts.product = $self;
      aiCalls          : Association to many AICallLogs  on aiCalls.product = $self;
}

entity Orders {
  key ID          : Integer;
      customerID  : String(5);
      orderDate   : Date;
      shipCountry : String(15);
      items       : Composition of many OrderItems on items.salesOrder = $self;
}

entity OrderItems {
  key salesOrder : Association to Orders;
  key product    : Association to Products;
      unitPrice  : Decimal(10,2);
      quantity   : Integer;
      discount   : Double;
}

// Supplier emails drafted by Claude
entity EmailDrafts : cuid, managed {
  product  : Association to Products;
  supplier : Association to Suppliers;
  subject  : String(200) @title: 'Subject';
  body     : LargeString @title: 'Email Body';
  status   : String(10) default 'Draft' @title: 'Status';
}

// Every Claude API call is logged here (your HANA learning table)
entity AICallLogs : cuid, managed {
  feature      : String(30)  @title: 'Feature';
  model        : String(50)  @title: 'Model';
  prompt       : LargeString @title: 'Prompt';
  response     : LargeString @title: 'Response';
  inputTokens  : Integer     @title: 'Input Tokens';
  outputTokens : Integer     @title: 'Output Tokens';
  durationMs   : Integer     @title: 'Duration (ms)';
  status       : String(10)  @title: 'Status';
  errorMessage : String(500) @title: 'Error';
  product      : Association to Products;
  supplier     : Association to Suppliers;
}