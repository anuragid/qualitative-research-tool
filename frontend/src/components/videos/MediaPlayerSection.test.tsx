import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MediaPlayerSection } from "./MediaPlayerSection";

describe("MediaPlayerSection", () => {
  // 1. Renders video element for .mp4 files
  it("renders a <video> element for .mp4 files", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/video.mp4"
        filename="interview.mp4"
        videoStatus="transcribed"
      />
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(container.querySelector("audio")).toBeNull();
  });

  // 2. Renders audio element for .mp3 files
  it("renders an <audio> element for .mp3 files", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/audio.mp3"
        filename="interview.mp3"
        videoStatus="transcribed"
      />
    );
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  // 3. Renders audio element for .wav files
  it("renders an <audio> element for .wav files", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/audio.wav"
        filename="recording.wav"
        videoStatus="transcribed"
      />
    );
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
  });

  // 4. Renders audio element for other audio extensions
  it.each(["m4a", "ogg", "flac", "aac"])(
    "renders an <audio> element for .%s files",
    (ext) => {
      const { container } = render(
        <MediaPlayerSection
          playbackUrl={`https://example.com/audio.${ext}`}
          filename={`recording.${ext}`}
          videoStatus="transcribed"
        />
      );
      expect(container.querySelector("audio")).not.toBeNull();
      expect(container.querySelector("video")).toBeNull();
    }
  );

  // 5. Sets id="main-video-player" on video element
  it('sets id="main-video-player" on the video element', () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/video.mp4"
        filename="interview.mp4"
        videoStatus="transcribed"
      />
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("id")).toBe("main-video-player");
  });

  // 6. Sets id="main-video-player" on audio element
  it('sets id="main-video-player" on the audio element', () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/audio.mp3"
        filename="interview.mp3"
        videoStatus="transcribed"
      />
    );
    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio).not.toBeNull();
    expect(audio.getAttribute("id")).toBe("main-video-player");
  });

  // 7. Renders nothing when playbackUrl is undefined
  it("renders nothing when playbackUrl is undefined", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl={undefined}
        filename="interview.mp4"
        videoStatus="transcribed"
      />
    );
    expect(container.innerHTML).toBe("");
  });

  // 8. Video element has controls attribute
  it("video element has controls attribute", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/video.mp4"
        filename="interview.mp4"
        videoStatus="transcribed"
      />
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.hasAttribute("controls")).toBe(true);
  });

  // 9. Audio element has controls attribute
  it("audio element has controls attribute", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/audio.mp3"
        filename="interview.mp3"
        videoStatus="transcribed"
      />
    );
    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio.hasAttribute("controls")).toBe(true);
  });

  // 10. Video source elements have correct src
  it("video source elements point to the playbackUrl", () => {
    const url = "https://example.com/video.mp4";
    const { container } = render(
      <MediaPlayerSection
        playbackUrl={url}
        filename="interview.mp4"
        videoStatus="transcribed"
      />
    );
    const sources = container.querySelectorAll("video source");
    expect(sources.length).toBeGreaterThan(0);
    sources.forEach((source) => {
      expect(source.getAttribute("src")).toBe(url);
    });
  });

  // 11. Audio source elements have correct src
  it("audio source elements point to the playbackUrl", () => {
    const url = "https://example.com/audio.mp3";
    const { container } = render(
      <MediaPlayerSection
        playbackUrl={url}
        filename="interview.mp3"
        videoStatus="transcribed"
      />
    );
    const sources = container.querySelectorAll("audio source");
    expect(sources.length).toBeGreaterThan(0);
    sources.forEach((source) => {
      expect(source.getAttribute("src")).toBe(url);
    });
  });

  // 12. Case-insensitive extension matching
  it("treats uppercase extensions as audio correctly", () => {
    const { container } = render(
      <MediaPlayerSection
        playbackUrl="https://example.com/audio.MP3"
        filename="RECORDING.MP3"
        videoStatus="transcribed"
      />
    );
    expect(container.querySelector("audio")).not.toBeNull();
  });
});
