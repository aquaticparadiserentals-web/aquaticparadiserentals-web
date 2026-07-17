/**
 * AQUATIC PARADISE RENTALS — Booking Backend
 * Deploy: Extensions > Apps Script in your "APR Master Log" Google Sheet
 *         Deploy > New deployment > Web app
 *         Execute as: Me | Who has access: Anyone
 *
 * Sheet tab: BOOKINGS (auto-created on first booking)
 * Columns: ref | fname | lname | phone | email | datetime | groupSize |
 *          gear | duration | total | referral | notes | waiverAccepted |
 *          waiverTimestamp | source | Timestamp | NotifiedAt | idPhotoUrl |
 *          status | kidsCount | driverLat | driverLng | driverLocAt |
 *          staffId | staffName | depositAmount | depositReceivedAt | depositStatus |
 *          signatureUrl
 */

var SHEET_NAME = 'BOOKINGS';
var DRIVERS_SHEET_NAME = 'DRIVERS';
var NOTIFY_EMAIL = 'aquaticparadiserentals@gmail.com';
// Shared secret required to read booking/customer data (PII). Booking *submission*
// stays open since customers must be able to book without a login.
var APP_TOKEN = '2Si_80O9OJ0DGmc8p6G5pDeG';
// Weaker, separate secret for dispatch/delivery staff (e.g. Shamar) — unlocks
// ONLY name/gear/time/location for progressing a delivery, never pricing,
// revenue, or full guest PII. Give this token to dispatch staff; keep
// APP_TOKEN for the owner/admin console only.
var STAFF_TOKEN = 'Dsp_7Kq2mNw94RfL';
var GENERIC_ERROR = 'Something went wrong. Please try again.';
var ID_PHOTO_FOLDER_NAME = 'APR Guest ID Photos';
var MAX_ID_PHOTO_BASE64_LEN = 8000000; // ~6MB decoded — generous cap against abuse
// Drawn e-signatures (waiver, and any future agreement) — same private-by-
// default posture as guest ID photos, since a signature is guest PII too.
// Signatures compress well at low resolution, so the cap is far smaller than
// the ID photo one.
var SIGNATURE_FOLDER_NAME = 'Aquatic Paradise Signatures';
var MAX_SIGNATURE_BASE64_LEN = 1500000; // ~1.1MB decoded

var FIELDS = ['ref','fname','lname','phone','email','datetime','groupSize',
  'gear','duration','total','referral','notes','waiverAccepted','waiverTimestamp',
  'source','Timestamp','NotifiedAt','idPhotoUrl','status','kidsCount',
  'driverLat','driverLng','driverLocAt',
  // Added 2026-07-15: staff commission attribution + manual deposit tracking.
  // Appended at the end (not inserted earlier) so _sheet()'s self-healing
  // migration lines up with existing rows — see _sheet() below.
  'staffId','staffName','depositAmount','depositReceivedAt','depositStatus',
  // Added 2026-07-15: drawn e-signature (waiver). Also appended at the end
  // for the same self-healing-migration reason as the row above.
  'signatureUrl'];
// 'delivering' sits between confirmed and done — a driver sets it when they
// actually leave with the gear, which is also what starts auto-GPS sharing
// in dispatch.html (see updateDriverLocation).
var VALID_STATUSES = ['pending', 'confirmed', 'delivering', 'done'];
var INVENTORY_SHEET_NAME = 'INVENTORY';
var STAFF_SHEET_NAME = 'STAFF';
var FEEDBACK_SHEET_NAME = 'FEEDBACK';
var MESSAGES_SHEET_NAME = 'MESSAGES';
// Staff/driver photos are intentionally PUBLIC (guests are meant to see who
// they're dealing with) — opposite posture from guest ID photos, which are
// sensitive PII and must never be publicly shareable.
var STAFF_PHOTO_FOLDER_NAME = 'APR Staff Photos';
var MAX_STAFF_PHOTO_BASE64_LEN = 4000000; // ~3MB decoded — headshots, not ID scans

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

// Accepts EITHER the full admin token OR the weaker dispatch-only token.
// Use this only for actions that are safe for dispatch staff to reach
// (scoped booking view, driver contact list, marking status) — never for
// getBookings/getInventory/getIdPhoto/addDriver/etc, which stay _authOk-only.
function _dispatchAuthOk(p) {
  try {
    var token = p && p.token;
    if (typeof token !== 'string' || !token) return false;
    return token === APP_TOKEN || token === STAFF_TOKEN;
  } catch (err) {
    _logError('dispatchAuth', err);
    return false;
  }
}

// ── PIN VERIFICATION (server-side — the actual security boundary) ──
// admin.html/dispatch.html used to embed APP_TOKEN/STAFF_TOKEN as plain JS
// constants, with the 4-digit PIN gate checked entirely client-side. That
// meant anyone who viewed page source got the token regardless of the PIN —
// the PIN protected nothing. Now the client holds no token until it proves
// it knows the PIN via this endpoint, which is the only place the real
// comparison happens.
function _hashPin(pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin));
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function _pinPropKey(role) {
  return role === 'staff' ? 'APR_STAFF_PIN_HASH' : 'APR_ADMIN_PIN_HASH';
}

// Public (no token) — this IS the login step. Rate-limited against brute force.
function verifyPin(p) {
  try {
    if (!_rateLimitOk('pin')) return { ok: false, error: 'Too many attempts — please wait a minute.' };
    if (!p || (p.role !== 'admin' && p.role !== 'staff')) return { ok: false, error: 'Invalid request' };
    if (typeof p.pin !== 'string' || !/^\d{4}$/.test(p.pin)) return { ok: false, error: 'Incorrect PIN' };

    var storedHash = PropertiesService.getScriptProperties().getProperty(_pinPropKey(p.role));
    if (!storedHash) return { ok: false, error: 'PIN not set up yet — run seedDefaultPins() once from the Apps Script editor.' };
    if (_hashPin(p.pin) !== storedHash) return { ok: false, error: 'Incorrect PIN' };

    return { ok: true, token: p.role === 'staff' ? STAFF_TOKEN : APP_TOKEN };
  } catch (err) {
    return _fail('verifyPin', err);
  }
}

// Changing a PIN requires already holding the token for that role — so this
// only tightens access further, never loosens it.
function changePin(p) {
  try {
    if (!p || (p.role !== 'admin' && p.role !== 'staff')) return { ok: false, error: 'Invalid request' };
    var okAuth = (p.role === 'admin') ? _authOk(p) : _dispatchAuthOk(p);
    if (!okAuth) return { ok: false, error: 'Unauthorized' };
    if (typeof p.newPin !== 'string' || !/^\d{4}$/.test(p.newPin)) return { ok: false, error: 'PIN must be exactly 4 digits' };

    PropertiesService.getScriptProperties().setProperty(_pinPropKey(p.role), _hashPin(p.newPin));
    return { ok: true };
  } catch (err) {
    return _fail('changePin', err);
  }
}

// ── ONE-TIME SETUP: seeds the PIN hashes from the PINs that used to be
// hardcoded client-side (admin: 1784, staff/dispatch: 5150), so nothing
// breaks for existing users before they change them. Only sets a hash if
// one isn't already there — safe to re-run, never clobbers a PIN someone
// already changed.
function seedDefaultPins() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APR_ADMIN_PIN_HASH')) props.setProperty('APR_ADMIN_PIN_HASH', _hashPin('1784'));
  if (!props.getProperty('APR_STAFF_PIN_HASH')) props.setProperty('APR_STAFF_PIN_HASH', _hashPin('5150'));
  Logger.log('seedDefaultPins: admin/staff PIN hashes seeded (only where not already set).');
  try { SpreadsheetApp.getUi().alert('✅ Default PINs seeded (admin: 1784, staff: 5150). Change them from the app once logged in — the PIN is no longer stored anywhere in the code.'); } catch (uiErr) { /* expected outside Sheets UI */ }
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

    if (p.signatureBase64 !== undefined && p.signatureBase64 !== null && p.signatureBase64 !== '') {
      if (typeof p.signatureBase64 !== 'string') {
        return { valid: false, error: 'Invalid signature data' };
      }
      if (p.signatureBase64.length > MAX_SIGNATURE_BASE64_LEN) {
        return { valid: false, error: 'Signature image is too large' };
      }
      if (p.signatureMimeType !== undefined && p.signatureMimeType !== null) {
        if (typeof p.signatureMimeType !== 'string' || !/^image\/(png|jpeg|jpg|webp)$/i.test(p.signatureMimeType)) {
          return { valid: false, error: 'Unsupported signature image format' };
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

function _validateLocationPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing data' };
    if (typeof p.ref !== 'string' || !p.ref.trim() || p.ref.length > 200) {
      return { valid: false, error: 'Invalid ref' };
    }
    var lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || lat < -90 || lat > 90) return { valid: false, error: 'Invalid latitude' };
    if (!isFinite(lng) || lng < -180 || lng > 180) return { valid: false, error: 'Invalid longitude' };
    return { valid: true };
  } catch (err) {
    _logError('validateLocationPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

var MAX_FEEDBACK_COMMENT_LEN = 1000;

function _validateFeedbackPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing data' };
    if (typeof p.ref !== 'string' || !p.ref.trim() || p.ref.length > 200) {
      return { valid: false, error: 'Invalid ref' };
    }
    var rating = Number(p.rating);
    if (!isFinite(rating) || rating < 1 || rating > 5 || Math.round(rating) !== rating) {
      return { valid: false, error: 'Invalid rating' };
    }
    if (p.comment !== undefined && p.comment !== null) {
      if (typeof p.comment !== 'string' || p.comment.length > MAX_FEEDBACK_COMMENT_LEN) {
        return { valid: false, error: 'Comment too long' };
      }
    }
    return { valid: true };
  } catch (err) {
    _logError('validateFeedbackPayload', err);
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
    sh.appendRow(['id', 'name', 'vehicle', 'phone', 'createdAt', 'photoUrl']);
    sh.getRange('1:1').setFontWeight('bold');
  } else {
    var lastCol = sh.getLastColumn();
    var header = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    if (header.indexOf('photoUrl') === -1) {
      sh.getRange(1, lastCol + 1).setValue('photoUrl');
      sh.getRange('1:1').setFontWeight('bold');
    }
  }
  return sh;
}

function _feedbackSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(FEEDBACK_SHEET_NAME);
    sh.appendRow(['ref', 'rating', 'comment', 'createdAt']);
    sh.getRange('1:1').setFontWeight('bold');
  }
  return sh;
}

function _messagesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MESSAGES_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(MESSAGES_SHEET_NAME);
    sh.appendRow(['ref', 'type', 'to', 'subject', 'createdAt']);
    sh.getRange('1:1').setFontWeight('bold');
  }
  return sh;
}

// Records that an email actually went out for a booking, so staff can see
// what was sent without digging through Gmail's sent folder. Best-effort —
// a logging failure must never block the email itself from sending.
function _logMessage(ref, type, to, subject) {
  try {
    _messagesSheet().appendRow([ref || 'N/A', type, to, subject, new Date().toISOString()]);
  } catch (err) {
    _logError('_logMessage', err);
  }
}

// Shared by driver/staff photo uploads. PUBLIC on purpose — the whole point
// is guests can see who's showing up. Never use this for guest ID photos.
function _saveStaffPhoto(base64Raw, mimeTypeRaw, namePrefix) {
  try {
    if (!base64Raw) return '';
    var mime = (typeof mimeTypeRaw === 'string' && /^image\/(jpeg|jpg|png|webp)$/i.test(mimeTypeRaw)) ? mimeTypeRaw : 'image/jpeg';
    var base64 = String(base64Raw);
    var commaIdx = base64.indexOf(',');
    if (base64.slice(0, 5) === 'data:' && commaIdx !== -1) base64 = base64.slice(commaIdx + 1);
    if (base64.length > MAX_STAFF_PHOTO_BASE64_LEN) return '';

    var bytes;
    try { bytes = Utilities.base64Decode(base64); }
    catch (decodeErr) { _logError('_saveStaffPhoto.decode', decodeErr); return ''; }

    var ext = mime.indexOf('png') !== -1 ? 'png' : (mime.indexOf('webp') !== -1 ? 'webp' : 'jpg');
    var safePrefix = String(namePrefix || 'staff').replace(/[^a-zA-Z0-9_-]/g, '');
    var blob = Utilities.newBlob(bytes, mime, safePrefix + '_' + Date.now() + '.' + ext);

    var folders = DriveApp.getFoldersByName(STAFF_PHOTO_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(STAFF_PHOTO_FOLDER_NAME);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (shareErr) { _logError('_saveStaffPhoto.share', shareErr); }
    return file.getUrl();
  } catch (err) {
    _logError('_saveStaffPhoto', err);
    return '';
  }
}

// ── DRIVERS (shared across staff — same sheet/GAS backend as bookings) ──
function getDrivers() {
  try {
    var sh = _driversSheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map(function (row) {
      return { id: row[0], name: row[1], vehicle: row[2], phone: row[3], createdAt: row[4], photoUrl: row[5] || '' };
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

    var photoUrl = '';
    try { photoUrl = _saveStaffPhoto(p.photoBase64, p.photoMimeType, 'driver'); }
    catch (photoErr) { _logError('addDriver.photo', photoErr); }

    var sh = _driversSheet();
    var id = 'driver-' + Date.now();
    sh.appendRow([
      id,
      _safe(p.name, 'N/A'),
      _safe(p.vehicle, 'N/A'),
      _safe(p.phone, ''),
      new Date().toISOString(),
      photoUrl
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

// ── STAFF (on-site employees — shared across devices, same pattern as
// DRIVERS. Previously localStorage-only in admin.html, meaning different
// staff logins disagreed on the roster; migrated to match.) ──
function _staffSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STAFF_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(STAFF_SHEET_NAME);
    sh.appendRow(['id', 'name', 'role', 'phone', 'createdAt', 'photoUrl', 'commissionPct']);
    sh.getRange('1:1').setFontWeight('bold');
  } else {
    // Self-healing migration, same pattern as _driversSheet/_sheet — older
    // rosters predate commissionPct (added 2026-07-15).
    var lastCol = sh.getLastColumn();
    var header = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    if (header.indexOf('commissionPct') === -1) {
      sh.getRange(1, lastCol + 1).setValue('commissionPct');
      sh.getRange('1:1').setFontWeight('bold');
    }
  }
  return sh;
}

function _validateStaffPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing staff data' };
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) {
      return { valid: false, error: 'Invalid or missing name' };
    }
    if (p.role !== undefined && p.role !== null) {
      if (typeof p.role !== 'string' || p.role.length > 200) return { valid: false, error: 'Invalid role' };
    }
    if (p.phone !== undefined && p.phone !== null) {
      if (typeof p.phone !== 'string' || p.phone.length > 50) return { valid: false, error: 'Invalid phone' };
    }
    if (p.commissionPct !== undefined && p.commissionPct !== null && p.commissionPct !== '') {
      var pct = Number(p.commissionPct);
      if (isNaN(pct) || pct < 0 || pct > 100) return { valid: false, error: 'Commission % must be between 0 and 100' };
    }
    return { valid: true };
  } catch (err) {
    _logError('validateStaffPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

function getStaff() {
  try {
    var sh = _staffSheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map(function (row) {
      return {
        id: row[0], name: row[1], role: row[2], phone: row[3], createdAt: row[4],
        // Defensive NaN guard: the STAFF sheet can be hand-edited directly in
        // Google Sheets (bypassing _validateStaffPayload's 0-100 numeric
        // check), e.g. typing "10%" into the cell. Number("10%") is NaN,
        // which would otherwise flow straight into the commission report's
        // salesTotal * (commissionPct/100) math and render as "NaN%" /
        // "XCD NaN" for that row instead of a clear, safe value.
        photoUrl: row[5] || '', commissionPct: (function () {
          if (row[6] === '' || row[6] === undefined || row[6] === null) return 0;
          var n = Number(row[6]);
          return isNaN(n) ? 0 : n;
        })()
      };
    }).filter(function (d) { return d.id; });
  } catch (err) {
    _logError('getStaff', err);
    return [];
  }
}

function addStaff(p) {
  try {
    var validation = _validateStaffPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var photoUrl = '';
    try { photoUrl = _saveStaffPhoto(p.photoBase64, p.photoMimeType, 'staff'); }
    catch (photoErr) { _logError('addStaff.photo', photoErr); }

    var sh = _staffSheet();
    var id = 'staff-' + Date.now();
    sh.appendRow([
      id,
      _safe(p.name, 'N/A'),
      _safe(p.role, 'N/A'),
      _safe(p.phone, ''),
      new Date().toISOString(),
      photoUrl,
      (p.commissionPct !== undefined && p.commissionPct !== null && !isNaN(Number(p.commissionPct))) ? Number(p.commissionPct) : 0
    ]);
    return { ok: true, id: id };
  } catch (err) {
    return _fail('addStaff', err);
  }
}

// Patch-style edit — only touches the fields actually provided, so the Team
// tab can call this just to change commissionPct without resending photo/role.
function updateStaff(p) {
  try {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: 'Invalid id' };
    if (p.commissionPct !== undefined && p.commissionPct !== null && p.commissionPct !== '') {
      var pct = Number(p.commissionPct);
      if (isNaN(pct) || pct < 0 || pct > 100) return { ok: false, error: 'Commission % must be between 0 and 100' };
    }
    if (p.name !== undefined && (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)) {
      return { ok: false, error: 'Invalid name' };
    }

    var sh = _staffSheet();
    var data = sh.getDataRange().getValues();
    var header = data[0] || [];
    var idIdx = header.indexOf('id');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(p.id)) {
        var rowNum = i + 1;
        if (p.name !== undefined) sh.getRange(rowNum, header.indexOf('name') + 1).setValue(_safe(p.name, 'N/A'));
        if (p.role !== undefined) sh.getRange(rowNum, header.indexOf('role') + 1).setValue(_safe(p.role, 'N/A'));
        if (p.phone !== undefined) sh.getRange(rowNum, header.indexOf('phone') + 1).setValue(_safe(p.phone, ''));
        if (p.commissionPct !== undefined) sh.getRange(rowNum, header.indexOf('commissionPct') + 1).setValue(Number(p.commissionPct) || 0);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Staff member not found' };
  } catch (err) {
    return _fail('updateStaff', err);
  }
}

function deleteStaff(p) {
  try {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: 'Invalid id' };
    var sh = _staffSheet();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.id)) {
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: true }; // already gone — idempotent
  } catch (err) {
    return _fail('deleteStaff', err);
  }
}

// ── PUBLIC "MEET THE TEAM" PROJECTION ──
// No token required — deliberately strips phone numbers before returning,
// since this is meant for the guest-facing booking page. Only name, role/
// vehicle, and photo are public; contact numbers stay behind the admin token.
function getPublicTeam() {
  try {
    var staff = getStaff().map(function (s) {
      return { name: s.name, role: s.role, photoUrl: s.photoUrl, kind: 'staff' };
    });
    var drivers = getDrivers().map(function (d) {
      return { name: d.name, role: d.vehicle, photoUrl: d.photoUrl, kind: 'driver' };
    });
    return staff.concat(drivers);
  } catch (err) {
    _logError('getPublicTeam', err);
    return [];
  }
}

// ── INVENTORY (life jackets, boards, etc. — shared across staff) ──
// Category convention: 'life-jacket-adult', 'life-jacket-kid' today;
// extend to 'board', 'kayak', 'snorkel-set' etc. later without a schema change.
var VALID_INVENTORY_STATUSES = ['available', 'in-use', 'maintenance'];
var INVENTORY_LABEL_PREFIX = {
  'paddle-board': 'PB-', 'kayak': 'KY-', 'snorkel-set': 'SK-', 'floater': 'FL-',
  'life-jacket-adult': 'LJ-A', 'life-jacket-kid': 'LJ-K'
};
var LOW_STOCK_THRESHOLD = 3;

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

// Adds `qty` auto-numbered units of one category in a single write — the
// "restock" action. Numbering continues from however many of that category
// already exist, computed server-side so two staff restocking at once can't
// race each other into duplicate labels the way client-computed numbering could.
function restockInventory(p) {
  try {
    if (!p || typeof p.category !== 'string' || !p.category.trim()) {
      return { ok: false, error: 'Invalid category' };
    }
    var qty = Number(p.qty);
    if (!isFinite(qty) || qty < 1 || qty > 50 || Math.round(qty) !== qty) {
      return { ok: false, error: 'Quantity must be a whole number from 1-50' };
    }

    var sh = _inventorySheet();
    var data = sh.getDataRange().getValues();
    var existing = data.slice(1).filter(function (row) { return row[2] === p.category; }).length;
    var prefix = INVENTORY_LABEL_PREFIX[p.category] || 'IT-';
    var notes = _safe(p.notes, '');
    var now = new Date().toISOString();

    var rows = [];
    var labels = [];
    for (var i = 1; i <= qty; i++) {
      var label = prefix + (existing + i);
      labels.push(label);
      rows.push(['inv-' + Date.now() + '-' + i, label, p.category, 'available', notes, now]);
    }
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return { ok: true, added: rows.length, labels: labels };
  } catch (err) {
    return _fail('restockInventory', err);
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

// ── ONE-TIME SETUP: seeds the rest of the fleet (boards, kayaks, snorkel
// sets, floaters) using the real board names/sizes from OPERATIONS.md §2.
// Kayak/snorkel/floater counts are generic (6/12/8) since they're not
// individually named like the boards — relabel/edit via the admin
// Inventory tab if that's not accurate. Safe to re-run: skips anything
// already seeded by label.
function seedFullInventory() {
  var sh = _inventorySheet();
  var data = sh.getDataRange().getValues();
  var existingLabels = data.slice(1).map(function (row) { return row[1]; });

  var toSeed = [
    { label: 'PB-1', category: 'paddle-board', notes: 'Rainbow Snake (blue), 10\'x3"' },
    { label: 'PB-2', category: 'paddle-board', notes: 'Sea Turtle (green), 10\'6"' },
    { label: 'PB-3', category: 'paddle-board', notes: 'Horizon (yellow), 11\'x32"x6"' },
    { label: 'PB-4', category: 'paddle-board', notes: 'Horizon (pink), 11\'' },
    { label: 'PB-5', category: 'paddle-board', notes: 'Manta Ray (grey) #1, 10\'x32"x6"' },
    { label: 'PB-6', category: 'paddle-board', notes: 'Manta Ray (grey) #2, 10\'x32"x6"' },
    { label: 'PB-7', category: 'paddle-board', notes: 'Manta Ray (grey) #3, 10\'x32"x6"' },
    { label: 'PB-8', category: 'paddle-board', notes: 'Sunshine (white & blue), 11\'x33"x6"' }
  ];
  for (var k = 1; k <= 6; k++) toSeed.push({ label: 'KY-' + k, category: 'kayak', notes: '' });
  for (var s = 1; s <= 12; s++) toSeed.push({ label: 'SK-' + s, category: 'snorkel-set', notes: '' });
  for (var f = 1; f <= 8; f++) toSeed.push({ label: 'FL-' + f, category: 'floater', notes: '' });

  var added = 0;
  toSeed.forEach(function (item) {
    if (existingLabels.indexOf(item.label) !== -1) return; // already seeded
    sh.appendRow(['inv-' + Date.now() + '-' + added, item.label, item.category, 'available', item.notes, new Date().toISOString()]);
    added++;
  });

  Logger.log('seedFullInventory: added ' + added + ' item(s).');
  try { SpreadsheetApp.getUi().alert('✅ Seeded ' + added + ' item(s) — boards, kayaks, snorkel sets, floaters.'); } catch (uiErr) { /* expected outside Sheets UI */ }
}

// ── ONE-TIME SETUP: migrates the staff roster that used to be hardcoded
// client-side in admin.html (DEFAULT_TEAM) into the shared STAFF sheet.
// Run once after deploying. Safe to re-run — skips names already present.
function seedDefaultStaff() {
  var sh = _staffSheet();
  var data = sh.getDataRange().getValues();
  var existingNames = data.slice(1).map(function (row) { return row[1]; });

  var toSeed = [
    { name: 'Operations Manager', role: 'Ground Operations Lead', phone: '17844963447' },
    { name: 'Dravin', role: 'Gear Dispatch & Guest Relations', phone: '17845325218' },
    { name: 'Shammar', role: 'Gear Dispatch & Safety', phone: '17844340530' }
  ];

  var added = 0;
  toSeed.forEach(function (item) {
    if (existingNames.indexOf(item.name) !== -1) return; // already seeded
    sh.appendRow(['staff-' + Date.now() + '-' + added, item.name, item.role, item.phone, new Date().toISOString(), '']);
    added++;
  });

  Logger.log('seedDefaultStaff: added ' + added + ' staff member(s).');
  try { SpreadsheetApp.getUi().alert('✅ Seeded ' + added + ' staff member(s). Add photos via the admin Team tab.'); } catch (uiErr) { /* expected outside Sheets UI */ }
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

    // Deliberately NOT calling file.setSharing() here. Guest ID photos are
    // sensitive PII — the file stays private to the script's own account.
    // Staff view it through getIdPhoto() (token-gated, POST-only, never a
    // public link) instead of an open "anyone with the link" URL.
    var file = folder.createFile(blob);
    return file.getUrl();
  } catch (err) {
    _logError('_saveIdPhoto', err);
    return '';
  }
}

// ── SIGNATURE UPLOAD (Drive) ──
// Mirrors _saveIdPhoto: a drawn signature is guest PII like an ID photo, so
// it stays private (no setSharing call) rather than public like staff
// photos. Never blocks or fails the booking: any error returns '' and is
// logged, saveBooking proceeds regardless.
function _saveSignature(p) {
  try {
    if (!p || !p.signatureBase64) return '';
    var mime = (typeof p.signatureMimeType === 'string' && /^image\/(png|jpeg|jpg|webp)$/i.test(p.signatureMimeType))
      ? p.signatureMimeType : 'image/png';

    var base64 = String(p.signatureBase64);
    var commaIdx = base64.indexOf(',');
    if (base64.slice(0, 5) === 'data:' && commaIdx !== -1) base64 = base64.slice(commaIdx + 1);
    if (base64.length > MAX_SIGNATURE_BASE64_LEN) return '';

    var bytes;
    try {
      bytes = Utilities.base64Decode(base64);
    } catch (decodeErr) {
      _logError('_saveSignature.decode', decodeErr);
      return '';
    }

    var safeRef = String(p.ref || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    var ext = mime.indexOf('jpeg') !== -1 || mime.indexOf('jpg') !== -1 ? 'jpg' : (mime.indexOf('webp') !== -1 ? 'webp' : 'png');
    var blob = Utilities.newBlob(bytes, mime, 'sig_' + safeRef + '_' + Date.now() + '.' + ext);

    var folders = DriveApp.getFoldersByName(SIGNATURE_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(SIGNATURE_FOLDER_NAME);

    // Deliberately NOT calling file.setSharing() here — same reasoning as
    // _saveIdPhoto. Staff view it through getSignature() (token-gated,
    // POST-only) instead of an open "anyone with the link" URL.
    var file = folder.createFile(blob);
    return file.getUrl();
  } catch (err) {
    _logError('_saveSignature', err);
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
    if (p.action === 'getCustomers') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, customers: getCustomers(parseInt(p.limit, 10) || 300) });
    }
    if (p.action === 'getDrivers') {
      if (!_dispatchAuthOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, drivers: getDrivers() });
    }
    if (p.action === 'getDispatchBookings') {
      if (!_dispatchAuthOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getDispatchBookings(parseInt(p.limit, 10) || 50) });
    }
    if (p.action === 'getFeedback') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, feedback: getFeedback(parseInt(p.limit, 10) || 100) });
    }
    if (p.action === 'getMessages') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, messages: getMessages(parseInt(p.limit, 10) || 100) });
    }
    if (p.action === 'getInventory') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, inventory: getInventory() });
    }
    if (p.action === 'getStaff') {
      if (!_authOk(p)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, staff: getStaff() });
    }
    if (p.action === 'getWeather') {
      // Public — safety info, not PII. No token required.
      return _json({ ok: true, weather: getWeather() });
    }
    if (p.action === 'getPublicTeam') {
      // Public — name/role/photo only, phone numbers already stripped
      // upstream in getPublicTeam(). No token required.
      return _json({ ok: true, team: getPublicTeam() });
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

    if (payload.action === 'verifyPin') {
      // Public, no token — this is the login step itself. Rate-limited
      // inside verifyPin() against brute force.
      return _json(verifyPin(payload));
    }
    if (payload.action === 'changePin') {
      // No blanket auth check here — changePin() itself requires already
      // holding the token for the role being changed.
      return _json(changePin(payload));
    }
    if (payload.action === 'update_status') {
      if (!_dispatchAuthOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateStatus(payload));
    }
    if (payload.action === 'update_driver_location') {
      // Dispatch-scoped: a driver sharing their own position is the same
      // trust level as progressing a delivery status.
      if (!_dispatchAuthOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateDriverLocation(payload));
    }
    if (payload.action === 'reinstall_weather_trigger') {
      // Admin-only maintenance hook: reinstalls the weather trigger without
      // needing the Apps Script editor (used when the schedule changes).
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      installWeatherCheckTrigger();
      var trigCount = ScriptApp.getProjectTriggers().filter(function (t) {
        return t.getHandlerFunction() === 'dailyWeatherCheck';
      }).length;
      return _json({ ok: true, installed: trigCount });
    }
    if (payload.action === 'reinstall_backup_trigger') {
      // Admin-only maintenance hook: turns on the weekly Sheet backup and
      // takes an immediate first backup so it's proven working right away.
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      installBackupTrigger();
      weeklyBackup();
      var bkCount = ScriptApp.getProjectTriggers().filter(function (t) {
        return t.getHandlerFunction() === 'weeklyBackup';
      }).length;
      return _json({ ok: true, installed: bkCount });
    }
    if (payload.action === 'submit_feedback') {
      // Public — same posture as booking submission. A guest leaving
      // feedback must never need a token.
      return _json(saveFeedback(payload));
    }
    if (payload.action === 'getDispatchBookings') {
      if (!_dispatchAuthOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getDispatchBookings(50) });
    }
    if (payload.action === 'getBookings') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, bookings: getBookings(50) });
    }
    if (payload.action === 'getCustomers') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, customers: getCustomers(300) });
    }
    if (payload.action === 'getDrivers') {
      if (!_dispatchAuthOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
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
    if (payload.action === 'getFeedback') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, feedback: getFeedback(100) });
    }
    if (payload.action === 'deleteFeedback') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(deleteFeedback(payload));
    }
    if (payload.action === 'getInventory') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, inventory: getInventory() });
    }
    if (payload.action === 'addInventoryItem') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(addInventoryItem(payload));
    }
    if (payload.action === 'restockInventory') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(restockInventory(payload));
    }
    if (payload.action === 'updateInventoryStatus') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateInventoryStatus(payload));
    }
    if (payload.action === 'deleteInventoryItem') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(deleteInventoryItem(payload));
    }
    if (payload.action === 'getIdPhoto') {
      // POST-only, deliberately absent from doGet — keeps the token out of
      // URLs/query strings entirely for this sensitive-PII action.
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(getIdPhoto(payload));
    }
    if (payload.action === 'getSignature') {
      // Same POST-only, token-gated posture as getIdPhoto.
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(getSignature(payload));
    }
    if (payload.action === 'getStaff') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json({ ok: true, staff: getStaff() });
    }
    if (payload.action === 'addStaff') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(addStaff(payload));
    }
    if (payload.action === 'deleteStaff') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(deleteStaff(payload));
    }
    if (payload.action === 'updateStaff') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(updateStaff(payload));
    }
    if (payload.action === 'assignBookingStaff') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(assignBookingStaff(payload));
    }
    if (payload.action === 'getCommissionReport') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(getCommissionReport(payload));
    }
    if (payload.action === 'markDepositReceived') {
      if (!_authOk(payload)) return _json({ ok: false, error: 'Unauthorized' });
      return _json(markDepositReceived(payload));
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

function _rateLimitOk(bucket) {
  try {
    var cache = CacheService.getScriptCache();
    var key = (bucket || 'booking') + '_rl_' + Math.floor(Date.now() / 60000);
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

    // Same idea for a drawn waiver signature (if the guest used the
    // signature pad instead of/alongside the typed-name fallback).
    var signatureUrl = '';
    try {
      signatureUrl = _saveSignature(p);
    } catch (sigErr) {
      _logError('saveBooking.signature', sigErr);
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

    // signatureUrl lands after the staff/deposit columns in FIELDS, past
    // where the positional appendRow() above stops writing — same
    // header.indexOf lookup pattern as assignBookingStaff/markDepositReceived
    // rather than padding the appendRow array with placeholder blanks.
    // Deliberately locates the row by matching p.ref, NOT sh.getLastRow() —
    // concurrent doPost executions (no LockService in this file) can append
    // another booking between this request's appendRow() and this point,
    // which would otherwise write this guest's signature onto the wrong
    // (someone else's) row.
    if (signatureUrl) {
      try {
        var freshData = sh.getDataRange().getValues();
        var freshHdr = freshData[0] || [];
        var freshRefIdx = freshHdr.indexOf('ref');
        var sigColIdx = freshHdr.indexOf('signatureUrl');
        if (freshRefIdx !== -1 && sigColIdx !== -1) {
          for (var sigRow = freshData.length - 1; sigRow >= 1; sigRow--) {
            if (String(freshData[sigRow][freshRefIdx]) === String(p.ref)) {
              sh.getRange(sigRow + 1, sigColIdx + 1).setValue(signatureUrl);
              break;
            }
          }
        }
      } catch (sigWriteErr) {
        _logError('saveBooking.signatureWrite', sigWriteErr);
      }
    }

    // Idempotent notification: only mark/send once, and never let a mail
    // failure roll back or block the booking save.
    try {
      sendNotificationOnce(p, sh);
    } catch (notifyErr) {
      _logError('saveBooking.notify', notifyErr);
    }

    // Guest confirmation — reached only on first insert (duplicates return
    // above), so this can't double-send on client retries.
    try {
      sendGuestConfirmation(p);
    } catch (guestErr) {
      _logError('saveBooking.guestEmail', guestErr);
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

// Best-effort label→minutes map for overlap checks — duration is stored as
// the free-text label shown at booking time, not a number. Anything
// unrecognized (e.g. a package's "Full Day") falls back to a conservative
// 2-hour window so the conflict check stays a useful heuristic rather than
// silently skipping those bookings.
var DURATION_MINUTES = { '30 min': 30, '1 Hour': 60, '2 Hours': 120, 'Half Day': 240, 'Full Day': 480 };
function _durationMinutes(label) {
  return DURATION_MINUTES[String(label || '').trim()] || 120;
}

// ── CUSTOMERS — derived view over BOOKINGS, grouped by phone ──
// No separate sheet on purpose: a second store of guest data would need to
// be kept in sync with every booking write, and that's a new place for bugs.
// This computes profiles fresh from BOOKINGS on each read instead. Grouped
// by phone (digits-only) since most guests give a phone but skip email.
function getCustomers(limit) {
  try {
    var safeLimit = (typeof limit === 'number' && limit > 0 && limit <= 1000) ? limit : 300;
    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];

    var byPhone = {};
    var order = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var obj = {};
      FIELDS.forEach(function (f, idx) { obj[f] = row[idx]; });

      var digits = String(obj.phone || '').replace(/\D/g, '');
      var key = digits || ('noPhone_' + String(obj.ref || i));
      if (!byPhone[key]) {
        byPhone[key] = { phone: obj.phone || 'N/A', name: '', email: '', bookings: [] };
        order.push(key);
      }
      var c = byPhone[key];
      // Rows are appended in chronological order, so the last row seen for
      // this phone has the most current name/email — let it win.
      c.name = String(obj.fname || '') + ' ' + String(obj.lname || '');
      c.email = obj.email || c.email;
      c.bookings.push({
        ref: obj.ref, datetime: obj.datetime, duration: obj.duration, gear: obj.gear,
        total: obj.total, status: obj.status || 'pending',
        idPhotoUrl: obj.idPhotoUrl || '', waiverAccepted: obj.waiverAccepted || '',
        signatureUrl: obj.signatureUrl || ''
      });
    }

    var customers = order.map(function (key) {
      var c = byPhone[key];
      var bookings = c.bookings.slice().sort(function (a, b) {
        return new Date(a.datetime) - new Date(b.datetime);
      });
      var totalSpent = bookings.reduce(function (s, b) { return s + (parseFloat(b.total) || 0); }, 0);

      var idPhotoUrl = '', idPhotoRef = '';
      for (var j = bookings.length - 1; j >= 0; j--) {
        if (bookings[j].idPhotoUrl) { idPhotoUrl = bookings[j].idPhotoUrl; idPhotoRef = bookings[j].ref; break; }
      }
      var signatureUrl = '', signatureRef = '';
      for (var k = bookings.length - 1; k >= 0; k--) {
        if (bookings[k].signatureUrl) { signatureUrl = bookings[k].signatureUrl; signatureRef = bookings[k].ref; break; }
      }
      var waiverOnFile = bookings.some(function (b) {
        return b.waiverAccepted === true || String(b.waiverAccepted).toLowerCase() === 'true';
      });

      // Double-booking conflict: two still-active (pending/confirmed)
      // bookings for the same guest whose time windows overlap.
      var active = bookings.filter(function (b) { return b.status === 'pending' || b.status === 'confirmed' || b.status === 'delivering'; });
      var hasConflict = false;
      for (var a = 0; a < active.length && !hasConflict; a++) {
        var aStart = new Date(active[a].datetime).getTime();
        if (isNaN(aStart)) continue;
        var aEnd = aStart + _durationMinutes(active[a].duration) * 60000;
        for (var b2 = a + 1; b2 < active.length; b2++) {
          var bStart = new Date(active[b2].datetime).getTime();
          if (isNaN(bStart)) continue;
          var bEnd = bStart + _durationMinutes(active[b2].duration) * 60000;
          if (aStart < bEnd && bStart < aEnd) { hasConflict = true; break; }
        }
      }

      return {
        phone: c.phone,
        name: c.name.trim() || 'N/A',
        email: c.email || 'N/A',
        bookingCount: bookings.length,
        firstSeen: bookings[0] ? bookings[0].datetime : 'N/A',
        lastSeen: bookings[bookings.length - 1] ? bookings[bookings.length - 1].datetime : 'N/A',
        totalSpent: totalSpent,
        idPhotoUrl: idPhotoUrl,
        idPhotoRef: idPhotoRef,
        signatureUrl: signatureUrl,
        signatureRef: signatureRef,
        waiverOnFile: waiverOnFile,
        isRegular: bookings.length >= 3,
        hasConflict: hasConflict,
        bookings: bookings
      };
    });

    customers.sort(function (x, y) { return new Date(y.lastSeen) - new Date(x.lastSeen); });
    return customers.slice(0, safeLimit);
  } catch (err) {
    _logError('getCustomers', err);
    return [];
  }
}

// ── SCOPED DISPATCH VIEW — only what a delivery/dispatch staffer needs.
// Deliberately excludes: total, referral, waiverAccepted, waiverTimestamp,
// idPhotoUrl, signatureUrl, email. No pricing or revenue figure appears
// anywhere in this return value — that's the entire point of this endpoint existing.
var DISPATCH_FIELDS = ['ref', 'fname', 'lname', 'phone', 'datetime', 'groupSize', 'kidsCount', 'gear', 'duration', 'notes', 'status', 'driverLat', 'driverLng', 'driverLocAt'];

function getDispatchBookings(limit) {
  try {
    var safeLimit = (typeof limit === 'number' && limit > 0 && limit <= 500) ? limit : 50;
    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    var header = data[0];
    var colIdx = {};
    FIELDS.forEach(function (f, i) { colIdx[f] = i; });

    return data.slice(1).reverse().slice(0, safeLimit).map(function (row) {
      var obj = {};
      DISPATCH_FIELDS.forEach(function (f) {
        var v = row[colIdx[f]];
        obj[f] = (v === undefined || v === null || v === '') ? 'N/A' : v;
      });
      return obj;
    });
  } catch (err) {
    _logError('getDispatchBookings', err);
    return [];
  }
}

// ── GUEST ID PHOTO VIEW (token-gated, POST-only — never a public link) ──
// Looks up the booking's stored idPhotoUrl, extracts the Drive file ID, and
// returns the image content directly. This is the only way to view a guest
// ID photo now that _saveIdPhoto() no longer makes the file public.
function getIdPhoto(p) {
  try {
    if (!p || typeof p.ref !== 'string' || !p.ref.trim()) return { ok: false, error: 'Invalid ref' };

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var header = data[0] || [];
    var refIdx = header.indexOf('ref');
    var urlIdx = header.indexOf('idPhotoUrl');
    if (refIdx === -1 || urlIdx === -1) return { ok: false, error: 'Sheet not initialized' };

    var idPhotoUrl = '';
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) { idPhotoUrl = String(data[i][urlIdx] || ''); break; }
    }
    if (!idPhotoUrl) return { ok: false, error: 'No ID photo on file for this booking' };

    var match = idPhotoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return { ok: false, error: 'Could not resolve photo file' };

    var file = DriveApp.getFileById(match[1]);
    var blob = file.getBlob();
    return {
      ok: true,
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    };
  } catch (err) {
    return _fail('getIdPhoto', err);
  }
}

// ── GUEST SIGNATURE VIEW (token-gated, POST-only — never a public link) ──
// Same pattern as getIdPhoto: looks up the booking's stored signatureUrl,
// extracts the Drive file ID, and returns the image content directly.
function getSignature(p) {
  try {
    if (!p || typeof p.ref !== 'string' || !p.ref.trim()) return { ok: false, error: 'Invalid ref' };

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var header = data[0] || [];
    var refIdx = header.indexOf('ref');
    var urlIdx = header.indexOf('signatureUrl');
    if (refIdx === -1 || urlIdx === -1) return { ok: false, error: 'Sheet not initialized' };

    var signatureUrl = '';
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) { signatureUrl = String(data[i][urlIdx] || ''); break; }
    }
    if (!signatureUrl) return { ok: false, error: 'No signature on file for this booking' };

    var match = signatureUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return { ok: false, error: 'Could not resolve signature file' };

    var file = DriveApp.getFileById(match[1]);
    var blob = file.getBlob();
    return {
      ok: true,
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    };
  } catch (err) {
    return _fail('getSignature', err);
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

// Driver taps "Share my location" once per delivery — a single point-in-time
// fix (browser geolocation), not continuous tracking. Overwrites the
// booking's last-known location so dispatch/admin can open it in Maps.
function updateDriverLocation(p) {
  try {
    var validation = _validateLocationPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var header = data[0] || [];
    var refIdx = header.indexOf('ref');
    var latIdx = header.indexOf('driverLat');
    var lngIdx = header.indexOf('driverLng');
    var atIdx = header.indexOf('driverLocAt');
    if (refIdx === -1 || latIdx === -1 || lngIdx === -1 || atIdx === -1) {
      return { ok: false, error: 'Sheet not initialized' };
    }

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) {
        sh.getRange(i + 1, latIdx + 1, 1, 3).setValues([[Number(p.lat), Number(p.lng), new Date().toISOString()]]);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Booking not found' };
  } catch (err) {
    return _fail('updateDriverLocation', err);
  }
}

// ── STAFF COMMISSION ATTRIBUTION (admin-only — sets which staff member gets
// credit for a booking's sale; drivers/dispatch never see or set this) ──
function assignBookingStaff(p) {
  try {
    if (!p || typeof p.ref !== 'string' || !p.ref.trim()) return { ok: false, error: 'Invalid ref' };
    // staffId '' is allowed — that's how a booking gets unassigned again.
    if (p.staffId !== undefined && p.staffId !== null && typeof p.staffId !== 'string') {
      return { ok: false, error: 'Invalid staffId' };
    }

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var header = data[0] || [];
    var refIdx = header.indexOf('ref');
    var staffIdIdx = header.indexOf('staffId');
    var staffNameIdx = header.indexOf('staffName');
    if (refIdx === -1 || staffIdIdx === -1 || staffNameIdx === -1) return { ok: false, error: 'Sheet not initialized' };

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) {
        sh.getRange(i + 1, staffIdIdx + 1, 1, 2).setValues([[_safe(p.staffId, ''), _safe(p.staffName, '')]]);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Booking not found' };
  } catch (err) {
    return _fail('assignBookingStaff', err);
  }
}

// ── COMMISSION REPORT — read-only, computed fresh from BOOKINGS + STAFF on
// every call (same "derive, don't duplicate" approach as getCustomers). Sums
// booking.total for every booking attributed to each staff member whose
// datetime (the rental date/time, not Timestamp — when the booking was
// logged) falls inside [startDate, endDate]. Owner's call 2026-07-15: payroll
// periods should follow when the rental actually happens, not when it was
// booked. No payout automation — report only.
// Parses a 'YYYY-MM-DD' date-input string as local midnight, not UTC
// midnight. new Date('YYYY-MM-DD') parses as UTC per spec, so in a
// timezone behind UTC (e.g. AST, UTC-4) reading it back with
// getFullYear/getMonth/getDate silently rolls the date back a day —
// this bit getCommissionReport's "inclusive end date" before this fix.
function _parseLocalDateInput(s) {
  var parts = String(s).split('-');
  if (parts.length !== 3) return null;
  var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function getCommissionReport(p) {
  try {
    var start = p && p.startDate ? _parseLocalDateInput(p.startDate) : null;
    var end = p && p.endDate ? _parseLocalDateInput(p.endDate) : null;
    if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) {
      return { ok: false, error: 'Invalid date range' };
    }
    if (start > end) {
      return { ok: false, error: 'Start date must be on or before end date' };
    }
    // Treat endDate as inclusive of the whole day.
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

    var staff = getStaff();
    var byId = {};
    staff.forEach(function (s) {
      byId[s.id] = { staffId: s.id, name: s.name, commissionPct: s.commissionPct || 0, salesTotal: 0, commissionOwed: 0, bookingCount: 0 };
    });

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var idx = {};
    FIELDS.forEach(function (f, i) { idx[f] = i; });

    var unassignedTotal = 0;
    if (data.length > 1) {
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var rentalDate = row[idx.datetime] ? new Date(row[idx.datetime]) : null;
        if (!rentalDate || isNaN(rentalDate.getTime()) || rentalDate < start || rentalDate > end) continue;

        var total = Number(row[idx.total]) || 0;
        var staffId = String(row[idx.staffId] || '').trim();
        if (staffId && byId[staffId]) {
          byId[staffId].salesTotal += total;
          byId[staffId].bookingCount += 1;
        } else {
          unassignedTotal += total;
        }
      }
    }

    var report = Object.keys(byId).map(function (id) {
      var r = byId[id];
      r.commissionOwed = r.salesTotal * (r.commissionPct / 100);
      return r;
    }).sort(function (a, b) { return b.salesTotal - a.salesTotal; });

    return { ok: true, report: report, unassignedTotal: unassignedTotal };
  } catch (err) {
    return _fail('getCommissionReport', err);
  }
}

// ── DEPOSIT TRACKING (manual — admin enters whatever amount actually landed
// in the BOSVG bank account by transfer; no gateway, no calculated %) ──
function markDepositReceived(p) {
  try {
    if (!p || typeof p.ref !== 'string' || !p.ref.trim()) return { ok: false, error: 'Invalid ref' };
    var amount = Number(p.amount);
    // > 0, not >= 0 — a blank input box coerces to 0 via Number(''), which
    // must not be recordable as a legitimate "deposit received."
    if (isNaN(amount) || amount <= 0) return { ok: false, error: 'Enter a deposit amount greater than zero' };

    var sh = _sheet();
    var data = sh.getDataRange().getValues();
    var header = data[0] || [];
    var refIdx = header.indexOf('ref');
    var amtIdx = header.indexOf('depositAmount');
    var atIdx = header.indexOf('depositReceivedAt');
    var statusIdx = header.indexOf('depositStatus');
    if (refIdx === -1 || amtIdx === -1 || atIdx === -1 || statusIdx === -1) return { ok: false, error: 'Sheet not initialized' };

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) {
        // A deposit already marked received requires an explicit
        // confirmOverwrite flag — otherwise a stale tab or accidental
        // double-tap would silently clobber a correctly-recorded amount.
        if (String(data[i][statusIdx]) === 'received' && !p.confirmOverwrite) {
          return {
            ok: false,
            error: 'Deposit already marked received',
            alreadyReceived: true,
            existingAmount: Number(data[i][amtIdx]) || 0,
            existingAt: data[i][atIdx] || ''
          };
        }
        sh.getRange(i + 1, amtIdx + 1, 1, 3).setValues([[amount, new Date().toISOString(), 'received']]);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Booking not found' };
  } catch (err) {
    return _fail('markDepositReceived', err);
  }
}

// ── FEEDBACK (public submit, like saveBooking — guest never needs a token) ──
function saveFeedback(p) {
  try {
    if (!_rateLimitOk('feedback')) {
      return { ok: false, error: 'Too many submissions right now — please try again in a minute.' };
    }

    var validation = _validateFeedbackPayload(p);
    if (!validation.valid) return { ok: false, error: validation.error };

    var bookingSh = _sheet();
    var bookingData = bookingSh.getDataRange().getValues();
    var bookingRefIdx = bookingData[0] ? bookingData[0].indexOf('ref') : -1;
    var refFound = false;
    if (bookingRefIdx !== -1) {
      for (var i = 1; i < bookingData.length; i++) {
        if (String(bookingData[i][bookingRefIdx]) === String(p.ref)) { refFound = true; break; }
      }
    }
    if (!refFound) return { ok: false, error: 'Booking not found' };

    var sh = _feedbackSheet();
    sh.appendRow([
      _safe(p.ref, 'N/A'),
      Number(p.rating),
      _safe(p.comment, ''),
      new Date().toISOString()
    ]);
    return { ok: true };
  } catch (err) {
    return _fail('saveFeedback', err);
  }
}

function getMessages(limit) {
  try {
    var safeLimit = (typeof limit === 'number' && limit > 0 && limit <= 500) ? limit : 100;
    var sh = _messagesSheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).reverse().slice(0, safeLimit).map(function (row) {
      return { ref: row[0], type: row[1], to: row[2], subject: row[3] || '', createdAt: row[4] };
    });
  } catch (err) {
    _logError('getMessages', err);
    return [];
  }
}

function getFeedback(limit) {
  try {
    var safeLimit = (typeof limit === 'number' && limit > 0 && limit <= 500) ? limit : 100;
    var sh = _feedbackSheet();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).reverse().slice(0, safeLimit).map(function (row) {
      return { ref: row[0], rating: row[1], comment: row[2] || '', createdAt: row[3] };
    });
  } catch (err) {
    _logError('getFeedback', err);
    return [];
  }
}

// Admin-only — removes a single feedback row (matched by ref + createdAt,
// since ref alone isn't guaranteed unique if a guest submits more than once).
// Same pattern as deleteDriver/deleteInventoryItem: idempotent, returns ok
// even if already gone.
function deleteFeedback(p) {
  try {
    if (!p || typeof p.ref !== 'string' || !p.ref.trim() || typeof p.createdAt !== 'string' || !p.createdAt.trim()) {
      return { ok: false, error: 'Invalid ref/createdAt' };
    }
    var sh = _feedbackSheet();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(p.ref) && String(data[i][3]) === String(p.createdAt)) {
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: true }; // already gone — idempotent
  } catch (err) {
    return _fail('deleteFeedback', err);
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

// ── WHATSAPP TAP-TO-SEND LINKS (no API, no tokens, no second number) ──
// Builds a wa.me link that opens WhatsApp with the message pre-filled —
// whoever taps it sends it themselves, from their own already-active
// WhatsApp account. Used instead of the Cloud API so nobody has to
// register a second business number just to notify staff/guests.
function _waLink(phone, text) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
}

// One tap-to-send link per staff/driver with a phone number on file.
// Best-effort per-recipient — one bad number never blocks the rest.
function _teamWhatsAppLinks(text) {
  var links = [];
  try {
    var recipients = getStaff().concat(getDrivers());
    recipients.forEach(function (person) {
      if (!person || !person.phone) return;
      var link = _waLink(person.phone, text);
      if (link) links.push((person.name || 'Team member') + ': ' + link);
    });
  } catch (err) {
    _logError('_teamWhatsAppLinks', err);
  }
  return links;
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

  var waText = 'New APR booking ' + n(p && p.ref, 'N/A') + ': ' +
    n(p && p.fname, 'Guest') + ' ' + n(p && p.lname, '') + ', ' +
    n(p && p.gear, 'N/A') + ', ' + n(p && p.datetime, 'N/A') + '. Tap to reply if you can take it.';
  var waLinks = _teamWhatsAppLinks(waText);
  if (waLinks.length) {
    body += '\n\nTap to notify via WhatsApp:\n' + waLinks.join('\n');
  }

  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  _logMessage(p && p.ref, 'email', NOTIFY_EMAIL, subject);
}

// ── GUEST CONFIRMATION EMAIL ──
// The booking row starts as "pending" — this tells the guest exactly that,
// what confirms it (deposit / WhatsApp), and the bad-weather promise. Skipped
// silently when no valid email was given (email is optional on the form).
function sendGuestConfirmation(p) {
  var email = p && p.email ? String(p.email).trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  var n = function (v, fallback) {
    if (v === undefined || v === null) return fallback || 'N/A';
    var s = String(v).trim();
    return s.length ? s : (fallback || 'N/A');
  };
  var subject = '🌊 Booking received — ' + n(p.ref) + ' · Aquatic Paradise Rentals';
  var body = [
    'Hi ' + n(p.fname, 'there') + ',',
    '',
    'Thanks for booking with Aquatic Paradise Rentals in Bequia! We\'ve received your request:',
    '',
    'Ref:       ' + n(p.ref),
    'Gear:      ' + n(p.gear),
    'Duration:  ' + n(p.duration),
    'Date/Time: ' + n(p.datetime),
    'Group:     ' + n(p.groupSize, '1') + (p.kidsCount && Number(p.kidsCount) > 0 ? ' (incl. ' + p.kidsCount + ' kid(s) — kid-size life jackets included)' : ''),
    'Total:     XCD ' + n(p.total, '0') + '  (USD ≈ XCD ÷ 2.7)',
    (p.notes && String(p.notes).trim() ? 'Notes:     ' + n(p.notes) + '\n' : '') +
    '',
    'WHAT HAPPENS NEXT',
    'Your booking is PENDING until we confirm it — we\'ll message you on WhatsApp shortly.',
    'To secure your slot right away, message us for bank-transfer deposit details:',
    'https://wa.me/17844963447',
    '',
    'OUR BAD-WEATHER PROMISE',
    'We check wind and sea conditions daily. If conditions are unsafe at your rental time,',
    'you choose: free rebooking to another day, or a full refund of anything paid.',
    '',
    'Need to change or cancel? Just message us on WhatsApp: https://wa.me/17844963447',
    'Safety rules: https://aquaticparadiserental.vacations/rules.html',
    '',
    'See you at the beach!',
    'Aquatic Paradise Rentals — Bequia, St. Vincent & the Grenadines',
    'https://aquaticparadiserental.vacations'
  ].join('\n');
  GmailApp.sendEmail(email, subject, body, { name: 'Aquatic Paradise Rentals' });
  _logMessage(p.ref, 'email', email, subject);
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

  // 2c. STAFF sheet header check.
  try {
    var staffSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET_NAME);
    if (staffSh) {
      var staffHeader = staffSh.getRange(1, 1, 1, Math.max(staffSh.getLastColumn(), 1)).getValues()[0];
      var expectedStaffCols = ['id', 'name', 'role', 'phone', 'createdAt', 'photoUrl'];
      var missingStaffCols = expectedStaffCols.filter(function (f) { return staffHeader.indexOf(f) === -1; });
      if (missingStaffCols.length) {
        issues.push('STAFF header is missing expected column(s): ' + missingStaffCols.join(', ') + '.');
      }
    }
    // Not present yet is fine — auto-creates on first use (e.g. running seedDefaultStaff).
  } catch (err) {
    issues.push('Could not read the STAFF sheet: ' + (err && err.message ? err.message : err));
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

  // 5. Weather reading isn't stale — catches the daily trigger silently
  // failing (e.g. Open-Meteo down repeatedly, or the trigger got deleted).
  try {
    var weatherRaw = PropertiesService.getScriptProperties().getProperty(WEATHER_PROP_KEY);
    if (!weatherRaw) {
      issues.push('No weather reading has ever been saved. Run installWeatherCheckTrigger() if you want the daily conditions check active.');
    } else {
      var weatherData = JSON.parse(weatherRaw);
      var checkedAt = weatherData.checkedAt ? new Date(weatherData.checkedAt) : null;
      if (checkedAt && !isNaN(checkedAt.getTime())) {
        var ageHours = (Date.now() - checkedAt.getTime()) / 3600000;
        if (ageHours > 30) { // daily trigger + generous buffer
          issues.push('Last weather check was ' + Math.round(ageHours) + ' hours ago — the daily trigger may have stopped running.');
        }
      }
    }
  } catch (err) {
    issues.push('Could not verify weather check freshness: ' + (err && err.message ? err.message : err));
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

// ── WEATHER / SEA-CONDITION SAFETY CHECK ──
// Uses Open-Meteo (free, no API key required) for Bequia's approximate
// coordinates. Wind speed is the same safety signal the existing manual
// anemometer protocol already uses (see OPERATIONS.md §7) — this automates
// the daily check, it doesn't replace the on-the-spot manual check before
// each rental.
var WEATHER_LAT = 13.0056;
var WEATHER_LON = -61.2392;
// Thresholds in km/h — adjust if these don't match real on-the-water
// judgment; they're a starting point, not a substitute for staff judgment.
var WIND_CAUTION_KMH = 28;  // ~15 knots
var WIND_UNSAFE_KMH = 37;   // ~20 knots
var WEATHER_PROP_KEY = 'apr_weather_latest';

function _weatherStatus(windKmh) {
  if (windKmh >= WIND_UNSAFE_KMH) return 'unsafe';
  if (windKmh >= WIND_CAUTION_KMH) return 'caution';
  return 'safe';
}

// Fetches current conditions. Never throws — a failed fetch resolves to
// status 'unknown' so nothing downstream mistakes "couldn't check" for "safe".
function _fetchWeather() {
  try {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WEATHER_LAT +
      '&longitude=' + WEATHER_LON + '&current=wind_speed_10m,wind_gusts_10m' +
      '&daily=wind_speed_10m_max&timezone=auto&wind_speed_unit=kmh';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      return { status: 'unknown', error: 'HTTP ' + resp.getResponseCode() };
    }
    var data = JSON.parse(resp.getContentText());
    var windNow = data.current && typeof data.current.wind_speed_10m === 'number' ? data.current.wind_speed_10m : null;
    var gustNow = data.current && typeof data.current.wind_gusts_10m === 'number' ? data.current.wind_gusts_10m : null;
    var windMaxToday = (data.daily && Array.isArray(data.daily.wind_speed_10m_max) && data.daily.wind_speed_10m_max.length) ? data.daily.wind_speed_10m_max[0] : null;
    if (windNow === null) return { status: 'unknown', error: 'No wind data in response' };

    return {
      status: _weatherStatus(Math.max(windNow, windMaxToday || 0)),
      windNowKmh: windNow,
      gustNowKmh: gustNow,
      windMaxTodayKmh: windMaxToday,
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    _logError('_fetchWeather', err);
    return { status: 'unknown', error: (err && err.message) ? err.message : String(err) };
  }
}

// Runs on an hourly time-based trigger (set up via installWeatherCheckTrigger).
// Saves the latest reading for the app to display. To keep hourly checks from
// spamming: the owner email goes out only on the FIRST check of the day (the
// morning digest) or when the status CHANGES mid-day (e.g. SAFE → CAUTION).
// Guest heads-ups stay caution/unsafe-only, once per booking per day.
// Checks outside ~6am–7pm are skipped — nobody is on the water at night.
function dailyWeatherCheck() {
  var hourNow = new Date().getHours();
  if (hourNow < 6 || hourNow >= 19) {
    Logger.log('dailyWeatherCheck: skipped (outside 6am-7pm window)');
    return null;
  }

  var prev = null;
  try {
    var prevRaw = PropertiesService.getScriptProperties().getProperty(WEATHER_PROP_KEY);
    if (prevRaw) prev = JSON.parse(prevRaw);
  } catch (err) { /* treat as no previous reading */ }

  var weather = _fetchWeather();

  try {
    PropertiesService.getScriptProperties().setProperty(WEATHER_PROP_KEY, JSON.stringify(weather));
  } catch (err) {
    _logError('dailyWeatherCheck.save', err);
  }

  var firstRunToday = !prev || !prev.checkedAt ||
    new Date(prev.checkedAt).toDateString() !== new Date().toDateString();
  var statusChanged = prev && prev.status !== weather.status;

  if (!firstRunToday && !statusChanged) {
    Logger.log('dailyWeatherCheck: status=' + weather.status + ' (unchanged, no alerts)');
    return weather;
  }

  try {
    var subject = firstRunToday
      ? '🌊 APR Daily Conditions: ' + weather.status.toUpperCase()
      : '🌊 APR Conditions CHANGED: ' + (prev && prev.status ? prev.status.toUpperCase() : '?') + ' → ' + weather.status.toUpperCase();
    var body = weather.status === 'unknown'
      ? 'Could not reach the weather service today (' + (weather.error || 'unknown error') + '). Do a manual anemometer check before dispatching.'
      : ('Wind now: ' + weather.windNowKmh + ' km/h (gusts ' + (weather.gustNowKmh || 'N/A') + ' km/h)\n' +
         'Max wind expected today: ' + (weather.windMaxTodayKmh || 'N/A') + ' km/h\n' +
         'Status: ' + weather.status.toUpperCase() + '\n\n' +
         'Thresholds: caution at ' + WIND_CAUTION_KMH + '+ km/h, unsafe at ' + WIND_UNSAFE_KMH + '+ km/h.\n' +
         'This does not replace the on-the-spot anemometer check before each rental.');

    if (weather.status === 'caution' || weather.status === 'unsafe') {
      var teamWaText = 'APR conditions today: ' + weather.status.toUpperCase() +
        ' (wind ~' + (weather.windNowKmh != null ? weather.windNowKmh : 'N/A') + ' km/h, gusts to ' +
        (weather.gustNowKmh != null ? weather.gustNowKmh : 'N/A') + ' km/h).';
      var teamWaLinks = _teamWhatsAppLinks(teamWaText);
      if (teamWaLinks.length) {
        body += '\n\nTap to notify via WhatsApp:\n' + teamWaLinks.join('\n');
      }
    }

    GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (mailErr) {
    _logError('dailyWeatherCheck.ownerEmail', mailErr);
  }

  // Guest heads-up — only when there's an actual reason to warn them.
  if (weather.status === 'caution' || weather.status === 'unsafe') {
    try {
      _notifyTodaysGuestsOfConditions(weather);
    } catch (err) {
      _logError('dailyWeatherCheck.guestNotify', err);
    }
  }

  Logger.log('dailyWeatherCheck: status=' + weather.status);
  return weather;
}

// Emails guests whose booking datetime falls today, once per day per
// booking (reuses the same ref-based idempotency style as sendNotificationOnce
// so a re-run of dailyWeatherCheck doesn't spam the same guest twice).
function _notifyTodaysGuestsOfConditions(weather) {
  var sh = _sheet();
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return;

  var header = data[0];
  var refIdx = header.indexOf('ref');
  var emailIdx = header.indexOf('email');
  var phoneIdx = header.indexOf('phone');
  var fnameIdx = header.indexOf('fname');
  var datetimeIdx = header.indexOf('datetime');
  var statusIdx = header.indexOf('status');
  if (refIdx === -1 || emailIdx === -1 || datetimeIdx === -1) return;

  var todayStr = new Date().toDateString();
  var notifiedToday = JSON.parse(PropertiesService.getScriptProperties().getProperty('apr_weather_notified_' + todayStr) || '[]');
  var newlyNotified = notifiedToday.slice();
  var guestWaLinks = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ref = String(row[refIdx] || '');
    var email = String(row[emailIdx] || '').trim();
    var status = statusIdx !== -1 ? row[statusIdx] : '';
    var bookingDate = row[datetimeIdx] ? new Date(row[datetimeIdx]) : null;

    if (!email || !ref) continue;
    if (status === 'done') continue; // already completed, no need to warn
    if (!bookingDate || isNaN(bookingDate.getTime()) || bookingDate.toDateString() !== todayStr) continue;
    if (notifiedToday.indexOf(ref) !== -1) continue; // already emailed today

    try {
      var fname = fnameIdx !== -1 ? row[fnameIdx] : '';
      var subject = weather.status === 'unsafe'
        ? '⚠️ Aquatic Paradise Rentals — conditions update for today'
        : 'Aquatic Paradise Rentals — conditions heads-up for today';
      var body = 'Hi ' + (fname || 'there') + ',\n\n' +
        'Wind conditions today are running ' + weather.status.toUpperCase() +
        ' (around ' + weather.windNowKmh + ' km/h, gusts to ' + (weather.gustNowKmh || 'N/A') + ' km/h).\n\n' +
        (weather.status === 'unsafe'
          ? 'For your safety we may need to adjust timing or gear for your rental today — our team will follow up, or feel free to reach out directly.'
          : 'Your rental is still on — just flagging so you know what to expect on the water today.') +
        '\n\n— Aquatic Paradise Rentals\n+1 (784) 496-3447';
      GmailApp.sendEmail(email, subject, body);

      var phone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
      if (phone) {
        var waText = 'Hi ' + (fname || 'there') + ', conditions update for your Aquatic Paradise Rentals booking today: ' +
          weather.status.toUpperCase() + ' (wind ~' + weather.windNowKmh + ' km/h, gusts to ' + (weather.gustNowKmh || 'N/A') + ' km/h). ' +
          (weather.status === 'unsafe' ? 'We may need to adjust timing or gear — let us know a good time to talk.' : 'Your rental is still on, just a heads-up.');
        var link = _waLink(phone, waText);
        if (link) guestWaLinks.push(ref + ' (' + (fname || 'guest') + '): ' + link);
      }

      newlyNotified.push(ref);
    } catch (err) {
      _logError('_notifyTodaysGuestsOfConditions.' + ref, err);
    }
  }

  try {
    PropertiesService.getScriptProperties().setProperty('apr_weather_notified_' + todayStr, JSON.stringify(newlyNotified));
  } catch (err) {
    _logError('_notifyTodaysGuestsOfConditions.save', err);
  }

  if (guestWaLinks.length) {
    try {
      GmailApp.sendEmail(NOTIFY_EMAIL, 'APR: tap to WhatsApp today\'s guests re: conditions',
        'Guests already got an email heads-up. Tap a link below to also send them a WhatsApp:\n\n' + guestWaLinks.join('\n\n'));
    } catch (err) {
      _logError('_notifyTodaysGuestsOfConditions.digest', err);
    }
  }
}

// Public — no token required. This is safety information, not customer PII,
// and both the guest-facing booking page and the admin console need to show
// it without needing the admin token.
function getWeather() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(WEATHER_PROP_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    _logError('getWeather', err);
  }
  // No cached reading yet (first run hasn't happened) — check live rather
  // than returning nothing.
  return _fetchWeather();
}

// ── ONE-TIME SETUP: installs the hourly weather-check trigger. Run once from
// the Apps Script editor. Safe to re-run — clears any existing trigger first.
// The trigger fires hourly around the clock; dailyWeatherCheck() itself skips
// runs outside ~6am–7pm, and only alerts on the first run of the day or a
// status change, so hourly does NOT mean hourly emails.
function installWeatherCheckTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyWeatherCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyWeatherCheck')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('installWeatherCheckTrigger: dailyWeatherCheck() will now run hourly (active 6am-7pm, alerts on first run or status change).');
  try { SpreadsheetApp.getUi().alert('✅ Hourly weather check scheduled (active 6am-7pm; alerts only on morning digest or status change).'); } catch (uiErr) { /* expected outside Sheets UI */ }
}

// ── WEEKLY SPREADSHEET BACKUP ──
// The whole business lives in one Google Sheet — this copies it to a dated
// file in an "APR Backups" Drive folder once a week and keeps the last 8,
// so a bad edit or deleted tab is never more than a week from recoverable.
var BACKUP_FOLDER_NAME = 'APR Backups';
var BACKUP_KEEP = 8;

function weeklyBackup() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var file = DriveApp.getFileById(ss.getId());
    var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    file.makeCopy('APR Master Log — backup ' + stamp, folder);

    // Prune: keep only the newest BACKUP_KEEP copies.
    var backups = [];
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.getName().indexOf('APR Master Log — backup ') === 0) backups.push(f);
    }
    backups.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    for (var i = BACKUP_KEEP; i < backups.length; i++) backups[i].setTrashed(true);
  } catch (err) {
    _logError('weeklyBackup', err);
  }
}

function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyBackup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
  Logger.log('installBackupTrigger: weeklyBackup() will now run every Sunday ~3 AM.');
  try { SpreadsheetApp.getUi().alert('✅ Weekly backup scheduled — Sundays ~3 AM, keeps last ' + BACKUP_KEEP + ' copies.'); } catch (uiErr) { /* expected outside Sheets UI */ }
}

// ── AUTOMATED BUSINESS REPORT ──
// Adapted to the REAL BOOKINGS schema (named FIELDS columns via _sheet(),
// not fixed A-G letters). Deposits (depositAmount/depositStatus) and staff
// commission (STAFF.commissionPct + BOOKINGS.staffId, added 2026-07-15) are
// now tracked, but deliberately kept out of THIS auto-email — they have
// their own read-only admin reports (Bookings deposit column, Commission
// tab) and folding them into the daily/weekly blast risks the owner
// mis-reading "revenue" as "cash actually collected." 'cancelled' isn't a
// real status either (VALID_STATUSES is pending/confirmed/delivering/done)
// — so this counts all logged bookings as revenue rather than guessing at
// a cancellation split.
var REPORT_TYPE_PROP_KEY = 'apr_report_type';

function sendAutoReport() {
  var reportType = PropertiesService.getScriptProperties().getProperty(REPORT_TYPE_PROP_KEY) || 'daily';
  var daysBack = reportType === 'weekly' ? 7 : 1;

  var sh = _sheet();
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    _sendReportEmail(_buildEmptyReportHtml(reportType), reportType);
    return;
  }

  var header = data[0];
  var idx = {};
  FIELDS.forEach(function (f, i) { idx[f] = i; });

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  var bookingCount = 0;
  var totalRevenue = 0;
  var gearUsage = {};
  var recentBookings = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = row[idx.Timestamp] ? new Date(row[idx.Timestamp]) : null;
    if (!ts || isNaN(ts.getTime()) || ts < cutoff) continue;

    bookingCount++;
    var total = Number(row[idx.total]) || 0;
    totalRevenue += total;

    var gear = String(row[idx.gear] || '').trim();
    if (gear) gearUsage[gear] = (gearUsage[gear] || 0) + 1;

    recentBookings.push({
      date: Utilities.formatDate(ts, Session.getScriptTimeZone(), 'MMM dd'),
      name: (row[idx.fname] || '') + ' ' + (row[idx.lname] || ''),
      gear: gear || 'N/A',
      amount: total,
      status: String(row[idx.status] || 'pending')
    });
  }

  var topGear = Object.keys(gearUsage)
    .map(function (g) { return [g, gearUsage[g]]; })
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 5);

  var html = _buildReportHtml(reportType, {
    bookingCount: bookingCount,
    totalRevenue: totalRevenue,
    topGear: topGear,
    recentBookings: recentBookings
  });

  _sendReportEmail(html, reportType);
}

function _buildReportHtml(reportType, d) {
  var periodLabel = reportType === 'weekly' ? 'This Week' : 'Today';
  var gearRows = d.topGear.length
    ? d.topGear.map(function (g) {
        return '<tr><td style="padding:4px 12px;">' + g[0] + '</td><td style="padding:4px 12px;">' + g[1] + ' booking(s)</td></tr>';
      }).join('')
    : '<tr><td style="padding:4px 12px;" colspan="2">No gear activity</td></tr>';

  var bookingRows = d.recentBookings.length
    ? d.recentBookings.slice(0, 15).map(function (b) {
        return '<tr>' +
          '<td style="padding:4px 12px;">' + b.date + '</td>' +
          '<td style="padding:4px 12px;">' + b.name + '</td>' +
          '<td style="padding:4px 12px;">' + b.gear + '</td>' +
          '<td style="padding:4px 12px;">XCD ' + b.amount.toFixed(2) + '</td>' +
          '<td style="padding:4px 12px; text-transform:capitalize;">' + b.status + '</td>' +
          '</tr>';
      }).join('')
    : '<tr><td style="padding:4px 12px;" colspan="5">No bookings ' + periodLabel.toLowerCase() + '</td></tr>';

  return '' +
    '<div style="font-family: Arial, sans-serif; max-width: 640px; margin: auto;">' +
    '<div style="background:#03939E; color:#fff; padding:20px; border-radius:6px 6px 0 0;">' +
    '<h2 style="margin:0;">Aquatic Paradise Rentals</h2>' +
    '<p style="margin:4px 0 0; opacity:0.9;">' + periodLabel + '\'s Report — ' + new Date().toDateString() + '</p>' +
    '</div>' +
    '<div style="padding:20px; border:1px solid #eee; border-top:none;">' +

    '<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">' +
    '<tr>' +
    '<td style="padding:12px; background:#f7f7f7; border-radius:6px; text-align:center;"><div style="font-size:22px; font-weight:bold; color:#03939E;">' + d.bookingCount + '</div><div style="font-size:12px; color:#666;">Bookings</div></td>' +
    '<td style="width:10px;"></td>' +
    '<td style="padding:12px; background:#f7f7f7; border-radius:6px; text-align:center;"><div style="font-size:22px; font-weight:bold; color:#0B1E2D;">XCD ' + d.totalRevenue.toFixed(0) + '</div><div style="font-size:12px; color:#666;">Revenue</div></td>' +
    '</tr>' +
    '</table>' +

    '<h3 style="color:#0B1E2D; border-bottom:2px solid #FBC62C; padding-bottom:4px;">Top Gear</h3>' +
    '<table style="width:100%; border-collapse:collapse; font-size:14px;">' + gearRows + '</table>' +

    '<h3 style="color:#0B1E2D; border-bottom:2px solid #FBC62C; padding-bottom:4px; margin-top:20px;">Bookings</h3>' +
    '<table style="width:100%; border-collapse:collapse; font-size:13px;">' +
    '<tr style="background:#f0f0f0; font-weight:bold;"><td style="padding:4px 12px;">Date</td><td style="padding:4px 12px;">Customer</td><td style="padding:4px 12px;">Gear</td><td style="padding:4px 12px;">Amount</td><td style="padding:4px 12px;">Status</td></tr>' +
    bookingRows +
    '</table>' +

    '<p style="margin-top:16px; font-size:12px; color:#888;">Deposits and staff commission have their own admin reports (Bookings tab, Commission tab) — not included in this summary.</p>' +
    '<p style="margin-top:8px; font-size:11px; color:#999;">Automated report — Aquatic Paradise Rentals booking system.</p>' +
    '</div></div>';
}

function _buildEmptyReportHtml(reportType) {
  return '<p>No bookings found for this period.</p>';
}

function _sendReportEmail(html, reportType) {
  var subjectLabel = reportType === 'weekly' ? 'Weekly Report' : 'Daily Report';
  try {
    GmailApp.sendEmail(NOTIFY_EMAIL, 'Aquatic Paradise Rentals — ' + subjectLabel + ' (' + new Date().toDateString() + ')', '', { htmlBody: html });
  } catch (err) {
    _logError('_sendReportEmail', err);
  }
}

// ── ONE-TIME SETUP: run ONE of these two, not both. Re-running either one
// safely replaces any existing report trigger (never creates duplicates).
function setupDailyReportTrigger() {
  _deleteExistingReportTriggers();
  PropertiesService.getScriptProperties().setProperty(REPORT_TYPE_PROP_KEY, 'daily');
  ScriptApp.newTrigger('sendAutoReport').timeBased().everyDays(1).atHour(18).create();
  Logger.log('setupDailyReportTrigger: report will send daily at 6 PM.');
  try { SpreadsheetApp.getUi().alert('✅ Daily report scheduled for 6 PM.'); } catch (uiErr) { /* expected outside Sheets UI */ }
}

function setupWeeklyReportTrigger() {
  _deleteExistingReportTriggers();
  PropertiesService.getScriptProperties().setProperty(REPORT_TYPE_PROP_KEY, 'weekly');
  ScriptApp.newTrigger('sendAutoReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  Logger.log('setupWeeklyReportTrigger: report will send every Monday at 8 AM.');
  try { SpreadsheetApp.getUi().alert('✅ Weekly report scheduled for Monday 8 AM.'); } catch (uiErr) { /* expected outside Sheets UI */ }
}

function _deleteExistingReportTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendAutoReport') ScriptApp.deleteTrigger(t);
  });
}

// Run manually anytime to send a report right now, without waiting for
// the schedule — useful to confirm it works before trusting the automation.
function testReportNow() {
  sendAutoReport();
}
