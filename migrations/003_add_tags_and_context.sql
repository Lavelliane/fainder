-- Add tags and contextual metadata for better search
-- This migration adds support for tagging, categorization, and enhanced image analysis

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    category TEXT, -- e.g., 'object', 'scene', 'text', 'concept', 'emotion'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create document_tags junction table
CREATE TABLE IF NOT EXISTS document_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0, -- AI confidence in this tag (0.0 to 1.0)
    source TEXT DEFAULT 'ai', -- 'ai', 'user', 'ocr', 'vision'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(document_id, tag_id)
);

-- Add new columns to documents table for enhanced metadata
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type TEXT; -- 'text', 'image', 'document', 'mixed'
ALTER TABLE documents ADD COLUMN IF NOT EXISTS primary_language TEXT DEFAULT 'en';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS confidence_score REAL; -- Overall AI confidence
ALTER TABLE documents ADD COLUMN IF NOT EXISTS image_analysis JSONB DEFAULT '{}'; -- Vision analysis results
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auto_tags TEXT[]; -- Quick access array of tag names

-- Create categories table for organizing tags
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT, -- Hex color for UI
    icon TEXT, -- Icon name for UI
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default categories
INSERT INTO categories (name, description, color, icon) VALUES
('objects', 'Physical objects and items', '#3B82F6', 'box'),
('people', 'People and human-related content', '#10B981', 'users'),
('text', 'Text content and documents', '#6366F1', 'file-text'),
('nature', 'Natural scenes and outdoor content', '#059669', 'tree'),
('technology', 'Technology and digital content', '#8B5CF6', 'monitor'),
('business', 'Business and professional content', '#DC2626', 'briefcase'),
('education', 'Educational and learning content', '#F59E0B', 'book'),
('medical', 'Medical and health-related content', '#EF4444', 'heart'),
('food', 'Food and cooking related content', '#F97316', 'chef-hat'),
('transportation', 'Vehicles and transportation', '#06B6D4', 'car'),
('architecture', 'Buildings and structures', '#84CC16', 'building'),
('art', 'Art and creative content', '#EC4899', 'palette')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag_id ON document_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_confidence ON document_tags(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_documents_content_type ON documents(content_type);
CREATE INDEX IF NOT EXISTS idx_documents_auto_tags ON documents USING gin(auto_tags);
CREATE INDEX IF NOT EXISTS idx_documents_image_analysis ON documents USING gin(image_analysis);

-- Create a function to get or create a tag
CREATE OR REPLACE FUNCTION get_or_create_tag(
    tag_name TEXT,
    tag_category TEXT DEFAULT NULL,
    tag_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    tag_id UUID;
BEGIN
    -- Try to find existing tag
    SELECT id INTO tag_id FROM tags WHERE name = LOWER(tag_name);
    
    -- If not found, create new tag
    IF tag_id IS NULL THEN
        INSERT INTO tags (name, category, description) 
        VALUES (LOWER(tag_name), tag_category, tag_description) 
        RETURNING id INTO tag_id;
    END IF;
    
    RETURN tag_id;
END;
$$ LANGUAGE plpgsql;

-- Create a function to add tag to document
CREATE OR REPLACE FUNCTION add_document_tag(
    doc_id UUID,
    tag_name TEXT,
    tag_confidence REAL DEFAULT 1.0,
    tag_source TEXT DEFAULT 'ai'
)
RETURNS VOID AS $$
DECLARE
    tag_id UUID;
BEGIN
    -- Get or create the tag
    tag_id := get_or_create_tag(tag_name);
    
    -- Insert the document-tag relationship
    INSERT INTO document_tags (document_id, tag_id, confidence, source)
    VALUES (doc_id, tag_id, tag_confidence, tag_source)
    ON CONFLICT (document_id, tag_id) 
    DO UPDATE SET 
        confidence = GREATEST(document_tags.confidence, tag_confidence),
        source = CASE WHEN tag_confidence > document_tags.confidence THEN tag_source ELSE document_tags.source END;
END;
$$ LANGUAGE plpgsql;

-- Create a function to update document auto_tags array
CREATE OR REPLACE FUNCTION update_document_auto_tags(doc_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE documents 
    SET auto_tags = (
        SELECT ARRAY_AGG(t.name ORDER BY dt.confidence DESC)
        FROM document_tags dt
        JOIN tags t ON dt.tag_id = t.id
        WHERE dt.document_id = doc_id
        AND dt.confidence >= 0.3  -- Only include high-confidence tags
    )
    WHERE id = doc_id;
END;
$$ LANGUAGE plpgsql;

-- Original similarity search function with document info (fallback)
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
    similarity REAL,
    document_title TEXT,
    document_filename TEXT,
    public_url TEXT,
    content_type TEXT,
    auto_tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id as chunk_id,
        dc.document_id,
        dc.chunk_text,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::REAL as similarity,
        COALESCE(d.title, d.original_filename) as document_title,
        d.original_filename as document_filename,
        d.public_url,
        d.content_type,
        d.auto_tags,
        d.created_at
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 
        dc.user_id = user_id_param 
        AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Enhanced similarity search with tag context and document info
CREATE OR REPLACE FUNCTION enhanced_similarity_search(
    query_embedding VECTOR(1536),
    user_id_param UUID,
    similarity_threshold REAL DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    content_types TEXT[] DEFAULT NULL,
    required_tags TEXT[] DEFAULT NULL
)
RETURNS TABLE(
    chunk_id UUID,
    document_id UUID,
    chunk_text TEXT,
    metadata JSONB,
    similarity REAL,
    document_title TEXT,
    document_filename TEXT,
    public_url TEXT,
    content_type TEXT,
    auto_tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id as chunk_id,
        dc.document_id,
        dc.chunk_text,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::REAL as similarity,
        COALESCE(d.title, d.original_filename) as document_title,
        d.original_filename as document_filename,
        d.public_url,
        d.content_type,
        d.auto_tags,
        d.created_at
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 
        dc.user_id = user_id_param 
        AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) > similarity_threshold
        AND (content_types IS NULL OR d.content_type = ANY(content_types))
        AND (required_tags IS NULL OR d.auto_tags && required_tags)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Create a view for easy tag querying
CREATE OR REPLACE VIEW document_tags_view AS
SELECT 
    d.id as document_id,
    d.original_filename,
    d.content_type,
    d.auto_tags,
    t.name as tag_name,
    t.category as tag_category,
    dt.confidence,
    dt.source,
    c.name as category_name,
    c.color as category_color
FROM documents d
LEFT JOIN document_tags dt ON d.id = dt.document_id
LEFT JOIN tags t ON dt.tag_id = t.id
LEFT JOIN categories c ON t.category = c.name; 