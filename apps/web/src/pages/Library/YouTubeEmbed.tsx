interface YouTubeEmbedProps {
  url: string;
  className?: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function extractVideoId(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') {
      id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    } else if (YOUTUBE_HOSTS.has(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = /^\/(?:embed|shorts)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export default function YouTubeEmbed({ url, className = '' }: YouTubeEmbedProps) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return (
      <div className={`bg-gray-100 rounded-lg p-6 text-center ${className}`}>
        <p role="status" className="text-gray-500 text-sm">
          URL de vídeo do YouTube inválida ou não fornecida.
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="relative w-full" style={{ paddingBottom: '56.25%', minHeight: 200 }}>
        <iframe
          key={videoId}
          className="absolute top-0 left-0 w-full h-full rounded-lg"
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video player"
          referrerPolicy="strict-origin-when-cross-origin"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {/* Cross-origin playback errors are shown by the native player. Keep recovery
          available even if the player never loads; do not treat iframe load as playback. */}
      <p className="mt-2 text-sm text-gray-600">
        Se o vídeo não carregar, estiver indisponível ou não permitir reprodução aqui,{' '}
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 underline"
        >
          abra no YouTube
        </a>.
      </p>
    </div>
  );
}
