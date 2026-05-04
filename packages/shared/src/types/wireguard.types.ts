export interface WgPeer {
  publicKey: string
  endpoint: string | null
  allowedIps: string
  latestHandshake: number | null
  transferRx: number
  transferTx: number
  persistentKeepalive: number
  isOnline: boolean
  branchName: string | null
  branchIp: string | null
}

export interface WgStatus {
  interface: string
  publicKey: string
  listenPort: number
  peers: WgPeer[]
  totalPeers: number
  onlinePeers: number
}

export interface AddPeerRequest {
  branchName: string
  location?: string
  publicKey?: string  // if omitted, server generates keypair
}

export interface AddPeerResponse {
  branchIp: string
  publicKey: string
  clientConfig: string
  qrDataUrl: string
}
