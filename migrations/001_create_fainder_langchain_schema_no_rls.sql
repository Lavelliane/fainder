-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table for tracking anonymous users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create documents table for storing uploaded files and their metadata
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    
    -- Content and metadata for search
    extracted_text TEXT,
    title TEXT,
    description TEXT,
    
    -- Processing status for LangChain pipeline
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'chunking', 'embedding', 'processed', 'error')),
    processing_error TEXT,
    processing_metadata JSONB DEFAULT '{}',
    
    -- Document metadata
    language TEXT DEFAULT 'en',
    page_count INTEGER,
    word_count INTEGER,
    character_count INTEGER,
    
    -- LangChain specific fields
    document_hash TEXT, -- For deduplication
    chunk_size INTEGER DEFAULT 1000,
    chunk_overlap INTEGER DEFAULT 200,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create document_chunks table for LangChain document splitting
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Chunk content and position
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_hash TEXT, -- For deduplication at chunk level
    
    -- Chunk metadata (LangChain format)
    metadata JSONB DEFAULT '{}',
    
    -- Content analysis
    word_count INTEGER,
    character_count INTEGER,
    
    -- Vector embedding (OpenAI text-embedding-ada-002 = 1536 dimensions)
    embedding VECTOR(1536),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    embedded_at TIMESTAMP WITH TIME ZONE
);

-- Create embeddings table for different embedding models/versions
CREATE TABLE IF NOT EXISTS embedding_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL, -- e.g., 'text-embedding-ada-002'
    provider TEXT NOT NULL, -- e.g., 'openai'
    dimensions INTEGER NOT NULL,
    version TEXT,
    cost_per_token DECIMAL(10,8),
    max_tokens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default OpenAI embedding model
INSERT INTO embedding_models (name, provider, dimensions, version, cost_per_token, max_tokens) 
VALUES ('text-embedding-ada-002', 'openai', 1536, 'v2', 0.0000001, 8191)
ON CONFLICT (name) DO NOTHING;

-- Create search_queries table to track user searches and improve results
CREATE TABLE IF NOT EXISTS search_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Query details
    query_text TEXT NOT NULL,
    query_embedding VECTOR(1536),
    query_type TEXT DEFAULT 'semantic' CHECK (query_type IN ('semantic', 'keyword', 'hybrid')),
    
    -- Search parameters
    similarity_threshold REAL DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    
    -- Results and performance
    results_count INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    
    -- Metadata
    search_metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create search_results table to track which chunks were returned
CREATE TABLE IF NOT EXISTS search_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    search_query_id UUID REFERENCES search_queries(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL,
    rank_position INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversations table for chat history (if building chat interface)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table for chat messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create comprehensive indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity DESC);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(document_hash);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON document_chunks(chunk_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_index ON document_chunks(document_id, chunk_index);

-- Critical: Vector similarity search index using HNSW
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON document_chunks 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Alternative: IVFFlat index (good for smaller datasets)
-- CREATE INDEX IF NOT EXISTS idx_chunks_embedding_ivfflat ON document_chunks 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_search_queries_user_id ON search_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_created_at ON search_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_embedding_hnsw ON search_queries 
USING hnsw (query_embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_search_results_query_id ON search_results(search_query_id);
CREATE INDEX IF NOT EXISTS idx_search_results_chunk_id ON search_results(chunk_id);
CREATE INDEX IF NOT EXISTS idx_search_results_similarity ON search_results(similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_documents_text_search ON documents 
USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(extracted_text, '')));

CREATE INDEX IF NOT EXISTS idx_chunks_text_search ON document_chunks 
USING gin(to_tsvector('english', chunk_text));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Utility functions for LangChain integration

-- Function to get or create user by session_id
CREATE OR REPLACE FUNCTION get_or_create_user(session_id_param TEXT)
RETURNS UUID AS $$
DECLARE
    user_id UUID;
BEGIN
    SELECT id INTO user_id FROM users WHERE session_id = session_id_param;
    
    IF user_id IS NULL THEN
        INSERT INTO users (session_id) VALUES (session_id_param) RETURNING id INTO user_id;
    ELSE
        UPDATE users SET last_activity = NOW() WHERE id = user_id;
    END IF;
    
    RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for similarity search (for LangChain)
CREATE OR REPLACE FUNCTION similarity_search(
    query_embedding VECTOR(1536),
    user_id_param UUID,
    similarity_threshold REAL DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    chunk_id UUID,
    document_id UUID,
    chunk_text TEXT,
    metadata JSONB,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id as chunk_id,
        dc.document_id,
        dc.chunk_text,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) as similarity
    FROM document_chunks dc
    WHERE 
        dc.user_id = user_id_param 
        AND dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> query_embedding) > similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update document processing status
CREATE OR REPLACE FUNCTION update_document_status(
    document_id_param UUID,
    new_status TEXT,
    error_message TEXT DEFAULT NULL,
    metadata_update JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE documents 
    SET 
        status = new_status,
        processing_error = error_message,
        processing_metadata = COALESCE(metadata_update, processing_metadata),
        updated_at = NOW(),
        processed_at = CASE WHEN new_status = 'processed' THEN NOW() ELSE processed_at END
    WHERE id = document_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 