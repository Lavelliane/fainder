-- Disable Row Level Security Migration
-- This migration removes all RLS policies and disables RLS on all tables

-- Drop all existing RLS policies
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Users can manage their own documents" ON documents;
DROP POLICY IF EXISTS "Users can access chunks of their documents" ON document_chunks;
DROP POLICY IF EXISTS "Users can access their own search queries" ON search_queries;
DROP POLICY IF EXISTS "Users can view search results from their queries" ON search_results;
DROP POLICY IF EXISTS "Users can manage their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can access messages from their conversations" ON messages;

-- Also drop policies from other possible migration variations
DROP POLICY IF EXISTS "Users can view their own documents" ON documents;
DROP POLICY IF EXISTS "Users can view their own search queries" ON search_queries;

-- Disable Row Level Security on all tables
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE search_queries DISABLE ROW LEVEL SECURITY;
ALTER TABLE search_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Also disable on embedding_models table if it exists
ALTER TABLE embedding_models DISABLE ROW LEVEL SECURITY;

-- Remove any remaining function dependencies that were used by RLS
-- The get_or_create_user function can remain as it's still useful 