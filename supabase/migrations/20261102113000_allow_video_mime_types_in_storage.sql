-- Permitir tipos MIME de vídeo y audio avanzado en el bucket 'user-documents' de Supabase Storage
UPDATE storage.buckets
SET allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'text/plain',
  'application/octet-stream',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mp4',
  'audio/x-m4a'
]
WHERE id = 'user-documents';

