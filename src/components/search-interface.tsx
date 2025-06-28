'use client'

import { useState, useTransition } from 'react'
import { Search, Loader2, MessageSquare, FileText, Image, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useUser } from '@/hooks/use-user'
import { searchDocuments, askQuestion } from '@/lib/actions'
import type { SearchResponse, ChatResponse, SearchResult } from '@/lib/schemas'
import { runStorageDiagnostics, testImageUrl } from '@/lib/storage-debug'

export function SearchInterface() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null)
  const [isPending, startTransition] = useTransition()
  const [searchType, setSearchType] = useState<'search' | 'chat'>('search')
  const { userId } = useUser()

  console.log(searchResults)

  const handleSearch = async () => {
    if (!query.trim() || !userId) return

    const formData = new FormData()
    formData.append('query', query)
    formData.append('userId', userId)
    formData.append('searchType', 'semantic')
    formData.append('maxResults', '10')
    formData.append('similarityThreshold', '0.7')

    startTransition(async () => {
      try {
        if (searchType === 'search') {
          const response: SearchResponse = await searchDocuments(formData)
          if (response.success && response.data) {
            setSearchResults(response.data.results)
            setChatResponse(null)
          }
        } else {
          const response: ChatResponse = await askQuestion(formData)
          if (response.success && response.data) {
            setChatResponse(response)
            setSearchResults([])
          }
        }
      } catch (error) {
        console.error('Search error:', error)
      }
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            AI Search
          </CardTitle>
          <CardDescription>
            Search your documents using natural language or ask questions for AI-powered answers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Type Toggle */}
          <div className="flex gap-2">
            <Button
              variant={searchType === 'search' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSearchType('search')}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Document Search
            </Button>
            <Button
              variant={searchType === 'chat' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSearchType('chat')}
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              AI Q&A
            </Button>
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder={
                searchType === 'search' 
                  ? "Search your documents... (e.g., 'financial reports from Q4')"
                  : "Ask a question... (e.g., 'What were the key findings in the report?')"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isPending || !userId}
              className="flex-1"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isPending || !query.trim() || !userId}
              className="flex items-center gap-2"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searchType === 'search' ? 'Search' : 'Ask'}
            </Button>
          </div>

          {!userId && (
            <p className="text-sm text-gray-500 text-center">
              Initializing your session...
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              Found {searchResults.length} relevant document chunks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {searchResults.map((result, index) => (
              <div key={result.chunk_id} className="border rounded-lg overflow-hidden">
                {/* Image Preview for Image Content */}
                {result.content_type === 'image' && result.public_url && (
                  <div className="relative">
                    <img 
                      src={result.public_url} 
                      alt={result.document_title || result.document_filename || 'Image'}
                      className="w-full h-48 sm:h-64 object-cover"
                      onLoad={() => {
                        console.log('Image loaded successfully:', result.public_url);
                      }}
                      onError={(e) => {
                        console.error('Image failed to load:', {
                          url: result.public_url,
                          filename: result.document_filename,
                          error: e
                        });
                        // Show error placeholder instead of hiding
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        
                        // Create error placeholder
                        const placeholder = img.parentElement?.querySelector('.image-error-placeholder');
                        if (!placeholder) {
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'image-error-placeholder w-full h-48 sm:h-64 bg-gray-100 flex flex-col items-center justify-center border border-gray-200 rounded';
                          errorDiv.innerHTML = `
                            <svg class="h-12 w-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            <p class="text-sm text-gray-500 text-center px-4">
                              Image preview not available<br/>
                              <span class="text-xs">${result.document_filename || 'Unknown file'}</span>
                            </p>
                            <button class="mt-2 text-xs text-blue-600 hover:text-blue-700" onclick="window.open('${result.public_url}', '_blank')">
                              Try opening directly
                            </button>
                          `;
                          img.parentElement?.appendChild(errorDiv);
                        }
                      }}
                    />
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-white/90 text-gray-800">
                        <Image className="h-3 w-3 mr-1" />
                        Image
                      </Badge>
                    </div>
                  </div>
                )}
                
                {/* Debug info for images (only in development) */}
                {result.content_type === 'image' && result.public_url && process.env.NODE_ENV === 'development' && (
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    <p><strong>Debug - Image URL:</strong> {result.public_url}</p>
                    <button 
                      onClick={() => window.open(result.public_url, '_blank')}
                      className="text-blue-600 hover:text-blue-700 underline"
                    >
                      Test image URL directly
                    </button>
                  </div>
                )}
                
                <div className="p-4 space-y-3">
                  {/* Header with Title and Match Score */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        {result.content_type === 'image' ? (
                          <Image className="h-4 w-4 text-blue-500" />
                        ) : result.content_type === 'text' ? (
                          <FileText className="h-4 w-4 text-green-500" />
                        ) : (
                          <FileText className="h-4 w-4 text-gray-500" />
                        )}
                        {result.document_title || result.document_filename || 'Document'}
                      </h4>
                      {result.document_filename && result.document_title !== result.document_filename && (
                        <p className="text-xs text-gray-500 mt-1">{result.document_filename}</p>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {Math.round(result.similarity * 100)}% match
                    </Badge>
                  </div>

                  {/* Content Preview */}
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {result.chunk_text}
                    </p>
                  </div>

                  {/* Tags */}
                  {result.auto_tags && result.auto_tags.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="h-3 w-3 text-gray-400" />
                      {result.auto_tags.slice(0, 6).map((tag, tagIndex) => (
                        <Badge key={tagIndex} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {result.auto_tags.length > 6 && (
                        <Badge variant="outline" className="text-xs text-gray-500">
                          +{result.auto_tags.length - 6} more
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Metadata (only show relevant ones) */}
                  {Object.keys(result.metadata).length > 0 && (
                    <details className="text-xs">
                      <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
                        View technical details
                      </summary>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {Object.entries(result.metadata)
                          .filter(([key]) => !['chunk_id', 'document_id'].includes(key))
                          .slice(0, 8)
                          .map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs bg-gray-50">
                            {key}: {String(value).substring(0, 20)}
                            {String(value).length > 20 && '...'}
                          </Badge>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Created Date */}
                  {result.created_at && (
                    <p className="text-xs text-gray-400">
                      Uploaded {new Date(result.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI Chat Response */}
      {chatResponse?.success && chatResponse.data?.answer && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              AI Answer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-800">{chatResponse.data.answer.answer}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Confidence:</span>
              <Badge variant={
                chatResponse.data.answer.confidence > 0.8 ? 'default' : 
                chatResponse.data.answer.confidence > 0.6 ? 'secondary' : 'outline'
              }>
                {Math.round(chatResponse.data.answer.confidence * 100)}%
              </Badge>
            </div>

            {chatResponse.data.answer.sources.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Sources:</h4>
                {chatResponse.data.answer.sources.map((source, index) => (
                  <div key={source.chunk_id} className="border rounded p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{source.document_title}</span>
                      <Badge variant="outline">
                        {Math.round(source.relevance_score * 100)}% relevant
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{source.excerpt}</p>
                  </div>
                ))}
              </div>
            )}

            {chatResponse.data.answer.follow_up_questions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Follow-up questions:</h4>
                <div className="space-y-1">
                  {chatResponse.data.answer.follow_up_questions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => setQuery(question)}
                      className="text-left text-sm text-blue-600 hover:text-blue-700 hover:underline block w-full"
                    >
                      • {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {((searchType === 'search' && searchResults.length === 0) || 
        (searchType === 'chat' && !chatResponse?.success)) && 
        query && !isPending && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">
              {searchType === 'search' 
                ? 'No documents found matching your search.' 
                : 'Unable to generate an answer. Try uploading more documents or rephrasing your question.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 