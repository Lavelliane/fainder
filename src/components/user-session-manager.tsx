'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { generateUserId, getUserIdFromUrl, getOrCreateUser } from '@/lib/user-management'

interface UserSessionManagerProps {
  children: React.ReactNode
}

export function UserSessionManager({ children }: UserSessionManagerProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isInitialized, setIsInitialized] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Track initialization attempts to prevent infinite loops
  const initializationAttempted = useRef(false)
  const retryCount = useRef(0)
  const maxRetries = 3

  useEffect(() => {
    // Prevent multiple concurrent initialization attempts
    if (initializationAttempted.current) return
    initializationAttempted.current = true

    const initializeUser = async () => {
      try {
        setError(null)
        const urlUserId = getUserIdFromUrl(searchParams)
        
        if (!urlUserId) {
          // No user ID in URL, generate one and redirect
          const newUserId = generateUserId()
          const newUrl = `/?uid=${newUserId}`
          router.replace(newUrl)
          // Reset the flag so it can try again with the new URL
          initializationAttempted.current = false
          return
        }

        // User ID exists, get or create user in database
        const user = await getOrCreateUser(urlUserId)
        setUserId(user.id)
        setIsInitialized(true)
        retryCount.current = 0 // Reset retry count on success
        
      } catch (error) {
        console.error('Failed to initialize user:', error)
        retryCount.current += 1
        
        if (retryCount.current >= maxRetries) {
          // Max retries reached, show error state
          setError('Failed to initialize user session. Please refresh the page.')
          setIsInitialized(true) // Set to true to stop loading state
          return
        }
        
        // If we haven't exceeded max retries, generate a new ID and try again
        const newUserId = generateUserId()
        const newUrl = `/?uid=${newUserId}`
        router.replace(newUrl)
        // Reset the flag so it can try again with the new URL
        initializationAttempted.current = false
      }
    }

    initializeUser()
  }, [searchParams, router])

  // Show error state if max retries exceeded
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.316 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Session Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing your session...</p>
          {retryCount.current > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Retry attempt {retryCount.current} of {maxRetries}
            </p>
          )}
        </div>
      </div>
    )
  }

  return <div data-user-id={userId}>{children}</div>
} 