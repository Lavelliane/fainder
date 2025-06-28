import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

interface FileSystemItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  extension?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, targetPath, filePath } = body

    if (action === 'scan') {
      // Default to Documents folder if no path provided
      const scanPath = targetPath || path.join(os.homedir(), 'Documents')
      
      try {
        const items = await fs.readdir(scanPath, { withFileTypes: true })
        const fileSystemItems: FileSystemItem[] = []

        for (const item of items) {
          const itemPath = path.join(scanPath, item.name)
          
          try {
            const stats = await fs.stat(itemPath)
            
            fileSystemItems.push({
              name: item.name,
              path: itemPath,
              type: item.isDirectory() ? 'directory' : 'file',
              size: item.isFile() ? stats.size : undefined,
              extension: item.isFile() ? path.extname(item.name) : undefined
            })
          } catch (statError) {
            // Skip items we can't access
            continue
          }
        }

        // Sort: directories first, then files alphabetically
        fileSystemItems.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })

        return NextResponse.json({ 
          success: true, 
          items: fileSystemItems, 
          currentPath: scanPath 
        })
      } catch (error) {
        return NextResponse.json({ 
          success: false, 
          error: 'Unable to access directory',
          currentPath: scanPath 
        }, { status: 403 })
      }
    }

    if (action === 'readFile') {
      if (!filePath) {
        return NextResponse.json({ 
          success: false, 
          error: 'File path is required' 
        }, { status: 400 })
      }

      try {
        const stats = await fs.stat(filePath)
        
        // Check if it's actually a file
        if (!stats.isFile()) {
          return NextResponse.json({ 
            success: false, 
            error: 'Path is not a file' 
          }, { status: 400 })
        }

        // Limit file size to prevent large files from crashing the server
        const maxSize = 10 * 1024 * 1024 // 10MB
        if (stats.size > maxSize) {
          return NextResponse.json({ 
            success: false, 
            error: 'File too large (max 10MB)' 
          }, { status: 413 })
        }

        const content = await fs.readFile(filePath)
        const extension = path.extname(filePath).toLowerCase()
        
        // Determine if file is text-based
        const textExtensions = ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.css', '.scss', '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go', '.rs', '.sql', '.csv', '.yaml', '.yml', '.ini', '.conf']
        const isText = textExtensions.includes(extension)

        if (isText) {
          const textContent = content.toString('utf8')
          return NextResponse.json({ 
            success: true, 
            content: textContent,
            type: 'text',
            filename: path.basename(filePath),
            size: stats.size
          })
        } else {
          // For binary files, return base64 encoded content
          const base64Content = content.toString('base64')
          return NextResponse.json({ 
            success: true, 
            content: base64Content,
            type: 'binary',
            filename: path.basename(filePath),
            size: stats.size,
            mimeType: getMimeType(extension)
          })
        }
      } catch (error) {
        return NextResponse.json({ 
          success: false, 
          error: 'Unable to read file' 
        }, { status: 403 })
      }
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action' 
    }, { status: 400 })

  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: 'Invalid request body' 
    }, { status: 400 })
  }
}

function getMimeType(extension: string): string {
  const mimeTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip'
  }
  
  return mimeTypes[extension] || 'application/octet-stream'
}