import { supabase } from './supabase'

export function generateUserId(): string {
  return Math.random().toString(36).substr(2, 12) + Date.now().toString(36)
}

export function getUserIdFromUrl(searchParams: URLSearchParams): string | null {
  return searchParams.get('uid')
}

export async function getOrCreateUser(sessionId: string) {
  try {
    // First try to get existing user
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, session_id')
      .eq('session_id', sessionId)
      .single()

    if (existingUser && !fetchError) {
      // Update last activity
      await supabase
        .from('users')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', existingUser.id)
      
      return existingUser
    }

    // Create new user if not found
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ session_id: sessionId }])
      .select('id, session_id')
      .single()

    if (createError) {
      console.error('Error creating user:', createError)
      throw createError
    }

    return newUser
  } catch (error) {
    console.error('Error in getOrCreateUser:', error)
    throw error
  }
}

export function buildUrlWithUserId(userId: string, pathname: string = '/'): string {
  const url = new URL(pathname, window.location.origin)
  url.searchParams.set('uid', userId)
  return url.toString()
} 