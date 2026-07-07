/**
 * AQUATIC PARADISE RENTALS — Booking Backend
 * Deploy: Extensions > Apps Script in your "APR Master Log" Google Sheet
 *         Deploy > New deployment > Web app
 *         Execute as: Me | Who has access: Anyone
 *
 * Sheet tab: BOOKINGS (auto-created on first booking)
 * Columns: ref | fname | lname | phone | email | datetime | groupSize |
 *          gear | duration | total | referral | notes | waiverAccepted |
 *          waiverTimestamp | source | Timestamp | NotifiedAt
 */

var SHEET_NAME = 'BOOKINGS';
var DRIVERS_SHEET_NAME = 'DRIVERS';
var NOTIFY_EMAIL = 'aquaticparadiserentals@gmail.com';
// Shared secret required to read booking/customer data (PII). Booking *submission*
// stays open since customers must be able to book without a login.
var APP_TOKEN = '2Si_80O9OJ0DGmc8p6G5pDeG';
var GENERIC_ERROR = 'Something went wrong. Please try again.';
var ID_PHOTO_FOLDER_NAME = 'APR Guest ID Photos';
var MAX_ID_PHOTO_BASE64_LEN = 8000000; // ~6MB decoded — generous cap against abuse

var FIELDS = ['ref','fname','lname','phone','email','datetime','groupSize',
  'gear','duration','total','referral','notes','waiverAccepted','waiverTimestamp',
  'source','Timestamp','NotifiedAt','idPhotoUrl','status','kidsCount'];
var VALID_STATUSES = ['pending', 'confirmed', 'done'];
var INVENTORY_SHEET_NAME = 'INVENTORY';

// ── FAIL-SAFE HELPERS ──

// Any error while checking the token is treated as "not authorized" — never
// fail open. Returns false for missing/malformed/mismatched tokens as well as
// for unexpected exceptions during comparison.
function _authOk(p) {
  try {
    var token = p && p.token;
    if (typeof token !== 'string' || !token) return false;
    return token === APP_TOKEN;
  } catch (err) {
    _logError('auth', err);
    return false;
  }
}

// Never let raw exception details (stack traces, sheet names, formulas) reach
// the client. Log full detail server-side, return a generic message.
function _logError(where, err) {
  try {
    Logger.log('[' + where + '] ' + (err && err.message ? err.message : err));
  } catch (e) { /* logging must never itself throw */ }
}

function _fail(where, err) {
  _logError(where, err);
  return { ok: false, error: GENERIC_ERROR };
}

function _json(obj) {
  try {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Even JSON serialization is wrapped — fall back to a minimal safe payload.
    return ContentService.createTextOutput('{"ok":false,"error":"' + GENERIC_ERROR + '"}')
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── INPUT VALIDATION ──
// Explicit schema check: type, length, and null/empty checks before anything
// touches the sheet. Returns { valid, error } — never throws.
function _validateBookingPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing booking data' };

    var requiredStrings = ['ref', 'fname', 'lname', 'phone', 'datetime', 'gear'];
    for (var i = 0; i < requiredStrings.length; i++) {
      var key = requiredStrings[i];
      var val = p[key];
      if (typeof val !== 'string' && typeof val !== 'number') {
        return { valid: false, error: 'Invalid or missing field: ' + key };
      }
      var str = String(val).trim();
      if (str.length === 0) return { valid: false, error: 'Field cannot be empty: ' + key };
      if (str.length > 200) return { valid: false, error: 'Field too long: ' + key };
    }

    var optionalStrings = ['email', 'groupSize', 'duration', 'referral', 'notes', 'waiverTimestamp', 'source'];
    for (var j = 0; j < optionalStrings.length; j++) {
      var ok = optionalStrings[j];
      var ov = p[ok];
      if (ov !== undefined && ov !== null) {
        if (typeof ov !== 'string' && typeof ov !== 'number') {
          return { valid: false, error: 'Invalid field type: ' + ok };
        }
        if (String(ov).length > 1000) return { valid: false, error: 'Field too long: ' + ok };
      }
    }

    if (p.total !== undefined && p.total !== null) {
      var totalNum = Number(p.total);
      if (isNaN(totalNum) || totalNum < 0 || totalNum > 1000000) {
        return { valid: false, error: 'Invalid total amount' };
      }
    }

    if (p.kidsCount !== undefined && p.kidsCount !== null && p.kidsCount !== '') {
      var kidsNum = Number(p.kidsCount);
      if (isNaN(kidsNum) || kidsNum < 0 || kidsNum > 20 || Math.floor(kidsNum) !== kidsNum) {
        return { valid: false, error: 'Invalid number of kids' };
      }
    }

    if (p.idPhotoBase64 !== undefined && p.idPhotoBase64 !== null && p.idPhotoBase64 !== '') {
      if (typeof p.idPhotoBase64 !== 'string') {
        return { valid: false, error: 'Invalid ID photo data' };
      }
      if (p.idPhotoBase64.length > MAX_ID_PHOTO_BASE64_LEN) {
        return { valid: false, error: 'ID photo is too large' };
      }
      if (p.idPhotoMimeType !== undefined && p.idPhotoMimeType !== null) {
        if (typeof p.idPhotoMimeType !== 'string' || !/^image\/(jpeg|jpg|png|webp)$/i.test(p.idPhotoMimeType)) {
          return { valid: false, error: 'Unsupported ID photo format' };
        }
      }
    }

    return { valid: true };
  } catch (err) {
    _logError('validateBookingPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

function _validateDriverPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing driver data' };
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) {
      return { valid: false, error: 'Invalid or missing name' };
    }
    if (p.vehicle !== undefined && p.vehicle !== null) {
      if (typeof p.vehicle !== 'string' || p.vehicle.length > 200) {
        return { valid: false, error: 'Invalid vehicle' };
      }
    }
    if (p.phone !== undefined && p.phone !== null) {
      if (typeof p.phone !== 'string' || p.phone.length > 50) {
        return { valid: false, error: 'Invalid phone' };
      }
    }
    return { valid: true };
  } catch (err) {
    _logError('validateDriverPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

function _validateStatusPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing data' };
    if (typeof p.ref !== 'string' || !p.ref.trim() || p.ref.length > 200) {
      return { valid: false, error: 'Invalid ref' };
    }
    if (typeof p.status !== 'string' || VALID_STATUSES.indexOf(p.status) === -1) {
      return { valid: false, error: 'Invalid status' };
    }
    return { valid: true };
  } catch (err) {
    _logError('validateStatusPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

// ── SHEET ACCESS (wrapped — a locked/slow sheet must never crash the request) ──
function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(FIELDS);
    sh.getRange('1:1').setFontWeight('bold');
    ['D:D','F:F','N:N'].forEach(function(r){ sh.getRange(r).setNumberFormat('@'); });
  } else {
    // Self-healing migration: older sheets predate newer columns (e.g.
    // 'status', 'kidsCount'). Append any missing ones at the end without
    // disturbing existing data or column order.
    var lastCol = sh.getLastColumn();
    var header = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var missing = FIELDS.filter(function (f) { return header.indexOf(f) === -1; });
    if (missing.length) {
      sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
      sh.getRange('1:1').setFontWeight('bold');
    }
  }
  return sh;
}

function _driversSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DRIVERS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(DRIVERS_SHEET_NAME);
    sh.appendRow(['id', 'name', 'vehicle', 'phone', 'createdAt']);
    sh.getRange('1:1').setFontWeight('bold');
  }
  return sh;
}

// ── DRIVERS (shared across staff — same sheet/GAS backend as bookings) ──
function getDrivers() {
  try {
    var sh = _driversSheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map(function (row) {
      return { id: row[0], name: row[1], vehicle: row[2], phone: row[3], createdAt: row[4] };
    }).filter(function (d) { return d.id; });
  } catch (err) {
    _logError('getDrivers', err);
    return [];
  }
}

function addDriver(p) {
  try {
    var validation = _validateDriverPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var sh = _driversSheet();
    var id = 'driver-' + Date.now();
    sh.appendRow([
      id,
      _safe(p.name, 'N/A'),
      _safe(p.vehicle, 'N/A'),
      _safe(p.phone, ''),
      new Date().toISOString()
    ]);
    return { ok: true, id: id };
  } catch (err) {
    return _fail('addDriver', err);
  }
}

function deleteDriver(p) {
  try {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: 'Invalid id' };
    var sh = _driversSheet();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.id)) {
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: true }; // already gone — idempotent
  } catch (err) {
    return _fail('deleteDriver', err);
  }
}

// ── INVENTORY (life jackets, boards, etc. — shared across staff) ──
// Category convention: 'life-jacket-adult', 'life-jacket-kid' today;
// extend to 'board', 'kayak', 'snorkel-set' etc. later without a schema change.
var VALID_INVENTORY_STATUSES = ['available', 'in-use', 'maintenance'];

function _inventorySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(INVENTORY_SHEET_NAME);
    sh.appendRow(['id', 'label', 'category', 'status', 'notes', 'createdAt']);
    sh.getRange('1:1').setFontWeight('bold');
  }
  return sh;
}

function _validateInventoryPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing item data' };
    if (typeof p.label !== 'string' || !p.label.trim() || p.label.length > 50) {
      return { valid: false, error: 'Invalid or missing label' };
    }
    if (typeof p.category !== 'string' || !p.category.trim() || p.category.length > 50) {
      return { valid: false, error: 'Invalid or missing category' };
    }
    return { valid: true };
  } catch (err) {
    _logError('validateInventoryPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

function getInventory() {
  try {
    var sh = _inventorySheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map(function (row) {
      return { id: row[0], label: row[1], category: row[2], status: row[3], notes: row[4], createdAt: row[5] };
    }).filter(function (d) { return d.id; });
  } catch (err) {
    _logError('getInventory', err);
    return [];
  }
}

function addInventoryItem(p) {
  try {
    var validation = _validateInventoryPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var sh = _inventorySheet();
    var id = 'inv-' + Date.now();
    sh.appendRow([
      id,
      _safe(p.label, 'N/A'),
      _safe(p.category, 'N/A'),
      'available',
      _safe(p.notes, ''),
      new Date().toISOString()
    ]);
    return { ok: true, id: id };
  } catch (err) {
    return _fail('addInventoryItem', err);
  }
}

function updateInventoryStatus(p) {
  try {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: 'Invalid id' };
    if (typeof p.status !== 'string' || VALID_INVENTORY_STATUSES.indexOf(p.status) === -1) {
      return { ok: false, error: 'Invalid status' };
    }
    var sh = _inventorySheet();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.id)) {
        sh.getRange(i + 1, 4).setValue(p.status); // column 4 = status
        return { ok: true };
      }
    }
    return { ok: false, error: 'Item not found' };
  } catch (err) {
    return _fail('updateInventoryStatus', err);
  }
}

function deleteInventoryItem(p) {
  try {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: 'Invalid id' };
    var sh = _inventorySheet();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.id)) {
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: true }; // already gone — idempotent
  } catch (err) {
    return _fail('deleteInventoryItem', err);
  }
}

// ── ONE-TIME SETUP: seeds the 8 existing life jackets as labeled, adult-size
// inventory (per the current equipment list — 4 blue + 4 red, no kid-size
// jackets owned yet). Safe to re-run: skips creation if items with these
// labels already exist. Add kid-size jackets later via the admin Inventory
// tab with category 'life-jacket-kid' once purchased.
function seedLifeJacketInventory() {
  var sh = _inventorySheet();
  var data = sh.getDataRange().getValues();
  var existingLabels = data.slice(1).map(function (row) { return row[1]; });

  var toSeed = [
    { label: 'LJ-A1', notes: 'Blue' }, { label: 'LJ-A2', notes: 'Blue' },
    { label: 'LJ-A3', notes: 'Blue' }, { label: 'LJ-A4', notes: 'Blue' },
    { label: 'LJ-A5', notes: 'Red' }, { label: 'LJ-A6', notes: 'Red' },
    { label: 'LJ-A7', notes: 'Red' }, { label: 'LJ-A8', notes: 'Red' }
  ];

  var added = 0;
  toSeed.forEach(function (item) {
    if (existingLabels.indexOf(item.label) !== -1) return; // already seeded
    sh.appendRow(['inv-' + Date.now() + '-' + added, item.label, 'life-jacket-adult', 'available', item.notes, new Date().toISOString()]);
    added++;
  });

  Logger.log('seedLifeJacketInventory: added ' + added + ' item(s).');
  try { SpreadsheetApp.getUi().alert('✅ Seeded ' + added + ' life jacket(s). Add kid-size jackets via the admin Inventory tab once purchased.'); } catch (uiErr) { /* expected outside Sheets UI */ }
}

// ── ID PHOTO UPLOAD (Drive) ──
// Never blocks or fails the booking: any error here returns '' and is logged,
// saveBooking proceeds regardless.
function _saveIdPhoto(p) {
  try {
    if (!p || !p.idPhotoBase64) return '';
    var mime = (typeof p.idPhotoMimeType === 'string' && /^image\/(jpeg|jpg|png|webp)$/i.test(p.idPhotoMimeType))
      ? p.idPhotoMimeType : 'image/jpeg';

    var base64 = String(p.idPhotoBase64);
    var commaIdx = base64.indexOf(',');
    if (base64.slice(0, 5) === 'data:' && commaIdx !== -1) base64 = base64.slice(commaIdx + 1);
    if (base64.length > MAX_ID_PHOTO_BASE64_LEN) return '';

    var bytes;
    try {
      bytes = Utilities.base64Decode(base64);
    } catch (decodeErr) {
      _logError('_saveIdPhoto.decode', decodeErr);
      return '';
    }

    var safeRef = String(p.ref || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    var ext = mime.indexOf('png') !== -1 ? 'png' : (mime.indexOf('webp') !== -1 ? 'webp' : 'jpg');
    var blob = Utilities.newBlob(bytes, mime, 'id_' + safeRef + '_' + Date.now() + '.' + ext);

    var folders = DriveApp.getFoldersByName(ID_PHOTO_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(ID_PHOTO_FOLDER_NAME);

    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (shareErr) { _logError('_saveIdPhoto.share', shareErr); }

    return file.getUrl();
  } catch (err) {
    _logError('_saveIdPhoto', err);
    return '';
  }
}

function _safe(val, fallback) {
  var s = (val === undefined || val === null || val === '') ? (fallback !== undefined ? fallback : '') : String(val);
  if (/^\s*[=+\-@\t]/.test(s)) return "'" + s;
  return s;
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.data) {
      var parsed;
      try {
        parsed = JSON.parse(p.data);
      } catch (parseErr) {
        return _json({ ok: false, error: 'Invalid booking data format' });
      }
      return _json(saveBooking(parsed));
    }
    if (p.action === 'getBookings') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getBookings(parseInt(p.limit, 10) || 50) });
    }
    if (p.action === 'getDrivers') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, drivers: getDrivers() });
    }
    if (p.action === 'getInventory') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, inventory: getInventory() });
    }
    return _json({ ok: true, message: 'APR Backend v4' });
  } catch (err) {
    return _json(_fail('doGet', err));
  }
}

function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return _json({ ok: false, error: 'Invalid request format' });
      }
    } else if (e && e.parameter && e.parameter.data) {
      try {
        payload = JSON.parse(e.parameter.data);
      } catch (parseErr2) {
        return _json({ ok: false, error: 'Invalid request format' });
      }
    } else {
      return _json({ ok: false, error: 'No data received' });
    }

    if (payload.action === 'update_status') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateStatus(payload));
    }
    if (payload.action === 'getBookings') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getBookings(50) });
    }
    if (payload.action === 'getDrivers') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, drivers: getDrivers() });
    }
    if (payload.action === 'addDriver') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(addDriver(payload));
    }
    if (payload.action === 'deleteDriver') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(deleteDriver(payload));
    }
    if (payload.action === 'getInventory') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, inventory: getInventory() });
    }
    if (payload.action === 'addInventoryItem') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(addInventoryItem(payload));
    }
    if (payload.action === 'updateInventoryStatus') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateInventoryStatus(payload));
    }
    if (payload.action === 'deleteInventoryItem') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(deleteInventoryItem(payload));
    }
    return _json(saveBooking(payload));
  } catch (err) {
    return _json(_fail('doPost', err));
  }
}

// ── IDEMPOTENT BOOKING SAVE ──
// If the same ref is submitted twice (client retry, flaky connection, script
// restart) we must not create a duplicate row or send a duplicate email.
// ── RATE LIMIT (open endpoint — no login required to submit a booking) ──
// Caps total submissions per rolling minute so a scripted flood can't
// exhaust the Gmail daily send quota or Apps Script's execution quota.
// A real small business does not get more than a handful of bookings in
// any single minute, so this threshold has generous headroom for genuine
// traffic spikes while still capping abuse.
var RATE_LIMIT_MAX_PER_MINUTE = 20;

function _rateLimitOk() {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'booking_rl_' + Math.floor(Date.now() / 60000);
    var current = Number(cache.get(key)) || 0;
    if (current >= RATE_LIMIT_MAX_PER_MINUTE) return false;
    cache.put(key, String(current + 1), 120); // expires well after the minute window closes
    return true;
  } catch (err) {
    _logError('_rateLimitOk', err);
    return true; // never let a caching failure block real bookings
  }
}

function saveBooking(p) {
  try {
    if (!_rateLimitOk()) {
      return { ok: false, error: 'Too many booking attempts right now — please try again in a minute.' };
    }

    var validation = _validateBookingPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var sh = _sheet();
    var data;
    try {
      data = sh.getDataRange().getValues();
    } catch (readErr) {
      return _fail('saveBooking.read', readErr);
    }

    var refIdx = data[0] ? data[0].indexOf('ref') : -1;
    if (refIdx !== -1) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][refIdx]) === String(p.ref)) {
          // Already saved — return success without re-inserting or re-notifying.
          return { ok: true, ref: p.ref, duplicate: true };
        }
      }
    }

    // Upload the ID photo (if any) before writing the row so the Drive link
    // can be stored in the same append. A failed upload never blocks the booking.
    var idPhotoUrl = '';
    try {
      idPhotoUrl = _saveIdPhoto(p);
    } catch (photoErr) {
      _logError('saveBooking.photo', photoErr);
    }

    try {
      sh.appendRow([
        _safe(p.ref, 'N/A'),
        _safe(p.fname, 'N/A'),
        _safe(p.lname, 'N/A'),
        _safe(p.phone, 'N/A'),
        _safe(p.email, 'N/A'),
        _safe(p.datetime, 'N/A'),
        _safe(p.groupSize, 'N/A'),
        _safe(p.gear, 'N/A'),
        _safe(p.duration, 'N/A'),
        (p.total !== undefined && p.total !== null && !isNaN(Number(p.total))) ? Number(p.total) : 0,
        _safe(p.referral, 'N/A'),
        _safe(p.notes, 'N/A'),
        p.waiverAccepted ? true : false,
        _safe(p.waiverTimestamp, 'N/A'),
        _safe(p.source, 'PWA'),
        new Date().toISOString(),
        '', // NotifiedAt — set once the notification is actually sent
        idPhotoUrl,
        'pending', // status — updated via update_status as staff progress the booking
        (p.kidsCount !== undefined && p.kidsCount !== null && !isNaN(Number(p.kidsCount))) ? Number(p.kidsCount) : 0
      ]);
    } catch (writeErr) {
      return _fail('saveBooking.write', writeErr);
    }

    // Idempotent notification: only mark/send once, and never let a mail
    // failure roll back or block the booking save.
    try {
      sendNotificationOnce(p, sh);
    } catch (notifyErr) {
      _logError('saveBooking.notify', notifyErr);
    }

    return { ok: true, ref: p.ref };
  } catch (err) {
    return _fail('saveBooking', err);
  }
}

function getBookings(limit) {
  try {
    var safeLimit = (typeof limit === 'number' && limit > 0 && limit <= 500) ? limit : 50;
    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).reverse().slice(0, safeLimit).map(function (row) {
      var obj = {};
      FIELDS.forEach(function (f, i) {
        var v = row[i];
        obj[f] = (v === undefined || v === null || v === '') ? 'N/A' : v;
      });
      return obj;
    });
  } catch (err) {
    _logError('getBookings', err);
    return [];
  }
}

function updateStatus(p) {
  try {
    var validation = _validateStatusPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var refIdx = data[0] ? data[0].indexOf('ref') : -1;
    var statusIdx = data[0] ? data[0].indexOf('status') : -1;
    if (refIdx === -1 || statusIdx === -1) return { ok: false, error: 'Sheet not initialized' };

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) {
        sh.getRange(i + 1, statusIdx + 1).setValue(p.status);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Booking not found' };
  } catch (err) {
    return _fail('updateStatus', err);
  }
}

// ── ONE-TIME SETUP: Run this once from Apps Script to fix sheet headers ──
// Safe to run from the standalone script editor (not just a sheet menu) —
// the UI alert is best-effort only and never blocks the actual header update.
function setupSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);
    sh.getRange('1:1').clearContent();
    sh.getRange(1, 1, 1, 18).setValues([[
      'ref','fname','lname','phone','email','datetime','groupSize',
      'gear','duration','total','referral','notes',
      'waiverAccepted','waiverTimestamp','source','Timestamp','NotifiedAt','idPhotoUrl'
    ]]);
    sh.getRange('1:1').setFontWeight('bold');
    ['D:D','F:F','N:N'].forEach(function (r) { sh.getRange(r).setNumberFormat('@'); });
    Logger.log('setupSheet: headers updated successfully.');
    try { SpreadsheetApp.getUi().alert('✅ Sheet headers updated! You can delete old test rows manually.'); } catch (uiErr) { /* expected when run outside the Sheets UI — headers are already saved above */ }
  } catch (err) {
    _logError('setupSheet', err);
  }
}

// ── ONE-TIME MIGRATION: moves any existing BOOKINGS rows into a separate
// "Archive_OldBookings" tab, leaving BOOKINGS with just the header row.
// Run this once after setupSheet if BOOKINGS already contains rows written
// under an older column schema (their data would otherwise sit under the
// wrong header labels going forward). Safe to re-run: does nothing if
// BOOKINGS has no data rows left.
function archiveOldBookingRows() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) { Logger.log('archiveOldBookingRows: no BOOKINGS sheet found.'); return; }

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow <= 1) { Logger.log('archiveOldBookingRows: no data rows to archive.'); return; }

    var numDataRows = lastRow - 1; // exclude header row
    var dataRange = sh.getRange(2, 1, numDataRows, lastCol);
    var values = dataRange.getValues();

    var archiveName = 'Archive_OldBookings';
    var archiveSheet = ss.getSheetByName(archiveName);
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet(archiveName);
      archiveSheet.appendRow(['ArchivedAt', 'OriginalRowData (columns A-' + String.fromCharCode(64 + lastCol) + ' from BOOKINGS at time of archive)']);
      archiveSheet.getRange('1:1').setFontWeight('bold');
    }

    var archiveTimestamp = new Date().toISOString();
    var rowsToAppend = values.map(function (row) {
      return [archiveTimestamp].concat(row);
    });
    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length)
      .setValues(rowsToAppend);

    dataRange.clearContent();

    Logger.log('archiveOldBookingRows: moved ' + numDataRows + ' row(s) to "' + archiveName + '".');
    try { SpreadsheetApp.getUi().alert('✅ Archived ' + numDataRows + ' old row(s) to "' + archiveName + '". BOOKINGS is now clean.'); } catch (uiErr) { /* expected outside Sheets UI */ }
  } catch (err) {
    _logError('archiveOldBookingRows', err);
  }
}

// ── IDEMPOTENT, NULL-SAFE EMAIL NOTIFICATION ──
// Writes a 'SENT' timestamp to the row BEFORE returning, so a retried/duplicate
// invocation for the same ref sees the flag and skips re-sending.
function sendNotificationOnce(p, sh) {
  try {
    sh = sh || _sheet();
    var data = sh.getDataRange().getValues();
    var refIdx = data[0].indexOf('ref');
    var notifiedIdx = data[0].indexOf('NotifiedAt');
    if (refIdx === -1) return;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) {
        if (notifiedIdx !== -1 && data[i][notifiedIdx]) {
          return; // already notified for this ref — do not send again
        }
        // Reserve the slot first so a slow/duplicate concurrent call backs off.
        if (notifiedIdx !== -1) {
          try { sh.getRange(i + 1, notifiedIdx + 1).setValue(new Date().toISOString()); }
          catch (lockErr) { _logError('sendNotificationOnce.reserve', lockErr); }
        }
        try {
          sendNotification(p);
        } catch (mailErr) {
          _logError('sendNotificationOnce.mail', mailErr);
          // Sending failed — clear the flag so a future retry can try again.
          if (notifiedIdx !== -1) {
            try { sh.getRange(i + 1, notifiedIdx + 1).setValue(''); } catch (clearErr) {}
          }
        }
        return;
      }
    }
  } catch (err) {
    _logError('sendNotificationOnce', err);
  }
}

function sendNotification(p) {
  var n = function (v, fallback) {
    if (v === undefined || v === null) return fallback || 'N/A';
    var s = String(v).trim();
    return s.length ? s : (fallback || 'N/A');
  };
  var subject = '🏄 New APR Booking: ' + n(p && p.ref, 'N/A');
  var body = [
    'New booking received!', '',
    'Ref:       ' + n(p && p.ref, 'N/A'),
    'Name:      ' + n(p && p.fname, 'N/A') + ' ' + n(p && p.lname, ''),
    'Phone:     ' + n(p && p.phone, 'N/A'),
    'Email:     ' + n(p && p.email, 'N/A'),
    'Date/Time: ' + n(p && p.datetime, 'N/A'),
    'Group:     ' + n(p && p.groupSize, 'N/A') + (p && p.kidsCount ? ' (' + p.kidsCount + ' kid(s) — prep kid-size life jackets)' : ''),
    'Gear:      ' + n(p && p.gear, 'N/A'),
    'Duration:  ' + n(p && p.duration, 'N/A'),
    'Total:     XCD ' + n(p && p.total, '0'),
    'Referral:  ' + n(p && p.referral, 'N/A'),
    'Notes:     ' + n(p && p.notes, 'N/A'),
    '', 'Submitted: ' + new Date().toISOString()
  ].join('\n');
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

// ── HEALTH CHECK ("AI technician") ──
// Runs on a time-based trigger (set up once via installHealthCheckTrigger).
// Checks the systems this business actually depends on and emails Delroy
// ONLY when something looks wrong — a healthy run stays silent so this
// doesn't turn into noise he learns to ignore.
var HEALTH_CHECK_LOOKBACK_MIN = 60; // how far back to check for stuck notifications

function healthCheck() {
  var issues = [];

  // 1. BOOKINGS sheet exists and has the expected header row.
  try {
    var bookSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!bookSh) {
      issues.push('BOOKINGS sheet is missing entirely — booking submissions will fail until _sheet() recreates it, which only happens on the next real booking attempt.');
    } else {
      var bookHeader = bookSh.getRange(1, 1, 1, Math.max(bookSh.getLastColumn(), 1)).getValues()[0];
      var missingCols = FIELDS.filter(function (f) { return bookHeader.indexOf(f) === -1; });
      if (missingCols.length) {
        issues.push('BOOKINGS header is missing expected column(s): ' + missingCols.join(', ') + '. Run setupSheet() from the Apps Script editor to repair it.');
      }
    }
  } catch (err) {
    issues.push('Could not read the BOOKINGS sheet at all: ' + (err && err.message ? err.message : err));
  }

  // 2. DRIVERS sheet exists and has the expected header row.
  try {
    var drvSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DRIVERS_SHEET_NAME);
    if (!drvSh) {
      issues.push('DRIVERS sheet is missing — it should auto-create on first driver add, but if admin.html shows no drivers and adding one fails, this is why.');
    } else {
      var drvHeader = drvSh.getRange(1, 1, 1, Math.max(drvSh.getLastColumn(), 1)).getValues()[0];
      var expectedDrvCols = ['id', 'name', 'vehicle', 'phone', 'createdAt'];
      var missingDrvCols = expectedDrvCols.filter(function (f) { return drvHeader.indexOf(f) === -1; });
      if (missingDrvCols.length) {
        issues.push('DRIVERS header is missing expected column(s): ' + missingDrvCols.join(', ') + '.');
      }
    }
  } catch (err) {
    issues.push('Could not read the DRIVERS sheet at all: ' + (err && err.message ? err.message : err));
  }

  // 2b. INVENTORY sheet exists and has the expected header row.
  try {
    var invSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET_NAME);
    if (invSh) {
      var invHeader = invSh.getRange(1, 1, 1, Math.max(invSh.getLastColumn(), 1)).getValues()[0];
      var expectedInvCols = ['id', 'label', 'category', 'status', 'notes', 'createdAt'];
      var missingInvCols = expectedInvCols.filter(function (f) { return invHeader.indexOf(f) === -1; });
      if (missingInvCols.length) {
        issues.push('INVENTORY header is missing expected column(s): ' + missingInvCols.join(', ') + '.');
      }
    }
    // Not present yet is fine — it auto-creates on first use (e.g. running seedLifeJacketInventory).
  } catch (err) {
    issues.push('Could not read the INVENTORY sheet: ' + (err && err.message ? err.message : err));
  }

  // 3. Recent bookings stuck without a notification email ever being sent.
  // A gap here means either GmailApp is failing (quota, permission revoked)
  // or sendNotificationOnce has a bug — either way, Delroy is not finding
  // out about real bookings, which is the single worst failure mode for
  // this business.
  try {
    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    if (data.length > 1) {
      var header = data[0];
      var tsIdx = header.indexOf('Timestamp');
      var notifiedIdx = header.indexOf('NotifiedAt');
      var refIdx = header.indexOf('ref');
      if (tsIdx !== -1 && notifiedIdx !== -1) {
        var cutoff = new Date(Date.now() - HEALTH_CHECK_LOOKBACK_MIN * 60 * 1000);
        var stuck = [];
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          var ts = row[tsIdx] ? new Date(row[tsIdx]) : null;
          var notified = row[notifiedIdx];
          if (ts && !isNaN(ts.getTime()) && ts < cutoff && (!notified || String(notified).trim() === '')) {
            stuck.push(refIdx !== -1 ? row[refIdx] : ('row ' + (i + 1)));
          }
        }
        if (stuck.length) {
          issues.push('Booking(s) older than ' + HEALTH_CHECK_LOOKBACK_MIN + ' min with no notification ever sent: ' + stuck.slice(0, 10).join(', ') +
            (stuck.length > 10 ? (' (+' + (stuck.length - 10) + ' more)') : '') +
            '. Check Gmail sending quota/permissions, or look at Apps Script execution logs for sendNotification errors.');
        }
      }
    }
  } catch (err) {
    issues.push('Could not run the stuck-notification check: ' + (err && err.message ? err.message : err));
  }

  // 4. The deployed web app URL actually responds. Uses UrlFetchApp to hit
  // its own public endpoint — catches the case where a deploy went out
  // broken (e.g. a syntax error that only surfaces at request time).
  try {
    var deploymentUrl = ScriptApp.getService().getUrl();
    if (deploymentUrl) {
      var resp = UrlFetchApp.fetch(deploymentUrl, { muteHttpExceptions: true });
      var code = resp.getResponseCode();
      if (code !== 200) {
        issues.push('The deployed web app is not responding normally (HTTP ' + code + '). Bookings from the live site are likely failing right now.');
      } else {
        var bodyText = '';
        try { bodyText = resp.getContentText(); } catch (readErr) { /* ignore */ }
        if (bodyText.indexOf('"ok"') === -1) {
          issues.push('The deployed web app responded but not with the expected JSON shape — something may be broken in doGet().');
        }
      }
    }
  } catch (err) {
    issues.push('Could not reach the deployed web app to check it is alive: ' + (err && err.message ? err.message : err));
  }

  // Only send an email when there's something to act on. A silent run
  // means everything checked out.
  if (issues.length) {
    try {
      var subject = '⚠️ APR System Health Check — ' + issues.length + ' issue(s) found';
      var body = 'Automated health check found the following:\n\n' +
        issues.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n\n') +
        '\n\nChecked at: ' + new Date().toISOString();
      GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    } catch (mailErr) {
      _logError('healthCheck.notify', mailErr);
    }
  }
  Logger.log('healthCheck: ' + issues.length + ' issue(s) found.');
  return issues;
}

// ── ONE-TIME SETUP: installs a time-based trigger so healthCheck() runs on
// its own without anyone remembering to run it manually. Run this once from
// the Apps Script editor. Safe to re-run — it clears any existing
// healthCheck trigger first so you never end up with duplicates.
function installHealthCheckTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'healthCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('healthCheck')
    .timeBased()
    .everyHours(6)
    .create();
  Logger.log('installHealthCheckTrigger: healthCheck() will now run every 6 hours.');
  try { SpreadsheetApp.getUi().alert('✅ Health check scheduled — runs every 6 hours automatically.'); } catch (uiErr) { /* expected outside Sheets UI */ }
}
