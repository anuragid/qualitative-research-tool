interface MediaPlayerSectionProps {
  playbackUrl: string | undefined;
  filename: string;
  videoStatus: string;
}

export function MediaPlayerSection({ playbackUrl, filename }: MediaPlayerSectionProps) {
  if (!playbackUrl) return null;

  const isAudio = /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(filename);

  return (
    <div className="bg-card shadow-card overflow-hidden h-full">
      {isAudio ? (
        <audio
          id="main-video-player"
          key={playbackUrl}
          controls
          className="w-full p-4"
          preload="metadata"
        >
          <source src={playbackUrl} type="audio/mpeg" />
          <source src={playbackUrl} type="audio/wav" />
          <source src={playbackUrl} type="audio/mp4" />
          <source src={playbackUrl} type="audio/ogg" />
          <source src={playbackUrl} type="audio/flac" />
          <source src={playbackUrl} type="audio/aac" />
          Your browser does not support the audio tag.
        </audio>
      ) : (
        <video
          id="main-video-player"
          key={playbackUrl}
          controls
          // eslint-disable-next-line design-system/no-raw-tailwind-colors -- Video player needs true black background for letterboxing
          className="w-full h-full bg-black object-contain"
          preload="metadata"
        >
          <source src={playbackUrl} type="video/mp4" />
          <source src={playbackUrl} type="video/quicktime" />
          <source src={playbackUrl} type="video/x-msvideo" />
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
}
