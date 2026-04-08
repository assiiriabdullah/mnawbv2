import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'database.sqlite'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('general_manager', 'dept_manager', 'supervisor', 'operator')),
      department TEXT CHECK(department IN ('shifts', 'hr', 'operations', 'workforce') OR department IS NULL),
      shift TEXT CHECK(shift IN ('أ', 'ب', 'ج', 'د', 'مساندة_صباحية', 'مساندة_مسائية') OR shift IS NULL),
      join_date TEXT NOT NULL,
      annual_leave_balance INTEGER NOT NULL DEFAULT 36,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      employee_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mandates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      employee_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_name TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supervisor_id INTEGER NOT NULL,
      shift TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'approved')),
      notes TEXT,
      shift_start_time TEXT,
      shift_end_time TEXT,
      supervisor_signature TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      approved_at TEXT,
      FOREIGN KEY (supervisor_id) REFERENCES employees(id),
      UNIQUE(shift, date)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      check_in_time TEXT,
      check_in_signature TEXT,
      check_out_time TEXT,
      check_out_signature TEXT,
      status TEXT NOT NULL DEFAULT 'absent' CHECK(status IN ('present', 'absent', 'late', 'excused')),
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(session_id, employee_id)
    );

    CREATE TABLE IF NOT EXISTS employee_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL UNIQUE,
      signature_data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  // Migration: Add annual_leave_balance column if it doesn't exist
  try {
    db.exec(`ALTER TABLE employees ADD COLUMN annual_leave_balance INTEGER NOT NULL DEFAULT 36`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Migration: Add department column if it doesn't exist
  try {
    db.exec(`ALTER TABLE employees ADD COLUMN department TEXT CHECK(department IN ('shifts', 'hr', 'operations', 'workforce') OR department IS NULL)`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Migration: Update old roles to new roles
  try {
    // Migrate 'manager' role to 'general_manager'
    db.prepare(`UPDATE employees SET role = 'general_manager' WHERE role = 'manager'`).run();
  } catch (e) {
    // Ignore if constraint fails
  }

  // Migration: Assign existing employees without department to 'shifts' department
  try {
    db.prepare(`UPDATE employees SET department = 'shifts' WHERE department IS NULL AND role NOT IN ('general_manager')`).run();
  } catch (e) {
    // Ignore
  }

  // Migration: Add shift_start_time, shift_end_time, supervisor_signature to attendance_sessions
  try {
    db.exec(`ALTER TABLE attendance_sessions ADD COLUMN shift_start_time TEXT`);
  } catch (e) { }
  try {
    db.exec(`ALTER TABLE attendance_sessions ADD COLUMN shift_end_time TEXT`);
  } catch (e) { }
  try {
    db.exec(`ALTER TABLE attendance_sessions ADD COLUMN supervisor_signature TEXT`);
  } catch (e) { }

  // Create default general manager if none exists
  const manager = db.prepare("SELECT id FROM employees WHERE role = 'general_manager'").get();
  if (!manager) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO employees (name, username, password, role, department, shift, join_date)
      VALUES (?, ?, ?, 'general_manager', NULL, NULL, ?)
    `).run('المدير العام', 'admin', hashedPassword, '2020-01-01');
    console.log('✅ تم إنشاء حساب المدير العام الافتراضي: admin / admin123');
  }
}

// Helper function to log activities
export function logActivity(userId: number, userName: string, action: string, targetType: string, targetName?: string, details?: string): void {
  db.prepare(`
      INSERT INTO activity_log (user_id, user_name, action, target_type, target_name, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, userName, action, targetType, targetName || null, details || null);
}

export default db;
