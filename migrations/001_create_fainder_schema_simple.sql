-- Create users table for tracking anonymous users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create documents table for storing uploaded files and their metadata
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    
    -- Processing status
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'error')),
    processing_error TEXT,
    
    -- Search metadata
    language TEXT DEFAULT 'en',
    page_count INTEGER,
    word_count INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create search_queries table to track user searches and improve results
CREATE TABLE IF NOT EXISTS search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    query_type TEXT DEFAULT 'keyword' CHECK (query_type IN ('semantic', 'keyword', 'hybrid')),
    results_count INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_search_queries_user_id ON search_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_created_at ON search_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id);

-- Full-text search index for documents
CREATE INDEX IF NOT EXISTS idx_documents_text_search ON documents USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(extracted_text, '')));

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

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users (users can only see their own data)
CREATE POLICY "Users can view their own data" ON users
    FOR ALL USING (session_id = current_setting('app.current_session_id', true));

-- RLS Policies for documents  
CREATE POLICY "Users can view their own documents" ON documents
    FOR ALL USING (user_id IN (
        SELECT id FROM users WHERE session_id = current_setting('app.current_session_id', true)
    ));

-- RLS Policies for search_queries
CREATE POLICY "Users can view their own search queries" ON search_queries
    FOR ALL USING (user_id IN (
        SELECT id FROM users WHERE session_id = current_setting('app.current_session_id', true)
    ));

-- Create a function to get or create user by session_id
CREATE OR REPLACE FUNCTION get_or_create_user(session_id_param TEXT)
RETURNS UUID AS $$
DECLARE
    user_id UUID;
BEGIN
    -- Try to find existing user
    SELECT id INTO user_id FROM users WHERE session_id = session_id_param;
    
    -- If not found, create new user
    IF user_id IS NULL THEN
        INSERT INTO users (session_id) VALUES (session_id_param) RETURNING id INTO user_id;
    ELSE
        -- Update last activity
        UPDATE users SET last_activity = NOW() WHERE id = user_id;
    END IF;
    
    RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 