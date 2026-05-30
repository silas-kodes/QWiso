import { create } from 'zustand'

export type WAState = 'disconnected' | 'connecting' | 'qr_ready' | 'pairing' | 'authenticated' | 'ready' | 'error'

export interface WAStatus {
  id: string
  name?: string
  state: WAState
  phone: string | null
  qrCode: string | null
  pairingCode: string | null
  error: string | null
}

export interface ValidationProgress {
  jobId: string
  datasetId: string
  current: number
  total: number
  digits: string
  valid: boolean
  counts?: {
    total: number
    pending: number
    valid: number
    invalid: number
    error: number
    campaign: number
    staff: number
    excluded: number
  }
}

export interface AccountHealth {
  accountId: string
  accountName: string
  health: 'healthy' | 'degraded' | 'cooldown' | 'exhausted'
  checksThisHour: number
  checksThisSession: number
  cooldownUntil: number
  consecutiveErrors: number
}

export interface CampaignProgress {
  campaignId: string
  sentCount: number
  failedCount: number
  totalContacts: number
  lastNumber: string
  success: boolean
}

interface WebSocketState {
  connected: boolean
  waStatuses: Record<string, WAStatus>
  rotationHealths: Record<string, AccountHealth>
  validationProgress: ValidationProgress | null
  lastValidationResult: { jobId: string; result: unknown } | null
  campaignProgress: Record<string, CampaignProgress>
  campaignStatuses: Record<string, string>
  
  // Actions
  setConnected: (connected: boolean) => void
  setWAStatus: (status: WAStatus) => void
  removeWAStatus: (id: string) => void
  setAccountHealth: (health: AccountHealth) => void
  setValidationProgress: (progress: ValidationProgress | null) => void
  setValidationComplete: (jobId: string, result: unknown) => void
  setCampaignProgress: (progress: CampaignProgress) => void
  setCampaignStatus: (campaignId: string, status: string) => void
}

export const useWebSocketStore = create<WebSocketState>()((set) => ({
  connected: false,
  waStatuses: {},
  rotationHealths: {},
  validationProgress: null,
  lastValidationResult: null,

  setConnected: (connected) => set({ connected }),
  
  setWAStatus: (status) => set((state) => ({
    waStatuses: {
      ...state.waStatuses,
      [status.id]: status
    }
  })),

  removeWAStatus: (id) => set((state) => {
    const next = { ...state.waStatuses }
    delete next[id]
    const healthNext = { ...state.rotationHealths }
    delete healthNext[id]
    return { waStatuses: next, rotationHealths: healthNext }
  }),

  setAccountHealth: (health) => set((state) => ({
    rotationHealths: {
      ...state.rotationHealths,
      [health.accountId]: health
    }
  })),

  setValidationProgress: (validationProgress) => set({ validationProgress }),
  
  setValidationComplete: (jobId, result) => set({ 
    lastValidationResult: { jobId, result },
    validationProgress: null 
  }),

  campaignProgress: {},
  campaignStatuses: {},
  
  setCampaignProgress: (progress) => set((state) => ({
    campaignProgress: {
      ...state.campaignProgress,
      [progress.campaignId]: progress
    }
  })),

  setCampaignStatus: (campaignId, status) => set((state) => ({
    campaignStatuses: {
      ...state.campaignStatuses,
      [campaignId]: status
    }
  })),
}))
