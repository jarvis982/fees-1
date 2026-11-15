const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for screenshot uploads with validation
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png';
    cb(null, `proof-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

// Helper to read/write JSON files safely
const readJson = (file) => {
  const filePath = path.join(__dirname, 'data', file);
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return file.endsWith('s.json') ? [] : {};
  }
};

const writeJson = (file, data) => {
  const filePath = path.join(__dirname, 'data', file);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
};

// Date normalization helper supporting YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY
const normalizeDate = (d) => {
  if (!d) return '';
  const clean = d.trim();
  const parts = clean.split(/[-/.]/);
  if (parts.length < 3) return clean;

  if (parts[0].length === 4) {
    // YYYY-MM-DD
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  } else if (parts[2].length === 4) {
    // DD-MM-YYYY
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return clean;
};

// Helper: Generate verification QR code for receipts
async function generateReceiptVerificationQr(receiptId, admission, amount) {
  try {
    const verificationText = `VERIFIED: Lakes International School Fee Receipt ${receiptId} | Addmo: ${admission} | Amount: INR ${amount}`;
    return await QRCode.toDataURL(verificationText, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 140,
      color: { dark: '#082e4b', light: '#ffffff' }
    });
  } catch (e) {
    return null;
  }
}

// ========================
// API ENDPOINTS
// ========================

// 1. Get School Info
app.get('/api/school', (req, res) => {
  try {
    const school = readJson('school.json');
    res.json(school);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load school info' });
  }
});

// 2. Get All Student Records
app.get('/api/students', (req, res) => {
  try {
    const students = readJson('students.json');
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student records' });
  }
});

// 3. Step 3 & 4: Verify Student Details (Admission No + DOB)
app.post('/api/students/verify', (req, res) => {
  const { admission, dob } = req.body;

  if (!admission || !dob) {
    return res.status(400).json({ error: 'Please enter both Admission Number and Date of Birth.' });
  }

  const cleanAdmission = admission.trim().toUpperCase();
  const cleanDob = dob.trim();

  const students = readJson('students.json');
  const student = students.find(s => s.admission.toUpperCase() === cleanAdmission);

  if (!student) {
    return res.status(404).json({
      error: `Admission Number "${cleanAdmission}" was not found in the official school database.`
    });
  }

  if (normalizeDate(student.dob) !== normalizeDate(cleanDob)) {
    return res.status(401).json({
      error: 'Date of Birth does not match official school records for this Admission Number.'
    });
  }

  // Also fetch any existing payment receipts for this student
  const payments = readJson('payments.json');
  const studentPayments = payments.filter(p => p.admission.toUpperCase() === cleanAdmission);

  res.json({
    success: true,
    student: {
      admission: student.admission,
      name: student.name,
      className: student.className,
      section: student.section,
      parent: student.parent,
      phone: student.phone,
      email: student.email || '',
      busRoute: student.busRoute || '',
      dob: student.dob,
      fee: student.fee,
      feeBreakdown: student.feeBreakdown || null,
      pendingMonths: student.pendingMonths || [],
      paidMonths: student.paidMonths || []
    },
    paymentHistory: studentPayments
  });
});

// 4. Step 5 & 6: Generate Dynamic Payment QR Code Scanner
app.post('/api/fees/generate-qr', async (req, res) => {
  const { admission, months } = req.body;

  if (!admission || !months || !Array.isArray(months) || months.length === 0) {
    return res.status(400).json({ error: 'Please select at least one pending fee month.' });
  }

  const students = readJson('students.json');
  const student = students.find(s => s.admission.toUpperCase() === admission.trim().toUpperCase());

  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const school = readJson('school.json');
  const totalAmount = student.fee * months.length;

  // Build UPI URI standard string
  // upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&cu=INR&tn=<NOTE>
  const note = `Fee ${student.admission} (${months.join(', ')})`;
  const upiUri = `upi://pay?pa=${encodeURIComponent(school.upiId)}&pn=${encodeURIComponent(school.merchantName)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      width: 320,
      color: {
        dark: '#082e4b',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      admission: student.admission,
      studentName: student.name,
      className: `${student.className}-${student.section}`,
      parentName: student.parent,
      monthlyFee: student.fee,
      feeBreakdown: student.feeBreakdown || null,
      months,
      totalAmount,
      upiId: school.upiId,
      merchantName: school.merchantName,
      bankDetails: school.bankDetails || null,
      upiUri,
      qrDataUrl
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR payment scanner' });
  }
});

// 5. Submit Payment & Generate Official Receipt
app.post('/api/fees/pay', (req, res) => {
  upload.single('screenshot')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error processing file upload.' });
    }

    try {
      const { admission, reference, paymentMethod } = req.body;
      let months = req.body.months;

      if (typeof months === 'string') {
        try {
          months = JSON.parse(months);
        } catch (e) {
          months = months.split(',').map(m => m.trim()).filter(Boolean);
        }
      }

      if (!admission || !months || !Array.isArray(months) || months.length === 0) {
        return res.status(400).json({ error: 'Invalid fee submission details. Please select months.' });
      }

      const students = readJson('students.json');
      const studentIdx = students.findIndex(s => s.admission.toUpperCase() === admission.trim().toUpperCase());

      if (studentIdx === -1) {
        return res.status(404).json({ error: 'Student not found in school records.' });
      }

      const student = students[studentIdx];
      const totalAmount = student.fee * months.length;
      const receiptId = `LIS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      const screenshotPath = req.file ? `/uploads/${req.file.filename}` : null;
      const verificationQr = await generateReceiptVerificationQr(receiptId, student.admission, totalAmount);

      // Create official payment entry
      const payment = {
        receiptId,
        admission: student.admission,
        studentName: student.name,
        className: `${student.className}-${student.section}`,
        parentName: student.parent,
        phone: student.phone || '',
        months,
        monthlyFee: student.fee,
        feeBreakdown: student.feeBreakdown || null,
        totalAmount,
        paymentMethod: paymentMethod || 'UPI / BharatQR Scanner',
        reference: reference || `UPI-APP-${Date.now().toString().slice(-7)}`,
        screenshot: screenshotPath,
        verificationQr,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS'
      };

      // Update student's pending and paid months
      student.pendingMonths = (student.pendingMonths || []).filter(m => !months.includes(m));
      student.paidMonths = Array.from(new Set([...(student.paidMonths || []), ...months]));

      // Save updated student records and payments
      students[studentIdx] = student;
      writeJson('students.json', students);

      const payments = readJson('payments.json');
      payments.unshift(payment);
      writeJson('payments.json', payments);

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        receipt: payment,
        remainingPendingMonths: student.pendingMonths
      });
    } catch (err) {
      console.error('Payment submission error:', err);
      res.status(500).json({ error: 'Failed to process payment.' });
    }
  });
});

// 6. Get Receipts List
app.get('/api/receipts-list', (req, res) => {
  try {
    const payments = readJson('payments.json');
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// 7. Get Receipt by ID
app.get('/api/receipt/:receiptId', async (req, res) => {
  try {
    const payments = readJson('payments.json');
    const receipt = payments.find(p => p.receiptId.toUpperCase() === req.params.receiptId.trim().toUpperCase());
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found.' });
    }
    if (!receipt.verificationQr) {
      receipt.verificationQr = await generateReceiptVerificationQr(receipt.receiptId, receipt.admission, receipt.totalAmount);
    }
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

// 8. Get Receipts by Student Admission No
app.get('/api/students/:admission/receipts', (req, res) => {
  try {
    const payments = readJson('payments.json');
    const filtered = payments.filter(p => p.admission.toUpperCase() === req.params.admission.trim().toUpperCase());
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch student receipts' });
  }
});

// 9. Admin Statistics Dashboard Data
app.get('/api/admin/stats', (req, res) => {
  try {
    const students = readJson('students.json');
    const payments = readJson('payments.json');

    const totalStudents = students.length;
    const totalCollected = payments.reduce((acc, p) => acc + (Number(p.totalAmount) || 0), 0);

    let totalPendingAmount = 0;
    let studentsWithPending = 0;
    let studentsDuesCleared = 0;

    students.forEach(s => {
      const pendingCount = (s.pendingMonths || []).length;
      if (pendingCount > 0) {
        totalPendingAmount += pendingCount * (s.fee || 0);
        studentsWithPending++;
      } else {
        studentsDuesCleared++;
      }
    });

    const totalExpected = totalCollected + totalPendingAmount;
    const collectionRate = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : 0;

    res.json({
      totalStudents,
      totalCollected,
      totalPendingAmount,
      studentsWithPending,
      studentsDuesCleared,
      totalPaymentsCount: payments.length,
      collectionRate: Number(collectionRate)
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to compute admin statistics' });
  }
});

// 10. Admin: Add New Student Record
app.post('/api/admin/students', (req, res) => {
  try {
    const { admission, name, dob, className, section, parent, phone, email, fee, pendingMonths } = req.body;

    if (!admission || !name || !dob || !className || !section || !fee) {
      return res.status(400).json({ error: 'Admission, Name, DOB, Class, Section, and Monthly Fee are required.' });
    }

    const cleanAdmission = admission.trim().toUpperCase();
    const students = readJson('students.json');

    if (students.some(s => s.admission.toUpperCase() === cleanAdmission)) {
      return res.status(409).json({ error: `Student with Admission No. "${cleanAdmission}" already exists.` });
    }

    const parsedFee = Number(fee);
    const newStudent = {
      admission: cleanAdmission,
      name: name.trim(),
      dob: normalizeDate(dob),
      className: className.trim(),
      section: section.trim().toUpperCase(),
      parent: (parent || '').trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      busRoute: (req.body.busRoute || '').trim(),
      fee: parsedFee,
      feeBreakdown: {
        tuition: Math.round(parsedFee * 0.7),
        computerLab: Math.round(parsedFee * 0.2),
        sportsActivity: Math.round(parsedFee * 0.1)
      },
      pendingMonths: Array.isArray(pendingMonths) ? pendingMonths : ['April', 'May', 'June'],
      paidMonths: []
    };

    students.push(newStudent);
    writeJson('students.json', students);

    res.status(201).json({ success: true, message: 'Student added successfully', student: newStudent });
  } catch (err) {
    console.error('Add student error:', err);
    res.status(500).json({ error: 'Failed to add student record' });
  }
});

// 11. Admin: Update Existing Student Record
app.put('/api/admin/students/:admission', (req, res) => {
  try {
    const admissionParam = req.params.admission.trim().toUpperCase();
    const students = readJson('students.json');
    const idx = students.findIndex(s => s.admission.toUpperCase() === admissionParam);

    if (idx === -1) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const s = students[idx];
    const { name, dob, className, section, parent, phone, email, fee, pendingMonths, paidMonths, busRoute } = req.body;

    if (name) s.name = name.trim();
    if (dob) s.dob = normalizeDate(dob);
    if (className) s.className = className.trim();
    if (section) s.section = section.trim().toUpperCase();
    if (parent !== undefined) s.parent = parent.trim();
    if (phone !== undefined) s.phone = phone.trim();
    if (email !== undefined) s.email = email.trim();
    if (busRoute !== undefined) s.busRoute = busRoute.trim();
    if (fee !== undefined && !isNaN(Number(fee))) {
      s.fee = Number(fee);
      s.feeBreakdown = {
        tuition: Math.round(s.fee * 0.7),
        computerLab: Math.round(s.fee * 0.2),
        sportsActivity: Math.round(s.fee * 0.1)
      };
    }
    if (Array.isArray(pendingMonths)) s.pendingMonths = pendingMonths;
    if (Array.isArray(paidMonths)) s.paidMonths = paidMonths;

    students[idx] = s;
    writeJson('students.json', students);

    res.json({ success: true, message: 'Student updated successfully', student: s });
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// 12. Admin: Delete Student Record
app.delete('/api/admin/students/:admission', (req, res) => {
  try {
    const admissionParam = req.params.admission.trim().toUpperCase();
    const students = readJson('students.json');
    const filtered = students.filter(s => s.admission.toUpperCase() !== admissionParam);

    if (filtered.length === students.length) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    writeJson('students.json', filtered);
    res.json({ success: true, message: `Student ${admissionParam} deleted successfully.` });
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// 13. Admin: Export Data to CSV
app.get('/api/admin/export/:type', (req, res) => {
  const type = req.params.type;
  if (type === 'students') {
    const students = readJson('students.json');
    let csv = 'Admission,Name,Class,Section,Parent,Phone,Monthly Fee,Pending Months,Paid Months\n';
    students.forEach(s => {
      csv += `"${s.admission}","${s.name}","${s.className}","${s.section}","${s.parent}","${s.phone}","${s.fee}","${(s.pendingMonths||[]).join(';')}","${(s.paidMonths||[]).join(';')}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="LIS_Students_Records.csv"');
    return res.send(csv);
  } else if (type === 'payments') {
    const payments = readJson('payments.json');
    let csv = 'Receipt ID,Admission,Student Name,Class,Parent,Total Amount,Months Paid,Payment Method,Reference,Timestamp\n';
    payments.forEach(p => {
      csv += `"${p.receiptId}","${p.admission}","${p.studentName}","${p.className}","${p.parentName}","${p.totalAmount}","${(p.months||[]).join(';')}","${p.paymentMethod}","${p.reference}","${p.timestamp}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="LIS_Fee_Payments_Report.csv"');
    return res.send(csv);
  }
  res.status(400).send('Invalid export type. Use "students" or "payments".');
});

// 14. Reset Student Records (for testing / demo)
app.post('/api/admin/reset', (req, res) => {
  try {
    const original = [
      { "admission": "LIS2025001", "name": "Aarav Sharma", "dob": "2013-04-15", "gender": "Male", "className": "VI", "section": "A", "parent": "Rohan Sharma", "phone": "+91 98765 43210", "email": "rohan.sharma@gmail.com", "busRoute": "Route 3 - Bhowali to Bhimtal", "fee": 4500, "feeBreakdown": { "tuition": 3200, "computerLab": 800, "sportsActivity": 500 }, "pendingMonths": ["November", "December"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October"] },
      { "admission": "LIS2025002", "name": "Ananya Verma", "dob": "2012-08-22", "gender": "Female", "className": "VII", "section": "B", "parent": "Suresh Verma", "phone": "+91 98765 43211", "email": "suresh.verma@yahoo.com", "busRoute": "Route 1 - Nainital Mall Road", "fee": 4800, "feeBreakdown": { "tuition": 3400, "computerLab": 900, "sportsActivity": 500 }, "pendingMonths": ["October", "November", "December"], "paidMonths": ["April", "May", "June", "July", "August", "September"] },
      { "admission": "LIS2025003", "name": "Vivaan Joshi", "dob": "2011-01-10", "gender": "Male", "className": "VIII", "section": "A", "parent": "Manish Joshi", "phone": "+91 98765 43212", "email": "m.joshi@outlook.com", "busRoute": "Self / Parent Drop", "fee": 5200, "feeBreakdown": { "tuition": 3700, "computerLab": 1000, "sportsActivity": 500 }, "pendingMonths": ["December"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October", "November"] },
      { "admission": "LIS2025004", "name": "Diya Singh", "dob": "2014-11-05", "gender": "Female", "className": "V", "section": "C", "parent": "Amit Singh", "phone": "+91 98765 43213", "email": "amit.singh@rediffmail.com", "busRoute": "Route 2 - Sattal Chowk", "fee": 4200, "feeBreakdown": { "tuition": 3000, "computerLab": 700, "sportsActivity": 500 }, "pendingMonths": ["November", "December", "January"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October"] },
      { "admission": "LIS2025005", "name": "Advik Mehta", "dob": "2010-06-18", "gender": "Male", "className": "IX", "section": "A", "parent": "Kunal Mehta", "phone": "+91 98765 43214", "email": "kunal.mehta@gmail.com", "busRoute": "Route 4 - Haldwani Bypass", "fee": 5600, "feeBreakdown": { "tuition": 4000, "computerLab": 1100, "sportsActivity": 500 }, "pendingMonths": ["September", "October", "November"], "paidMonths": ["April", "May", "June", "July", "August"] },
      { "admission": "LIS2025006", "name": "Myra Kapoor", "dob": "2015-03-27", "gender": "Female", "className": "IV", "section": "B", "parent": "Nitin Kapoor", "phone": "+91 98765 43215", "email": "nitin.kapoor@gmail.com", "busRoute": "Route 3 - Bhowali to Bhimtal", "fee": 3900, "feeBreakdown": { "tuition": 2800, "computerLab": 600, "sportsActivity": 500 }, "pendingMonths": ["November", "December"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October"] },
      { "admission": "LIS2025007", "name": "Ishaan Gupta", "dob": "2009-09-12", "gender": "Male", "className": "X", "section": "A", "parent": "Rahul Gupta", "phone": "+91 98765 43216", "email": "rahul.gupta@corp.in", "busRoute": "Route 5 - Kathgodam Station Road", "fee": 6000, "feeBreakdown": { "tuition": 4300, "computerLab": 1200, "sportsActivity": 500 }, "pendingMonths": ["December"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October", "November"] },
      { "admission": "LIS2025008", "name": "Sara Khan", "dob": "2013-12-01", "gender": "Female", "className": "VI", "section": "B", "parent": "Imran Khan", "phone": "+91 98765 43217", "email": "imran.khan@gmail.com", "busRoute": "Route 2 - Sattal Chowk", "fee": 4500, "feeBreakdown": { "tuition": 3200, "computerLab": 800, "sportsActivity": 500 }, "pendingMonths": ["October", "November"], "paidMonths": ["April", "May", "June", "July", "August", "September"] },
      { "admission": "LIS2025009", "name": "Reyansh Das", "dob": "2011-07-19", "gender": "Male", "className": "VIII", "section": "C", "parent": "Arun Das", "phone": "+91 98765 43218", "email": "arun.das@gmail.com", "busRoute": "Route 1 - Nainital Mall Road", "fee": 5200, "feeBreakdown": { "tuition": 3700, "computerLab": 1000, "sportsActivity": 500 }, "pendingMonths": ["November", "December"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October"] },
      { "admission": "LIS2025010", "name": "Aadhya Patel", "dob": "2012-02-14", "gender": "Female", "className": "VII", "section": "A", "parent": "Jay Patel", "phone": "+91 98765 43219", "email": "jay.patel@outlook.com", "busRoute": "Route 3 - Bhowali to Bhimtal", "fee": 4800, "feeBreakdown": { "tuition": 3400, "computerLab": 900, "sportsActivity": 500 }, "pendingMonths": ["November"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October"] },
      { "admission": "LIS2025011", "name": "Kabir Rawat", "dob": "2008-10-30", "gender": "Male", "className": "XI", "section": "A", "parent": "Deepak Rawat", "phone": "+91 98765 43220", "email": "deepak.rawat@gov.in", "busRoute": "Self / Parent Drop", "fee": 6500, "feeBreakdown": { "tuition": 4700, "computerLab": 1300, "sportsActivity": 500 }, "pendingMonths": ["October", "November", "December"], "paidMonths": ["April", "May", "June", "July", "August", "September"] },
      { "admission": "LIS2025012", "name": "Meera Thapa", "dob": "2014-05-25", "gender": "Female", "className": "V", "section": "A", "parent": "Sanjay Thapa", "phone": "+91 98765 43221", "email": "sanjay.thapa@gmail.com", "busRoute": "Route 2 - Sattal Chowk", "fee": 4200, "feeBreakdown": { "tuition": 3000, "computerLab": 700, "sportsActivity": 500 }, "pendingMonths": ["December"], "paidMonths": ["April", "May", "June", "July", "August", "September", "October", "November"] }
    ];
    writeJson('students.json', original);
    writeJson('payments.json', []);
    res.json({ success: true, message: 'All 12 student records and payment history have been reset.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset student records' });
  }
});

// Fallback to index.html for non-API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled application error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Lakes International School Fee System running at http://localhost:${PORT}`);
});
