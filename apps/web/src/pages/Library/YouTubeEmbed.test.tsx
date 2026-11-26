import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import YouTubeEmbed from './YouTubeEmbed';

const videoId = 'M7lc1UVf-VE';
const embedUrl = `https://www.youtube.com/embed/${videoId}`;

describe('#583 YouTube embedding', () => {
  it.each([
    `https://www.youtube.com/watch?v=${videoId}&t=10`,
    `https://youtu.be/${videoId}?si=abc`,
    `https://youtube.com/embed/${videoId}`,
    `https://m.youtube.com/shorts/${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
  ])('uses only the validated video ID and an origin-only referrer for %s', (url) => {
    render(<YouTubeEmbed url={url} />);
    const frame = screen.getByTitle('YouTube video player');
    expect(frame).toHaveAttribute('src', embedUrl);
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(screen.getByRole('link', { name: 'abra no YouTube' })).toHaveAttribute(
      'href', `https://www.youtube.com/watch?v=${videoId}`,
    );
    expect(screen.getByRole('link', { name: 'abra no YouTube' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Se o vídeo não carregar/)).toBeInTheDocument();
  });

  it.each([
    '',
    'not-a-url',
    `https://youtube.com.evil.example/watch?v=${videoId}`,
    `https://fake-youtube.com/watch?v=${videoId}`,
    `https://youtube.com@evil.example/watch?v=${videoId}`,
    `http://www.youtube.com/watch?v=${videoId}`,
    `https://www.youtube.com:444/watch?v=${videoId}`,
    'https://www.youtube.com/watch?v=short',
    'https://youtu.be/M7lc1UVf%2FVE',
    `https://youtu.be/${videoId}/more`,
  ])('does not embed or create a fallback for an invalid source %s', (url) => {
    render(<YouTubeEmbed url={url} />);
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('URL de vídeo do YouTube inválida');
  });

  it('replaces a stale iframe and its fallback immediately when the URL changes', () => {
    const { rerender } = render(<YouTubeEmbed url={`https://youtu.be/${videoId}`} />);
    const original = screen.getByTitle('YouTube video player');
    rerender(<YouTubeEmbed url="https://youtu.be/0S5ZFH1ZXIk" />);
    expect(screen.getByTitle('YouTube video player')).not.toBe(original);
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute('src', 'https://www.youtube.com/embed/0S5ZFH1ZXIk');
    rerender(<YouTubeEmbed url="" />);
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
