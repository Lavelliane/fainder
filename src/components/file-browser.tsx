'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Folder, 
  File, 
  ArrowLeft, 
  Home, 
  RefreshCw, 
  Search,
  FileText,
  Image,
  Music,
  Video,
  Archive,
  Code,
  FileSpreadsheet,
  X
} from 'lucide-react'

interface FileSystemItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  extension?: string
}

interface FileContent {
  content: string
  type: 'text' | 'binary'
  filename: string
  size: number
  mimeType?: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileIcon(extension?: string) {
  if (!extension) return <File className="w-4 h-4" />
  
  const ext = extension.toLowerCase()
  
  if (['.txt', '.md', '.doc', '.docx', '.pdf'].includes(ext)) {
    return <FileText className="w-4 h-4" />
  }
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'].includes(ext)) {
    return <Image className="w-4 h-4" />
  }
  if (['.mp3', '.wav', '.flac', '.aac', '.ogg'].includes(ext)) {
    return <Music className="w-4 h-4" />
  }
  if (['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv'].includes(ext)) {
    return <Video className="w-4 h-4" />
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return <Archive className="w-4 h-4" />
  }
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go', '.rs'].includes(ext)) {
    return <Code className="w-4 h-4" />
  }
  if (['.xls', '.xlsx', '.csv'].includes(ext)) {
    return <FileSpreadsheet className="w-4 h-4" />
  }
  
  return <File className="w-4 h-4" />
}

export function FileBrowser() {
  const [items, setItems] = useState<FileSystemItem[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null)

  const scanDirectory = async (path?: string) => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan', targetPath: path })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setItems(data.items)
        setCurrentPath(data.currentPath)
      } else {
        setError(data.error || 'Failed to scan directory')
      }
    } catch (err) {
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const readFile = async (filePath: string) => {
    setLoading(true)
    
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'readFile', filePath })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSelectedFile(data)
      } else {
        setError(data.error || 'Failed to read file')
      }
    } catch (err) {
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleItemClick = (item: FileSystemItem) => {
    if (item.type === 'directory') {
      scanDirectory(item.path)
    } else {
      readFile(item.path)
    }
  }

  const navigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/')
    if (parentPath) {
      scanDirectory(parentPath)
    }
  }

  const goHome = () => {
    scanDirectory() // This will use default Documents path
  }

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  useEffect(() => {
    scanDirectory() // Load Documents folder on mount
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5" />
            File Browser
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={goHome}
              disabled={loading}
            >
              <Home className="w-4 h-4 mr-1" />
              Documents
            </Button>
            
            {currentPath && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateUp}
                  disabled={loading}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Up
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => scanDirectory(currentPath)}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </>
            )}
          </div>

          {/* Current Path */}
          <div className="text-sm text-muted-foreground bg-muted p-2 rounded font-mono">
            {currentPath || 'Loading...'}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search files and folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* File List */}
          <div className="border rounded-md max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchTerm ? 'No items match your search.' : 'This folder is empty.'}
              </div>
            ) : (
              <div className="divide-y">
                {filteredItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex-shrink-0">
                      {item.type === 'directory' ? (
                        <Folder className="w-4 h-4 text-blue-600" />
                      ) : (
                        getFileIcon(item.extension)
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.extension && (
                        <Badge variant="secondary" className="text-xs">
                          {item.extension.slice(1).toUpperCase()}
                        </Badge>
                      )}
                      {item.size !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(item.size)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* File Content Viewer */}
      {selectedFile && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {getFileIcon(selectedFile.filename.split('.').pop())}
                {selectedFile.filename}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedFile(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Size: {formatFileSize(selectedFile.size)}
            </div>
          </CardHeader>
          <CardContent>
            {selectedFile.type === 'text' ? (
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96 whitespace-pre-wrap">
                {selectedFile.content}
              </pre>
            ) : selectedFile.mimeType?.startsWith('image/') ? (
              <div className="text-center">
                <img
                  src={`data:${selectedFile.mimeType};base64,${selectedFile.content}`}
                  alt={selectedFile.filename}
                  className="max-w-full max-h-96 mx-auto rounded-md"
                />
              </div>
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                <File className="w-12 h-12 mx-auto mb-2" />
                <p>This file type cannot be previewed.</p>
                <p className="text-sm">File type: {selectedFile.mimeType || 'Unknown'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
} 