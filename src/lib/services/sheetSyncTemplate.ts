export interface FieldDiff {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export interface ClientChangeItem {
  clientId: string;
  companyName: string;
  changeType: 'created' | 'updated';
  details: string;
  changedAt: string;
  fieldDiffs?: FieldDiff[];
}

export interface SheetConfig {
  workspaceId: string;
  sheetUrl: string;
  webhookUrl: string;
  lastInvoiceSync?: string;
  lastClientSync?: string;
  syncedInvoiceIds?: string[];
  syncedClientIds?: string[];
  pendingClientChanges?: Record<string, ClientChangeItem>;
}

export const APPS_SCRIPT_TEMPLATE = `/**
 * Docspace Google Sheets Two-Way Sync Script
 * -------------------------------------------------------------
 * Automatically maintains "Invoices" and "Clients" tabs.
 * Supports smart upserts (updates existing rows or appends new ones).
 */

// Target spreadsheet URL (pre-filled with your sheet)
var SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1a0Xaf42WlDlA4tt4emgEp7ECpknC4a7pBfmtgJjwMe0/edit";

function getSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  if (SPREADSHEET_URL) {
    try {
      return SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    } catch (err) {
      return SpreadsheetApp.openById("1a0Xaf42WlDlA4tt4emgEp7ECpknC4a7pBfmtgJjwMe0");
    }
  }
  throw new Error("Could not find active spreadsheet.");
}

// Initializer / Test Function (can be clicked safely with 'Run' in Apps Script)
function testRun() {
  var ss = getSpreadsheet();
  var invSheet = getOrCreateSheet(ss, "Invoices");
  var cliSheet = getOrCreateSheet(ss, "Clients");
  sortInvoicesSheet(invSheet);
  sortClientsSheet(cliSheet);
  Logger.log("✅ Setup & Sort Complete for Spreadsheet: " + ss.getName());
}

function doPost(e) {
  try {
    var ss = getSpreadsheet();

    if (!e || !e.postData || !e.postData.contents) {
      testRun();
      return respondJson({
        success: true,
        message: "Ran initial setup. Note: Docspace sends data automatically via Webhook POST requests."
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var data = payload.data;

    if (action === "test_connection") {
      var invSheet = getOrCreateSheet(ss, "Invoices");
      var cliSheet = getOrCreateSheet(ss, "Clients");
      return respondJson({
        success: true,
        message: "Connected successfully to spreadsheet: " + ss.getName(),
        sheets: ["Invoices", "Clients"]
      });
    }

    if (action === "sync_invoice") {
      var sheet = getOrCreateSheet(ss, "Invoices");
      var result = upsertInvoice(sheet, data);
      sortInvoicesSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        result: result
      });
    }

    if (action === "sync_all_invoices" || action === "sync_invoices") {
      var sheet = getOrCreateSheet(ss, "Invoices");
      var invoices = Array.isArray(data) ? data : [data];
      var isFullSync = payload.isFullSync === true;
      var inserted = 0;
      var updated = 0;
      for (var i = 0; i < invoices.length; i++) {
        var res = upsertInvoice(sheet, invoices[i]);
        if (res.isNew) inserted++;
        else updated++;
      }
      var deleted = 0;
      if (isFullSync) {
        deleted = reconcileInvoices(sheet, invoices, payload.allActiveInvoiceNumbers, payload.allActiveInvoiceIds);
      }
      sortInvoicesSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        inserted: inserted,
        updated: updated,
        deleted: deleted,
        total: invoices.length,
        isFullSync: isFullSync
      });
    }

    if (action === "delete_invoice") {
      var sheet = getOrCreateSheet(ss, "Invoices");
      var deleted = deleteInvoiceRow(sheet, data);
      sortInvoicesSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        deleted: deleted
      });
    }

    if (action === "sort_invoices") {
      var sheet = getOrCreateSheet(ss, "Invoices");
      sortInvoicesSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        message: "Invoices sheet sorted ascending successfully."
      });
    }

    if (action === "sync_clients" || action === "sync_all_clients") {
      var sheet = getOrCreateSheet(ss, "Clients");
      var clients = Array.isArray(data) ? data : [data];
      var isFullSync = payload.isFullSync === true;
      var inserted = 0;
      var updated = 0;
      for (var j = 0; j < clients.length; j++) {
        var res = upsertClient(sheet, clients[j]);
        if (res.isNew) inserted++;
        else updated++;
      }
      var deleted = 0;
      if (isFullSync) {
        deleted = reconcileClients(sheet, clients, payload.allActiveIds, payload.allActiveNames);
      }
      sortClientsSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        inserted: inserted,
        updated: updated,
        deleted: deleted,
        total: clients.length,
        isFullSync: isFullSync
      });
    }

    if (action === "delete_client") {
      var sheet = getOrCreateSheet(ss, "Clients");
      var deleted = deleteClientRow(sheet, data);
      sortClientsSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        deleted: deleted
      });
    }

    if (action === "sort_clients") {
      var sheet = getOrCreateSheet(ss, "Clients");
      sortClientsSheet(sheet);
      return respondJson({
        success: true,
        action: action,
        message: "Clients sheet sorted ascending by Created Date successfully."
      });
    }

    return respondJson({
      success: false,
      error: "Unknown action: " + action
    });

  } catch (err) {
    return respondJson({
      success: false,
      error: err.toString()
    });
  }
}

function doGet(e) {
  return respondJson({
    status: "online",
    message: "Docspace Sheet Sync Webhook is running."
  });
}

function respondJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (name === "Invoices") {
    ensureInvoicesHeader(sheet);
  } else if (name === "Clients") {
    ensureClientsHeader(sheet);
  }
  return sheet;
}

function ensureInvoicesHeader(sheet) {
  var headers = [
    "Invoice Number",
    "Doc Type",
    "Client Name",
    "Client GSTIN",
    "Place of Supply",
    "Issue Date",
    "Due Date",
    "Status",
    "Subtotal (INR)",
    "Tax Total (INR)",
    "Discount (INR)",
    "Total Amount (INR)",
    "Currency",
    "Items Count",
    "GST Treatment",
    "Payment Source",
    "Notes / Details",
    "Last Synced At",
    "Invoice ID"
  ];

  var lastCol = sheet.getLastColumn();
  var needsUpdate = false;
  if (lastCol < headers.length) {
    needsUpdate = true;
  } else {
    var cur = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(cur[i] || "").trim() !== headers[i]) {
        needsUpdate = true;
        break;
      }
    }
  }

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold");
    range.setBackground("#0f172a");
    range.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
}

function ensureClientsHeader(sheet) {
  var headers = [
    "Client ID",
    "Company Name",
    "Contact Person",
    "Email",
    "Phone",
    "Website",
    "Address",
    "Place of Supply",
    "Location",
    "Client Type",
    "GST Number",
    "GST Treatment",
    "Payment Source",
    "Status",
    "Invoice Currency",
    "Industry / Niche",
    "Tags",
    "Notes",
    "Created Date",
    "Last Synced At"
  ];

  var lastCol = sheet.getLastColumn();
  var needsUpdate = false;
  if (lastCol < headers.length) {
    needsUpdate = true;
  } else {
    var cur = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(cur[i] || "").trim() !== headers[i]) {
        needsUpdate = true;
        break;
      }
    }
  }

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold");
    range.setBackground("#047857");
    range.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }

  ensureClientsConditionalFormatting(sheet);
}

// Automatically creates a conditional formatting rule on the Clients sheet
// so that any row with Status "INACTIVE" receives a light red background behind text
function ensureClientsConditionalFormatting(sheet) {
  try {
    var rules = sheet.getConditionalFormatRules() || [];
    var alreadyExists = false;
    for (var i = 0; i < rules.length; i++) {
      var cond = rules[i].getBooleanCondition();
      if (cond) {
        var args = cond.getCriteriaValues();
        if (args && args.some(function(a) { return String(a).toUpperCase().indexOf("INACTIVE") !== -1; })) {
          alreadyExists = true;
          break;
        }
      }
    }
    if (!alreadyExists) {
      // Column N is Status (14). In custom formula: =$N2="INACTIVE"
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      var maxCols = Math.max(sheet.getLastColumn(), 20);
      var range = sheet.getRange(2, 1, maxRows - 1, maxCols);
      var rule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$N2="INACTIVE"')
        .setBackground("#fee2e2")
        .setRanges([range])
        .build();
      rules.push(rule);
      sheet.setConditionalFormatRules(rules);
    }
  } catch (err) {
    Logger.log("Notice on ensureClientsConditionalFormatting: " + err.message);
  }
}

// Automatically sorts the Invoices tab in ascending order based on Invoice Number (Column A)
// Lowest invoice number (e.g. DOC-26-1030) stays at the top, followed by 1031, 1032, etc.
function sortInvoicesSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 2 || lastCol <= 0) return;

    var numRows = lastRow - 1;
    var range = sheet.getRange(2, 1, numRows, lastCol);
    var values = range.getValues();

    // Natural alphanumeric sort so lowest invoice number (e.g. 1030) is at the top
    values.sort(function(a, b) {
      var invA = String(a[0] || "").trim();
      var invB = String(b[0] || "").trim();
      if (!invA && !invB) return 0;
      if (!invA) return 1;
      if (!invB) return -1;
      return invA.localeCompare(invB, undefined, { numeric: true, sensitivity: 'base' });
    });

    range.setValues(values);
  } catch (err) {
    Logger.log("Error sorting Invoices sheet: " + err.message);
  }
}

function upsertInvoice(sheet, inv) {
  if (!inv || !inv.invoiceNumber) return { isNew: false, skipped: true };

  var data = sheet.getDataRange().getValues();
  var targetRow = -1;
  var invNum = String(inv.invoiceNumber).trim();
  var invId = String(inv.id || "").trim();

  // Find the column index for "Invoice ID"
  var invoiceIdColIdx = -1;
  if (data.length > 0) {
    var headerRow = data[0];
    for (var c = 0; c < headerRow.length; c++) {
      if (String(headerRow[c] || "").trim().toLowerCase() === "invoice id") {
        invoiceIdColIdx = c;
        break;
      }
    }
  }

  // Collect active invoice numbers from payload to avoid accidental deletion
  var activeNums = [];
  if (Array.isArray(inv.allActiveInvoiceNumbers)) {
    for (var a = 0; a < inv.allActiveInvoiceNumbers.length; a++) {
      var an = String(inv.allActiveInvoiceNumbers[a] || "").trim().toUpperCase();
      if (an && activeNums.indexOf(an) === -1) activeNums.push(an);
    }
  }

  // Collect previous invoice numbers (e.g. when switched from Tax to Proforma or Receipt)
  var prevNums = [];
  if (inv.previousInvoiceNumber) {
    var p0 = String(inv.previousInvoiceNumber).trim().toUpperCase();
    if (p0 && p0 !== invNum.toUpperCase() && activeNums.indexOf(p0) === -1) {
      prevNums.push(p0);
    }
  }
  if (Array.isArray(inv.previousInvoiceNumbers)) {
    for (var p = 0; p < inv.previousInvoiceNumbers.length; p++) {
      var pn = String(inv.previousInvoiceNumbers[p] || "").trim().toUpperCase();
      if (pn && pn !== invNum.toUpperCase() && activeNums.indexOf(pn) === -1 && prevNums.indexOf(pn) === -1) {
        prevNums.push(pn);
      }
    }
  }

  // 1. Try finding dedicated row by Invoice ID
  if (invId && invoiceIdColIdx >= 0) {
    for (var i = 1; i < data.length; i++) {
      var rowId = String(data[i][invoiceIdColIdx] || "").trim();
      if (rowId === invId) {
        targetRow = i + 1;
        break;
      }
    }
  }

  // 2. If not found by ID, try finding by exact current Invoice Number (Column A)
  if (targetRow <= 0) {
    for (var i = 1; i < data.length; i++) {
      var rowNum = String(data[i][0] || "").trim().toUpperCase();
      if (rowNum === invNum.toUpperCase()) {
        targetRow = i + 1;
        break;
      }
    }
  }

  // 3. If not found, try finding by previous Invoice Number(s)
  if (targetRow <= 0 && prevNums.length > 0) {
    for (var i = 1; i < data.length; i++) {
      var rowNum = String(data[i][0] || "").trim().toUpperCase();
      if (rowNum && prevNums.indexOf(rowNum) !== -1) {
        targetRow = i + 1;
        break;
      }
    }
  }

  var now = new Date().toISOString().replace("T", " ").substring(0, 19);
  var rowValues = [
    invNum,
    inv.docType || "Tax Invoice",
    inv.clientName || "",
    inv.clientGst || "",
    inv.placeOfSupply || "",
    inv.issueDate || "",
    inv.dueDate || "",
    String(inv.status || "draft").toUpperCase(),
    Number(inv.subtotal || 0),
    Number(inv.taxTotal || 0),
    Number(inv.discount || 0),
    Number(inv.total || 0),
    inv.currency || "INR",
    inv.items ? inv.items.length : 0,
    inv.gstTreatment || "Regular",
    inv.paymentSource || "",
    inv.notes || "",
    now,
    invId
  ];

  var isNew = false;
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
    targetRow = sheet.getLastRow();
    isNew = true;
  }

  // Clean up any other duplicate / orphaned rows that belonged to this invoice's previous numbers or ID
  if (prevNums.length > 0 || invId) {
    var freshData = sheet.getDataRange().getValues();
    for (var r = freshData.length - 1; r >= 1; r--) {
      var rRowIndex = r + 1;
      if (rRowIndex === targetRow) continue; // Keep the active updated row!
      var rNum = String(freshData[r][0] || "").trim().toUpperCase();
      var rId = invoiceIdColIdx >= 0 ? String(freshData[r][invoiceIdColIdx] || "").trim() : "";
      if ((invId && rId && rId === invId) || (rNum && prevNums.indexOf(rNum) !== -1 && activeNums.indexOf(rNum) === -1)) {
        sheet.deleteRow(rRowIndex);
        if (rRowIndex < targetRow) targetRow--;
      }
    }
  }

  sortInvoicesSheet(sheet);
  return { isNew: isNew, row: targetRow };
}

// Automatically sorts the Clients tab on the basis of the day they were added (Created Date - Column S)
// Earliest added clients come first at the top, and later ones move down and down
// And highlights inactive clients with a light red background behind text
function sortClientsSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol <= 0) return;

    var numRows = lastRow - 1;
    var range = sheet.getRange(2, 1, numRows, lastCol);
    var values = range.getValues();

    // Column S is index 18 ("Created Date"), Column N is index 13 ("Status")
    var createdDateColIdx = 18;
    var statusColIdx = 13;
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var c = 0; c < headerRow.length; c++) {
      var h = String(headerRow[c] || "").trim().toLowerCase();
      if (h === "created date") {
        createdDateColIdx = c;
      } else if (h === "status") {
        statusColIdx = c;
      }
    }

    function parseDateValue(val) {
      if (!val) return 0;
      if (val instanceof Date) return val.getTime();
      var str = String(val).trim();
      if (!str) return 0;
      var ts = Date.parse(str);
      if (!isNaN(ts)) return ts;
      var parts = str.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          var d = parseInt(parts[0], 10);
          var m = parseInt(parts[1], 10) - 1;
          var y = parseInt(parts[2], 10);
          var td = new Date(y, m, d);
          if (!isNaN(td.getTime())) return td.getTime();
        }
        if (parts[0].length === 4) {
          var y = parseInt(parts[0], 10);
          var m = parseInt(parts[1], 10) - 1;
          var d = parseInt(parts[2], 10);
          var td = new Date(y, m, d);
          if (!isNaN(td.getTime())) return td.getTime();
        }
      }
      return 0;
    }

    if (numRows > 1) {
      // Sort ascending: earliest date first, later dates move down
      values.sort(function(a, b) {
        var tA = parseDateValue(a[createdDateColIdx]);
        var tB = parseDateValue(b[createdDateColIdx]);

        if (!tA && !tB) return 0;
        if (!tA) return 1;
        if (!tB) return -1;

        if (tA !== tB) {
          return tA - tB;
        }

        // Tie-breaker: Company Name (Column B / index 1)
        var nameA = String(a[1] || "").trim().toUpperCase();
        var nameB = String(b[1] || "").trim().toUpperCase();
        return nameA.localeCompare(nameB);
      });

      range.setValues(values);
    }

    // Highlight any inactive client row with light red background (#fee2e2)
    var backgrounds = [];
    for (var r = 0; r < values.length; r++) {
      var rowBgs = [];
      var statusVal = String(values[r][statusColIdx] || "").trim().toUpperCase();
      var isInactive = statusVal === "INACTIVE";
      var bgColor = isInactive ? "#fee2e2" : "#ffffff";
      for (var col = 0; col < lastCol; col++) {
        rowBgs.push(bgColor);
      }
      backgrounds.push(rowBgs);
    }
    range.setBackgrounds(backgrounds);
  } catch (err) {
    Logger.log("Error sorting/highlighting Clients sheet: " + err.message);
  }
}

function upsertClient(sheet, cli) {
  if (!cli) return { isNew: false, skipped: true };

  var data = sheet.getDataRange().getValues();
  var targetRow = -1;
  var cliId = String(cli.id || "").trim();
  var cliName = String(cli.companyName || "").trim().toUpperCase();

  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][0]).trim();
    var rowName = String(data[i][1]).trim().toUpperCase();
    if ((cliId && rowId === cliId) || (cliName && rowName === cliName)) {
      targetRow = i + 1;
      break;
    }
  }

  var now = new Date().toISOString().replace("T", " ").substring(0, 19);
  var rowValues = [
    cliId,
    cli.companyName || "",
    cli.contactPerson || "",
    cli.email || "",
    cli.phone || "",
    cli.website || "",
    cli.address || "",
    cli.placeOfSupply || "",
    cli.clientLocation || "Domestic",
    cli.clientType || "Business",
    cli.gstNumber || "",
    cli.gstTreatment || "Regular",
    cli.paymentSource || "",
    String(cli.status || "active").toUpperCase(),
    cli.invoiceCurrency || "INR",
    cli.industry || "",
    Array.isArray(cli.tags) ? cli.tags.join(", ") : (cli.tags || ""),
    cli.notes || "",
    cli.createdAt || "",
    now
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    sortClientsSheet(sheet);
    return { isNew: false, row: targetRow };
  } else {
    sheet.appendRow(rowValues);
    sortClientsSheet(sheet);
    return { isNew: true, row: sheet.getLastRow() };
  }
}

// Reconciles Clients tab so that only truly deleted/non-existing clients in Docspace are purged
function reconcileClients(sheet, activeClients, allActiveIds, allActiveNames) {
  var validIds = {};
  var validNames = {};

  if (Array.isArray(allActiveIds) && allActiveIds.length > 0) {
    for (var a = 0; a < allActiveIds.length; a++) {
      if (allActiveIds[a]) validIds[String(allActiveIds[a]).trim()] = true;
    }
  }
  if (Array.isArray(allActiveNames) && allActiveNames.length > 0) {
    for (var b = 0; b < allActiveNames.length; b++) {
      if (allActiveNames[b]) validNames[String(allActiveNames[b]).trim().toUpperCase()] = true;
    }
  }
  for (var k = 0; k < activeClients.length; k++) {
    var c = activeClients[k];
    if (c.id) validIds[String(c.id).trim()] = true;
    if (c.companyName) validNames[String(c.companyName).trim().toUpperCase()] = true;
  }

  var lastRow = sheet.getLastRow();
  var deletedCount = 0;
  if (lastRow > 1) {
    var rangeValues = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var r = rangeValues.length - 1; r >= 0; r--) {
      var rowId = String(rangeValues[r][0] || "").trim();
      var rowName = String(rangeValues[r][1] || "").trim().toUpperCase();

      var keep = false;
      if (rowId && validIds[rowId]) {
        keep = true;
      } else if (rowName && validNames[rowName]) {
        keep = true;
      }

      if (!keep) {
        var rowIndex = r + 2; // 1-indexed, skipping header
        sheet.deleteRow(rowIndex);
        deletedCount++;
      }
    }
  }
  return deletedCount;
}

// Deletes a specific client row by ID or Company Name
function deleteClientRow(sheet, clientData) {
  if (!clientData) return false;
  var targetId = String(clientData.id || "").trim();
  var targetName = String(clientData.companyName || "").trim().toUpperCase();
  var lastRow = sheet.getLastRow();
  var deleted = false;
  if (lastRow > 1) {
    var rangeValues = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var r = rangeValues.length - 1; r >= 0; r--) {
      var rowId = String(rangeValues[r][0] || "").trim();
      var rowName = String(rangeValues[r][1] || "").trim().toUpperCase();
      if ((targetId && rowId === targetId) || (targetName && rowName === targetName)) {
        sheet.deleteRow(r + 2);
        deleted = true;
      }
    }
  }
  return deleted;
}

// Reconciles Invoices tab so that only truly deleted invoices in Docspace are purged
function reconcileInvoices(sheet, activeInvoices, allActiveInvoiceNumbers, allActiveInvoiceIds) {
  var validNumbers = {};
  var validIds = {};

  if (Array.isArray(allActiveInvoiceNumbers) && allActiveInvoiceNumbers.length > 0) {
    for (var a = 0; a < allActiveInvoiceNumbers.length; a++) {
      if (allActiveInvoiceNumbers[a]) validNumbers[String(allActiveInvoiceNumbers[a]).trim().toUpperCase()] = true;
    }
  }
  if (Array.isArray(allActiveInvoiceIds) && allActiveInvoiceIds.length > 0) {
    for (var b = 0; b < allActiveInvoiceIds.length; b++) {
      if (allActiveInvoiceIds[b]) validIds[String(allActiveInvoiceIds[b]).trim()] = true;
    }
  }
  for (var k = 0; k < activeInvoices.length; k++) {
    var inv = activeInvoices[k];
    if (inv.invoiceNumber) validNumbers[String(inv.invoiceNumber).trim().toUpperCase()] = true;
    if (inv.id) validIds[String(inv.id).trim()] = true;
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var deletedCount = 0;
  if (lastRow > 1 && lastCol > 0) {
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var invoiceIdColIdx = -1;
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var c = 0; c < headerRow.length; c++) {
      if (String(headerRow[c] || "").trim().toLowerCase() === "invoice id") {
        invoiceIdColIdx = c;
        break;
      }
    }

    for (var r = data.length - 1; r >= 0; r--) {
      var rowInvNum = String(data[r][0] || "").trim().toUpperCase();
      var rowId = invoiceIdColIdx >= 0 ? String(data[r][invoiceIdColIdx] || "").trim() : "";

      var keep = false;
      if (rowId && validIds[rowId]) {
        keep = true;
      } else if (rowInvNum && validNumbers[rowInvNum]) {
        keep = true;
      }

      if (!keep) {
        sheet.deleteRow(r + 2);
        deletedCount++;
      }
    }
  }
  return deletedCount;
}

// Deletes a specific invoice row by Invoice Number or Invoice ID
function deleteInvoiceRow(sheet, invoiceData) {
  if (!invoiceData) return false;
  var targetNum = String(invoiceData.invoiceNumber || "").trim().toUpperCase();
  var targetId = String(invoiceData.id || "").trim();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var deleted = false;
  if (lastRow > 1 && lastCol > 0) {
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var invoiceIdColIdx = -1;
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var c = 0; c < headerRow.length; c++) {
      if (String(headerRow[c] || "").trim().toLowerCase() === "invoice id") {
        invoiceIdColIdx = c;
        break;
      }
    }

    for (var r = data.length - 1; r >= 0; r--) {
      var rowInvNum = String(data[r][0] || "").trim().toUpperCase();
      var rowId = invoiceIdColIdx >= 0 ? String(data[r][invoiceIdColIdx] || "").trim() : "";
      if ((targetId && rowId && rowId === targetId) || (targetNum && rowInvNum === targetNum)) {
        sheet.deleteRow(r + 2);
        deleted = true;
      }
    }
  }
  return deleted;
}
`;
