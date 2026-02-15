import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import logFactory from '../utils/logger.js';
import { Room } from '../models/index.js';

const log = logFactory({ name: 'generateSitemap' });

const staticRoutes = [
  { url: '/', changefreq: 'always', priority: 0.8 },
  { url: '/login', changefreq: 'weekly' },
  { url: '/register', changefreq: 'weekly', priority: 0.7 },
  { url: '/terms', changefreq: 'monthly' },
  { url: '/privacy', changefreq: 'monthly' },
  { url: '/help/cams', changefreq: 'weekly' },
  { url: '/help/chat', changefreq: 'weekly' },
  { url: '/help/mod', changefreq: 'weekly' },
  { url: '/contact', changefreq: 'monthly' },
  { url: '/directory', changefreq: 'always' },
];

export default async function generateSitemap(req, res) {
  try {
    const rooms = await Room.find({
      'attrs.owner': { $ne: null },
      'attrs.active': true,
      'settings.public': true,
    }).lean();

    const links = [
      ...staticRoutes,
      ...rooms.map((room) => {
        const entry = {
          url: `/${room.name}`,
          changefreq: 'daily',
        };

        if (room.settings.display) {
          entry.img = [{
            url: `/uploads/${room.settings.display}`,
            title: room.name,
            ...(room.settings.description && { caption: room.settings.description }),
          }];
        }

        return entry;
      }),
    ];

    const stream = new SitemapStream({ hostname: 'https://jumpin.chat' });
    const xml = await streamToPromise(Readable.from(links).pipe(stream));
    res.header('Content-Type', 'application/xml');
    return res.status(200).send(xml.toString());
  } catch (err) {
    log.fatal({ err }, 'failed to generate sitemap');
    return res.status(500).end();
  }
}
