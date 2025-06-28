import { Suspense } from 'react'
import { FileUpload } from '@/components/file-upload'
import { SearchInterface } from '@/components/search-interface'
import { UserSessionManager } from '@/components/user-session-manager'
import { FileBrowser } from '@/components/file-browser'

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

function AppContent() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Fainder
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            AI-Powered Document Search
          </p>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Upload your documents and search through them using natural language. 
            Find exactly what you're looking for without complex search queries.
          </p>
        </div>
        
        <div className="space-y-12">
          <FileBrowser />
          <FileUpload />
          <SearchInterface />
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <UserSessionManager>
        <AppContent />
      </UserSessionManager>
    </Suspense>
  )
}
