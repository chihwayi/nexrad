import 'dotenv/config'

export const config = {
  port: Number(process.env.API_PORT) || 3000,
  host: process.env.API_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'radius',
    password: process.env.DB_PASSWORD || 'radiusPassword',
    database: process.env.DB_NAME || 'radius',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'noreply@nexrad.app',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'dev-refresh',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  wg: {
    interface: process.env.WG_INTERFACE || 'wg0',
    configPath: process.env.WG_CONFIG_PATH || '/etc/wireguard/wg0.conf',
    serverIp: process.env.WG_SERVER_IP || '10.8.0.1',
    subnet: process.env.WG_SUBNET || '10.8.0.0/24',
    endpoint: process.env.WG_SERVER_ENDPOINT || '',
    port: Number(process.env.WG_PORT) || 51820,
    serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY || '',
  },
  apiBaseUrl: process.env.API_BASE_URL || `http://${process.env.WG_SERVER_ENDPOINT || 'localhost'}`,
} as const
