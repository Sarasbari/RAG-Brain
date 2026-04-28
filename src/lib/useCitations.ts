import { useState } from 'react'
import { Citation } from '@/types'

// Custom hook to extract citations from response headers
export function useCitations() {
  const [citations, setCitations] = useState<Citation[]>([])

  function parseCitationsFromHeaders(headers: Headers) {
    const raw = headers.get('X-Citations')
    if (raw) {
      try {
        setCitations(JSON.parse(raw))
      } catch {}
    }
  }

  return { citations, parseCitationsFromHeaders, setCitations }
}