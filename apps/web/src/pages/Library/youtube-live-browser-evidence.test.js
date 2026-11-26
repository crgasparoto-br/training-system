// @vitest-environment node
// External player homologation is separate from the deterministic network test.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoopbackTls } from './youtube-browser-tls.mjs';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.ISSUE_583_YOUTUBE_LIVE === '1' ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-583');
const videoId = 'M7lc1UVf-VE'; // Public video used in YouTube's IFrame API documentation.
const embedUrl = 'https://www.youtube.com/embed/' + videoId;
const subjectSha = process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local';
const productionShell = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const entrypoint = '<script type="module" src="/src/main.tsx"></script>';
const harness = productionShell.replace(entrypoint, `<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import YouTubeEmbed from '/src/pages/Library/YouTubeEmbed.tsx';
createRoot(document.getElementById('root')).render(
  React.createElement(YouTubeEmbed, { url: 'https://youtu.be/${videoId}' })
);
</script>`);

suite('Issue #583 - real YouTube over HTTPS', () => {
  it('requires actual native video playback, not iframe load or a mocked response', async () => {
    let vite;
    let browser;
    let page;
    const evidence = { schemaVersion: 1, kind: 'issue-583-youtube-live',
      subjectSha, videoId, simulated: false, result: 'PENDING', requests: [], samples: [] };
    mkdirSync(outputDir, { recursive: true });
    try {
      expect(productionShell).toContain(entrypoint);
      const tls = createLoopbackTls();
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, https: tls.options },
        plugins: [{ name: 'issue-583-live-browser', configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.split('?')[0] !== '/library') return next();
            try {
              res.setHeader('Content-Type', 'text/html');
              res.end(await server.transformIndexHtml('/library', harness));
            } catch (error) { next(error); }
          });
        } }],
      });
      await vite.listen();
      const origin = 'https://127.0.0.1:' + vite.httpServer.address().port;
      evidence.origin = origin;
      browser = await puppeteer.launch({
        executablePath: process.env.CHROME_BIN || puppeteer.executablePath(),
        headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', tls.chromeArg],
      });
      page = await browser.newPage();
      await page.setViewport({ width: 1000, height: 800 });
      page.on('request', request => {
        if (request.url() === embedUrl && request.isNavigationRequest()) {
          evidence.requests.push({ url: request.url(), referer: request.headers().referer ?? null,
            authorization: Boolean(request.headers().authorization), cookie: Boolean(request.headers().cookie) });
        }
      });
      page.on('requestfailed', request => {
        if (request.url() === embedUrl) evidence.requestFailure = request.failure()?.errorText;
      });
      // No request interception, fake player, autoplay flag or certificate bypass for YouTube.
      const responsePromise = page.waitForResponse(response => response.url() === embedUrl
        && response.request().isNavigationRequest(), { timeout: 30000 });
      await page.goto(origin + '/library?privacyProbe=synthetic-only', { waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => isSecureContext && location.protocol === 'https:')).toBe(true);
      expect(await page.$eval('meta[name="referrer"]', node => node.content)).toBe('no-referrer');
      const element = await page.waitForSelector('iframe[title="YouTube video player"]');
      const response = await responsePromise;
      evidence.httpStatus = response.status();
      expect(response.ok()).toBe(true);
      expect(evidence.requests).toContainEqual({ url: embedUrl, referer: origin + '/', authorization: false, cookie: false });
      const frame = await element.contentFrame();
      expect(frame).toBeTruthy();
      await frame.waitForSelector('#movie_player', { timeout: 25000 });
      const play = await frame.waitForSelector('.ytp-large-play-button', { visible: true, timeout: 15000 });
      await play.click();
      let firstPlaying;
      for (let attempt = 0; attempt < 40; attempt++) {
        const sample = await frame.evaluate(() => {
          const player = document.querySelector('#movie_player');
          const video = player?.querySelector('video');
          const error = document.querySelector('.ytp-error-content-wrap');
          return {
            time: video?.currentTime ?? null, readyState: video?.readyState ?? 0,
            paused: video?.paused ?? true, ad: player?.classList.contains('ad-showing') ?? false,
            error: error?.getClientRects().length ? error.textContent?.trim().slice(0, 500) : null,
            mediaError: video?.error?.code ?? null,
          };
        });
        evidence.samples.push(sample);
        if (sample.error || sample.mediaError) throw new Error('Native player error: ' + (sample.error || sample.mediaError));
        if (!sample.ad && !sample.paused && sample.readyState >= 2 && sample.time !== null) {
          if (firstPlaying === undefined) firstPlaying = sample.time;
          if (sample.time >= firstPlaying + 1.5) {
            evidence.result = 'PASS';
            break;
          }
        } else {
          firstPlaying = undefined;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      expect(evidence.result, 'External video playback was not established').toBe('PASS');
    } catch (error) {
      evidence.result = 'FAIL_OR_UNAVAILABLE';
      evidence.error = String(error);
      throw error;
    } finally {
      try {
        if (page) await page.screenshot({ path: path.join(outputDir, 'player.png') });
      } catch (error) { evidence.screenshotError = String(error); }
      writeFileSync(path.join(outputDir, 'live.json'), JSON.stringify(evidence, null, 2));
      await browser?.close();
      await vite?.close();
    }
  }, 150000);
});
