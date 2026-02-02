import { useState, useEffect } from 'react';

interface YouTubeEmbedProps {
  url: string;
  className?: string;
}

/**
 * Extrai o ID do vídeo de diferentes formatos de URL do YouTube
 * Suporta:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 */
function extractVideoId(url: string): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    
    // Formato: youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
      return urlObj.searchParams.get('v');
    }
    
    // Formato: youtu.be/VIDEO_ID
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1).split('?')[0];
    }
    
    // Formato: youtube.com/embed/VIDEO_ID ou youtube.com/shorts/VIDEO_ID
    if (urlObj.hostname.includes('youtube.com')) {
      const match = urlObj.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
      if (match) return match[2];
    }
    
    return null;
  } catch {
    return null;
  }
}

export default function YouTubeEmbed({ url, className = '' }: YouTubeEmbedProps) {
  const [videoId, setVideoId] = useState<string | null>(null);

  useEffect(() => {
    const id = extractVideoId(url);
    setVideoId(id);
  }, [url]);

  if (!videoId) {
    return (
      <div className={`bg-gray-100 rounded-lg p-6 text-center ${className}`}>
        <p className="text-gray-500 text-sm">
          URL de vídeo inválida ou não fornecida
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${className}`} style={{ paddingBottom: '56.25%' }}>
      <iframe
        className="absolute top-0 left-0 w-full h-full rounded-lg"
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
