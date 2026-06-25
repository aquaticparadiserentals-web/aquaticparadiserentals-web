// APR Google Apps Script Backend - Code.gs
// Handles bookings from the PWA via GET (primary) and POST (fallback)

const SHEET_NAME = 'Bookings';

function doGet(e) {
  // Handle GET request with data param (primary path - no CORS issues)
  try {
    if (e.parameter && e.parameter.data) {
      const payload = JSON.parse(e.parameter.data);
      const result = saveBooking(payload);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Handle getBookings action
    if (e.parameter && e.parameter.action === 'getBookings') {
      const limit = parseInt(e.parameter.limit) || 50;
      const bookings = getBookings(limit);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, bookings: bookings }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Default health check
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'APR Backend running' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  // Handle POST request (fallback path)
  try {
    let payload;
    
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    } else {
      throw new Error('No data received');
    }
    
    const result = saveBooking(payload);
    
    // Add CORS headers
    const output = ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
    return output;
    
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveBooking(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  // Create sheet with headers if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 13).setValues([[
      'Ref', 'First Name', 'Last Name', 'Phone', 'Email',
      'Date/Time', 'Group Size', 'Gear', 'Duration', 'Total (XCD)',
      'Referral', 'Notes', 'Timestamp'
    ]]);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
  }
  
  // Append booking row
  sheet.appendRow([
    payload.ref || '',
    payload.fname || '',
    payload.lname || '',
    payload.phone || '',
    payload.email || '',
    payload.datetime || '',
    payload.groupSize || '',
    payload.gear || '',
    payload.duration || '',
    payload.total || '',
    payload.referral || '',
    payload.notes || '',
    new Date().toISOString()
  ]);
  
  // Send notification email
  try {
    sendNotification(payload);
  } catch(emailErr) {
    // Don't fail the booking if email fails
    Logger.log('Email error: ' + emailErr.message);
  }
  
  return { ok: true, ref: payload.ref };
}

function getBookings(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only headers
  
  const headers = data[0];
  const rows = data.slice(1).reverse(); // Most recent first
  const limited = rows.slice(0, limit);
  
  return limited.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function sendNotification(payload) {
  const subject = '🏄 New APR Booking: ' + (payload.ref || 'Unknown');
  const body = [
    'New booking received!',
    '',
    'Ref: ' + (payload.ref || ''),
    'Name: ' + (payload.fname || '') + ' ' + (payload.lname || ''),
    'Phone: ' + (payload.phone || ''),
    'Email: ' + (payload.email || ''),
    'Date/Time: ' + (payload.datetime || ''),
    'Group Size: ' + (payload.groupSize || ''),
    'Gear: ' + (payload.gear || ''),
    'Duration: ' + (payload.duration || ''),
    'Total: XCD ' + (payload.total || ''),
    'Notes: ' + (payload.notes || ''),
    '',
    'Timestamp: ' + new Date().toISOString()
  ].join('\n');
  
  GmailApp.sendEmail('aquaticparadiserentals@gmail.com', subject, body);
}
