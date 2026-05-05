import { query, queryOne } from '../../db/mysql.js'

export interface BillingPlan {
  id: number
  orgId: number
  name: string
  displayName: string | null
  timeBankHours: number
  dataLimitMb: number | null
  cost: number
  currency: string
  frGroupName: string | null
  isActive: boolean
  createdAt: string
}

export interface CreatePlanInput {
  orgId: number
  name: string
  displayName?: string
  timeBankHours: number
  dataLimitMb?: number
  cost: number
  currency: string
  frGroupName?: string
}

export async function listPlans(orgId: number, includeInactive = false): Promise<BillingPlan[]> {
  return query<BillingPlan>(
    `
    SELECT id, org_id AS orgId, name, display_name AS displayName,
           time_bank_hours AS timeBankHours, data_limit_mb AS dataLimitMb,
           cost, currency, fr_group_name AS frGroupName,
           is_active AS isActive, created_at AS createdAt
    FROM nx_billing_plans WHERE org_id = ? ${includeInactive ? '' : 'AND is_active = 1'}
    ORDER BY cost
  `,
    [orgId]
  )
}

export async function getPlan(orgId: number, id: number): Promise<BillingPlan | null> {
  return queryOne<BillingPlan>(
    `
    SELECT id, org_id AS orgId, name, display_name AS displayName,
           time_bank_hours AS timeBankHours, data_limit_mb AS dataLimitMb,
           cost, currency, fr_group_name AS frGroupName,
           is_active AS isActive, created_at AS createdAt
    FROM nx_billing_plans WHERE id = ? AND org_id = ?
  `,
    [id, orgId]
  )
}

export async function createPlan(input: CreatePlanInput): Promise<BillingPlan> {
  const [result] = await query<{ insertId: number }>(
    `
    INSERT INTO nx_billing_plans
      (org_id, name, display_name, time_bank_hours, data_limit_mb, cost, currency, fr_group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      input.orgId,
      input.name,
      input.displayName ?? null,
      input.timeBankHours,
      input.dataLimitMb ?? null,
      input.cost,
      input.currency,
      input.frGroupName ?? null,
    ]
  )

  // Sync to FreeRADIUS billing_plans table for daloRADIUS compat
  await query(
    `
    INSERT IGNORE INTO billing_plans (planName, planCost, planCurrency, planTimeBank)
    VALUES (?, ?, ?, ?)
  `,
    [input.name, input.cost, input.currency, input.timeBankHours]
  )

  // Create FreeRADIUS group policy if frGroupName specified
  if (input.frGroupName) {
    await syncFrGroupPolicy(input.frGroupName, input.timeBankHours, input.dataLimitMb)
  }

  return getPlan(input.orgId, (result as any).insertId) as Promise<BillingPlan>
}

export async function updatePlan(
  orgId: number,
  id: number,
  updates: Partial<Omit<CreatePlanInput, 'orgId'>>
): Promise<BillingPlan | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.displayName !== undefined) {
    fields.push('display_name = ?')
    values.push(updates.displayName)
  }
  if (updates.timeBankHours !== undefined) {
    fields.push('time_bank_hours = ?')
    values.push(updates.timeBankHours)
  }
  if (updates.dataLimitMb !== undefined) {
    fields.push('data_limit_mb = ?')
    values.push(updates.dataLimitMb)
  }
  if (updates.cost !== undefined) {
    fields.push('cost = ?')
    values.push(updates.cost)
  }
  if (updates.currency !== undefined) {
    fields.push('currency = ?')
    values.push(updates.currency)
  }
  if (updates.frGroupName !== undefined) {
    fields.push('fr_group_name = ?')
    values.push(updates.frGroupName)
  }

  if (!fields.length) return getPlan(orgId, id)

  values.push(id, orgId)
  await query(
    `UPDATE nx_billing_plans SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`,
    values
  )
  return getPlan(orgId, id)
}

export async function togglePlanActive(orgId: number, id: number): Promise<BillingPlan | null> {
  await query('UPDATE nx_billing_plans SET is_active = NOT is_active WHERE id = ? AND org_id = ?', [
    id,
    orgId,
  ])
  return getPlan(orgId, id)
}

/**
 * Sync FreeRADIUS radgroupcheck/radgroupreply for a plan group.
 * Enforces Max-All-Session (total seconds) and Octets-Limit if dataLimitMb set.
 */
async function syncFrGroupPolicy(
  groupName: string,
  timeBankHours: number,
  dataLimitMb?: number | null
) {
  const totalSeconds = timeBankHours * 3600

  // Remove existing policies for this group
  await query('DELETE FROM radgroupcheck WHERE groupname = ?', [groupName])
  await query('DELETE FROM radgroupreply WHERE groupname = ?', [groupName])

  // Time limit check
  await query(
    `
    INSERT INTO radgroupcheck (groupname, attribute, op, value)
    VALUES (?, 'Max-All-Session', ':=', ?)
  `,
    [groupName, String(totalSeconds)]
  )

  // Data limit reply (if set)
  if (dataLimitMb) {
    const bytes = dataLimitMb * 1048576
    await query(
      `
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES (?, 'ChilliSpot-Max-Total-Octets', ':=', ?)
    `,
      [groupName, String(bytes)]
    )
  }

  // Session timeout reply
  await query(
    `
    INSERT INTO radgroupreply (groupname, attribute, op, value)
    VALUES (?, 'Session-Timeout', ':=', ?)
  `,
    [groupName, String(totalSeconds)]
  )
}
