// Global State
let currentStudent = null;
let selectedMonths = [];
let generatedQrData = null;
let cachedStudents = [];
let qrCountdownInterval = null;
let currentStudentHistory = [];

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();

  // Check if viewing receipt from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const viewReceiptId = urlParams.get('viewReceipt');
  if (viewReceiptId) {
    loadReceiptById(viewReceiptId);
    return;
  }

  // Check if student was passed from Admin or URL
  const testAdm = sessionStorage.getItem('test_adm');
  const testDob = sessionStorage.getItem('test_dob');
  if (testAdm && testDob) {
    sessionStorage.removeItem('test_adm');
    sessionStorage.removeItem('test_dob');
    document.getElementById('inputAdmission').value = testAdm;
    document.getElementById('inputDob').value = testDob;
    setTimeout(() => submitStudentDetails(), 400);
  }
});

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-weight: 800; font-size: 16px;">${icons[type] || '•'}</span>
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format money in INR
function formatINR(num) {
  return '₹' + Number(num || 0).toLocaleString('en-IN');
}

// Navigation helpers
function setupNavigation() {
  const menuBtn = document.getElementById('menuBtn');
  const navMenu = document.getElementById('navigation');
  if (menuBtn && navMenu) {
    menuBtn.addEventListener('click', () => {
      navMenu.classList.toggle('open');
    });
  }
}

function closeNav() {
  const navMenu = document.getElementById('navigation');
  if (navMenu) navMenu.classList.remove('open');
}

// Step Wizard Progress Updater
function setWizardStep(step) {
  const steps = [1, 2, 3, 4];
  steps.forEach(s => {
    const el = document.getElementById(`wizardStep${s}`);
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (s < step) el.classList.add('completed');
    if (s === step) el.classList.add('active');
  });
}

// Switch between fee payment panels
function showFeeStep(stepName) {
  const panels = ['stepVerification', 'stepMonths', 'stepScanner', 'stepReceipt'];
  panels.forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = 'none';
  });

  const activePanel = document.getElementById(stepName);
  if (activePanel) {
    activePanel.style.display = 'block';
    activePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ==========================================
// STEP 1 & 2: VERIFY ADMISSION NO + DOB
// ==========================================
async function submitStudentDetails(e) {
  if (e) e.preventDefault();

  const admissionInput = document.getElementById('inputAdmission');
  const dobInput = document.getElementById('inputDob');
  const alertEl = document.getElementById('verificationAlert');

  const admission = admissionInput.value.trim().toUpperCase();
  const dob = dobInput.value.trim();

  alertEl.style.display = 'none';
  alertEl.className = 'alert-box alert-error';

  if (!admission || !dob) {
    alertEl.textContent = 'Please enter both Admission Number (Addmo) and Date of Birth (DOB).';
    alertEl.style.display = 'block';
    showToast('Please provide both Admission Number and Date of Birth.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnVerifyStudent');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Verifying with School Records...';

  try {
    const res = await fetch('/api/students/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admission, dob })
    });

    const data = await res.json();

    if (!res.ok) {
      alertEl.textContent = data.error || 'Verification failed. Please check your credentials.';
      alertEl.style.display = 'block';
      showToast(data.error || 'Verification failed', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    // Success! Student verified
    currentStudent = data.student;
    currentStudentHistory = data.paymentHistory || [];

    renderStudentAndPendingMonths(currentStudent);
    renderStudentPaymentHistory(currentStudentHistory);

    showToast(`Welcome, ${currentStudent.name}! Details verified.`, 'success');
    setWizardStep(2);
    showFeeStep('stepMonths');
    switchStudentTab('pending');
  } catch (err) {
    console.error(err);
    alertEl.textContent = 'Network or server error while connecting to school database.';
    alertEl.style.display = 'block';
    showToast('Failed to connect with school database.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// ==========================================
// STEP 3: RENDER PENDING MONTHS & BREAKDOWN
// ==========================================
function renderStudentAndPendingMonths(student) {
  document.getElementById('summaryStudentName').textContent = student.name;
  document.getElementById('summaryAdmissionNo').textContent = student.admission;
  document.getElementById('summaryClass').textContent = `${student.className}-${student.section}`;
  document.getElementById('summaryParent').textContent = student.parent;
  document.getElementById('summaryMonthlyFee').textContent = formatINR(student.fee);

  // Breakdown preview
  if (student.feeBreakdown) {
    document.getElementById('breakdownTuition').textContent = formatINR(student.feeBreakdown.tuition);
    document.getElementById('breakdownLab').textContent = formatINR(student.feeBreakdown.computerLab);
    document.getElementById('breakdownSports').textContent = formatINR(student.feeBreakdown.sportsActivity);
  } else {
    document.getElementById('breakdownTuition').textContent = formatINR(Math.round(student.fee * 0.7));
    document.getElementById('breakdownLab').textContent = formatINR(Math.round(student.fee * 0.2));
    document.getElementById('breakdownSports').textContent = formatINR(Math.round(student.fee * 0.1));
  }

  const container = document.getElementById('pendingMonthsContainer');
  container.innerHTML = '';
  selectedMonths = [];

  const pendingList = student.pendingMonths || [];
  const paidList = student.paidMonths || [];

  if (pendingList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 22px; text-align: center; background: #eaf8f1; border-radius: 10px; color: #16845c; border: 1.5px dashed #a3e6cb;">
        <span style="font-size: 28px;">🎉</span>
        <div style="font-weight: 800; font-size: 16px; margin-top: 6px;">All Fees Cleared!</div>
        <p style="font-size: 13px; color: #1f3344; margin-top: 4px;">
          There are no pending fee dues for <strong>${student.name}</strong> for this session.
        </p>
      </div>
    `;
    document.getElementById('btnProceedToScanner').disabled = true;
    updateCalculatedAmount();
    return;
  }

  document.getElementById('btnProceedToScanner').disabled = false;

  // Render pending months with checkboxes
  pendingList.forEach(month => {
    const card = document.createElement('label');
    card.className = 'month-card';
    card.innerHTML = `
      <input type="checkbox" value="${month}" onchange="toggleMonthSelection(this)">
      <span>${month}</span>
      <span class="month-badge-pending">Pending</span>
    `;
    container.appendChild(card);
  });

  // Render already paid months (disabled) for reference
  paidList.forEach(month => {
    const card = document.createElement('div');
    card.className = 'month-card disabled';
    card.innerHTML = `
      <input type="checkbox" disabled checked>
      <span>${month}</span>
      <span class="month-badge-paid">Paid</span>
    `;
    container.appendChild(card);
  });

  // Pre-select first pending month by default for convenience
  const firstCheckbox = container.querySelector('input[type="checkbox"]:not([disabled])');
  if (firstCheckbox) {
    firstCheckbox.checked = true;
    toggleMonthSelection(firstCheckbox);
  } else {
    updateCalculatedAmount();
  }
}

function toggleMonthSelection(checkbox) {
  const month = checkbox.value;
  const parentCard = checkbox.closest('.month-card');

  if (checkbox.checked) {
    if (!selectedMonths.includes(month)) selectedMonths.push(month);
    if (parentCard) parentCard.classList.add('selected');
  } else {
    selectedMonths = selectedMonths.filter(m => m !== month);
    if (parentCard) parentCard.classList.remove('selected');
  }

  updateCalculatedAmount();
}

function selectAllPendingMonths() {
  if (!currentStudent) return;
  const checkboxes = document.querySelectorAll('#pendingMonthsContainer input[type="checkbox"]:not([disabled])');
  checkboxes.forEach(cb => {
    cb.checked = true;
    if (!selectedMonths.includes(cb.value)) selectedMonths.push(cb.value);
    const card = cb.closest('.month-card');
    if (card) card.classList.add('selected');
  });
  updateCalculatedAmount();
  showToast('All pending months selected', 'info');
}

function selectQuarter(q) {
  if (!currentStudent) return;
  const quarterMap = {
    'Q1': ['April', 'May', 'June'],
    'Q2': ['July', 'August', 'September'],
    'Q3': ['October', 'November', 'December'],
    'Q4': ['January', 'February', 'March']
  };

  const targetMonths = quarterMap[q] || [];
  let selectedCount = 0;

  const checkboxes = document.querySelectorAll('#pendingMonthsContainer input[type="checkbox"]:not([disabled])');
  checkboxes.forEach(cb => {
    const card = cb.closest('.month-card');
    if (targetMonths.includes(cb.value)) {
      cb.checked = true;
      if (!selectedMonths.includes(cb.value)) selectedMonths.push(cb.value);
      if (card) card.classList.add('selected');
      selectedCount++;
    } else {
      cb.checked = false;
      selectedMonths = selectedMonths.filter(m => m !== cb.value);
      if (card) card.classList.remove('selected');
    }
  });

  updateCalculatedAmount();
  if (selectedCount > 0) {
    showToast(`${q} (${targetMonths.join(', ')}) selected!`, 'info');
  } else {
    showToast(`No pending dues in ${q} for this student.`, 'info');
  }
}

function clearMonthSelection() {
  selectedMonths = [];
  const checkboxes = document.querySelectorAll('#pendingMonthsContainer input[type="checkbox"]:not([disabled])');
  checkboxes.forEach(cb => {
    cb.checked = false;
    const card = cb.closest('.month-card');
    if (card) card.classList.remove('selected');
  });
  updateCalculatedAmount();
}

function updateCalculatedAmount() {
  if (!currentStudent) return;
  const count = selectedMonths.length;
  const total = count * currentStudent.fee;

  document.getElementById('selectedMonthsCount').textContent =
    count === 0 ? '0 months selected' : `${count} month${count > 1 ? 's' : ''} (${selectedMonths.join(', ')})`;
  document.getElementById('payableTotalAmount').textContent = formatINR(total);

  const proceedBtn = document.getElementById('btnProceedToScanner');
  proceedBtn.disabled = (count === 0);
}

// Student profile tabs: Pending vs Past History
function switchStudentTab(tab) {
  const pendingBtn = document.getElementById('tabPendingMonthsBtn');
  const historyBtn = document.getElementById('tabPastReceiptsBtn');
  const pendingContent = document.getElementById('tabContentPending');
  const historyContent = document.getElementById('tabContentHistory');

  if (tab === 'pending') {
    pendingBtn.classList.add('active');
    historyBtn.classList.remove('active');
    pendingContent.style.display = 'block';
    historyContent.style.display = 'none';
  } else {
    pendingBtn.classList.remove('active');
    historyBtn.classList.add('active');
    pendingContent.style.display = 'none';
    historyContent.style.display = 'block';
  }
}

function renderStudentPaymentHistory(payments) {
  const countEl = document.getElementById('pastReceiptsCount');
  if (countEl) countEl.textContent = payments.length;

  const container = document.getElementById('studentReceiptsHistoryList');
  if (!container) return;

  if (!payments || payments.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); background: #f8fafc; border-radius: 8px;">
        No prior payments found in the school digital records for this student.
      </div>
    `;
    return;
  }

  container.innerHTML = payments.map(p => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
      <div>
        <strong style="color: var(--navy); font-size: 14px;">Receipt #${p.receiptId}</strong>
        <div style="font-size: 12px; color: var(--text-muted);">
          Months Paid: <strong style="color: var(--navy);">${(p.months || []).join(', ')}</strong> | Date: ${new Date(p.timestamp).toLocaleDateString()}
        </div>
        <div style="font-size: 13px; color: var(--green); font-weight: 700; margin-top: 2px;">
          ${formatINR(p.totalAmount)} (${p.paymentMethod})
        </div>
      </div>
      <div>
        <button class="btn btn-navy btn-sm" onclick="loadReceiptById('${p.receiptId}')">
          View / Print Receipt 🖨️
        </button>
      </div>
    </div>
  `).join('');
}

// ==========================================
// STEP 4: GENERATE SCANNER (QR CODE)
// ==========================================
async function proceedToScanner() {
  if (!currentStudent || selectedMonths.length === 0) {
    showToast('Please select at least one pending fee month.', 'error');
    return;
  }

  const btn = document.getElementById('btnProceedToScanner');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Generating Payment Scanner...';

  try {
    const res = await fetch('/api/fees/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admission: currentStudent.admission,
        months: selectedMonths
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to generate payment scanner.', 'error');
      return;
    }

    generatedQrData = data;

    // Populate Step 3 Scanner UI
    document.getElementById('scannerQrImage').src = data.qrDataUrl;
    document.getElementById('scannerPayableAmount').textContent = formatINR(data.totalAmount);
    document.getElementById('scannerStudentName').textContent = data.studentName;
    document.getElementById('scannerAdmissionNo').textContent = data.admission;
    document.getElementById('scannerSelectedMonths').textContent = data.months.join(', ');
    document.getElementById('scannerUpiId').textContent = data.upiId;

    // Set mobile UPI intent link
    const mobileLink = document.getElementById('scannerMobileUpiLink');
    if (mobileLink) {
      mobileLink.href = data.upiUri;
    }

    startQrCountdown(300); // 5 minutes
    setWizardStep(3);
    showFeeStep('stepScanner');
    switchPaymentModeTab('upi');
    showToast('Payment QR Scanner generated successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to connect with payment gateway.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Payment Mode Tabs inside Step 3
function switchPaymentModeTab(mode) {
  const upiBtn = document.getElementById('tabUpiScannerBtn');
  const bankBtn = document.getElementById('tabBankDetailsBtn');
  const upiDiv = document.getElementById('paymentModeUpi');
  const bankDiv = document.getElementById('paymentModeBank');

  if (mode === 'upi') {
    upiBtn.classList.add('active');
    bankBtn.classList.remove('active');
    upiDiv.style.display = 'block';
    bankDiv.style.display = 'none';
  } else {
    upiBtn.classList.remove('active');
    bankBtn.classList.add('active');
    upiDiv.style.display = 'none';
    bankDiv.style.display = 'block';
  }
}

// QR Countdown Timer
function startQrCountdown(seconds) {
  if (qrCountdownInterval) clearInterval(qrCountdownInterval);
  let timeLeft = seconds;
  const display = document.getElementById('scannerTimerDisplay');

  function update() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    if (display) display.textContent = `${m}:${s}`;
    if (timeLeft <= 0) {
      clearInterval(qrCountdownInterval);
      if (display) display.textContent = 'Expired - Please refresh';
    }
    timeLeft--;
  }
  update();
  qrCountdownInterval = setInterval(update, 1000);
}

function copyUpiId() {
  if (!generatedQrData) return;
  copyText(generatedQrData.upiId, 'UPI ID');
}

function copyText(text, label = 'Text') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} copied to clipboard!`, 'success');
  }).catch(() => {
    prompt(`Copy ${label}:`, text);
  });
}

// ==========================================
// STEP 5: CONFIRM PAYMENT & RECEIPT
// ==========================================
async function confirmPaymentSubmission() {
  if (!currentStudent || !generatedQrData) return;

  const btn = document.getElementById('btnConfirmPayment');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Verifying and Generating Receipt...';

  const refInput = document.getElementById('inputTransactionRef');
  const reference = refInput ? refInput.value.trim() : '';

  const formData = new FormData();
  formData.append('admission', currentStudent.admission);
  formData.append('months', JSON.stringify(selectedMonths));
  formData.append('reference', reference || `UPI-APP-${Date.now().toString().slice(-7)}`);
  formData.append('paymentMethod', 'UPI / BharatQR Scanner');

  const fileInput = document.getElementById('inputProofScreenshot');
  if (fileInput && fileInput.files[0]) {
    formData.append('screenshot', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/fees/pay', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to submit payment.', 'error');
      return;
    }

    if (qrCountdownInterval) clearInterval(qrCountdownInterval);

    // Success! Render Official Receipt
    renderOfficialReceipt(data.receipt);
    setWizardStep(4);
    showFeeStep('stepReceipt');
    launchConfetti();
    showToast('Payment successful! Official receipt generated.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Payment submission encountered an error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

let currentReceiptData = null;

function renderOfficialReceipt(receipt) {
  currentReceiptData = receipt;
  document.getElementById('receiptNo').textContent = receipt.receiptId;
  document.getElementById('receiptDate').textContent = new Date(receipt.timestamp).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  document.getElementById('receiptStudentName').textContent = receipt.studentName;
  document.getElementById('receiptAdmission').textContent = receipt.admission;
  document.getElementById('receiptClass').textContent = receipt.className;
  document.getElementById('receiptParent').textContent = receipt.parentName;
  document.getElementById('receiptMethod').textContent = receipt.paymentMethod;
  document.getElementById('receiptRef').textContent = receipt.reference;

  // Breakdown items
  const tableBody = document.getElementById('receiptItemsBody');
  tableBody.innerHTML = '';

  const bd = receipt.feeBreakdown || {
    tuition: Math.round(receipt.monthlyFee * 0.7),
    computerLab: Math.round(receipt.monthlyFee * 0.2),
    sportsActivity: Math.round(receipt.monthlyFee * 0.1)
  };

  receipt.months.forEach(month => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>Tuition Fee — ${month}</strong></td>
      <td style="color: var(--text-muted); font-size: 11px;">
        Tuition: ${formatINR(bd.tuition)} | Lab: ${formatINR(bd.computerLab)} | Sports: ${formatINR(bd.sportsActivity)}
      </td>
      <td style="text-align: right; font-weight: 700; color: var(--navy);">${formatINR(receipt.monthlyFee)}</td>
    `;
    tableBody.appendChild(row);
  });

  document.getElementById('receiptTotalAmount').textContent = formatINR(receipt.totalAmount);

  // Verification QR
  const qrImg = document.getElementById('receiptVerificationQrImg');
  if (qrImg) {
    if (receipt.verificationQr) {
      qrImg.src = receipt.verificationQr;
      qrImg.style.display = 'block';
    } else {
      qrImg.style.display = 'none';
    }
  }
}

function shareReceiptWhatsApp() {
  if (!currentReceiptData) {
    showToast('No receipt data to share.', 'error');
    return;
  }

  const r = currentReceiptData;
  const msg = 
`*Lakes International School, Bhimtal*
*Official CBSE Fee Payment Receipt*
---------------------------------------
📄 *Receipt No:* ${r.receiptId}
👤 *Student:* ${r.studentName} (${r.admission})
🏫 *Class:* ${r.className}
👨‍👩‍👦 *Parent:* ${r.parentName}
📅 *Months:* ${(r.months || []).join(', ')}
💰 *Total Amount:* ${formatINR(r.totalAmount)}
💳 *Payment Mode:* ${r.paymentMethod}
🔖 *Ref / UTR:* ${r.reference}
🗓️ *Date:* ${new Date(r.timestamp).toLocaleDateString()}
---------------------------------------
CBSE Affiliation: 3530124 | School Code: 81358
Eligible for Tax Exemption under Sec 80C.
Verify: ${window.location.origin}/?viewReceipt=${encodeURIComponent(r.receiptId)}#fees`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#e3b75d', '#16845c', '#0c5278', '#c0392b', '#9b59b6', '#3498db'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.transform = `scale(${Math.random() * 0.8 + 0.5})`;
    container.appendChild(piece);
  }

  setTimeout(() => { container.innerHTML = ''; }, 3500);
}

function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  if (item) {
    item.classList.toggle('open');
  }
}

function printReceipt() {
  window.print();
}

function startAnotherPayment() {
  currentStudent = null;
  selectedMonths = [];
  generatedQrData = null;
  if (qrCountdownInterval) clearInterval(qrCountdownInterval);

  document.getElementById('inputAdmission').value = '';
  document.getElementById('inputDob').value = '';
  document.getElementById('inputTransactionRef').value = '';
  document.getElementById('inputProofScreenshot').value = '';

  setWizardStep(1);
  showFeeStep('stepVerification');
}

// ==========================================
// RECEIPT LOOKUP MODAL
// ==========================================
function openReceiptLookupModal() {
  document.getElementById('receiptLookupModal').style.display = 'flex';
}

function closeReceiptLookupModal() {
  document.getElementById('receiptLookupModal').style.display = 'none';
}

async function searchReceiptById(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('inputSearchReceiptId');
  const receiptId = input.value.trim().toUpperCase();

  if (!receiptId) return;

  const btn = document.getElementById('btnSearchReceipt');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Searching...';

  try {
    const res = await fetch(`/api/receipt/${encodeURIComponent(receiptId)}`);
    const receipt = await res.json();

    if (!res.ok) {
      showToast(receipt.error || 'Receipt not found.', 'error');
      return;
    }

    closeReceiptLookupModal();
    renderOfficialReceipt(receipt);
    setWizardStep(4);
    showFeeStep('stepReceipt');
    showToast(`Receipt #${receipt.receiptId} loaded!`, 'success');
  } catch (err) {
    showToast('Failed to retrieve receipt.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function loadReceiptById(receiptId) {
  try {
    const res = await fetch(`/api/receipt/${encodeURIComponent(receiptId)}`);
    const receipt = await res.json();
    if (!res.ok) {
      showToast(receipt.error || 'Receipt not found', 'error');
      return;
    }
    renderOfficialReceipt(receipt);
    setWizardStep(4);
    showFeeStep('stepReceipt');
  } catch (e) {
    showToast('Could not load receipt details.', 'error');
  }
}

// ==========================================
// DEMO HELPER: 12 STUDENT RECORDS MODAL
// ==========================================
async function loadAllStudents() {
  try {
    const res = await fetch('/api/students');
    cachedStudents = await res.json();
    populateDemoModalTable(cachedStudents);
  } catch (err) {
    console.warn('Could not preload students list', err);
  }
}

function openDemoModal() {
  const modal = document.getElementById('demoModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const searchInput = document.getElementById('demoSearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  populateDemoModalTable(cachedStudents);
}

function closeDemoModal() {
  const modal = document.getElementById('demoModal');
  if (modal) modal.style.display = 'none';
}

function populateDemoModalTable(students) {
  const tbody = document.getElementById('demoStudentsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!students || students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px;">No student records found.</td></tr>';
    return;
  }

  students.forEach((s) => {
    const hasPending = (s.pendingMonths && s.pendingMonths.length > 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.admission}</strong></td>
      <td>${s.name}</td>
      <td>${s.className}-${s.section}</td>
      <td><code>${s.dob}</code></td>
      <td>${formatINR(s.fee)}</td>
      <td>
        ${hasPending
        ? `<span style="color:#b43403; font-weight:600;">${s.pendingMonths.join(', ')}</span>`
        : `<span style="color:#166534; font-weight:600; background:#dcfce7; padding:2px 6px; border-radius:4px;">Dues Cleared</span>`
      }
      </td>
      <td>
        <button class="btn btn-navy btn-sm" onclick="selectDemoStudent('${s.admission}', '${s.dob}')">
          Autofill & Test →
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterDemoStudents(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    populateDemoModalTable(cachedStudents);
    return;
  }

  const filtered = cachedStudents.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.admission.toLowerCase().includes(q) ||
    `${s.className}-${s.section}`.toLowerCase().includes(q)
  );
  populateDemoModalTable(filtered);
}

function selectDemoStudent(admission, dob) {
  closeDemoModal();
  document.getElementById('inputAdmission').value = admission;
  document.getElementById('inputDob').value = dob;

  const feeSection = document.getElementById('fees');
  if (feeSection) feeSection.scrollIntoView({ behavior: 'smooth' });

  submitStudentDetails();
}
