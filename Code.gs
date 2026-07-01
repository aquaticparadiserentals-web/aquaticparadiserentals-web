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
var NOTIFY_EMAIL = 'aquaticparadiserentals@gmail.com';
// Shared secret required to read booking/customer data (PII). Booking *submission*
// stays open since customers must be able to book without a login.
var APP_TOKEN = '2Si_80O9OJ0DGmc8p6G5pDeG';
var GENERIC_ERROR = 'Something went wrong. Please try again.';

var FIELDS = ['ref','fname','lname','phone','email','datetime','groupSize',
  'gear','duration','total','referral','notes','waiverAccepted','waiverTimestamp',
  'source','Timestamp','NotifiedAt'];

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

    return { valid: true };
  } catch (err) {
    _logError('validateBookingPayload', err);
    return { valid: false, error: 'Validation failed' };
  }
}

function _validateStatusPayload(p) {
  try {
    if (!p || typeof p !== 'object') return { valid: false, error: 'Missing data' };
    if (typeof p.ref !== 'string' || !p.ref.trim() || p.ref.length > 200) {
      return { valid: false, error: 'Invalid ref' };
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
    sh.appendRow([
      'ref','fname','lname','phone','email','datetime','groupSize',
      'gear','duration','total','referral','notes',
      'waiverAccepted','waiverTimestamp','source','Timestamp','NotifiedAt'
    ]);
    sh.getRange('1:1').setFontWeight('bold');
    ['D:D','F:F','N:N'].forEach(function(r){ sh.getRange(r).setNumberFormat('@'); });
  }
  return sh;
}

function _safe(val, fallback) {
  var s = (val === undefined || val === null || val === '') ? (fallback !== undefined ? fallback : '') : String(val);
  if (/^[=+\-@]/.test(s)) return "'" + s;
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
    return _json(saveBooking(payload));
  } catch (err) {
    return _json(_fail('doPost', err));
  }
}

// ── IDEMPOTENT BOOKING SAVE ──
// If the same ref is submitted twice (client retry, flaky connection, script
// restart) we must not create a duplicate row or send a duplicate email.
function saveBooking(p) {
  try {
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
        '' // NotifiedAt — set once the notification is actually sent
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
    if (refIdx === -1) return { ok: false, error: 'Sheet not initialized' };

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][refIdx]) === String(p.ref)) return { ok: true };
    }
    return { ok: false, error: 'Booking not found' };
  } catch (err) {
    return _fail('updateStatus', err);
  }
}

// ── ONE-TIME SETUP: Run this once from Apps Script to fix sheet headers ──
function setupSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);
    sh.getRange('1:1').clearContent();
    sh.getRange(1, 1, 1, 17).setValues([[
      'ref','fname','lname','phone','email','datetime','groupSize',
      'gear','duration','total','referral','notes',
      'waiverAccepted','waiverTimestamp','source','Timestamp','NotifiedAt'
    ]]);
    sh.getRange('1:1').setFontWeight('bold');
    ['D:D','F:F','N:N'].forEach(function (r) { sh.getRange(r).setNumberFormat('@'); });
    SpreadsheetApp.getUi().alert('✅ Sheet headers updated! You can delete old test rows manually.');
  } catch (err) {
    _logError('setupSheet', err);
    try { SpreadsheetApp.getUi().alert('⚠️ Setup failed — check Apps Script logs.'); } catch (e2) {}
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
    'Group:     ' + n(p && p.groupSize, 'N/A'),
    'Gear:      ' + n(p && p.gear, 'N/A'),
    'Duration:  ' + n(p && p.duration, 'N/A'),
    'Total:     XCD ' + n(p && p.total, '0'),
    'Referral:  ' + n(p && p.referral, 'N/A'),
    'Notes:     ' + n(p && p.notes, 'N/A'),
    '', 'Submitted: ' + new Date().toISOString()
  ].join('\n');
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}
