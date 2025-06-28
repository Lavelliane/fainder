-- Create the fainder bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fainder', 'fainder', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (this is usually enabled by default)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy to allow public uploads to fainder bucket
CREATE POLICY "Allow public uploads to fainder bucket" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'fainder');

-- Policy to allow public reads from fainder bucket  
CREATE POLICY "Allow public reads from fainder bucket" ON storage.objects
FOR SELECT USING (bucket_id = 'fainder');

-- Policy to allow public deletes from fainder bucket (optional)
CREATE POLICY "Allow public deletes from fainder bucket" ON storage.objects
FOR DELETE USING (bucket_id = 'fainder');

-- Policy to allow public updates to fainder bucket (optional)
CREATE POLICY "Allow public updates to fainder bucket" ON storage.objects
FOR UPDATE USING (bucket_id = 'fainder'); 