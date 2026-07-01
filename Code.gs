/**
 * AQUATIC PARADISE RENTALS — Booking Backend
 * Deploy: Extensions > Apps Script in your "APR Master Log" Google Sheet
 *         Deploy > New deployment > Web app
 *         Execute as: Me | Who has access: Anyone
 *
 * Sheet tab: BOOKINGS (auto-created on first booking)
 * Columns: ref | fname | lname | phone | email | datetime | groupSize |
 *          gear | duration | total | referral | notes | waiverAccepted |
 *          waiverTimestamp | source | Timestamp
 */

var SHEET_NAME = 'BOOKINGS';
var NOTIFY_EMAIL = 'aquaticparadiserentals@gmail.com';
// Shared secret required to read booking/customer data (PII). Booking *submission*
// stays open since customers must be able to book without a login.
var APP_TOKEN = '2Si_80O9OJ0DGmc8p6G5pDeG';

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow([
      'ref','fname','lname','phone','email','datetime','groupSize',
      'gear','duration','total','referral','notes',
      'waiverAccepted','waiverTimestamp','source','Timestamp'
    ]);
    sh.getRange('1:1').setFontWeight('bold');
    ['D:D','F:F','N:N'].forEach(function(r){ sh.getRange(r).setNumberFormat('@'); });
  }
  return sh;
}

function _safe(val) {
  var s = (val === undefined || val === null) ? '' : String(val);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.data) {
      return _json(saveBooking(JSON.parse(p.data)));
    }
    if (p.action === 'getBookings') {
      if (p.token !== APP_TOKEN) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getBookings(parseInt(p.limit) || 50) });
    }
    return _json({ ok: true, message: 'APR Backend v3' });
  } catch(err) {
    return _json({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    } else {
      throw new Error('No data received');
    }
    if (payload.action === 'update_status') {
      if (payload.token !== APP_TOKEN) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateStatus(payload));
    }
    if (payload.action === 'getBookings') {
      if (payload.token !== APP_TOKEN) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getBookings(50) });
    }
    return _json(saveBooking(payload));
  } catch(err) {
    return _json({ ok: false, error: err.message });
  }
}

function saveBooking(p) {
  var sh = _sheet();
  sh.appendRow([
    _safe(p.ref),
    _safe(p.fname),
    _safe(p.lname),
    _safe(p.phone),
    _safe(p.email),
    _safe(p.datetime),
    _safe(p.groupSize),
    _safe(p.gear),
    _safe(p.duration),
    p.total || 0,
    _safe(p.referral),
    _safe(p.notes),
    p.waiverAccepted ? true : false,
    _safe(p.waiverTimestamp),
    _safe(p.source || 'PWA'),
    new Date().toISOString()
  ]);
  try { sendNotification(p); } catch(e) { Logger.log('Email err: ' + e.message); }
  return { ok: true, ref: p.ref };
}

var FIELDS = ['ref','fname','lname','phone','email','datetime','groupSize',
  'gear','duration','total','referral','notes','waiverAccepted','waiverTimestamp','source','Timestamp'];

function getBookings(limit) {
  var sh = _sheet();
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).reverse().slice(0, limit).map(function(row) {
    var obj = {};
    FIELDS.forEach(function(f, i) { obj[f] = row[i]; });
    return obj;
  });
}

function updateStatus(p) {
  var sh = _sheet();
  var data = sh.getDataRange().getValues();
  var refIdx = data[0].indexOf('ref');
  for (var i = 1; i < data.length; i++) {
    if (data[i][refIdx] === p.ref) return { ok: true };
  }
  return { ok: false, error: 'Booking not found' };
}

// ── ONE-TIME SETUP: Run this once from Apps Script to fix sheet headers ──
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  // Clear and reset header row
  sh.getRange('1:1').clearContent();
  sh.getRange(1, 1, 1, 16).setValues([[
    'ref','fname','lname','phone','email','datetime','groupSize',
    'gear','duration','total','referral','notes',
    'waiverAccepted','waiverTimestamp','source','Timestamp'
  ]]);
  sh.getRange('1:1').setFontWeight('bold');
  ['D:D','F:F','N:N'].forEach(function(r){ sh.getRange(r).setNumberFormat('@'); });
  SpreadsheetApp.getUi().alert('✅ Sheet headers updated! You can delete old test rows manually.');
}

function sendNotification(p) {
  var subject = '🏄 New APR Booking: ' + (p.ref || '');
  var body = [
    'New booking received!', '',
    'Ref:       ' + (p.ref || ''),
    'Name:      ' + (p.fname || '') + ' ' + (p.lname || ''),
    'Phone:     ' + (p.phone || ''),
    'Email:     ' + (p.email || ''),
    'Date/Time: ' + (p.datetime || ''),
    'Group:     ' + (p.groupSize || ''),
    'Gear:      ' + (p.gear || ''),
    'Duration:  ' + (p.duration || ''),
    'Total:     XCD ' + (p.total || ''),
    'Referral:  ' + (p.referral || ''),
    'Notes:     ' + (p.notes || ''),
    '', 'Submitted: ' + new Date().toISOString()
  ].join('\n');
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}
