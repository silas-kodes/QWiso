import { useEffect, useCallback } from 'react'
import { useWebSocketStore, WAStatus, ValidationProgress } from '../stores/websocket'
import { wsUrl } from '../utils/api'

let globalWs: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let listenersCount = 0

function connectGlobal(
  setConnected: (connected: boolean) => void,
  setWAStatus: (status: WAStatus) => void,
  setValidationProgress: (progress: ValidationProgress | null) => void,
  setValidationComplete: (jobId: string, result: unknown) => void,
) {
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
    return
  }

  const ws = new WebSocket(wsUrl('/ws'))
  globalWs = ws

  ws.onopen = () => {
    console.log('[WS] Connected')
    setConnected(true)
    // Request current instance statuses to restore UI state after reload
    ws.send(JSON.stringify({ type: 'wa_get_status' }))
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'wa_status':
          if (data.status.error === 'Removed') {
            useWebSocketStore.getState().removeWAStatus(data.status.id)
          } else {
            setWAStatus(data.status)
          }
          break
          
        case 'account_rotation_health':
          useWebSocketStore.getState().setAccountHealth(data)
          break
          
        case 'validation_progress':
          setValidationProgress({
            jobId: data.jobId,
            datasetId: data.datasetId,
            current: data.current,
            total: data.total,
            digits: data.result.digits,
            valid: data.result.valid,
            counts: data.counts,
          })
          break
          
        case 'validation_complete':
          setValidationComplete(data.jobId, data.result)
          break
          
        case 'validation_error':
          console.error('[WS] Validation error:', data.error)
          break

        case 'campaign_progress':
          useWebSocketStore.getState().setCampaignProgress(data)
          break
          
        case 'campaign_status_changed':
          useWebSocketStore.getState().setCampaignStatus(data.campaignId, data.status)
          break
      }
    } catch (err) {
      console.error('[WS] Message parse error:', err)
    }
  }

  ws.onclose = () => {
    console.log('[WS] Disconnected')
    setConnected(false)
    globalWs = null
    
    // Reconnect after 3 seconds
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      connectGlobal(setConnected, setWAStatus, setValidationProgress, setValidationComplete)
    }, 3000)
  }

  ws.onerror = (err) => {
    console.error('[WS] Error:', err)
  }
}

function disconnectGlobal() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (globalWs) {
    globalWs.close()
    globalWs = null
  }
}

export function useWebSocket() {
  const { 
    connected, 
    setConnected, 
    setWAStatus, 
    setValidationProgress,
    setValidationComplete 
  } = useWebSocketStore()

  useEffect(() => {
    listenersCount++
    connectGlobal(setConnected, setWAStatus, setValidationProgress, setValidationComplete)

    return () => {
      listenersCount--
      if (listenersCount <= 0) {
        disconnectGlobal()
        setConnected(false)
      }
    }
  }, [setConnected, setWAStatus, setValidationProgress, setValidationComplete])

  const send = useCallback((message: unknown) => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(message))
    } else {
      console.warn('[WS] Cannot send — WebSocket not open:', message)
    }
  }, [])

  return { connected, send }
}
