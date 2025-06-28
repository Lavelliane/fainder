'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useUser } from '@/hooks/use-user'
import { uploadDocuments } from '@/lib/actions'
import type { UploadResponse } from '@/lib/schemas'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'completed' | 'error'
  progress: number
  url?: string
  error?: string
}

export function FileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { userId } = useUser()

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const uploadFile = async (selectedFiles: File[]) => {
    if (!userId) {
      alert('Please wait while we initialize your session...')
      return
    }

    // Add files to state with uploading status
    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
      progress: 0
    }))
    
    setFiles(prev => [...prev, ...newFiles])

    // Create FormData for server action
    const formData = new FormData()
    selectedFiles.forEach(file => {
      formData.append('files', file)
    })
    formData.append('userId', userId)

    startTransition(async () => {
      try {
        const response: UploadResponse = await uploadDocuments(formData)
        
        if (response.success && response.data) {
          // Update files to completed status
          setFiles(prev => prev.map(f => 
            newFiles.some(nf => nf.name === f.name) 
              ? { ...f, status: 'completed', progress: 100, url: response.data?.document.public_url }
              : f
          ))
        } else {
          // Update files to error status
          setFiles(prev => prev.map(f => 
            newFiles.some(nf => nf.name === f.name) 
              ? { ...f, status: 'error', error: response.error || 'Upload failed' }
              : f
          ))
        }
      } catch (error) {
        console.error('Upload error:', error)
        setFiles(prev => prev.map(f => 
          newFiles.some(nf => nf.name === f.name) 
            ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
            : f
        ))
      }
    })
  }

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const validFiles: File[] = []
    
    Array.from(selectedFiles).forEach(file => {
      // Validate file type and size
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`)
        return
      }
      validFiles.push(file)
    })

    if (validFiles.length > 0) {
      uploadFile(validFiles)
    }
  }, [uploadFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
          <CardDescription>
            Upload your documents to enable AI-powered natural language search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : isPending
                  ? 'border-gray-400 bg-gray-50'
                  : 'border-gray-300 hover:border-gray-400'
            } ${isPending ? 'pointer-events-none' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {isPending ? (
              <Loader2 className="h-12 w-12 mx-auto text-gray-400 mb-4 animate-spin" />
            ) : (
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            )}
            <div className="space-y-2">
              <p className="text-lg font-medium">
                {isPending ? 'Processing your files...' : 'Drop your files here'}
              </p>
              {!isPending && (
                <>
                  <p className="text-sm text-gray-500">
                    or{' '}
                    <button
                      onClick={openFileDialog}
                      className="text-blue-600 hover:text-blue-700 underline"
                    >
                      browse to upload
                    </button>
                  </p>
                  <p className="text-xs text-gray-400">
                    Supports PDF, DOC, DOCX, TXT, and image files (JPG, PNG, GIF, etc.) up to 10MB
                  </p>
                </>
              )}
              {isPending && (
                <p className="text-sm text-gray-500">
                  Your files are being uploaded and processed with AI...
                </p>
              )}
            </div>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {files.map((file) => (
              <div key={file.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                <File className="h-8 w-8 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center space-x-2">
                      {file.status === 'completed' && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                      {file.status === 'error' && (
                        <Badge variant="destructive" className="bg-red-100 text-red-800">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatFileSize(file.size)}</span>
                    {file.status === 'uploading' && <span>{file.progress}%</span>}
                  </div>
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="mt-2" />
                  )}
                  {file.status === 'error' && file.error && (
                    <Alert className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {file.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
} 