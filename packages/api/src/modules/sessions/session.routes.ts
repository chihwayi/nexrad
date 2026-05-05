import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { query, queryOne } from '../../db/mysql.js'
import { execSync } from 'child_process'

export async function sessionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // List active sessions
  app.get('/sessions/active', async (req) => {
    return query<{
      acctsessionid: string
      username: string
      nasipaddress: string
      framedipaddress: string
      acctstarttime: string
      acctsessiontime: number
    }>(
      `
      SELECT acctsessionid, username, nasipaddress, framedipaddress,
             acctstarttime, acctsessiontime
      FROM radacct
      WHERE acctstoptime IS NULL
        AND nasipaddress IN (
          SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
        )
      ORDER BY acctstarttime DESC
    `,
      [req.user!.orgId!]
    )
  })

  // Disconnect a session via RADIUS CoA (Change of Authorization)
  app.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/disconnect',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const [session] = await query<{
        username: string
        nasipaddress: string
        acctsessionid: string
      }>(
        `
        SELECT username, nasipaddress, acctsessionid
        FROM radacct
        WHERE acctsessionid = ? AND acctstoptime IS NULL
      `,
        [req.params.sessionId]
      )

      if (!session) return reply.status(404).send({ error: 'Session not found or already closed' })

      // Look up the RADIUS secret for this NAS from the nas table
      const nasRow = await queryOne<{ secret: string }>(
        'SELECT secret FROM nas WHERE nasname = ?',
        [session.nasipaddress]
      )
      const nasSecret = nasRow?.secret ?? ''

      try {
        // Mark session stopped in accounting (soft disconnect)
        await query(
          `
          UPDATE radacct
          SET acctstoptime = NOW(), acctterminatecause = 'Admin-Reset'
          WHERE acctsessionid = ?
        `,
          [req.params.sessionId]
        )

        // Attempt CoA disconnect via radclient
        if (nasSecret) {
          execSync(
            `echo "User-Name = ${session.username}, Acct-Session-Id = ${req.params.sessionId}" | ` +
              `radclient -x ${session.nasipaddress}:3799 disconnect ${nasSecret} 2>/dev/null || true`
          )
        }

        return { success: true, message: `Session for ${session.username} disconnected` }
      } catch {
        return reply.status(500).send({ error: 'Failed to disconnect session' })
      }
    }
  )
}
