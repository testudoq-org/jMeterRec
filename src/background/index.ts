import type { BackgroundRequest, BackgroundResponse } from '../messages'
import { RecorderService } from './recorder-service'

const service = new RecorderService()

service.initialize().catch((err: unknown) => {
  console.error('Failed to initialize BM JMX Recorder.', err)
})

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  void service
    .handleMessage(message)
    .then((response: BackgroundResponse) => sendResponse(response))
    .catch((err: unknown) => {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
    })

  return true
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('BM JMX Recorder installed')
})
