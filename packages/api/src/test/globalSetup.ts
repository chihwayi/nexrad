import { createConnection } from 'mysql2/promise'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const migrationsDir = resolve(__dirname, '../db/migrations')

export async function setup() {
  const conn = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'radius',
    password: process.env.DB_PASSWORD || 'radiusPassword',
    database: process.env.DB_NAME || 'radius',
    multipleStatements: true,
  })

  const migrations = [
    '001_freeradius_compat.sql',
    '002_nexrad_tables.sql',
    '003_performance_indexes.sql',
    '004_branch_provisioning.sql',
  ]
  for (const file of migrations) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8')
    await conn.query(sql)
  }

  // Seed test org-admin user: username=admin, password=admin123, org_id=1, role=orgadmin
  await conn.query(`
    INSERT IGNORE INTO nx_users (id, org_id, username, email, password, role)
    VALUES (2, 1, 'admin', 'admin@nexrad-test.io',
      '$2b$12$1Vgb8jO2O14Uowto2ooMzeTeNS6mSpAPnH4ehGusiel5T1TWcWZIS',
      'orgadmin')
  `)

  await conn.end()
}

export async function teardown() {
  // pool is cleaned up when the test process exits
}
