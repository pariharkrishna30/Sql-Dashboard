# SQL Developer Tool

## 📌 Overview
SQL Developer Tool is a lightweight web-based utility that allows authenticated users to safely execute **SELECT queries** and view results in a structured format.

The tool is accessible via:

example.com/sqldev


---

## 🔐 Access Control
- Only logged-in users can access the tool
- Unauthorized users are redirected to login
- Integrated with existing authentication system
- No impact on core system functionality

---


---

## ⚙️ Database Configuration
- Uses credentials from `config.inc.php`
- Auto-detects environment:
  - Local (Windows)
  - Server (Linux)

---

## 🧾 Features

### SQL Execution
- Supports **SELECT queries only**
- Supports JOIN operations
- Blocks unsafe queries:
  - INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE

### Restricted Tables
Access is blocked for:
- admin_user_login_token  
- qs_admin_debug_password  
- qs_admin_user  
- qs_easy_ecom_user  
- qs_sub_user  

---

## 📊 Result Display
- Table format output
- Column headers + row values
- Scrollable results
- Handles large datasets (1000+ rows)

---

## 🛠️ Additional Features
- Execute Query button
- Show Table Structure:
  - Column Name
  - Data Type
  - NULL / NOT NULL

Optional:
- Dark mode
- Query history
- Export to CSV

---

## 🎨 UI/UX
- Clean and simple design
- Responsive layout
- Easy to use interface

---

## 🔒 Security
- Only SELECT queries allowed
- Input validation
- SQL Injection prevention
- XSS protection

---

## ⚠️ System Safety
- Runs independently in `/sqldev/`
- Does NOT affect existing system

---

## 📦 Deliverables
- New files under `/sqldev/`
- No core system modifications
- Full frontend + backend implementation

---

## ✅ Status
Project setup ready for development 🚀