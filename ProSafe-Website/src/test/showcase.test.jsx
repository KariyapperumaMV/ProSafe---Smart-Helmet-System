import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import { screenshots, videos } from '../data/showcase.js';
import { workerVisual } from '../data/home.js';
import { ScreenshotGallery } from '../components/showcase/ScreenshotGallery.jsx';
import { VideoCard } from '../components/showcase/VideoCard.jsx';

const publicFile = (p) => resolve(__dirname, '../../public', `.${p}`);

// jsdom does not implement modal dialogs.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
}

describe('showcase assets', () => {
  it('points every screenshot, video, poster and the worker visual at a real file', () => {
    for (const s of screenshots) expect(existsSync(publicFile(s.src)), s.src).toBe(true);
    for (const v of videos.filter((x) => x.src)) {
      expect(existsSync(publicFile(v.src)), v.src).toBe(true);
      expect(readFileSync(publicFile(v.src)).subarray(4, 8).toString(), `${v.id} is MP4`).toBe('ftyp');
      if (v.poster) expect(existsSync(publicFile(v.poster)), v.poster).toBe(true);
    }
    expect(existsSync(publicFile(workerVisual.src))).toBe(true);
  });

  it('labels the worker visual honestly', () => {
    expect(workerVisual.caption[workerVisual.kind]).toMatch(workerVisual.kind === 'photo' ? /Photograph/ : /Conceptual illustration.*not a photograph/);
  });

  it('uses the expected video identifiers', () => {
    expect(videos.map((v) => v.id)).toEqual(['prosafe-uiux', 'prosafe-demonstration']);
  });
});

describe('ScreenshotGallery', () => {
  it('shows one screenshot at a time and navigates with buttons, thumbnails and arrow keys', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGallery items={screenshots} />);
    const region = screen.getByRole('region', { name: /screenshots/ });
    expect(within(region).getByText(screenshots[0].caption)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Next screenshot' })[0]);
    expect(within(region).getByText(screenshots[1].caption)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: screenshots[3].title }));
    expect(within(region).getByText(screenshots[3].caption)).toBeInTheDocument();
    screen.getByRole('button', { name: screenshots[3].title }).focus();
    await user.keyboard('{ArrowRight}');
    expect(within(region).getByText(screenshots[0].caption)).toBeInTheDocument();
  });

  it('enlarges the current screenshot in a dialog', async () => {
    const user = userEvent.setup();
    const { container } = render(<ScreenshotGallery items={screenshots} />);
    await user.click(screen.getByRole('button', { name: /Enlarge screenshot/ }));
    expect(container.querySelector('dialog').hasAttribute('open')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close enlarged screenshot' }));
    expect(container.querySelector('dialog').hasAttribute('open')).toBe(false);
  });
});

describe('VideoCard', () => {
  it('loads nothing until Play is pressed, then shows a native player', async () => {
    const user = userEvent.setup();
    const video = videos.find((v) => v.src);
    const { container } = render(<VideoCard video={video} />);
    expect(container.querySelector('video')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Play video/ }));
    const player = container.querySelector('video');
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute('controls');
    expect(player.getAttribute('src')).toBe(video.src);
  });

  it('never renders a player for a video without a source', () => {
    const pending = videos.find((v) => !v.src && !v.youtubeId);
    const { container } = render(<VideoCard video={pending} />);
    expect(container.querySelector('video, iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: /Play video/ })).toBeNull();
    expect(screen.getByText('Video to be added')).toBeInTheDocument();
  });
});

describe('page integration', () => {
  it('replaces the repetitive hero card and keeps the 3D helmet section', () => {
    const { container } = render(<App />);
    const home = container.querySelector('#home');
    expect(within(home).queryByText('Sensing channels')).toBeNull();
    expect(within(home).queryByText('Helmet LED status')).toBeNull();
    expect(within(home).getByRole('heading', { name: workerVisual.heading })).toBeInTheDocument();
    expect(container.querySelector('#helmet')).not.toBeNull();
    expect(container.querySelector('#platform')).not.toBeNull();
    expect(container.querySelector('#in-action')).not.toBeNull();
  });
});
