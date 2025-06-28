'use client'

import { supabase } from './supabase'

export interface StorageDebugInfo {
  bucketExists: boolean
  bucketIsPublic: boolean
  canUpload: boolean
  canRead: boolean
  testFileUrl: string | null
  errors: string[]
}

// Debug function to test Supabase storage configuration
export async function debugStorageAccess(): Promise<StorageDebugInfo> {
  const result: StorageDebugInfo = {
    bucketExists: false,
    bucketIsPublic: false,
    canUpload: false,
    canRead: false,
    testFileUrl: null,
    errors: []
  }

  try {
    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    
    if (bucketsError) {
      result.errors.push(`Failed to list buckets: ${bucketsError.message}`)
      return result
    }

    const fainder = buckets.find(bucket => bucket.id === 'fainder')
    if (fainder) {
      result.bucketExists = true
      result.bucketIsPublic = fainder.public || false
    } else {
      result.errors.push('Fainder bucket not found')
      return result
    }

    // Test file operations
    const testFileName = `test-${Date.now()}.txt`
    const testContent = new Blob(['test content'], { type: 'text/plain' })

    // Test upload
    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('fainder')
        .upload(testFileName, testContent)

      if (uploadError) {
        result.errors.push(`Upload test failed: ${uploadError.message}`)
      } else {
        result.canUpload = true

        // Test public URL generation
        const { data: urlData } = supabase.storage
          .from('fainder')
          .getPublicUrl(testFileName)

        result.testFileUrl = urlData.publicUrl

        // Test if the URL is accessible
        try {
          const response = await fetch(urlData.publicUrl, { method: 'HEAD' })
          result.canRead = response.ok
          if (!response.ok) {
            result.errors.push(`Public URL not accessible: ${response.status} ${response.statusText}`)
          }
        } catch (fetchError) {
          result.errors.push(`Failed to fetch public URL: ${fetchError}`)
        }

        // Clean up test file
        await supabase.storage.from('fainder').remove([testFileName])
      }
    } catch (uploadError) {
      result.errors.push(`Upload test error: ${uploadError}`)
    }

  } catch (error) {
    result.errors.push(`General error: ${error}`)
  }

  return result
}

// Helper function to test a specific image URL
export async function testImageUrl(url: string): Promise<{
  accessible: boolean
  status?: number
  contentType?: string
  error?: string
}> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return {
      accessible: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || undefined
    }
  } catch (error) {
    return {
      accessible: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Dev-only function to run diagnostics
export async function runStorageDiagnostics() {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('Storage diagnostics only available in development mode')
    return
  }

  console.log('🔍 Running Supabase storage diagnostics...')
  
  const result = await debugStorageAccess()
  
  console.log('📊 Storage Debug Results:')
  console.log('Bucket exists:', result.bucketExists)
  console.log('Bucket is public:', result.bucketIsPublic)
  console.log('Can upload:', result.canUpload)
  console.log('Can read public URLs:', result.canRead)
  
  if (result.testFileUrl) {
    console.log('Test file URL:', result.testFileUrl)
  }
  
  if (result.errors.length > 0) {
    console.error('❌ Errors found:')
    result.errors.forEach(error => console.error(`  - ${error}`))
  } else {
    console.log('✅ No errors found!')
  }

  return result
}

// Make it available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugStorage = runStorageDiagnostics
  (window as any).testImageUrl = testImageUrl
} 