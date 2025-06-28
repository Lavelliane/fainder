'use client'

import { useEffect, useState } from 'react'

export function useUser() {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    // Get user ID from the data attribute set by UserSessionManager
    const userElement = document.querySelector('[data-user-id]')
    if (userElement) {
      const id = userElement.getAttribute('data-user-id')
      setUserId(id)
    }
  }, [])

  return { userId }
} 