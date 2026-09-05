import type { BackgroundRequest, BackgroundResponse } from '../messages'
import { RecorderService } from './recorder-service'

const service = new RecorderService()

service.initialize().catch((err: unknown) => {
  console.error('Failed to initialize Capultura.', err)
})

console.log(
  '[Capitura] background loaded, scripting available:',
  typeof (chrome as { scripting?: unknown }).scripting
)

chrome.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
  void service
    .handleMessage(message, sender)
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
  console.log('Capultura installed')
})
