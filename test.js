// Automated Test Suite for Lakes International School Fee System
const http = require('http');
const assert = require('assert');

// Helper to start the server in a test process or run against localhost:3000
const PORT = 3001;
process.env.PORT = PORT;

const server = require('./server.js');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        ...headers
      }
    };

    let postData = null;
    if (body) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Lakes International School API Test Suite ---');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✕ ${name}`);
      console.error('    Error:', err.message);
      failed++;
    }
  }

  // 1. School Info Test
  await test('GET /api/school returns valid school details', async () => {
    const res = await request('GET', '/api/school');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Lakes International School');
    assert.strictEqual(res.body.affiliation, 'CBSE Affiliation Number: 3530124');
    assert.ok(res.body.bankDetails, 'Bank details present');
  });

  // 2. Student List Test
  await test('GET /api/students returns 12+ student records', async () => {
    const res = await request('GET', '/api/students');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 12);
  });

  // 3. Verify Student (Success)
  await test('POST /api/students/verify with correct credentials succeeds', async () => {
    const res = await request('POST', '/api/students/verify', {
      admission: 'LIS2025001',
      dob: '2013-04-15'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.student.name, 'Aarav Sharma');
    assert.ok(Array.isArray(res.body.student.pendingMonths));
  });

  // 4. Verify Student (DOB mismatch)
  await test('POST /api/students/verify with wrong DOB returns 401', async () => {
    const res = await request('POST', '/api/students/verify', {
      admission: 'LIS2025001',
      dob: '2010-01-01'
    });
    assert.strictEqual(res.status, 401);
    assert.ok(res.body.error);
  });

  // 5. Generate QR Code Scanner
  await test('POST /api/fees/generate-qr returns dynamic UPI QR image and URI', async () => {
    const res = await request('POST', '/api/fees/generate-qr', {
      admission: 'LIS2025001',
      months: ['November', 'December']
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.totalAmount, 9000);
    assert.ok(res.body.qrDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(res.body.upiUri.startsWith('upi://pay'));
  });

  // 6. Submit Payment & Generate Receipt
  let generatedReceiptId = null;
  await test('POST /api/fees/pay records payment and returns official receipt', async () => {
    const res = await request('POST', '/api/fees/pay', {
      admission: 'LIS2025001',
      months: ['November'],
      paymentMethod: 'UPI / BharatQR Scanner',
      reference: 'TEST-REF-998877'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.receipt);
    assert.strictEqual(res.body.receipt.totalAmount, 4500);
    assert.ok(res.body.receipt.receiptId.startsWith('LIS-'));
    assert.ok(res.body.receipt.verificationQr);
    generatedReceiptId = res.body.receipt.receiptId;
  });

  // 7. Get Receipt by ID
  await test('GET /api/receipt/:receiptId retrieves receipt details', async () => {
    assert.ok(generatedReceiptId, 'Receipt ID should be defined');
    const res = await request('GET', `/api/receipt/${generatedReceiptId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.receiptId, generatedReceiptId);
    assert.strictEqual(res.body.admission, 'LIS2025001');
  });

  // 8. Admin Stats
  await test('GET /api/admin/stats returns valid metrics', async () => {
    const res = await request('GET', '/api/admin/stats');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.totalStudents >= 12);
    assert.ok(res.body.totalCollected >= 4500);
    assert.ok(typeof res.body.collectionRate === 'number');
  });

  // 9. Admin Export CSV
  await test('GET /api/admin/export/students returns CSV content', async () => {
    const res = await request('GET', '/api/admin/export/students');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(typeof res.body === 'string' && res.body.includes('Admission,Name'));
  });

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Give server time to listen
setTimeout(runTests, 500);
