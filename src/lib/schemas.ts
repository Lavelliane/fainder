import { z } from 'zod'

// User schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  last_activity: z.string().datetime()
})

// Document schemas
export const DocumentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  filename: z.string(),
  original_filename: z.string(),
  storage_path: z.string(),
  public_url: z.string().url().optional(),
  file_type: z.string(),
  file_size: z.number().int().positive(),
  mime_type: z.string(),
  extracted_text: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['uploaded', 'processing', 'chunking', 'embedding', 'processed', 'error']),
  processing_error: z.string().optional(),
  processing_metadata: z.record(z.any()).default({}),
  language: z.string().default('en'),
  page_count: z.number().int().optional(),
  word_count: z.number().int().optional(),
  character_count: z.number().int().optional(),
  document_hash: z.string().optional(),
  chunk_size: z.number().int().default(1000),
  chunk_overlap: z.number().int().default(200),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  processed_at: z.string().datetime().optional()
})

// Document chunk schemas
export const DocumentChunkSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  user_id: z.string().uuid(),
  chunk_index: z.number().int(),
  chunk_text: z.string(),
  chunk_hash: z.string().optional(),
  metadata: z.record(z.any()).default({}),
  word_count: z.number().int().optional(),
  character_count: z.number().int().optional(),
  embedding: z.array(z.number()).optional(),
  created_at: z.string().datetime(),
  embedded_at: z.string().datetime().optional()
})

// Search schemas
export const SearchQuerySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  query_text: z.string(),
  query_embedding: z.array(z.number()).optional(),
  query_type: z.enum(['semantic', 'keyword', 'hybrid']).default('semantic'),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  max_results: z.number().int().positive().default(10),
  results_count: z.number().int().default(0),
  response_time_ms: z.number().int().optional(),
  search_metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime()
})

export const SearchResultSchema = z.object({
  chunk_id: z.string().uuid(),
  document_id: z.string().uuid(),
  chunk_text: z.string(),
  metadata: z.record(z.any()),
  similarity: z.number().min(0).max(1),
  rank_position: z.number().int().positive().optional(),
  document_title: z.string().optional(),
  document_filename: z.string().optional(),
  public_url: z.string().url().optional(),
  content_type: z.string().optional(),
  auto_tags: z.array(z.string()).optional(),
  created_at: z.string().datetime().optional()
})

// LangChain document processing schemas
export const DocumentExtractionSchema = z.object({
  text: z.string(),
  metadata: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    creation_date: z.string().optional(),
    page_count: z.number().int().optional(),
    word_count: z.number().int().optional(),
    language: z.string().optional()
  })
})

export const ChunkingConfigSchema = z.object({
  chunk_size: z.number().int().min(100).max(4000).default(1000),
  chunk_overlap: z.number().int().min(0).max(500).default(200),
  separators: z.array(z.string()).optional()
})

export const EmbeddingConfigSchema = z.object({
  model: z.string().default('text-embedding-ada-002'),
  dimensions: z.number().int().default(1536),
  batch_size: z.number().int().default(10)
})

// Chat/Conversation schemas
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
})

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime()
})

// AI Response schemas for structured outputs
export const DocumentSummarySchema = z.object({
  title: z.string().describe("A concise title for the document"),
  summary: z.string().describe("A comprehensive summary of the document content"),
  key_topics: z.array(z.string()).describe("Main topics and themes covered"),
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(['person', 'organization', 'location', 'date', 'concept']),
    context: z.string().optional()
  })).describe("Important entities mentioned in the document"),
  language: z.string().describe("Primary language of the document"),
  estimated_reading_time: z.number().int().describe("Estimated reading time in minutes")
})

export const SearchAnswerSchema = z.object({
  answer: z.string().describe("Direct answer to the user's question"),
  confidence: z.number().min(0).max(1).describe("Confidence score for the answer"),
  sources: z.array(z.object({
    chunk_id: z.string().uuid(),
    document_title: z.string(),
    relevance_score: z.number().min(0).max(1),
    excerpt: z.string().max(200)
  })).describe("Source chunks that support this answer"),
  follow_up_questions: z.array(z.string()).max(3).describe("Suggested follow-up questions")
})

export const DocumentAnalysisSchema = z.object({
  content_type: z.enum(['academic', 'business', 'legal', 'technical', 'personal', 'other']),
  complexity_level: z.enum(['basic', 'intermediate', 'advanced', 'expert']),
  key_insights: z.array(z.string()).max(5),
  action_items: z.array(z.string()).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional()
})

// Form validation schemas
export const UploadFormSchema = z.object({
  files: z.array(z.instanceof(File)).min(1).max(10),
  user_id: z.string().uuid(),
  processing_options: z.object({
    extract_metadata: z.boolean().default(true),
    generate_summary: z.boolean().default(true),
    chunk_size: z.number().int().min(100).max(4000).default(1000),
    chunk_overlap: z.number().int().min(0).max(500).default(200)
  }).optional()
})

export const SearchFormSchema = z.object({
  query: z.string().min(3).max(500),
  user_id: z.string().uuid(),
  search_type: z.enum(['semantic', 'keyword', 'hybrid']).default('semantic'),
  max_results: z.number().int().min(1).max(50).default(10),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  document_filter: z.array(z.string().uuid()).optional()
})

export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  conversation_id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  context_document_ids: z.array(z.string().uuid()).optional()
})

// API Response schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString())
})

export const UploadResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    document: DocumentSchema,
    processing_started: z.boolean()
  }).optional()
})

export const SearchResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    results: z.array(SearchResultSchema),
    query_id: z.string().uuid(),
    total_results: z.number().int(),
    response_time_ms: z.number().int()
  }).optional()
})

export const ChatResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    message: MessageSchema,
    conversation_id: z.string().uuid(),
    answer: SearchAnswerSchema.optional()
  }).optional()
})

// Type exports
export type User = z.infer<typeof UserSchema>
export type Document = z.infer<typeof DocumentSchema>
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>
export type SearchQuery = z.infer<typeof SearchQuerySchema>
export type SearchResult = z.infer<typeof SearchResultSchema>
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>
export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type Message = z.infer<typeof MessageSchema>
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>
export type SearchAnswer = z.infer<typeof SearchAnswerSchema>
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>
export type UploadForm = z.infer<typeof UploadFormSchema>
export type SearchForm = z.infer<typeof SearchFormSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ApiResponse = z.infer<typeof ApiResponseSchema>
export type UploadResponse = z.infer<typeof UploadResponseSchema>
export type SearchResponse = z.infer<typeof SearchResponseSchema>
export type ChatResponse = z.infer<typeof ChatResponseSchema> 