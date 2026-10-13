using ReplenishmentService as service from '../../srv/service';

// ---------- Products: texts and value helps ----------
annotate service.Products with {
  category @(
    Common.Text: category.name,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: {
      CollectionPath: 'Categories',
      Parameters: [
        { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: category_ID, ValueListProperty: 'ID' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
      ]
    }
  );
  supplier @(
    Common.Text: supplier.companyName,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: {
      CollectionPath: 'Suppliers',
      Parameters: [
        { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: supplier_ID, ValueListProperty: 'ID' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'companyName' }
      ]
    }
  );
  aiExplanation @UI.MultiLineText;
};

// ---------- Products: list report and object page ----------
annotate service.Products with @(
  UI.HeaderInfo: {
    TypeName      : 'Product',
    TypeNamePlural: 'Products',
    Title         : { Value: name },
    Description   : { Value: riskStatus }
  },

  UI.SelectionFields: [ category_ID, supplier_ID, riskStatus, discontinued ],

  UI.LineItem: [
    { $Type: 'UI.DataFieldForAction', Action: 'ReplenishmentService.EntityContainer/syncNorthwind', Label: 'Sync from Northwind' },
    { $Type: 'UI.DataFieldForAction', Action: 'ReplenishmentService.EntityContainer/runForecast',   Label: 'Run Forecast' },
    { Value: name },
    { Value: category_ID },
    { Value: supplier_ID },
    { Value: unitsInStock },
    { Value: unitsOnOrder },
    { Value: reorderLevel },
    { Value: avgMonthlyDemand },
    { Value: daysOfStock },
    { Value: suggestedQty },
    { Value: riskStatus, Criticality: riskCriticality }
  ],

  // most urgent products first
  UI.PresentationVariant: {
    SortOrder     : [ { Property: daysOfStock, Descending: false } ],
    Visualizations: [ '@UI.LineItem' ]
  },

  // buttons in the object page header
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ReplenishmentService.explainRisk',        Label: 'Explain with AI' },
    { $Type: 'UI.DataFieldForAction', Action: 'ReplenishmentService.draftSupplierEmail', Label: 'Draft Supplier Email' }
  ],

  UI.FieldGroup #Stock: { Data: [
    { Value: category_ID }, { Value: supplier_ID }, { Value: quantityPerUnit }, { Value: unitPrice },
    { Value: unitsInStock }, { Value: unitsOnOrder }, { Value: reorderLevel }, { Value: discontinued }
  ]},
  UI.FieldGroup #Forecast: { Data: [
    { Value: avgMonthlyDemand }, { Value: daysOfStock }, { Value: suggestedQty },
    { Value: riskStatus, Criticality: riskCriticality }, { Value: lastAnalyzed }
  ]},
  UI.FieldGroup #AI: { Data: [ { Value: aiExplanation } ] },

  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'Stock',    Label: 'Stock',                 Target: '@UI.FieldGroup#Stock' },
    { $Type: 'UI.ReferenceFacet', ID: 'Forecast', Label: 'Forecast',              Target: '@UI.FieldGroup#Forecast' },
    { $Type: 'UI.ReferenceFacet', ID: 'AI',       Label: 'AI Insight',            Target: '@UI.FieldGroup#AI' },
    { $Type: 'UI.ReferenceFacet', ID: 'Drafts',   Label: 'Supplier Email Drafts', Target: 'drafts/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'AICalls',  Label: 'AI Call Log',           Target: 'aiCalls/@UI.LineItem' }
  ]
);

// refresh the page automatically after the Claude actions
annotate service.Products actions {
  explainRisk        @Common.SideEffects: { TargetProperties: [ 'in/aiExplanation' ], TargetEntities: [ 'in/aiCalls' ] };
  draftSupplierEmail @Common.SideEffects: { TargetEntities: [ 'in/drafts', 'in/aiCalls' ] };
};

// ---------- Email drafts table ----------
annotate service.EmailDrafts with @(
  UI.LineItem: [
    { Value: createdAt, Label: 'Created' },
    { Value: subject },
    { Value: body },
    { Value: status }
  ]
) {
  body @UI.MultiLineText;
};

// ---------- AI call log table ----------
annotate service.AICallLogs with @(
  UI.LineItem: [
    { Value: createdAt, Label: 'Time' },
    { Value: feature },
    { Value: status },
    { Value: inputTokens },
    { Value: outputTokens },
    { Value: durationMs },
    { Value: createdBy, Label: 'User' }
  ]
);