# BarOps

<div align="center">

# 🍸 BarOps

### Modern Bar Operations Platform

**Simplifying inventory management for bars and restaurants.**

Built from real operational experience to reduce inventory time, eliminate manual spreadsheets and give managers complete control over their operation.

---

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-7-purple?logo=vite)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?logo=javascript)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Integration-green?logo=googlesheets)

</div>

---

## Overview

BarOps is a web platform designed to streamline the daily operations of bars and restaurants.

Instead of relying on paper forms and manual spreadsheets, teams can perform inventory counts directly from their mobile devices, automatically synchronize data with Google Sheets, generate reports, and keep a complete inventory history.

The project was originally created to solve real operational challenges inside a high-volume bar and later evolved into a reusable platform for hospitality businesses.

---

## Why BarOps?

Traditional inventory processes usually involve:

* Paper checklists
* Manual spreadsheet updates
* Time-consuming verification
* Counting mistakes
* Lack of traceability

BarOps replaces these repetitive tasks with a fast, standardized and reliable workflow.

---

## Key Features

* Secure authentication using User + PIN
* Role-based permissions (Admin & Leader)
* Inventory by sector
* Opening, Closing and Full Inventory modes
* Automatic draft recovery
* Inventory review before submission
* Google Sheets synchronization
* Current stock consultation
* Local inventory history
* Excel, PDF and CSV export
* Product management
* User management
* Inventory reports
* Mobile-first interface
* Offline-friendly workflow

---

## Target Users

BarOps was designed for hospitality professionals, including:

* Bar Managers
* Shift Leaders
* Restaurant Managers
* Business Owners

---

## Technology Stack

| Technology              | Purpose              |
| ----------------------- | -------------------- |
| React                   | User Interface       |
| Vite                    | Development & Build  |
| JavaScript (ES Modules) | Application Logic    |
| CSS                     | Responsive Interface |
| Google Apps Script      | Backend Integration  |
| Google Sheets           | Operational Database |
| jsPDF                   | PDF Export           |
| xlsx                    | Excel Export         |

---

## Project Structure

```text
.
├── google-apps-script/
│   └── Code.gs
│
├── src/
│   ├── assets/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   ├── utils/
│   ├── styles/
│   └── main.jsx
│
├── package.json
└── README.md
```

> *Some folders may evolve as the project grows.*

---

## Inventory Workflow

```text
Login

↓

Select Inventory

↓

Choose Sector

↓

Count Products

↓

Review

↓

Send to Google Sheets

↓

Generate Reports
```

---

## Google Sheets Integration

BarOps communicates with Google Sheets through Google Apps Script.

The integration allows:

* Inventory synchronization
* Current stock lookup
* Audit logging
* Product validation
* Automatic spreadsheet updates

This approach keeps deployment simple while integrating seamlessly with the workflow already used by many hospitality businesses.

---

## Installation

Clone the repository:

```bash
git clone https://github.com/francosdev/BarOps.git
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

---

## Roadmap

### Version 1

* Inventory Management
* Google Sheets Sync
* User Management
* Reports
* Export to Excel
* Export to PDF
* Export to CSV

### Version 2

* Dashboard
* Inventory Analytics
* CMV Reports
* Purchase Orders
* Production Control
* Stock Movements

### Version 3

* Dedicated Backend
* Cloud Database
* Multi-user Synchronization
* Real-time Updates
* Notifications
* Mobile Application

---

## Future Vision

The goal of BarOps is to become an operational platform for bars and restaurants, centralizing inventory, production, reporting, purchasing, and operational workflows in a single system.

---

## License

This project is currently under development.

A license will be defined before the first public release.
