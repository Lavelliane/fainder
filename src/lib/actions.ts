'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { 
  UploadFormSchema, 
  SearchFormSchema, 
  ChatMessageSchema,
  DocumentSchema,
  UploadResponseSchema,
  SearchResponseSchema,
  ChatResponseSchema,
  DocumentSummarySchema,
  SearchAnswerSchema,
  type UploadResponse,
  type SearchResponse,
  type ChatResponse,
  type DocumentSummary,
  type SearchAnswer
} from '@/lib/schemas'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { OpenAIEmbeddings } from '@langchain/openai'
import { ChatOpenAI } from '@langchain/openai'
import { StructuredOutputParser } from 'langchain/output_parsers'

// Initialize LangChain components
const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-ada-002',
  openAIApiKey: process.env.OPENAI_API_KEY
})

const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.1,
  openAIApiKey: process.env.OPENAI_API_KEY
})

// Server Action: Upload and process documents
export async function uploadDocuments(formData: FormData): Promise<UploadResponse> {
  try {
    const files = formData.getAll('files') as File[]
    const userId = formData.get('userId') as string
    
    console.log('Upload started:', { fileCount: files.length, userId })
    
    if (!files || files.length === 0) {
      throw new Error('No files provided')
    }

    if (!userId) {
      throw new Error('User ID is required')
    }

    // Validate input - simplified validation
    const validatedData = {
      files: files.filter(f => f instanceof File),
      user_id: userId,
      processing_options: {
        extract_metadata: true,
        generate_summary: true,
        chunk_size: 1000,
        chunk_overlap: 200
      }
    }

    const uploadResults = []

    for (const file of validatedData.files) {
      console.log('Processing file:', file.name, file.type, file.size)
      
      // Upload to Supabase Storage
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { data: storageData, error: storageError } = await supabase.storage
        .from('fainder')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (storageError) {
        console.error('Storage error:', storageError)
        throw new Error(`Storage upload failed: ${storageError.message}`)
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('fainder')
        .getPublicUrl(fileName)

      // Determine file type and category first
      const isImage = file.type.startsWith('image/')
      const isText = file.type === 'text/plain'
      const fileCategory = isImage ? 'image' : isText ? 'text' : 'document'

      // Validate public URL is accessible (for debugging)
      console.log('Generated public URL:', urlData.publicUrl)
      
      // Test URL accessibility for images
      if (isImage) {
        try {
          const testResponse = await fetch(urlData.publicUrl, { method: 'HEAD' })
          console.log('Image URL test status:', testResponse.status, testResponse.statusText)
        } catch (testError) {
          console.warn('Image URL test failed:', testError)
        }
      }

      // Create document record with simplified structure
      const documentData = {
        user_id: validatedData.user_id,
        filename: fileName,
        original_filename: file.name,
        storage_path: storageData?.path || fileName,
        public_url: urlData.publicUrl,
        file_type: fileCategory,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploaded',
        processing_metadata: { 
          is_image: isImage,
          requires_ocr: isImage,
          original_type: file.type
        }
      }

      const { data: dbData, error: dbError } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single()

      if (dbError) {
        console.error('Database error:', dbError)
        throw new Error(`Database insert failed: ${dbError.message}`)
      }

      console.log('Document created:', dbData.id)
      uploadResults.push(dbData)

      // Start async processing based on file type
      if (isImage) {
        processImageAsync(dbData.id, urlData.publicUrl).catch(console.error)
      } else if (isText) {
        processTextFileAsync(dbData.id, file).catch(console.error)
      } else {
        processDocumentAsync(dbData.id, file).catch(console.error)
      }
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        document: uploadResults[0], // Return first document for simplicity
        processing_started: true
      }
    }

    revalidatePath('/')
    return response

  } catch (error) {
    console.error('Upload error:', error)
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

// Process images using OpenAI Vision with enhanced contextual analysis
async function processImageAsync(documentId: string, publicUrl: string) {
  try {
    console.log('Processing image with enhanced analysis:', documentId)
    
    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId)

    // Use GPT-4o-mini for comprehensive vision analysis
    const visionLLM = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY
    })

    const analysisPrompt = `Analyze this image comprehensively and provide structured information. Be thorough and accurate.

Return your response in this exact JSON format:
{
  "extracted_text": "Any text visible in the image transcribed exactly",
  "main_description": "Detailed description of what's shown in the image",
  "objects": ["list", "of", "visible", "objects"],
  "people": ["descriptions", "of", "people", "if", "any"],
  "scene_type": "indoor/outdoor/nature/urban/etc",
  "colors": ["dominant", "colors"],
  "mood": "emotional tone or mood of the image",
  "activities": ["what", "is", "happening"],
  "tags": ["comprehensive", "list", "of", "relevant", "tags"],
  "categories": ["primary", "categories", "this", "image", "belongs", "to"],
  "text_type": "document/sign/handwriting/printed/none",
  "confidence": 0.95,
  "searchable_content": "Combined text optimized for search including all relevant information"
}`

    const response = await visionLLM.invoke([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: analysisPrompt
          },
          {
            type: "image_url",
            image_url: {
              url: publicUrl
            }
          }
        ]
      }
    ])

    const analysisText = response.content as string
    let analysis: any
    
    try {
      // Try to parse JSON response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON, falling back to text parsing')
      // Fallback to text parsing
      analysis = {
        extracted_text: extractSection(analysisText, 'extracted_text') || '',
        main_description: extractSection(analysisText, 'main_description') || analysisText,
        tags: ['image', 'vision-analyzed'],
        categories: ['general'],
        confidence: 0.7,
        searchable_content: analysisText
      }
    }

    // Create comprehensive searchable content
    const searchableContent = `
${analysis.extracted_text || ''}

Description: ${analysis.main_description || ''}

Objects: ${Array.isArray(analysis.objects) ? analysis.objects.join(', ') : ''}

Scene: ${analysis.scene_type || ''} 

Activities: ${Array.isArray(analysis.activities) ? analysis.activities.join(', ') : ''}

Tags: ${Array.isArray(analysis.tags) ? analysis.tags.join(', ') : ''}
`.trim()

    // Update document with comprehensive analysis
    await supabase
      .from('documents')
      .update({ 
        extracted_text: searchableContent,
        title: analysis.extracted_text 
          ? analysis.extracted_text.substring(0, 100) 
          : `Image: ${analysis.main_description?.substring(0, 100) || 'Analyzed Image'}`,
        description: analysis.main_description || '',
        content_type: 'image',
        confidence_score: analysis.confidence || 0.8,
        status: 'chunking',
        word_count: searchableContent.split(/\s+/).length,
        character_count: searchableContent.length,
        image_analysis: analysis,
        processing_metadata: {
          is_image: true,
          vision_analysis_complete: true,
          analysis_timestamp: new Date().toISOString()
        }
      })
      .eq('id', documentId)

    // Add tags to the document
    if (Array.isArray(analysis.tags)) {
      for (const tag of analysis.tags.slice(0, 20)) { // Limit to 20 tags
        if (tag && typeof tag === 'string' && tag.length > 1) {
          await supabase.rpc('add_document_tag', {
            doc_id: documentId,
            tag_name: tag.toLowerCase().trim(),
            tag_confidence: analysis.confidence || 0.8,
            tag_source: 'vision'
          })
        }
      }
    }

    // Add category tags
    if (Array.isArray(analysis.categories)) {
      for (const category of analysis.categories.slice(0, 5)) {
        if (category && typeof category === 'string') {
          await supabase.rpc('add_document_tag', {
            doc_id: documentId,
            tag_name: category.toLowerCase().trim(),
            tag_confidence: 0.9,
            tag_source: 'vision'
          })
        }
      }
    }

    // Update auto_tags array
    await supabase.rpc('update_document_auto_tags', { doc_id: documentId })

    // Create chunks for search
    await createChunksForDocument(documentId, searchableContent, {
      type: 'image',
      content_type: 'image',
      extracted_text: analysis.extracted_text || '',
      description: analysis.main_description || '',
      scene_type: analysis.scene_type || '',
      objects: analysis.objects || [],
      tags: analysis.tags || []
    })

    // Mark as processed
    await supabase
      .from('documents')
      .update({ 
        status: 'processed',
        processed_at: new Date().toISOString()
      })
      .eq('id', documentId)

    console.log('Enhanced image processing completed:', documentId)

  } catch (error) {
    console.error('Enhanced image processing error:', error)
    await supabase
      .from('documents')
      .update({ 
        status: 'error',
        processing_error: error instanceof Error ? error.message : 'Enhanced image processing failed'
      })
      .eq('id', documentId)
  }
}

// Process text files
async function processTextFileAsync(documentId: string, file: File) {
  try {
    console.log('Processing text file:', documentId)
    
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId)

    const text = await file.text()
    
    await supabase
      .from('documents')
      .update({ 
        extracted_text: text,
        content_type: 'text',
        status: 'chunking',
        word_count: text.split(/\s+/).length,
        character_count: text.length
      })
      .eq('id', documentId)

    await createChunksForDocument(documentId, text, {
      type: 'text',
      filename: file.name
    })

    await supabase
      .from('documents')
      .update({ 
        status: 'processed',
        processed_at: new Date().toISOString()
      })
      .eq('id', documentId)

  } catch (error) {
    console.error('Text processing error:', error)
    await supabase
      .from('documents')
      .update({ 
        status: 'error',
        processing_error: error instanceof Error ? error.message : 'Text processing failed'
      })
      .eq('id', documentId)
  }
}

// Helper function to extract sections from Vision API response
function extractSection(text: string, sectionName: string): string {
  const regex = new RegExp(`\\*\\*${sectionName}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z\\s]+:\\*\\*|$)`, 'i')
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

// Helper function to create chunks
async function createChunksForDocument(documentId: string, text: string, metadata: any) {
  try {
    // Get user_id from document
    const { data: docData } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', documentId)
      .single()

    if (!docData) throw new Error('Document not found')

    // Split text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    })

    const chunks = await textSplitter.createDocuments([text], [metadata])

    // Process chunks and create embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      // Generate embedding
      const embeddingVector = await embeddings.embedQuery(chunk.pageContent)
      
      // Insert chunk with embedding
      await supabase
        .from('document_chunks')
        .insert({
          document_id: documentId,
          user_id: docData.user_id,
          chunk_index: i,
          chunk_text: chunk.pageContent,
          metadata: { ...metadata, ...chunk.metadata },
          word_count: chunk.pageContent.split(/\s+/).length,
          character_count: chunk.pageContent.length,
          embedding: embeddingVector,
          embedded_at: new Date().toISOString()
        })
    }

    console.log(`Created ${chunks.length} chunks for document ${documentId}`)
  } catch (error) {
    console.error('Chunk creation error:', error)
    throw error
  }
}

// Background document processing with LangChain
async function processDocumentAsync(documentId: string, file: File) {
  try {
    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId)

    // Extract text content (simplified - you'd use specific loaders for different file types)
    const text = await extractTextFromFile(file)
    
    // Update document with extracted text
    await supabase
      .from('documents')
      .update({ 
        extracted_text: text,
        content_type: 'document',
        status: 'chunking',
        word_count: text.split(/\s+/).length,
        character_count: text.length
      })
      .eq('id', documentId)

    // Create LangChain document
    const langchainDoc = new Document({
      pageContent: text,
      metadata: {
        document_id: documentId,
        filename: file.name,
        file_type: file.type
      }
    })

    // Split into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    })

    const chunks = await textSplitter.splitDocuments([langchainDoc])

    // Update status to embedding
    await supabase
      .from('documents')
      .update({ status: 'embedding' })
      .eq('id', documentId)

    // Process chunks and create embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      // Generate embedding
      const embeddingVector = await embeddings.embedQuery(chunk.pageContent)
      
      // Get user_id from document
      const { data: docData } = await supabase
        .from('documents')
        .select('user_id')
        .eq('id', documentId)
        .single()

      // Insert chunk with embedding
      await supabase
        .from('document_chunks')
        .insert({
          document_id: documentId,
          user_id: docData?.user_id,
          chunk_index: i,
          chunk_text: chunk.pageContent,
          metadata: chunk.metadata,
          word_count: chunk.pageContent.split(/\s+/).length,
          character_count: chunk.pageContent.length,
          embedding: embeddingVector,
          embedded_at: new Date().toISOString()
        })
    }

    // Generate document summary
    const summary = await generateDocumentSummary(text)
    
    // Update document as processed
    await supabase
      .from('documents')
      .update({ 
        status: 'processed',
        title: summary.title,
        description: summary.summary,
        processed_at: new Date().toISOString(),
        processing_metadata: {
          summary,
          chunk_count: chunks.length
        }
      })
      .eq('id', documentId)

  } catch (error) {
    console.error('Document processing error:', error)
    await supabase
      .from('documents')
      .update({ 
        status: 'error',
        processing_error: error instanceof Error ? error.message : 'Processing failed'
      })
      .eq('id', documentId)
  }
}

// Extract text from file (simplified implementation)
async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'text/plain') {
    return await file.text()
  }
  
  // For other file types, you'd use appropriate loaders:
  // - PDFLoader for PDFs
  // - DocxLoader for Word documents
  // - etc.
  
  // Placeholder for now
  throw new Error(`File type ${file.type} not supported yet`)
}

// Generate document summary using structured output
async function generateDocumentSummary(text: string): Promise<DocumentSummary> {
  const parser = StructuredOutputParser.fromZodSchema(DocumentSummarySchema)
  
  const prompt = `Analyze the following document and provide a structured summary:

${text.substring(0, 4000)}...

${parser.getFormatInstructions()}`

  const response = await llm.invoke(prompt)
  return parser.parse(response.content as string)
}

// Server Action: Semantic search
export async function searchDocuments(formData: FormData): Promise<SearchResponse> {
  try {
    const query = formData.get('query') as string
    const userId = formData.get('userId') as string
    const searchType = (formData.get('searchType') as string) || 'semantic'
    const maxResults = parseInt(formData.get('maxResults') as string) || 10
    const similarityThreshold = parseFloat(formData.get('similarityThreshold') as string) || 0.7

    // Validate input
    const validatedData = SearchFormSchema.parse({
      query,
      user_id: userId,
      search_type: searchType as any,
      max_results: maxResults,
      similarity_threshold: similarityThreshold
    })

    const startTime = Date.now()

    // Generate query embedding
    const queryEmbedding = await embeddings.embedQuery(validatedData.query)

    // Create search query record
    const { data: searchQueryData, error: queryError } = await supabase
      .from('search_queries')
      .insert({
        user_id: validatedData.user_id,
        query_text: validatedData.query,
        query_embedding: queryEmbedding,
        query_type: validatedData.search_type,
        similarity_threshold: validatedData.similarity_threshold,
        max_results: validatedData.max_results
      })
      .select()
      .single()

    if (queryError) {
      throw new Error(`Search query creation failed: ${queryError.message}`)
    }

    // Try enhanced similarity search first, fallback to basic search if it fails
    let searchResults: any[] = []
    const searchError: any = null

    try {
      const { data, error } = await supabase
        .rpc('enhanced_similarity_search', {
          query_embedding: queryEmbedding,
          user_id_param: validatedData.user_id,
          similarity_threshold: validatedData.similarity_threshold,
          max_results: validatedData.max_results,
          content_types: null,
          required_tags: null
        })

      if (error) {
        console.warn('Enhanced search failed, trying basic search:', error)
        // Fallback to basic similarity search
        const fallbackResult = await supabase
          .rpc('similarity_search', {
            query_embedding: queryEmbedding,
            user_id_param: validatedData.user_id,
            similarity_threshold: validatedData.similarity_threshold,
            max_results: validatedData.max_results
          })
        
        if (fallbackResult.error) {
          throw new Error(`Both enhanced and basic search failed: ${fallbackResult.error.message}`)
        }
        
        searchResults = fallbackResult.data || []
      } else {
        searchResults = data || []
      }
    } catch (error) {
      console.error('Search error details:', error)
      throw new Error(`Similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    const responseTime = Date.now() - startTime

    // Update search query with results
    await supabase
      .from('search_queries')
      .update({
        results_count: searchResults?.length || 0,
        response_time_ms: responseTime
      })
      .eq('id', searchQueryData.id)

    // Record search results
    if (searchResults && searchResults.length > 0) {
      const searchResultsToInsert = searchResults.map((result: any, index: number) => ({
        search_query_id: searchQueryData.id,
        chunk_id: result.chunk_id,
        similarity_score: result.similarity,
        rank_position: index + 1
      }))

      await supabase
        .from('search_results')
        .insert(searchResultsToInsert)
    }

    const response = SearchResponseSchema.parse({
      success: true,
      data: {
        results: searchResults || [],
        query_id: searchQueryData.id,
        total_results: searchResults?.length || 0,
        response_time_ms: responseTime
      }
    })

    return response

  } catch (error) {
    console.error('Search error:', error)
    return SearchResponseSchema.parse({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    })
  }
}

// Server Action: AI-powered question answering
export async function askQuestion(formData: FormData): Promise<ChatResponse> {
  try {
    const message = formData.get('message') as string
    const userId = formData.get('userId') as string
    const conversationId = formData.get('conversationId') as string | null

    // Validate input
    const validatedData = ChatMessageSchema.parse({
      message,
      user_id: userId,
      conversation_id: conversationId || undefined
    })

    // Get or create conversation
    let currentConversationId = validatedData.conversation_id

    if (!currentConversationId) {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: validatedData.user_id,
          title: validatedData.message.substring(0, 50) + '...'
        })
        .select()
        .single()

      if (convError) {
        throw new Error(`Conversation creation failed: ${convError.message}`)
      }

      currentConversationId = newConversation.id
    }

    // Save user message
    const { data: userMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: validatedData.message
      })
      .select()
      .single()

    if (messageError) {
      throw new Error(`Message save failed: ${messageError.message}`)
    }

    // Perform semantic search to find relevant context
    const searchResponse = await searchDocuments(formData)
    
    if (!searchResponse.success || !searchResponse.data) {
      throw new Error('Failed to find relevant context')
    }

    // Generate answer using structured output
    const answer = await generateStructuredAnswer(
      validatedData.message,
      searchResponse.data.results
    )

    // Save assistant message
    const { data: assistantMessage, error: assistantError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        role: 'assistant',
        content: answer.answer,
        metadata: {
          answer_data: answer,
          search_query_id: searchResponse.data.query_id
        }
      })
      .select()
      .single()

    if (assistantError) {
      throw new Error(`Assistant message save failed: ${assistantError.message}`)
    }

    const response = ChatResponseSchema.parse({
      success: true,
      data: {
        message: assistantMessage,
        conversation_id: currentConversationId,
        answer
      }
    })

    revalidatePath('/')
    return response

  } catch (error) {
    console.error('Chat error:', error)
    return ChatResponseSchema.parse({
      success: false,
      error: error instanceof Error ? error.message : 'Chat failed'
    })
  }
}

// Generate structured answer using search results
async function generateStructuredAnswer(
  question: string,
  searchResults: any[]
): Promise<SearchAnswer> {
  const parser = StructuredOutputParser.fromZodSchema(SearchAnswerSchema)
  
  const context = searchResults
    .map((result, index) => `[${index + 1}] ${result.chunk_text}`)
    .join('\n\n')

  const prompt = `Based on the following context, answer the user's question in a structured format.

Question: ${question}

Context:
${context}

Provide a comprehensive answer with confidence score, relevant sources, and follow-up questions.

${parser.getFormatInstructions()}`

  const response = await llm.invoke(prompt)
  return parser.parse(response.content as string)
}

// Server Action: Get user's documents
export async function getUserDocuments(userId: string) {
  try {
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`)
    }

    return {
      success: true,
      data: documents
    }
  } catch (error) {
    console.error('Get documents error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch documents'
    }
  }
}

// Server Action: Get conversation history
export async function getConversations(userId: string) {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        messages (
          id,
          role,
          content,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`)
    }

    return {
      success: true,
      data: conversations
    }
  } catch (error) {
    console.error('Get conversations error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch conversations'
    }
  }
} 

export async function getDocumentPublicUrl(documentId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('public_url')
    .eq('id', documentId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch document public URL: ${error.message}`)
  }

  return data.public_url
}