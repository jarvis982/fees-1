# Lakes International School — Online Fee Payment System

A full-stack, production-ready, responsive web application implementing the exact flowchart requirements for **Lakes International School (LIS), Bhimtal** fee payment workflow.

---

## 🎯 Flowchart Steps Implemented & Major Improvements

1. **Step 1 - Open School Website:**
   - Displays **S.P (School Portal)** badge and **Lakes International School** branding.
   - Hero banner with scenic Himalayan campus imagery and prominent **"Pay Fees Now"** button.
   - Comprehensive school website (About, Facilities, Campus Gallery, Contact, CBSE Affiliation 3530124, School Code 81358).

2. **Step 2 - Click on Pay Fees:**
   - Smoothly redirects/scrolls to the Fee Portal and opens the 4-step wizard.

3. **Step 3 & 4 - Enter Student Details:**
   - Asks for:
     - **Addmo:** (Admission Number, e.g., `LIS2025001`)
     - **DOB:** (Date of Birth, e.g., `2013-04-15`)
   - Robust date parser supporting `YYYY-MM-DD`, `DD-MM-YYYY`, and `DD/MM/YYYY`.
   - Validates credentials against the school records database.

4. **Step 5 - Redirect Again (Which month Fees Pending?):**
   - Displays verified student profile (Name, Class, Section, Parent Name, Phone, Monthly Fee, Academic Session 2025-2026).
   - **Tab 1: Pending Dues:**
     - Dynamically displays that student's **Pending Months** (e.g., *November, December*).
     - Individual and "Select All Pending" multi-select options.
     - Real-time calculated payable amount and itemized fee breakdown (Tuition, Computer & STEM Lab, Sports & Extracurricular).
   - **Tab 2: Past Payment Receipts:**
     - Lists all previous payments made by this student with 1-click receipt viewing/reprinting.

5. **Step 6 - Payment Gateway & Scanner:**
   - **UPI QR Code Scanner:**
     - High-resolution dynamic **UPI QR Code** encoded with school UPI ID (`lisbhimtal@upi`), exact payable amount, and transaction reference.
     - **Live 5-minute validity timer** (`05:00`).
     - 1-click **Copy UPI ID** with feedback toast.
     - Mobile deep-link for UPI apps (*Google Pay, PhonePe, Paytm, BHIM*).
   - **Direct Bank Transfer Tab:**
     - Official State Bank of India (SBI) Account Details, IFSC Code, and Branch information with 1-click copy buttons.
   - Secure file upload for payment screenshot proof (JPEG, PNG, WebP with 5MB limit).
   - Instant receipt generation with simulated real-time verification.

6. **Step 7 - Official CBSE Fee Receipt:**
   - Official CBSE Affiliation No. (3530124) and School Code (81358).
   - **Dynamic Verification QR Code** generated and embedded on the receipt for digital authenticity.
   - Line-item breakdown of Tuition, Lab, and Sports fees.
   - Official School Seal and Digital Verification stamp.
   - Print / Save as PDF with dedicated `@media print` layout.

7. **Admin Dashboard & Management Portal (`/admin.html`):**
   - **Real-Time KPI Cards:** Total Students, Total Fees Collected (INR), Outstanding Pending Dues (INR), and Fee Collection Rate (%).
   - **Live Search & Filter:** Instant search by Student Name, Admission No, or Class, and status filter (All, Pending Dues, Cleared).
   - **Student Record Management:** Add New Student modal, Edit Student modal, and Delete Student.
   - **Audit Ledger:** Table of all verified transactions with direct "View Receipt" action.
   - **Data Export:** 1-click CSV download for Students Records (`LIS_Students_Records.csv`) and Fee Payments (`LIS_Fee_Payments_Report.csv`).
   - Safe Database Reset button.

8. **User Experience Enhancements:**
   - Non-intrusive, animated **Toast Notification System** replacing browser alerts.
   - **Receipt Search & Lookup Modal:** Parents can verify or reprint any receipt by entering their Receipt Number.
   - Floating **"📋 12 Student Records"** drawer with search and 1-click test autofill.
   - Safe atomic JSON file writes preventing data corruption on crashes.

---

## 👥 12 Student Test Records

| Admission No (Addmo) | Student Name | Class | DOB (Login) | Monthly Fee | Pending Months |
|---|---|---|---|---|---|
| `LIS2025001` | Aarav Sharma | VI-A | `2013-04-15` | ₹4,500 | November, December |
| `LIS2025002` | Ananya Verma | VII-B | `2012-08-22` | ₹4,800 | October, November, December |
| `LIS2025003` | Vivaan Joshi | VIII-A | `2011-01-10` | ₹5,200 | Dues Cleared (Has prior receipt) |
| `LIS2025004` | Diya Singh | V-C | `2014-11-05` | ₹4,200 | November, December, January |
| `LIS2025005` | Advik Mehta | IX-A | `2010-06-18` | ₹5,600 | September, October, November |
| `LIS2025006` | Myra Kapoor | IV-B | `2015-03-27` | ₹3,900 | November, December |
| `LIS2025007` | Ishaan Gupta | X-A | `2009-09-12` | ₹6,000 | December |
| `LIS2025008` | Sara Khan | VI-B | `2013-12-01` | ₹4,500 | October, November |
| `LIS2025009` | Reyansh Das | VIII-C | `2011-07-19` | ₹5,200 | November, December |
| `LIS2025010` | Aadhya Patel | VII-A | `2012-02-14` | ₹4,800 | November |
| `LIS2025011` | Kabir Rawat | XI-A | `2008-10-30` | ₹6,500 | October, November, December |
| `LIS2025012` | Meera Thapa | V-A | `2014-05-25` | ₹4,200 | December |

---

## 🚀 Running the Project

```bash
# 1. Install dependencies
npm install

# 2. Run the automated test suite
npm test

# 3. Start the application server
npm start
```

Access in your browser:
- **Main Website & Fee Payment Flow:** [http://localhost:3000](http://localhost:3000)
- **Admin Dashboard & Student Records:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
