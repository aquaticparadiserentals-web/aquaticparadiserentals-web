/**
 * AQUATIC PARADISE RENTALS — Booking App Backend
 * Owner: Delroy Stapleton (internal record only — never expose in API responses)
 * Deploy: Extensions > Apps Script in your "APR Master Log" Google Sheet,
 *         paste this whole file in, then Deploy > New deployment > Web app
 *         (Execute as: Me, Who has access: Anyone) and copy the URL into
 *         CONFIG.API_URL in index.html.
 *
 * Sheet tabs required (create if missing, exact names):
 *   BOOKINGS  — header row: Timestamp | BookingID | CustomerName | WhatsApp | Email |
 *               Gear | Date | StartTime | EndTime | Location | PaymentMethod |
 *               PriceXCD | Status | Driver | WaiverSigned | WaiverTimestamp |
 *               WaiverIP | WaiverDevice | SignatureDataURL | Notes
 */

var SHEET_NAME = 'BOOKINGS';
var OWNER_NOTE = 'Delroy Stapleton'; // internal metadata only, never returned to client

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Timestamp','BookingID','CustomerName','WhatsApp','Email','Gear','Date',
      'StartTime','EndTime','Location','PaymentMethod','PriceXCD','Status','Driver',
      'WaiverSigned','WaiverTimestamp','WaiverIP','WaiverDevice','SignatureDataURL','Notes','_Owner']);
  }
  // Runs every time (not just on first creation) so it also repairs a sheet that
  // was already created by an older version of this script. Plain-text format on
  // these columns stops Sheets from auto-converting dates/phone numbers.
  ['A:A','D:D','G:G','H:H','P:P'].forEach(function(rng){ sh.getRange(rng).setNumberFormat('@'); });
  return sh;
}

// Google Sheets treats values starting with = + - @ as the start of a formula
// when written programmatically, which is what mangled the WhatsApp number and
// dates earlier. Prepending a literal apostrophe forces plain-text, same as if
// a person typed an apostrophe first in the UI — Sheets hides the apostrophe
// and just shows the text. Also closes a formula-injection security gap on
// this public-facing form.
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
  var sh = _sheet();
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var ownerIdx = headers.indexOf('_Owner');
  var rows = data.slice(1).map(function(r) {
    var obj = {};
    headers.forEach(function(h, i) {
      if (h === '_Owner') return; // never expose owner field
      obj[h] = r[i];
    });
    obj._row = data.indexOf(r) + 1;
    return obj;
  });
  return _json({ ok: true, bookings: rows });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'create') {
      var sh = _sheet();
      var id = 'APR-' + Utilities.formatDate(new Date(), 'GMT', 'yyMMdd-HHmmss');
      sh.appendRow([
        new Date(), id, _safe(body.customerName), _safe(body.whatsapp), _safe(body.email),
        _safe(body.gear), _safe(body.date), _safe(body.startTime), _safe(body.endTime),
        _safe(body.location), _safe(body.paymentMethod), body.priceXCD || 0,
        'Requested', '', false, '', '', '', '', '', OWNER_NOTE
      ]);
      return _json({ ok: true, bookingId: id });
    }

    if (action === 'sign_waiver') {
      var sh = _sheet();
      var data = sh.getDataRange().getValues();
      var headers = data[0];
      var idIdx = headers.indexOf('BookingID');
      for (var i = 1; i < data.length; i++) {
        if (data[i][idIdx] === body.bookingId) {
          var row = i + 1;
          sh.getRange(row, headers.indexOf('WaiverSigned') + 1).setValue(true);
          sh.getRange(row, headers.indexOf('WaiverTimestamp') + 1).setValue(body.timestamp || new Date().toISOString());
          sh.getRange(row, headers.indexOf('WaiverIP') + 1).setValue(body.ip || 'unavailable');
          sh.getRange(row, headers.indexOf('WaiverDevice') + 1).setValue(body.device || '');
          sh.getRange(row, headers.indexOf('SignatureDataURL') + 1).setValue(body.signature || '');
          return _json({ ok: true });
        }
      }
      return _json({ ok: false, error: 'Booking not found' });
    }

    if (action === 'update_status') {
      var sh = _sheet();
      var data = sh.getDataRange().getValues();
      var headers = data[0];
      var idIdx = headers.indexOf('BookingID');
      for (var i = 1; i < data.length; i++) {
        if (data[i][idIdx] === body.bookingId) {
          var row = i + 1;
          if (body.status) sh.getRange(row, headers.indexOf('Status') + 1).setValue(body.status);
          if (body.driver !== undefined) sh.getRange(row, headers.indexOf('Driver') + 1).setValue(body.driver);
          if (body.notes !== undefined) sh.getRange(row, headers.indexOf('Notes') + 1).setValue(body.notes);
          return _json({ ok: true });
        }
      }
      return _json({ ok: false, error: 'Booking not found' });
    }

    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return _json({ ok: false, error: err.toString() });
  }
}
